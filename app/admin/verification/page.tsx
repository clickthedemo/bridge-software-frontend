import { BusinessLicenseQueue, VerificationQueue } from "./verification-client";

export default function VerificationPage() {
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">Admin workspace</p>
          <h1>Verification queue</h1>
          <p>Review business identity, licences, and profile readiness.</p>
        </div>
        <span className="status-chip pending">Live queue</span>
      </div>
      <VerificationQueue />
      <BusinessLicenseQueue />
    </section>
  );
}
