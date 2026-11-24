import { useEffect, useMemo, useState } from 'react';
import type { AdminRuleSet } from '../api-types';
import { api } from '../api';
import { formatDiffValue, structuralDiff, type DiffEntry } from '../diff';
import { EarnRuleEditor } from './EarnRuleEditor';
import { ConfirmButton, ErrorNote, Loading, Note } from '../ui';

type ListState =
  | { phase: 'loading' }
  | { phase: 'error'; error: unknown }
  | { phase: 'ready'; ruleSets: AdminRuleSet[] };

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleString();
}

function DiffTable({ entries }: { entries: DiffEntry[] }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="muted">JSON diff vs the published version</caption>
        <thead>
          <tr>
            <th scope="col">Path</th>
            <th scope="col">Change</th>
            <th scope="col">Published</th>
            <th scope="col">This version</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.path}:${entry.type}`}>
              <td>{entry.path}</td>
              <td>{entry.type}</td>
              <td>
                {entry.type === 'added' ? '—' : formatDiffValue(entry.before)}
              </td>
              <td>
                {entry.type === 'removed' ? '—' : formatDiffValue(entry.after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RuleSets() {
  const [list, setList] = useState<ListState>({ phase: 'loading' });
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [actionNote, setActionNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  async function reload(keepVersion = true) {
    setList({ phase: 'loading' });
    try {
      const ruleSets = await api.listRuleSets();
      setList({ phase: 'ready', ruleSets });
      if (!keepVersion) return;
      setSelectedVersion((current) =>
        current !== null && ruleSets.some((r) => r.version === current)
          ? current
          : (ruleSets[0]?.version ?? null),
      );
    } catch (e) {
      setList({ phase: 'error', error: e });
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const selected = useMemo(
    () =>
      list.phase === 'ready'
        ? list.ruleSets.find((r) => r.version === selectedVersion) ?? null
        : null,
    [list, selectedVersion],
  );
  const published = useMemo(
    () => (list.phase === 'ready' ? list.ruleSets.find((r) => r.status === 'published') ?? null : null),
    [list],
  );

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setActionError(null);
    setActionNote('');
    try {
      setActionNote(await action());
      await reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }

  if (list.phase === 'loading') return <Loading />;
  if (list.phase === 'error') return <ErrorNote error={list.error} />;

  const { ruleSets } = list;

  return (
    <section>
      <h2>Rule sets</h2>
      {actionNote ? (
        <p role="status" className="ok">
          {actionNote}
        </p>
      ) : null}
      {actionError !== null ? <ErrorNote error={actionError} /> : null}

      <div className="table-wrap">
        <table>
          <caption className="muted">gamification/ruleSets versions</caption>
          <thead>
            <tr>
              <th scope="col">Version</th>
              <th scope="col">Status</th>
              <th scope="col">Notes</th>
              <th scope="col">Created by</th>
              <th scope="col">Created at</th>
              <th scope="col">Published at</th>
            </tr>
          </thead>
          <tbody>
            {ruleSets.map((ruleSet) => (
              <tr
                key={ruleSet.version}
                onClick={() => {
                  setSelectedVersion(ruleSet.version);
                  setEditingRuleId(null);
                }}
              >
                <td>
                  <button type="button" aria-pressed={ruleSet.version === selectedVersion}>
                    v{ruleSet.version}
                  </button>
                </td>
                <td>{ruleSet.status}</td>
                <td>{ruleSet.notes}</td>
                <td>{ruleSet.createdBy}</td>
                <td>{formatDate(ruleSet.createdAt)}</td>
                <td>{formatDate(ruleSet.publishedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ruleSets.length === 0 ? (
        <Note>No rule sets yet. Publish a first version, then draft changes on top of it.</Note>
      ) : null}

      <div className="row-actions">
        <ConfirmButton
          label="New draft from published"
          confirmText={`Create a new draft from published v${published?.version}?`}
          disabled={busy || !published}
          onConfirm={() => {
            if (!published) return;
            void run(async () => {
              const saved = await api.saveDraft({
                notes: `Draft from v${published.version}`,
                rules: published.rules,
              });
              return `Draft v${saved.version} created.`;
            });
          }}
        />
        {selected && selected.status !== 'published' ? (
          <ConfirmButton
            label={`Publish v${selected.version}`}
            confirmText={`Publish v${selected.version}? New events use it immediately; households keep their ledger history.`}
            disabled={busy}
            onConfirm={() =>
              void run(async () => {
                const result = await api.publish({ version: selected.version });
                return `Published. Active version: v${result.activeVersion}.`;
              })
            }
          />
        ) : null}
        <ConfirmButton
          label="Roll back to previous"
          confirmText="Roll the published rule set back to the previous version?"
          disabled={busy}
          onConfirm={() =>
            void run(async () => {
              const result = await api.rollback();
              return `Rolled back. Active version: ${result.activeVersion ?? 'built-in defaults'}.`;
            })
          }
        />
      </div>

      {selected ? (
        <>
          <h3>Selected: v{selected.version} ({selected.status})</h3>
          <p className="muted">
            {selected.rules.earnRules.length} earn rules · {selected.rules.campaigns.length}{' '}
            campaigns · schemaVersion {selected.rules.schemaVersion}
          </p>

          {selected.status === 'published' ? (
            <Note>This is the published version; the diff vs published is empty.</Note>
          ) : published ? (
            <DiffTable entries={structuralDiff(published.rules, selected.rules)} />
          ) : (
            <Note>No published version yet; this draft will be the first publish.</Note>
          )}

          <h3>Earn rule</h3>
          <label htmlFor="rule-picker">Edit an earn rule</label>
          <select
            id="rule-picker"
            value={editingRuleId ?? ''}
            onChange={(e) => setEditingRuleId(e.target.value || null)}
          >
            <option value="">— pick a rule —</option>
            <option value="__new__">+ new rule</option>
            {selected.rules.earnRules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.id} ({rule.track}, {rule.status})
              </option>
            ))}
          </select>
          {editingRuleId !== null ? (
            <EarnRuleEditor
              ruleSet={selected}
              rule={
                editingRuleId === '__new__'
                  ? null
                  : selected.rules.earnRules.find((r) => r.id === editingRuleId) ?? null
              }
              onSaved={(version) => {
                setEditingRuleId(null);
                setActionNote(`Saved into draft v${version}.`);
                void reload();
              }}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
