"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const services = [
  {
    number: "01",
    title: "AI Receptionist",
    description: "Answer every call, handle routine questions, qualify callers, and book appointments—even after hours.",
    outcomes: ["24/7 call answering", "Scheduling and transfers", "Call summaries and follow-up"],
    accent: "mint",
  },
  {
    number: "02",
    title: "AI Sales Agent",
    description: "Respond while leads are still interested, qualify the opportunity, and move the right people toward a conversation.",
    outcomes: ["Fast lead response", "Text and email follow-up", "CRM notes and sales handoff"],
    accent: "coral",
  },
  {
    number: "03",
    title: "Workflow Automation",
    description: "Connect the tools you already use and remove repetitive handoffs, re-entry, reminders, and reporting work.",
    outcomes: ["Cross-app workflows", "Approvals and notifications", "Reliable audit trails"],
    accent: "blue",
  },
  {
    number: "04",
    title: "Custom Apps & Dashboards",
    description: "Replace spreadsheet sprawl with focused tools that give your team one clear place to work and decide.",
    outcomes: ["Internal business apps", "Live operational dashboards", "Purpose-built integrations"],
    accent: "violet",
  },
];

const faqs = [
  ["Will the AI sound robotic?", "No. We design a natural voice, vocabulary, and call flow for your business, then test real scenarios before launch."],
  ["Can a person take over?", "Yes. Calls and conversations can transfer to your team based on urgency, topic, confidence, or customer request."],
  ["Does this replace our current systems?", "Usually not. We connect to the calendar, CRM, inbox, phone, or database you already use whenever that is the best path."],
  ["How fast can we launch?", "A focused Jumpstart can be completed in days. A production AI agent or custom workflow normally launches in stages after discovery and testing."],
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = encodeURIComponent(`SavvyTech consultation — ${data.get("company") || data.get("name")}`);
    const body = encodeURIComponent(
      `Name: ${data.get("name")}\nCompany: ${data.get("company")}\nEmail: ${data.get("email")}\nInterest: ${data.get("interest")}\n\nWhat they want to improve:\n${data.get("message")}`,
    );
    setSubmitted(true);
    window.location.href = `mailto:savvytechconsult@gmail.com?subject=${subject}&body=${body}`;
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link href="#top" className="brand" aria-label="SavvyTech Automations home">
          <span className="brand-mark">S</span>
          <span><strong>SavvyTech</strong><small>Automations</small></span>
        </Link>
        <button className="menu-button" aria-expanded={menuOpen} aria-controls="primary-nav" onClick={() => setMenuOpen(!menuOpen)}>
          <span /><span /><span /><b>Menu</b>
        </button>
        <nav id="primary-nav" className={menuOpen ? "open" : ""} aria-label="Main navigation">
          <Link href="#services" onClick={() => setMenuOpen(false)}>Services</Link>
          <Link href="#sopsync" onClick={() => setMenuOpen(false)}>SOPsync</Link>
          <Link href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
          <Link href="#contact" className="nav-cta" onClick={() => setMenuOpen(false)}>Book a strategy call</Link>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span /> AI that works like part of your team</p>
            <h1>Never miss the call.<br />Never lose the <em>lead.</em></h1>
            <p className="hero-lede">SavvyTech builds AI receptionists, sales agents, and business automations that answer customers, book appointments, follow up, and keep work moving.</p>
            <div className="hero-actions">
              <Link href="#contact" className="button primary">Plan your AI agent <span>↗</span></Link>
              <Link href="#agent-demo" className="button secondary">See how it works</Link>
            </div>
            <div className="trust-row">
              <span><i>✓</i> Human handoff</span>
              <span><i>✓</i> Your tools, connected</span>
              <span><i>✓</i> Built around your rules</span>
            </div>
          </div>

          <div className="agent-stage" id="agent-demo" aria-label="Example AI receptionist conversation">
            <div className="signal-orbit"><span /><span /><span /></div>
            <div className="call-card">
              <div className="call-head">
                <span className="avatar">SA</span>
                <span><strong>Savvy AI Receptionist</strong><small><i /> On a customer call</small></span>
                <b>02:14</b>
              </div>
              <div className="message customer">I need to schedule service this Thursday.</div>
              <div className="message agent">Absolutely. I have openings at 10:30 AM and 2:00 PM. Which works better?</div>
              <div className="message customer short">2:00 PM, please.</div>
              <div className="automation-event"><span>✓</span><div><strong>Appointment booked</strong><small>Calendar updated · Confirmation sent</small></div></div>
            </div>
            <div className="metric-chip top"><small>Response time</small><strong>&lt; 2 sec</strong></div>
            <div className="metric-chip bottom"><small>Calls captured</small><strong>24 / 7</strong></div>
          </div>
        </section>

        <section className="proof-strip" aria-label="SavvyTech service promise">
          <p>One capable partner—from the first customer call to the last back-office handoff.</p>
          <div><span>VOICE</span><span>CHAT</span><span>SMS</span><span>EMAIL</span><span>WORKFLOWS</span></div>
        </section>

        <section className="services section" id="services">
          <div className="section-heading">
            <div><p className="eyebrow"><span /> What we build</p><h2>Put AI where work<br /><em>gets stuck.</em></h2></div>
            <p>Start with the bottleneck costing you the most time or opportunity. We design the smallest useful system, prove it, and expand from there.</p>
          </div>
          <div className="service-grid">
            {services.map((service) => (
              <article className={`service-card ${service.accent}`} key={service.title}>
                <div className="service-top"><span>{service.number}</span><i>↗</i></div>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <ul>{service.outcomes.map((item) => <li key={item}>{item}</li>)}</ul>
              </article>
            ))}
          </div>
        </section>

        <section className="agent-flow section">
          <div className="flow-copy">
            <p className="eyebrow light"><span /> From hello to handled</p>
            <h2>A conversation that<br /><em>actually goes somewhere.</em></h2>
            <p>Your AI agent follows your playbook, takes approved actions, and brings in a person whenever judgment or a personal touch matters.</p>
            <Link href="#contact" className="text-link">Map my customer journey <span>→</span></Link>
          </div>
          <ol className="flow-steps">
            <li><b>01</b><div><strong>Answer instantly</strong><span>Voice, chat, text, or email</span></div></li>
            <li><b>02</b><div><strong>Understand intent</strong><span>Questions, needs, urgency, fit</span></div></li>
            <li><b>03</b><div><strong>Take the next action</strong><span>Book, qualify, route, or update</span></div></li>
            <li><b>04</b><div><strong>Keep your team informed</strong><span>Summaries, records, alerts, follow-up</span></div></li>
          </ol>
        </section>

        <section className="sopsync section" id="sopsync">
          <div className="sopsync-visual" aria-label="SOPsync process document preview">
            <div className="doc back"><span /><span /><span /></div>
            <div className="doc front"><p>SOPsync</p><h3>Process Health Report</h3><div className="score"><strong>87</strong><span>Process score<br /><b>↑ 14%</b></span></div><i /><i /><i /><small>3 improvement opportunities identified</small></div>
          </div>
          <div className="sopsync-copy">
            <p className="product-label">A SAVVYTECH PRODUCT</p>
            <h2>Meet SOPsync.</h2>
            <p className="product-lede">Turn the way work really happens into clear, usable documentation.</p>
            <p>SOPsync helps teams capture processes, find gaps, compare documented work to actual work, and create audit-ready instructions without rebuilding everything from memory.</p>
            <div className="product-points"><span>Process discovery</span><span>Gap analysis</span><span>Illustrated SOPs</span><span>Training-ready output</span></div>
            <Link href="#contact" className="button dark">Ask about SOPsync <span>↗</span></Link>
          </div>
        </section>

        <section className="pricing section" id="pricing">
          <div className="section-heading compact">
            <div><p className="eyebrow"><span /> A clear way to start</p><h2>Start focused.<br /><em>Scale what works.</em></h2></div>
            <p>Preview pricing establishes the shape of each engagement. Final rates depend on call volume, integrations, AI usage, and support requirements.</p>
          </div>
          <div className="pricing-grid">
            <article className="price-card"><p className="price-label">DISCOVER</p><h3>Automation Jumpstart</h3><p className="price"><strong>$499</strong><span>one-time</span></p><p>For one focused opportunity that needs a practical launch plan.</p><ul><li>Process and opportunity review</li><li>Solution blueprint</li><li>Prototype or workflow map</li><li>Build estimate and launch plan</li></ul><Link href="#contact" className="button secondary wide">Start a Jumpstart</Link></article>
            <article className="price-card featured"><span className="popular">MOST POPULAR</span><p className="price-label">LAUNCH</p><h3>Managed AI Agent</h3><p className="price"><strong>Custom</strong><span>setup + monthly</span></p><p>For a production receptionist or sales agent connected to your business.</p><ul><li>Conversation and escalation design</li><li>Phone, calendar, or CRM connection</li><li>Testing and team handoff</li><li>Monitoring and improvement</li></ul><Link href="#contact" className="button primary wide">Plan my AI agent</Link></article>
            <article className="price-card"><p className="price-label">TRANSFORM</p><h3>Custom Automation</h3><p className="price"><strong>Scoped</strong><span>project or retainer</span></p><p>For connected workflows, internal apps, dashboards, and larger builds.</p><ul><li>Requirements and workflow design</li><li>Custom implementation</li><li>Documentation and training</li><li>Ongoing support options</li></ul><Link href="#contact" className="button secondary wide">Discuss a custom build</Link></article>
          </div>
        </section>

        <section className="faq section">
          <div className="faq-heading"><p className="eyebrow"><span /> Questions, answered</p><h2>What teams ask<br /><em>before they start.</em></h2></div>
          <div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
        </section>

        <section className="contact section" id="contact">
          <div className="contact-copy">
            <p className="eyebrow light"><span /> Let&apos;s make work lighter</p>
            <h2>What should your business<br /><em>never have to do manually again?</em></h2>
            <p>Tell us where customers wait, leads go quiet, or your team loses time. We&apos;ll help you choose the smartest place to begin.</p>
            <div className="contact-promise"><span>1</span><p><strong>One practical conversation</strong>No jargon-heavy sales pitch.</p></div>
            <div className="contact-promise"><span>2</span><p><strong>A focused recommendation</strong>Clear scope, next step, and expected value.</p></div>
          </div>
          <form className="contact-form" onSubmit={submitInquiry}>
            <div className="form-row"><label>Your name<input name="name" autoComplete="name" required placeholder="Joe Smith" /></label><label>Work email<input name="email" type="email" autoComplete="email" required placeholder="joe@company.com" /></label></div>
            <label>Company<input name="company" autoComplete="organization" placeholder="Your company" /></label>
            <label>What are you interested in?<select name="interest" defaultValue="AI Receptionist"><option>AI Receptionist</option><option>AI Sales Agent</option><option>Workflow Automation</option><option>Custom App or Dashboard</option><option>SOPsync</option><option>Not sure yet</option></select></label>
            <label>What would you like to improve?<textarea name="message" required rows={4} placeholder="We miss calls after hours and spend too much time scheduling…" /></label>
            <button className="button primary wide" type="submit">Request a strategy call <span>↗</span></button>
            <small>{submitted ? "Your email app should now be open with the details ready to send." : "Preview contact flow opens a prepared email. A CRM or form endpoint will be connected before launch."}</small>
          </form>
        </section>
      </main>

      <footer>
        <div className="footer-main"><Link href="#top" className="brand footer-brand"><span className="brand-mark">S</span><span><strong>SavvyTech</strong><small>Automations</small></span></Link><p>AI agents and automation built around the way your business actually works.</p><Link href="mailto:savvytechconsult@gmail.com">savvytechconsult@gmail.com</Link></div>
        <div className="footer-links"><div><strong>Services</strong><Link href="#services">AI Receptionist</Link><Link href="#services">AI Sales Agent</Link><Link href="#services">Workflow Automation</Link></div><div><strong>Company</strong><Link href="#sopsync">SOPsync</Link><Link href="#pricing">Pricing</Link><Link href="#contact">Contact</Link></div><div><strong>Legal</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></div>
        <p className="copyright">© {new Date().getFullYear()} SavvyTech Consulting LLC. All rights reserved.</p>
      </footer>
    </div>
  );
}
