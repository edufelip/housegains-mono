import { useEffect, useMemo, useState } from 'react';
import type { AdminRuleSet, AdminSimulateResponse } from '../api-types';
import { api } from '../api';
import { ErrorNote, Loading, Note } from '../ui';
import { parseDays } from '../validation';

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function Simulator() {
  const [list, setList] = useState<AdminRuleSet[] | null>(null);
  const [listError, setListError] = useState<unknown>(null);
  const [days, setDays] = useState('7');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AdminSimulateResponse | null>(null);
  const [runError, setRunError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    api
      .listRuleSets()
      .then((ruleSets) => {
        if (active) setList(ruleSets);
      })
      .catch((e) => {
        if (active) setListError(e);
      });
    return () => {
      active = false;
    };
  }, []);

  // The current draft: the highest-numbered draft version.
  const draft = useMemo(
    () =>
      list
        ?.filter((r) => r.status === 'draft')
        .reduce<AdminRuleSet | null>(
          (best, r) => (best === null || r.version > best.version ? r : best),
          null,
        ) ?? null,
    [list],
  );

  const parsedDays = parseDays(days);

  async function run() {
    if (!draft || parsedDays.value === null) return;
    setRunning(true);
    setRunError(null);
    setResult(null);
    try {
      setResult(await api.simulate({ rules: draft.rules, days: parsedDays.value }));
    } catch (e) {
      setRunError(e);
    } finally {
      setRunning(false);
    }
  }

  if (listError !== null) return <ErrorNote error={listError} />;
  if (list === null) return <Loading />;

  return (
    <section>
      <h2>Simulator</h2>
      {draft ? (
        <p className="muted">
          Replays the last N days of household ledger rows through published vs draft
          v{draft.version} — nothing is written.
        </p>
      ) : (
        <Note>No draft rule set. Create one in Rule sets to run a simulation.</Note>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label htmlFor="sim-days">Days to replay (1–28)</label>
        <input
          id="sim-days"
          type="number"
          min={1}
          max={28}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
        {parsedDays.error ? (
          <p role="alert" className="error">
            {parsedDays.error}
          </p>
        ) : null}

        <div className="row-actions">
          <button type="submit" disabled={!draft || parsedDays.value === null || running}>
            {running ? 'Running…' : 'Run simulation'}
          </button>
        </div>
      </form>

      {runError !== null ? <ErrorNote error={runError} /> : null}
      {running ? <Loading label="Replaying ledger rows…" /> : null}

      {result ? (
        <>
          <div className="table-wrap">
            <table>
              <caption className="muted">
                Last {result.days} days · totals (published → draft)
              </caption>
              <thead>
                <tr>
                  <th scope="col">Side</th>
                  <th scope="col">Ganhos</th>
                  <th scope="col">Zelo</th>
                  <th scope="col">Members</th>
                  <th scope="col">Cap hits</th>
                  <th scope="col">Avg / member</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">published</th>
                  <td>{result.published.ganhos}</td>
                  <td>{result.published.zelo}</td>
                  <td>{result.published.membersAffected}</td>
                  <td>{result.published.capHits}</td>
                  <td>{result.published.averagePerMember}</td>
                </tr>
                <tr>
                  <th scope="row">draft</th>
                  <td>{result.draft.ganhos}</td>
                  <td>{result.draft.zelo}</td>
                  <td>{result.draft.membersAffected}</td>
                  <td>{result.draft.capHits}</td>
                  <td>{result.draft.averagePerMember}</td>
                </tr>
                <tr>
                  <th scope="row">delta</th>
                  <td>{signed(result.draft.ganhos - result.published.ganhos)}</td>
                  <td>{signed(result.draft.zelo - result.published.zelo)}</td>
                  <td>{signed(result.draft.membersAffected - result.published.membersAffected)}</td>
                  <td>{signed(result.draft.capHits - result.published.capHits)}</td>
                  <td>
                    {signed(result.draft.averagePerMember - result.published.averagePerMember)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table>
              <caption className="muted">Per rule</caption>
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col">Track</th>
                  <th scope="col">Published total</th>
                  <th scope="col">Draft total</th>
                  <th scope="col">Δ total</th>
                  <th scope="col">Members</th>
                  <th scope="col">Cap hits</th>
                  <th scope="col">Avg / member</th>
                </tr>
              </thead>
              <tbody>
                {result.perRule.map((row) => (
                  <tr key={row.ruleId}>
                    <td>{row.ruleId}</td>
                    <td>{row.track}</td>
                    <td>{row.published?.total ?? '—'}</td>
                    <td>{row.draft?.total ?? '—'}</td>
                    <td>
                      {row.published && row.draft
                        ? signed(row.draft.total - row.published.total)
                        : '—'}
                    </td>
                    <td>{row.draft?.membersAffected ?? '—'}</td>
                    <td>{row.draft?.capHits ?? '—'}</td>
                    <td>{row.draft?.averagePerMember ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
