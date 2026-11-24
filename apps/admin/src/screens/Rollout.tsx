import { useEffect, useState } from 'react';
import type { AdminConfig } from '../api-types';
import type { RolloutMode } from '../engine-types';
import { api } from '../api';
import { ConfirmButton, ErrorNote, Loading } from '../ui';
import { parseConfigForm } from '../validation';

const MODES: readonly RolloutMode[] = ['off', 'shadow', 'live'];

export function Rollout() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [mode, setMode] = useState('');
  const [livePercent, setLivePercent] = useState('');
  const [controlPercent, setControlPercent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [savedNote, setSavedNote] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getConfig()
      .then((value) => {
        if (!active) return;
        setConfig(value);
        setMode(value.mode);
        setLivePercent(String(value.livePercent));
        setControlPercent(String(value.controlPercent));
      })
      .catch((e) => {
        if (active) setLoadError(e);
      });
    return () => {
      active = false;
    };
  }, []);

  const parsed = parseConfigForm(mode, livePercent, controlPercent);
  const dirty =
    config !== null &&
    (mode !== config.mode ||
      livePercent !== String(config.livePercent) ||
      controlPercent !== String(config.controlPercent));
  const valid = parsed.value !== null;

  async function save() {
    if (!parsed.value) return;
    setSaving(true);
    setSaveError(null);
    setSavedNote('');
    try {
      const updated = await api.setConfig(parsed.value);
      setConfig(updated);
      setMode(updated.mode);
      setLivePercent(String(updated.livePercent));
      setControlPercent(String(updated.controlPercent));
      setSavedNote('Saved. New households pick up the cohorts on their next engine run.');
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  }

  if (loadError !== null) return <ErrorNote error={loadError} />;
  if (config === null) return <Loading />;

  return (
    <section>
      <h2>Rollout</h2>
      {savedNote ? (
        <p role="status" className="ok">
          {savedNote}
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor="rollout-mode">Mode</label>
        <select
          id="rollout-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as RolloutMode)}
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label htmlFor="rollout-live">livePercent (households shown the program)</label>
        <input
          id="rollout-live"
          type="number"
          value={livePercent}
          onChange={(e) => setLivePercent(e.target.value)}
        />

        <label htmlFor="rollout-control">controlPercent (explicit control group)</label>
        <input
          id="rollout-control"
          type="number"
          value={controlPercent}
          onChange={(e) => setControlPercent(e.target.value)}
        />

        <p className="muted">
          live + control must stay at or below 100. livePercent → 'live' cohort, the next
          controlPercent → 'control', everyone else 'shadow'.
        </p>

        <label htmlFor="rollout-salt">cohortSalt (read-only)</label>
        <input id="rollout-salt" value={config.cohortSalt} readOnly />

        <p className="muted">
          Published rule set: {config.activeVersion ?? 'built-in defaults'} · previous:{' '}
          {config.previousVersion ?? 'none'}
        </p>

        {parsed.errors.length > 0 ? (
          <ul className="errors" role="alert">
            {parsed.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        {saveError !== null ? <ErrorNote error={saveError} /> : null}

        <ConfirmButton
          label={saving ? 'Saving…' : 'Save rollout'}
          confirmText={`Save the rollout config (mode ${parsed.value?.mode ?? mode}, live ${parsed.value?.livePercent ?? livePercent}, control ${parsed.value?.controlPercent ?? controlPercent})?`}
          onConfirm={() => void save()}
          disabled={!valid || !dirty || saving}
        />
      </form>
    </section>
  );
}
