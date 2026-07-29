import Link from "next/link";
import { SiteShell } from "../page";

export default function Success() {
  return (
    <SiteShell>
      <main className="inner-shell">
        <section className="success-panel">
          <span className="success-mark">✓</span>
          <p className="eyebrow">Reservation secured</p>
          <h1>Your place at H Mountain is waiting.</h1>
          <p>A confirmation and the remaining stay details will be sent to the email used at checkout.</p>
          <Link href="/" className="button dark">Return home</Link>
        </section>
      </main>
    </SiteShell>
  );
}
