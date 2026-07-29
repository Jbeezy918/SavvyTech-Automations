"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { SiteShell } from "../page";

const sites = [
  { id: 1, name: "Whispering Pine", type: "Woodland", rate: 45, x: 38, y: 29, description: "A tucked-away upper-loop site with quick trail access and a shaded woodland edge." },
  { id: 2, name: "Lavender Bend", type: "Meadow edge", rate: 45, x: 45, y: 27, description: "An open, easy-to-reach site overlooking the quiet center meadow." },
  { id: 3, name: "Moonrise", type: "Woodland", rate: 40, x: 58, y: 28, description: "A peaceful upper-loop clearing with wide sky views after sunset." },
  { id: 4, name: "Quiet Oak", type: "Private", rate: 55, x: 73, y: 39, description: "A private bend-side site buffered by trees and set just off the main loop." },
  { id: 5, name: "Little Hollow", type: "Woodland", rate: 40, x: 78, y: 50, description: "A cozy east-loop clearing surrounded by mature trees and morning shade." },
  { id: 6, name: "Wildflower", type: "Meadow edge", rate: 45, x: 79, y: 66, description: "A broad lower-loop site beside the open meadow with extra room to settle in." },
  { id: 7, name: "Creek Path", type: "Private", rate: 55, x: 45, y: 80, description: "A secluded lower clearing with a quiet, tucked-into-the-woods feeling." },
  { id: 8, name: "Homefire", type: "Group site", rate: 65, x: 32, y: 70, description: "A larger gathering site made for family campfires and a little more elbow room." },
  { id: 9, name: "Cedar Rest", type: "Woodland", rate: 40, x: 18, y: 58, description: "A shaded west-loop site close to the tree line and away from the central meadow." },
  { id: 10, name: "Sun Circle", type: "Meadow edge", rate: 45, x: 16.5, y: 46, description: "A bright west-side clearing with an open view across the property loop." },
];

const reservations: Record<number, string[]> = {
  1: ["2026-08-08", "2026-08-09", "2026-08-22"],
  2: ["2026-08-02", "2026-08-03", "2026-08-15", "2026-08-16"],
  3: ["2026-08-11", "2026-08-12", "2026-08-13"],
  4: ["2026-08-05", "2026-08-06", "2026-08-19", "2026-08-20"],
  5: ["2026-08-15", "2026-08-16", "2026-08-17"],
  6: ["2026-08-01", "2026-08-02", "2026-08-28", "2026-08-29"],
  7: ["2026-08-09", "2026-08-10"],
  8: ["2026-08-21", "2026-08-22", "2026-08-23"],
  9: ["2026-08-04", "2026-08-05"],
  10: ["2026-08-14", "2026-08-15"],
};

const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days: (Date | null)[] = Array(first.getDay()).fill(null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (days.length % 7) days.push(null);
  return days;
}

function nightsBetween(start: string, end: string) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000));
}

