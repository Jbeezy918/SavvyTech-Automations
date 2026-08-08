import React, { useState } from 'react';
import type { FirstRunInput } from '@shared/ipc';

/**
 * Guided first-run setup (spec section 22). Collects the administrator,
 * organization, first client, AI and voice preferences, and reviews privacy
 * rules before creating the initial records.
 */
const STEPS = ['Administrator', 'Organization & Client', 'AI Provider', 'Voice', 'Privacy Review'] as const;

export function OnboardingWizard({ onDone }: { onDone: () => void }): JSX.Element {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FirstRunInput>({
    organizationName: 'SavvyTech Automations',
    adminName: '', adminEmail: '', storageDir: null,
    aiProvider: 'none', voiceEnabled: false, firstClientName: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FirstRunInput>(k: K, v: FirstRunInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const finish = async () => {
    setBusy(true); setError(null);
    try {
      await window.sopsync.setupFirstRun(form);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="wizard">
      <div className="wizard-card">
        <h1>Welcome to SOPsync</h1>
        <div className="steps">
          {STEPS.map((s, i) => <span key={s} className={i === step ? 'active' : i < step ? 'done' : ''}>{s}</span>)}
        </div>

        {step === 0 && (
          <div className="wizard-body">
            <label className="field">Administrator name
              <input value={form.adminName} onChange={(e) => set('adminName', e.target.value)} placeholder="Jane Consultant" />
            </label>
            <label className="field">Administrator email
              <input value={form.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} placeholder="jane@savvytech.co" />
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="wizard-body">
            <label className="field">Organization name
              <input value={form.organizationName} onChange={(e) => set('organizationName', e.target.value)} />
            </label>
            <label className="field">First client name
              <input value={form.firstClientName} onChange={(e) => set('firstClientName', e.target.value)} placeholder="Acme Corp" />
            </label>
          </div>
        )}
        {step === 2 && (
          <div className="wizard-body">
            <label className="field">AI provider
              <select value={form.aiProvider} onChange={(e) => set('aiProvider', e.target.value as FirstRunInput['aiProvider'])}>
                <option value="none">None (deterministic analysis only)</option>
                <option value="local">Local model</option>
                <option value="openai">OpenAI (requires your key)</option>
                <option value="anthropic">Anthropic (requires your key)</option>
              </select>
            </label>
            <p className="muted">Screenshots and business data are never sent to an external provider unless
              you explicitly select and authorize one. Keys are stored in the macOS Keychain, never on disk.</p>
          </div>
        )}
        {step === 3 && (
          <div className="wizard-body">
            <label className="field checkbox">
              <input type="checkbox" checked={form.voiceEnabled} onChange={(e) => set('voiceEnabled', e.target.checked)} />
              Enable voice interaction (push-to-talk). Spoken announcements stay off unless enabled.
            </label>
          </div>
        )}
        {step === 4 && (
          <div className="wizard-body">
            <h3>Privacy rules you are agreeing to</h3>
            <ul className="privacy-list">
              <li>Capture requires authorization and shows a visible recording indicator at all times.</li>
              <li>Keystroke characters, passwords, and clipboard contents are never stored.</li>
              <li>Original screenshots are immutable; redaction creates derived copies.</li>
              <li>All data is stored locally and encrypted; nothing is uploaded without approval.</li>
              <li>Excluded apps/sites are never captured.</li>
            </ul>
            {error && <p className="error">{error}</p>}
          </div>
        )}

        <div className="wizard-nav">
          {step > 0 && <button onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
          {step < STEPS.length - 1
            ? <button className="primary" onClick={() => setStep(step + 1)}>Next</button>
            : <button className="primary" onClick={finish} disabled={busy}>{busy ? 'Setting up…' : 'Finish setup'}</button>}
        </div>
      </div>
    </div>
  );
}
