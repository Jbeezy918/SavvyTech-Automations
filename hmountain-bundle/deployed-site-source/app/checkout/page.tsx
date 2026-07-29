"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { SiteShell } from "../page";

export default function Checkout() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const site = params.get("site") || "1";
  const name = params.get("name") || "Whispering Pine";
  const checkIn = params.get("checkIn") || "";
  const checkOut = params.get("checkOut") || "";
  const nights = params.get("nights") || "1";
  const deposit = params.get("deposit") || "50";

  async function payDeposit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, name, checkIn, checkOut, nights }),
      });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Checkout is unavailable.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout is unavailable.");
      setBusy(false);
    }
  }

  return (
    <SiteShell>
      <main className="inner-shell">
        <section className="page-title">
          <Link href="/map" className="back-link">← Back to map & dates</Link>
          <p className="eyebrow light">Secure your stay</p>
          <h1>One last step to <em>slow down.</em></h1>
        </section>
        <section className="checkout-wrap">
          <div className="checkout-card">
            <p className="eyebrow">Booking summary</p>
            <h2>{name}</h2>
            <dl>
              <div><dt>Site</dt><dd>Campsite {site}</dd></div>
              <div><dt>Dates</dt><dd>{checkIn || "Select dates"} → {checkOut || "Select dates"}</dd></div>
              <div><dt>Length</dt><dd>{nights} {nights === "1" ? "night" : "nights"}</dd></div>
              <div className="deposit-row"><dt>Deposit due today</dt><dd>${deposit}.00</dd></div>
            </dl>
            {error && <p className="form-notice" role="alert">{error}</p>}
            <button className="button booking-button" disabled={busy || !checkIn || !checkOut} onClick={payDeposit}>
              {busy ? "Opening secure checkout…" : `Pay $${deposit} deposit`} <span>↗</span>
            </button>
            <p className="secure-note">Payment details are entered directly on Stripe’s secure checkout.</p>
          </div>
          <div className="checkout-help">
            <p className="eyebrow">Good to know</p>
            <h3>Your dates are held while you complete payment.</h3>
            <p>The deposit is applied to your stay. Final policies and the remaining-balance schedule will be confirmed before public launch.</p>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
