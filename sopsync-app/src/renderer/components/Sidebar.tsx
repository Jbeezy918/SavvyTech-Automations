import React from 'react';

export type Section = 'dashboard' | 'capture' | 'review' | 'health' | 'about';

const ITEMS: { key: Section; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '▦' },
  { key: 'capture', label: 'Capture', icon: '●' },
  { key: 'review', label: 'Review Board', icon: '▤' },
  { key: 'health', label: 'System Health', icon: '✚' },
  { key: 'about', label: 'About & Privacy', icon: 'ⓘ' },
];

export function Sidebar({ section, onSelect, capturing }: {
  section: Section; onSelect: (s: Section) => void; capturing: boolean;
}): JSX.Element {
  return (
    <nav className="sidebar">
      <div className="brand">SOP<span>sync</span></div>
      <div className="brand-sub">SavvyTech Automations</div>
      <ul>
        {ITEMS.map((it) => (
          <li key={it.key}>
            <button
              className={section === it.key ? 'active' : ''}
              onClick={() => onSelect(it.key)}
            >
              <span className="icon">{it.icon}</span>{it.label}
              {it.key === 'capture' && capturing && <span className="rec-dot" aria-label="recording" />}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
