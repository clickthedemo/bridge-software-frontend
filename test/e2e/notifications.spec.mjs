import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

async function setup(page, handler) {
  await page.addInitScript(() => localStorage.setItem("bridge-age-confirmed-v1", "confirmed"));
  await page.route("https://bridge-api.example.test/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/auth/me") return route.fulfill({json:{user:{id:"11111111-1111-4111-8111-111111111111",email:"owner@example.test",accountType:"standard",platformRoles:[],profile:{displayName:"Owner"}},memberships:[]}});
    if (url.pathname === "/api/v1/notifications" && url.searchParams.get("limit") === "50") return route.fulfill({json:{notifications:[],pageInfo:{limit:50,offset:0,hasMore:false}}});
    await handler(route,url);
  });
}
async function openPage(page, path) {
  await page.goto(path);
  await expect(page.locator(".age-gated-content")).not.toHaveAttribute("inert", "", {timeout:15000});
  await expect(page.locator(".age-gated-content")).toHaveAttribute("aria-hidden", "false");
}
async function evidence(page, testInfo, name) {
  await mkdir("/tmp/bridge-m4-evidence", {recursive:true});
  const path = `/tmp/bridge-m4-evidence/${testInfo.project.name}-${name}.png`;
  await page.screenshot({path,fullPage:true});
  await testInfo.attach(name,{path,contentType:"image/png"});
}
const prefs = {profile:{inApp:false,email:false},contact:{inApp:true,email:false},verification:{inApp:false,email:true}};

test("failed preference read cannot overwrite saved choices and retry preserves edits", async ({page}, testInfo) => {
  let reads=0; const writes=[];
  await setup(page, async (route,url) => {
    expect(url.pathname).toBe("/api/v1/notification-preferences");
    if(route.request().method()==="PUT") {
      writes.push(route.request().postDataJSON());
      if(writes.length===1) return route.fulfill({status:503,json:{error:"UNAVAILABLE",message:"Please retry saving."}});
      return route.fulfill({json:{preferences:writes.at(-1)}});
    }
    reads++;
    if(reads===1) return route.fulfill({status:503,json:{error:"UNAVAILABLE",message:"Preferences temporarily unavailable."}});
    return route.fulfill({json:{preferences:prefs}});
  });
  await openPage(page, "/notifications/preferences");
  await expect(page.locator('.form-error[role="alert"]')).toHaveText("Preferences temporarily unavailable.");
  await expect(page.getByRole("button",{name:"Save preferences",exact:true})).toBeDisabled();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await page.getByRole("button",{name:"Retry preferences"}).click();
  const profile=page.getByRole("group",{name:"Profile",exact:true});
  await expect(profile.getByLabel("Email notifications",{exact:true})).not.toBeChecked();
  await profile.getByLabel("Email notifications",{exact:true}).check();
  await page.getByRole("button",{name:"Save preferences",exact:true}).click();
  await expect(page.locator('.form-error[role="alert"]')).toHaveText("Please retry saving.");
  await expect(profile.getByLabel("Email notifications",{exact:true})).toBeChecked();
  await expect(page.getByText("Notification preferences saved.",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Save preferences",exact:true}).click();
  await expect(page.getByText("Notification preferences saved.",{exact:true})).toBeVisible();
  await evidence(page, testInfo, "notification-preferences-saved");
  expect(writes).toEqual([{...prefs,profile:{inApp:false,email:true}},{...prefs,profile:{inApp:false,email:true}}]);
});

test("notification load failure has a working retry and changed filters hide old rows", async ({page}, testInfo) => {
  let reads=0;
  await setup(page, async (route,url) => {
    expect(url.pathname).toBe("/api/v1/notifications");
    reads++;
    if(reads===1) return route.fulfill({status:503,json:{error:"UNAVAILABLE",message:"Notifications temporarily unavailable."}});
    if(url.searchParams.get("unreadOnly")==="true") {
      await new Promise(resolve=>setTimeout(resolve,500));
      return route.fulfill({json:{notifications:[],pageInfo:{limit:20,offset:0,hasMore:false}}});
    }
    return route.fulfill({json:{notifications:[{id:"note1",type:"profile_approved",category:"profile",title:"Earlier notification",body:"A previous update",createdAt:"2026-10-11T12:00:00Z",readAt:"2026-10-11T13:00:00Z"}],pageInfo:{limit:20,offset:0,hasMore:false}}});
  });
  await openPage(page, "/notifications");
  await expect(page.locator('.form-error[role="alert"]')).toHaveText("Notifications temporarily unavailable.");
  await expect(page.getByRole("button",{name:"Mark all read",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Retry notifications"}).click();
  await expect(page.getByRole("heading",{name:"Earlier notification"})).toBeVisible();
  await expect(page.locator('.form-error[role="alert"]')).toHaveCount(0);
  await page.getByLabel("Unread only").check();
  await expect(page.getByText("Loading notifications…",{exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Earlier notification"})).toHaveCount(0);
  await expect(page.getByText("You have no unread notifications.",{exact:true})).toBeVisible();
  await evidence(page, testInfo, "notification-filter-recovered");
});
