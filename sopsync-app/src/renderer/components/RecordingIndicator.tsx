import React from 'react';

/**
 * Always-visible capture status banner (spec section 2: "Visible capture
 * indicator at all times"). Also surfaces a warning when the Keychain is
 * unavailable, so the operator knows secrets are not being securely stored.
 */
export function RecordingIndicator({ capturing, keychainAvailable }: {
  capturing: boolean; keychainAvailable: boolean;
}): JSX.Element {
  return (
    <div className={`rec-banner ${capturing ? 'on' : 'off'}`}>
      <span className="rec-status">
        {capturing ? <><span className="rec-dot big" /> Recording — this session is being captured with authorization</>
          : <>Not recording</>}
      </span>
      {!keychainAvailable && (
        <span className="rec-warn">⚠ Keychain unavailable — running in non-secure mode. Do not use for production data.</span>
      )}
    </div>
  );
}
