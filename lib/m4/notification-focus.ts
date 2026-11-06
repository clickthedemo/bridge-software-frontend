"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function useNotificationFocus(parameter: string, ids: string[], selector: string) {
  const targetId = useSearchParams().get(parameter), signature = ids.join(",");
  useEffect(() => {
    if (!targetId) return;
    const index = signature.split(",").indexOf(targetId), elements = document.querySelectorAll<HTMLElement>(selector), element = index >= 0 ? elements.item(index) : null;
    if (!element) return;
    element.classList.add("notification-focus"); element.tabIndex = -1;
    const focus = () => { element.scrollIntoView({ block: "center" }); element.focus({ preventScroll: true }); };
    const gate = element.closest("[inert]");
    let observer: MutationObserver | undefined;
    if (gate) {
      // Browsers ignore focus inside the age gate until it unlocks.
      observer = new MutationObserver(() => { if (!gate.hasAttribute("inert")) { focus(); observer?.disconnect(); } });
      observer.observe(gate, { attributes: true, attributeFilter: ["inert"] });
    } else focus();
    return () => { observer?.disconnect(); element.classList.remove("notification-focus"); };
  }, [targetId, signature, selector]);
}
