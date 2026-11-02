"use client";

import { useEffect, useRef } from "react";

export function EinReplaceConfirmation({ onCancel, onConfirm }: { onCancel(): void; onConfirm(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="review-modal" aria-labelledby="ein-replace-title" aria-describedby="ein-replace-description" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id="ein-replace-title">Replace verified EIN?</h2>
    <p id="ein-replace-description">This business already has a verified EIN. Saving an EIN again will require verification again. Do you want to continue?</p>
    <div className="button-row"><button className="button secondary" type="button" onClick={onCancel}>Cancel</button><button className="button primary" type="button" onClick={onConfirm}>Save and request verification</button></div>
  </dialog>;
}
