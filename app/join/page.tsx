import { JoinForm } from "./join-form";
import { JoinOnboardingGate } from "./join-onboarding-gate";

export default function JoinPage() {
  return (
    <JoinOnboardingGate><section className="page shell form-page">
      <div className="page-heading">
        <p className="eyebrow">Step 1 of 4</p>
        <h1>How do you work in cannabis?</h1>
        <p className="lede">Your role sets your profile fields, verification steps, and dashboard. Choose the one that actually fits.</p>
      </div>
      <JoinForm />
    </section></JoinOnboardingGate>
  );
}
