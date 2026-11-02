import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the provider's async transitions without a browser or new test dependency.
const source = ts.transpileModule(readFileSync(new URL("./AuthProvider.tsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
class Phase3Error extends Error { constructor(code) { super(code); this.code = code; } }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(client) {
  const slots = [];
  let cursor = 0, effect, cleanup;
  const react = {
    createContext: () => ({ Provider: "provider" }),
    useMemo: (fn) => fn(), useCallback: (fn) => fn,
    useState: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; }];
    },
    useRef: (initial) => {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useEffect: (fn) => { effect = fn; },
  };
  const exports = {};
  runInNewContext(source, { exports, require: (name) => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: (_, props) => props.value };
    if (name === "@/lib/phase3") return { getPhase3Client: () => client, Phase3Error };
    throw new Error(name);
  } });
  const render = () => { cursor = 0; return exports.AuthProvider({ children: null }); };
  render(); cleanup = effect();
  return { render, unmount: () => cleanup() };
}
const identity = { user: { id: "miraj-user", platformRoles: ["admin"] }, memberships: [{ organizationId: "org" }] };
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("only a 401-style auth error means signed out; network failure can retry", async () => {
  let error = new Phase3Error("unavailable");
  const h = harness({ getCurrentUser: async () => { if (error) throw error; return identity; } });
  await flush();
  assert.equal(h.render().status, "unavailable");
  error = new Phase3Error("unauthenticated");
  await h.render().refresh();
  assert.equal(h.render().status, "unauthenticated");
  error = null;
  await h.render().refresh();
  assert.equal(h.render().status, "authenticated");
  assert.equal(h.render().user, identity.user);
  assert.equal(h.render().memberships, identity.memberships);
  assert.equal(h.render().isAdmin, true);
});

test("stale bootstrap cannot replace a newer successful login", async () => {
  const bootstrap = deferred();
  const h = harness({ getCurrentUser: () => bootstrap.promise, login: async () => identity });
  await h.render().login("member@example.test", "password");
  bootstrap.reject(new Phase3Error("unauthenticated"));
  await flush();
  assert.equal(h.render().status, "authenticated");
  assert.equal(h.render().user, identity.user);
});

test("failed logout retains identity; successful logout invalidates pending refresh", async () => {
  const pending = deferred();
  let failure = true, reads = 0;
  const h = harness({
    getCurrentUser: () => ++reads === 1 ? Promise.resolve(identity) : pending.promise,
    logout: async () => { if (failure) throw new Error("offline"); },
  });
  await flush();
  await assert.rejects(h.render().logout(), /offline/);
  assert.equal(h.render().status, "authenticated");
  assert.equal(h.render().user, identity.user);
  failure = false;
  const refreshing = h.render().refresh();
  await h.render().logout();
  pending.resolve(identity);
  await refreshing;
  assert.equal(h.render().status, "unauthenticated");
  assert.equal(h.render().user, null);
  assert.equal(h.render().memberships.length, 0);
});

test("unmount prevents pending session completion", async () => {
  const pending = deferred();
  const h = harness({ getCurrentUser: () => pending.promise });
  h.unmount();
  pending.resolve(identity);
  await flush();
  assert.equal(h.render().status, "loading");
});

test("membership refresh publishes new organization context without a full reload and ignores late responses after logout", async () => {
  let reads = 0;
  const pending = deferred();
  const h = harness({ getCurrentUser: () => ++reads === 1 ? Promise.resolve(identity) : pending.promise, logout: async () => {} });
  await flush();
  const refreshing = h.render().refreshMemberships();
  assert.equal(h.render().status, "authenticated");
  await h.render().logout(); pending.resolve({ ...identity, memberships: [{ organizationId: "new-org" }] }); await refreshing;
  assert.equal(h.render().status, "unauthenticated");
  assert.equal(h.render().memberships.length, 0);
});
