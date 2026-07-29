import Link from "next/link";
import { SiteShell } from "../page";

const events = [
  ["Weddings", "A natural setting for a ceremony that feels intimate, grounded, and unmistakably yours."],
  ["Family reunions", "Room for generations to gather, share meals, tell stories, and start new traditions."],
  ["Work retreats", "Bring your team away from the noise for clear thinking, deeper connection, and renewed energy."],
];

export default function Events() {
  return (
    <SiteShell>
      <main className="inner-shell">
        <section className="events-hero">
          <div>
            <p className="eyebrow light">Gather here</p>
            <h1>Bring your people. <em>We’ll hold the space.</em></h1>
            <p>Weddings, reunions, work retreats, and special gatherings shaped around what matters to you.</p>
          </div>
        </section>
        <section className="content-section editorial-grid event-grid">
          {events.map(([title, text], index) => <article key={title}><span className="card-number">0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}
        </section>
        <section className="closing">
          <p className="eyebrow">Start the conversation</p>
          <h2>Let’s shape a gathering that <em>feels personal.</em></h2>
          <Link href="mailto:hello@hmountainretreat.com" className="button dark">Plan your event <span>↗</span></Link>
        </section>
      </main>
    </SiteShell>
  );
}
