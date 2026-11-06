"use client";

import { useId, useState } from "react";
import { PromotedSlot } from "./PromotedSlot";
import "./boost-panel.css";

/**
 * The placements a member could buy. Three and concrete on purpose - a reviewer
 * has to be able to point at one and say "that one, not that one". Community
 * News is absent on purpose: that feed is stated as unpaid on its own page.
 */
const PLACEMENTS = [
  {
    id: "front-page",
    name: "Front page feature",
    what: "Your card runs in the featured row on the Bridge home page.",
    unit: "By the week, per market",
  },
  {
    id: "directory-top",
    name: "Directory top slot",
    what: "First position in Directory results for one member type in one market.",
    unit: "By the week, per member type",
  },
  {
    id: "explore-spotlight",
    name: "Explore spotlight",
    what: "Your card holds the spotlight slot when someone browses your state.",
    unit: "By the week, per state",
  },
];

/**
 * Seller-side boost surface. Container-width on purpose so the same component
 * works in a 250px Directory sidebar and in a full dashboard column.
 *
 * Paid placement is outside this contract, so this is a preview: the options
 * are real enough to react to, and the control that would take money is dead.
 */
export function BoostPanel() {
  const group = useId();
  const [selected, setSelected] = useState(PLACEMENTS[0].id);
  const placement = PLACEMENTS.find((item) => item.id === selected) ?? PLACEMENTS[0];

  return (
    <section aria-labelledby={`${group}-heading`} className="content-card bridge-boost">
      <p className="eyebrow">Boost</p>
      <h2 className="bridge-boost-heading" id={`${group}-heading`}>Advertise your business</h2>
      <p className="review-notice">
        Review build. Boost is not sold yet and nothing here charges you. The placements are the
        shape of the idea, not an offer, and no rate has been set.
      </p>

      <div aria-label="Placement" className="bridge-boost-options" role="radiogroup">
        {PLACEMENTS.map((item) => (
          <label className="bridge-boost-option" key={item.id}>
            <input
              checked={selected === item.id}
              name={group}
              onChange={() => setSelected(item.id)}
              type="radio"
              value={item.id}
            />
            <span className="bridge-boost-option-body">
              <strong>{item.name}</strong>
              <span className="bridge-boost-what">{item.what}</span>
              <span className="bridge-boost-meta">{item.unit} · rate not set</span>
            </span>
          </label>
        ))}
      </div>

      <p className="bridge-boost-summary" role="status">
        <strong>{placement.name}</strong> · {placement.unit} · always marked <PromotedSlot />
      </p>

      {/* No title attribute: it wins the accessible name over the visible label
          on a disabled button, and the hint below already carries the reason. */}
      <button className="button primary full" disabled type="button">Boost this business</button>
      <p className="form-hint">
        Disabled on purpose. There is no checkout, no rate and no payment field anywhere in this
        build.
      </p>
    </section>
  );
}