export default function PropertyMap() {
  const [selected, setSelected] = useState(sites[0]);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [notice, setNotice] = useState("");
  const [month, setMonth] = useState(() => new Date(2026, 7, 1));
  const calendarRef = useRef<HTMLDivElement>(null);
  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const deposit = nights ? Math.min(50, nights * selected.rate) : 0;
  const today = dateKey(new Date());
  const blockedDates = reservations[selected.id] || [];
  const days = useMemo(() => calendarDays(month), [month]);

  function chooseDate(value: string) {
    if (blockedDates.includes(value)) return;
    if (!checkIn || checkOut || value <= checkIn) {
      setCheckIn(value);
      setCheckOut("");
      setNotice("");
      return;
    }
    const includesReservation = blockedDates.some((blocked) => blocked > checkIn && blocked < value);
    if (includesReservation) {
      setNotice("That date range crosses a reserved night. Choose a shorter stay.");
      return;
    }
    setCheckOut(value);
    setNotice("");
  }

  function selectSite(site: typeof sites[number]) {
    setSelected(site);
    setCheckIn("");
    setCheckOut("");
    setNotice("");
    if (window.matchMedia("(max-width: 850px)").matches) {
      window.setTimeout(() => calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    }
  }

  function continueToCheckout() {
    if (!checkIn || !checkOut || nights < 1) {
      setNotice("Choose valid check-in and check-out dates first.");
      return;
    }
    if (blockedDates.some((date) => date >= checkIn && date < checkOut)) {
      setNotice("Part of that stay is already reserved. Please choose another range.");
      return;
    }
    const query = new URLSearchParams({
      site: String(selected.id), name: selected.name, checkIn, checkOut,
      nights: String(nights), rate: String(selected.rate), deposit: String(deposit),
    });
    window.location.assign(`/checkout?${query.toString()}`);
  }

  return (
    <SiteShell>
      <main className="inner-shell">
        <section className="page-title map-title">
          <div className="map-title-copy">
            <Link href="/" className="back-link">← Back to the retreat</Link>
            <p className="eyebrow light">Choose your campsite</p>
            <h1>
              <span>Find your corner of</span>
              <em>H&nbsp;Mountain.</em>
            </h1>
            <p>Select a numbered campsite, see the full month, and choose any open dates.</p>
          </div>
          <div
            className="map-title-scene"
            role="img"
            aria-label="A peaceful twilight campsite with a campfire, tent, camper, and purple-marked boundary trees"
          />
        </section>
        <section id="booking" className="booking-layout">
          <div className="property-map" aria-label="Interactive aerial property map with ten campsites">
            <img src="/assets/property-map.webp" alt="Aerial view of H Mountain Retreat with a gravel loop and wooded campsites" />
            {sites.map((site) => (
              <button
                key={site.id}
                className={`site-pin ${selected.id === site.id ? "selected" : ""}`}
                style={{ left: `${site.x}%`, top: `${site.y}%` }}
                onClick={() => selectSite(site)}
                aria-label={`Select campsite ${site.id}, ${site.name}`}
              >
                {site.id}
              </button>
            ))}
            <div className="map-legend">
              <span><i className="available" /> Available</span>
              <span><i className="selected-key" /> Selected</span>
            </div>
          </div>

          <aside className="booking-panel" aria-live="polite">
            <p className="eyebrow">Campsite {selected.id}</p>
            <h2>{selected.name}</h2>
            <div className="site-meta">
              <span>{selected.type}</span><span>${selected.rate} / night</span>
            </div>
            <p className="panel-copy">{selected.description}</p>
            <div className="calendar" ref={calendarRef}>
              <div className="calendar-header">
                <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">←</button>
                <strong>{monthLabel.format(month)}</strong>
                <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">→</button>
              </div>
              <div className="calendar-weekdays" aria-hidden="true">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="calendar-grid" role="grid" aria-label={`${monthLabel.format(month)} availability for campsite ${selected.id}`}>
                {days.map((date, index) => {
                  if (!date) return <span key={`empty-${index}`} className="calendar-empty" />;
                  const value = dateKey(date);
                  const booked = blockedDates.includes(value);
                  const past = value < today;
                  const start = value === checkIn;
                  const end = value === checkOut;
                  const inRange = Boolean(checkIn && checkOut && value > checkIn && value < checkOut);
                  return (
                    <button
                      type="button"
                      key={value}
                      disabled={booked || past}
                      className={`${booked ? "reserved" : ""} ${start || end ? "chosen" : ""} ${inRange ? "in-range" : ""}`}
                      onClick={() => chooseDate(value)}
                      aria-label={`${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}${booked ? ", reserved" : ", available"}`}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              <p className="calendar-instruction">
                {!checkIn ? "Select your arrival date." : !checkOut ? "Now select your departure date." : `${checkIn} through ${checkOut}`}
              </p>
            </div>
            <div className="availability-key">
              <span><i className="available" /> Available</span>
              <span><i className="booked" /> Reserved</span>
              <span><i className="selected-key" /> Your dates</span>
              <small>Calendar availability is currently sample data until the live reservation database is connected.</small>
            </div>
            {nights > 0 && (
              <div className="trip-summary">
                <div><span>{nights} {nights === 1 ? "night" : "nights"} × ${selected.rate}</span><strong>${nights * selected.rate}</strong></div>
                <div><span>Deposit due today</span><strong>${deposit}</strong></div>
                <small>Remaining balance: ${Math.max(0, nights * selected.rate - deposit)}</small>
              </div>
            )}
            {notice && <p className="form-notice" role="alert">{notice}</p>}
            <button
              className="button booking-button"
              onClick={continueToCheckout}
              disabled={!checkIn || !checkOut || nights < 1}
            >
              Continue to checkout <span>→</span>
            </button>
            <p className="secure-note">Secure Stripe deposits will activate when live booking is connected.</p>
          </aside>
        </section>
      </main>
    </SiteShell>
  );
}
