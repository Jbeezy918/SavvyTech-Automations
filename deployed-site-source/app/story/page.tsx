"use client";

import { useEffect, useState } from "react";
import { SiteShell } from "../page";

const frames = [
  {
    image: "/assets/story-lake-v2.webp",
    eyebrow: "Our story",
    lead: "A mountain built around",
    emphasis: "what H can mean.",
    meaning: "Health. Healing. Home. Hope.",
    copy: "H Mountain makes room for whatever renewal means to you—quiet reflection, a shared view, or simply time with people you love.",
  },
  {
    image: "/assets/story-play-v2.webp",
    eyebrow: "Time together",
    lead: "More room for laughter.",
    emphasis: "Less room for noise.",
    meaning: "Family. Friendship. Freedom.",
    copy: "The best retreat does not need a packed schedule. Sometimes it is a lawn game, a long conversation, and nowhere else you need to be.",
  },
  {
    image: "/assets/story-paddle-v2.webp",
    eyebrow: "Come back renewed",
    lead: "A slower pace.",
    emphasis: "A clearer way home.",
    meaning: "Rest. Reconnect. Renew.",
    copy: "From calm water to a fire under the stars, every H Mountain experience is designed to help the day loosen its grip.",
  },
];

export default function Story() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setActive((value) => (value + 1) % frames.length), 5200);
    return () => window.clearInterval(timer);
  }, []);

  const frame = frames[active];

  return (
    <SiteShell>
      <main className="inner-shell">
        <section className="story-stage">
          {frames.map((item, index) => (
            <div
              key={item.image}
              className={`story-frame ${index === active ? "active" : ""}`}
              style={{ backgroundImage: `url("${item.image}")` }}
              aria-hidden={index !== active}
            />
          ))}
          <div className="story-stage-copy" key={active}>
            <p className="eyebrow light">{frame.eyebrow}</p>
            <h1>
              <span className="story-line-top">{frame.lead}</span>{" "}
              <em className="story-line-bottom">{frame.emphasis}</em>
            </h1>
            <p className="story-meaning">{frame.meaning}</p>
            <p className="story-meaning">{frame.copy}</p>
          </div>
          <div className="story-dots" aria-label="Choose an H Mountain story">
            {frames.map((item, index) => (
              <button
                key={item.image}
                type="button"
                className={index === active ? "active" : ""}
                onClick={() => setActive(index)}
                aria-label={`Show story ${index + 1}`}
              />
            ))}
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
