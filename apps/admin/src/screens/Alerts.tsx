import { useEffect, useState } from 'react';
import type { AdminAlert } from '../api-types';
import { api } from '../api';
import { ErrorNote, Loading, Note } from '../ui';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatData(data: Record<string, string | number>): string {
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
}

export function Alerts() {
  const [alerts, setAlerts] = useState<AdminAlert[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    api
      .listAlerts()
      .then((value) => {
        if (active) setAlerts(value);
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error !== null) return <ErrorNote error={error} />;
  if (alerts === null) return <Loading />;

  return (
    <section>
      <h2>Alerts</h2>
      <p className="muted">
        Integrity alerts (C9). Alerts never claw back automatically; review, then adjust or
        rebuild from the Ledger screen.
      </p>
      {alerts.length === 0 ? (
        <Note>No alerts.</Note>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="muted">gamification/alerts</caption>
            <thead>
              <tr>
                <th scope="col">Created</th>
                <th scope="col">Kind</th>
                <th scope="col">Household</th>
                <th scope="col">Member</th>
                <th scope="col">Data</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>{formatDate(alert.createdAt)}</td>
                  <td>{alert.kind}</td>
                  <td>{alert.householdId}</td>
                  <td>{alert.memberId ?? '—'}</td>
                  <td>{formatData(alert.data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
