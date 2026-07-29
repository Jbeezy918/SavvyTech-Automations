import Link from "next/link";
import { SiteShell } from "../page";

const onSite = [
  ["Tea hut", "A cozy place for warm tea, slow conversation, and quiet mornings surrounded by the woods.", "Open with retreat"],
  ["Light & sound meditation", "Settle beneath soft violet-toned light with calming music in a space created for stillness and personal reflection.", "Guided experience"],
  ["Woodland campsites", "Private places for tents and campers, with the night sky, tree line, and campfire close at hand.", "Reserve a site"],
  ["Walking paths", "Unhurried paths for fresh air, gentle movement, and a little time away from everything.", "Explore freely"],
  ["Gathering spaces", "Natural settings for picnics, reunions, celebrations, workshops, and meaningful group time.", "Groups welcome"],
  ["Huts & camp store", "Hand-built round retreat huts and an on-site store with essentials and H Mountain goods are planned additions.", "Coming soon"],
];

const nearby = [
  ["Horseback trails", "Old Two Toes Equestrian Trail winds nearly six miles through forest, creeks, and meadows."],
  ["Hiking", "Choose from easy nature walks, lakeside loops, rugged mountain trails, and the historic Robbers Cave hike."],
  ["Lakes & paddling", "Lake Carlton, Coon Creek Lake, and Wayne Wallace Reservoir offer no-wake boating and seasonal rentals."],
  ["Swimming & fishing", "Designated swimming areas and fishing for bass, crappie, sunfish, catfish, and seasonal trout."],
  ["Birding", "Woodpeckers, hawks, warblers, and other species make the park especially rewarding during migration seasons."],
  ["Mountain biking", "Eight miles of rugged, challenging mountain-bike trails cross the park’s rocky terrain."],
];

export default function Amenities() {
  return (
    <SiteShell>
      <main className="inner-shell amenities-page">
        <section className="amenities-hero">
          <div className="amenities-hero-copy">
            <p className="eyebrow light">Stay · Explore · Restore</p>
            <h1>A full retreat experience, <em>from first light to campfire.</em></h1>
            <p>
              Share tea, ride the trails, settle into meditation, and end the day
              beneath an Oklahoma sky. H Mountain gives families, friends, and
              retreat groups room to reconnect at their own pace.
            </p>
            <div className="button-row">
              <Link href="/map" className="button primary">Reserve a campsite <span>↗</span></Link>
              <a href="#nearby" className="button ghost">Explore nearby</a>
            </div>
          </div>
          <div className="campfire-caption">
            <span>Evening at H Mountain</span>
            <strong>Camp together. Stay awhile.</strong>
          </div>
        </section>

        <section className="wildlife-banner">
          <div className="marked-tree" aria-hidden="true"><span /></div>
          <div>
            <p className="eyebrow">Our land promise</p>
            <h2>Wildlife is welcome here, too.</h2>
            <p>
              Purple-marked trees identify the H Mountain boundary and create a
              quiet, no-hunting space inside the retreat. It is not a judgment
              on hunting elsewhere—it is how we protect the campground, respect
              the animals already here, and keep the land peaceful for guests.
            </p>
          </div>
        </section>

        <section className="content-section amenity-intro">
          <p className="eyebrow">At H Mountain</p>
          <div>
            <h2>Simple comforts.<br /><em>Meaningful experiences.</em></h2>
            <p>These are the experiences planned for the property and the heart of an H Mountain stay.</p>
          </div>
        </section>

        <section className="amenity-cards">
          {onSite.map(([title, text, note], index) => (
            <article key={title}>
              <span className="card-number">0{index + 1}</span>
              <p className="amenity-note">{note}</p>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </section>

        <section className="meditation-feature">
          <div
            className="meditation-visual"
            role="img"
            aria-label="A peaceful timber meditation room with warm and soft lavender triangular lighting"
          />
          <div>
            <p className="eyebrow light">Quiet the noise</p>
            <h2>Soft light. Gentle music. <em>Time to find yourself.</em></h2>
            <p>
              Step into a softly illuminated meditation space shaped around
              breathwork, stillness, and restorative sound. No agenda—just room
              to slow down and listen inward.
            </p>
            <small>Offered as a relaxation and wellness experience, not medical treatment.</small>
          </div>
        </section>

        <section id="nearby" className="nearby-section">
          <div className="nearby-heading">
            <div>
              <p className="eyebrow">Minutes from more adventure</p>
              <h2>Make Robbers Cave part of your stay.</h2>
            </div>
            <p>
              H Mountain is your quiet home base for a much bigger family
              adventure in Robbers Cave country.
            </p>
          </div>
          <div className="nearby-grid">
            {nearby.map(([title, text]) => (
              <article key={title}><h3>{title}</h3><p>{text}</p></article>
            ))}
          </div>
          <div className="nearby-source">
            <p>Park conditions, rentals, hours, and activity availability can change. Confirm details before your visit.</p>
            <a href="https://www.robberscavestatepark.com/?detailed_information=activities" target="_blank" rel="noreferrer" className="text-link">
              View Robbers Cave activities <span>↗</span>
            </a>
          </div>
        </section>

        <section className="eufaula-feature">
          <div
            className="eufaula-photo"
            role="img"
            aria-label="Lake Eufaula in southeastern Oklahoma"
          />
          <div className="eufaula-copy">
            <p className="eyebrow light">Add water to your weekend</p>
            <h2>Make a day of it at <em>Lake Eufaula.</em></h2>
            <p>
              Pair a quiet stay at H Mountain with open water, wooded shoreline,
              and a full day outside. Lake Eufaula offers boating, fishing,
              swimming, hiking, and family-friendly recreation across the lake
              area.
            </p>
            <div className="trail-points">
              <span>Boating & fishing</span>
              <span>Swimming areas</span>
              <span>Trails & state parks</span>
            </div>
            <a
              href="https://www.travelok.com/lake_eufaula_area"
              target="_blank"
              rel="noreferrer"
              className="text-link light"
            >
              Explore the Lake Eufaula area <span>↗</span>
            </a>
            <small className="image-source">Lake photo: U.S. Army Corps of Engineers.</small>
          </div>
        </section>

        <section className="amenities-cta">
          <p className="eyebrow light">Your mountain stay</p>
          <h2>Pick your campsite.<br /><em>Build your experience.</em></h2>
          <Link href="/map" className="button primary">Check dates & reserve <span>↗</span></Link>
        </section>
      </main>
    </SiteShell>
  );
}
