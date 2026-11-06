"use client";

import Image from "next/image";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { BridgeIntro } from "./BridgeIntro";
import {
  AGE_GATE_CONFIRMED_VALUE,
  AGE_GATE_STORAGE_KEY,
  isAgeGateConfirmed,
} from "@/lib/age-gate";

type GateState = "checking" | "intro" | "prompt" | "denied" | "allowed";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AgeGate({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<GateState>("checking");
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const confirmedRef = useRef(false);
  const isLocked = state !== "allowed";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      let confirmed = false;
      try {
        confirmed = isAgeGateConfirmed(
          window.localStorage.getItem(AGE_GATE_STORAGE_KEY),
        );
      } catch {
        confirmed = false;
      }
      confirmedRef.current = confirmed;

      // Claim before playback. If tab storage is unavailable, skip decoration.
      let playIntro = false;
      try {
        playIntro = window.sessionStorage.getItem("bridge-intro-seen-v1") !== "seen";
        window.sessionStorage.setItem("bridge-intro-seen-v1", "seen");
      } catch { playIntro = false; }
      const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (quiet || !playIntro) {
        setState(confirmed ? "allowed" : "prompt");
        return;
      }
      setState("intro");
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isLocked || state === "intro") {
      document.body.style.removeProperty("overflow");
      return;
    }

    document.body.style.overflow = "hidden";
    const focusTarget = state === "denied" ? leaveRef.current : confirmRef.current;
    const frame = window.requestAnimationFrame(() => focusTarget?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.removeProperty("overflow");
    };
  }, [isLocked, state]);

  function confirmAge() {
    try {
      window.localStorage.setItem(
        AGE_GATE_STORAGE_KEY,
        AGE_GATE_CONFIRMED_VALUE,
      );
    } catch {
      // Storage can be unavailable in private or hardened browsing contexts.
      // The current page may still open after an explicit confirmation.
    }
    document.documentElement.dataset.ageVerified = "true";
    setState("allowed");
  }

  function leaveBridge() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.replace("about:blank");
  }

  function trapDialogFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <div
        aria-hidden={isLocked}
        className="age-gated-content"
        inert={isLocked}
      >
        {children}
      </div>
      {state === "intro" && (
        <BridgeIntro
          onDone={() => setState(confirmedRef.current ? "allowed" : "prompt")}
        />
      )}
      {isLocked && state !== "intro" && (
        <div className="age-gate" role="presentation">
          <div
            aria-describedby="age-gate-description"
            aria-labelledby="age-gate-title"
            aria-modal="true"
            className="age-gate-dialog"
            onKeyDown={trapDialogFocus}
            ref={dialogRef}
            role="dialog"
          >
            <div className="age-gate-brand" aria-hidden="true">
              <Image src="/bridge-mark.svg" alt="" height={44} width={71} priority />
              <span>BRIDGE</span>
            </div>

            {state === "denied" ? (
              <>
                <h1 id="age-gate-title">You cannot enter Bridge</h1>
                <p id="age-gate-description">
                  Bridge is intended for adults 21 and older. Access is not
                  available if you are under 21.
                </p>
                <button
                  className="button secondary age-gate-action"
                  onClick={leaveBridge}
                  ref={leaveRef}
                  type="button"
                >
                  Leave Bridge
                </button>
              </>
            ) : (
              <>
                <h1 id="age-gate-title">Before you enter Bridge</h1>
                <p id="age-gate-description">
                  Bridge is a cannabis industry platform intended for adults
                  21 and older. Confirm your age to continue.
                </p>
                <div className="age-gate-actions">
                  <button
                    className="button primary age-gate-action"
                    onClick={confirmAge}
                    ref={confirmRef}
                    type="button"
                  >
                    I am 21 or older
                  </button>
                  <button
                    className="button secondary age-gate-action"
                    onClick={() => setState("denied")}
                    type="button"
                  >
                    I am under 21
                  </button>
                </div>
                <p className="age-gate-note">
                  Your confirmation is saved on this device. Bridge does not
                  collect a birth date in this review build.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
