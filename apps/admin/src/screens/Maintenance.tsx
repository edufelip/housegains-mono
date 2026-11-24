import { useState } from 'react';
import { api } from '../api';
import { ConfirmButton, ErrorNote } from '../ui';

export function Maintenance() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState('');

  async function backfill() {
    setBusy(true);
    setError(null);
    setNote('');
    try {
      const result = await api.backfillLevelFloors();
      setNote(`Done. ${result.updatedMembers} member(s) got their levelFloor and xpPeak set.`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Maintenance</h2>
      <p className="muted">
        Backfill sets levelFloor = floor(xp / 100) + 1 and xpPeak = max(xp, 0) for every
        member still missing them (C3), so the new curve never lowers a displayed level.
      </p>
      {note ? (
        <p role="status" className="ok">
          {note}
        </p>
      ) : null}
      {error !== null ? <ErrorNote error={error} /> : null}
      <ConfirmButton
        label={busy ? 'Backfilling…' : 'Backfill level floors'}
        confirmText="Backfill levelFloor and xpPeak for members missing them?"
        disabled={busy}
        onConfirm={() => void backfill()}
      />
    </section>
  );
}
