"use client";

import Link from "next/link";
import { useState } from "react";
import { accountPathForRole, joinRoles } from "@/lib/onboarding/roles";
import type { MemberRole } from "@/lib/types";

export function JoinForm() {
  const [selectedRole, setSelectedRole] = useState<MemberRole>("Brand");
  const selected = joinRoles.find((role) => role.name === selectedRole) ?? joinRoles[0];

  return (
    <form className="join-form" onSubmit={(event) => event.preventDefault()}>
      <fieldset>
        <legend className="sr-only">Choose your member role</legend>
        <div className="role-grid">
          {joinRoles.map((role, index) => (
            <label className="role-card" key={role.name}>
              <input checked={selectedRole === role.name} name="role" onChange={() => setSelectedRole(role.name)} type="radio" value={role.name} />
              <span className="role-icon" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <strong>{role.name}</strong><small>{role.description}</small>
              {!role.milestone4Supported && <small className="boundary-note">Not yet supported in Milestone 4 onboarding.</small>}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-preview">
        <div><span className="step-label">Next up</span><strong>{selected.nextTitle}</strong><small>{selected.requirements}</small></div>
        {selected.milestone4Supported ? <Link className="button primary" href={accountPathForRole(selectedRole)}>Continue</Link> : <span className="button secondary" aria-disabled="true">Onboarding unavailable</span>}
      </div>
      <div className="join-pricing-note">
        <div><p className="eyebrow">Pricing not finalized</p><strong>This onboarding flow is non-transactional. No billing or approved subscription price is connected.</strong></div>
        <Link className="text-link" href="/pricing">Review pricing assumptions</Link>
      </div>
    </form>
  );
}
