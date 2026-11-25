import { useMemo, useState } from 'react';
import type { AdminRuleSet } from '../api-types';
import type {
  CapPool,
  CapScope,
  CapWindow,
  EarnRule,
  EventKind,
  Track,
} from '../engine-types';
import { EVENT_KINDS } from '../engine-types';
import { api } from '../api';
import { previewToast } from '../toast-preview';
import {
  emptyCapForm,
  parseEarnRuleForm,
  toEarnRuleForm,
  type CapForm,
  type EarnRuleForm,
} from '../validation';
import { ErrorNote, Note } from '../ui';

const TRACKS: readonly Track[] = ['ganhos', 'zelo'];
const STATUSES = ['active', 'paused'] as const;
const REFS = ['action', 'chore', 'member', 'instance'] as const;
const CAP_SCOPES: readonly CapScope[] = ['member', 'member+target', 'household', 'lifetime'];
const CAP_WINDOWS: readonly CapWindow[] = ['day', 'week', 'life'];
const CAP_POOLS: readonly CapPool[] = ['dailyGanhos', 'perInstanceGanhos', 'weeklyZelo'];
const CAP_TARGETS = ['instance', 'assignee', 'chore'] as const;
const CELEBRATE_MOMENTS = ['toast', 'badge', 'streak', 'level'] as const;

function blankForm(): EarnRuleForm {
  return {
    id: '',
    track: 'ganhos',
    status: 'active',
    ref: '',
    eventKind: 'ledger.subtask',
    where: '',
    amount: '0',
    perXp: false,
    awardExtras: '',
    caps: [],
    clawback: [],
    spendableAfterHours: '24',
    celebrateMoment: 'toast',
    celebrateCopyKey: '',
    minHouseholdMembers: '',
    activeFrom: '',
    activeTo: '',
  };
}

export function EarnRuleEditor({
  ruleSet,
  rule,
  onSaved,
}: {
  ruleSet: AdminRuleSet;
  /** null → create a new rule. */
  rule: EarnRule | null;
  onSaved: (version: number) => void;
}) {
  const [form, setForm] = useState<EarnRuleForm>(() => (rule ? toEarnRuleForm(rule) : blankForm()));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  function update<K extends keyof EarnRuleForm>(key: K, value: EarnRuleForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateCap(index: number, patch: Partial<CapForm>) {
    setForm((current) => ({
      ...current,
      caps: current.caps.map((cap, i) => (i === index ? { ...cap, ...patch } : cap)),
    }));
  }

  const parsed = useMemo(() => parseEarnRuleForm(form), [form]);
  const previewRule = useMemo<EarnRule | null>(() => parsed.value, [parsed]);
  const preview = useMemo(
    () =>
      previewRule
        ? previewToast(previewRule, ruleSet.rules, { today: new Date().toISOString().slice(0, 10) })
        : null,
    [previewRule, ruleSet.rules],
  );

  async function save() {
    if (!parsed.value) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Saving into a published version would edit history; create a draft instead.
      const saved = await api.saveDraft({
        ...(ruleSet.status === 'draft' ? { version: ruleSet.version } : {}),
        notes: ruleSet.status === 'draft' ? ruleSet.notes : `Draft from v${ruleSet.version}`,
        rules: {
          ...ruleSet.rules,
          earnRules: mergeRule(ruleSet.rules.earnRules, parsed.value),
        },
      });
      onSaved(saved.version);
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3>{rule ? `Edit ${rule.id}` : 'New earn rule'}</h3>

      {preview ? (
        <div className="toast-preview" aria-label="Toast preview">
          <p className="line" role="status">
            {preview.line}
          </p>
          <p className="muted">
            {preview.label}
            {preview.turboMultiplier
              ? ` · Turbo ×${preview.turboMultiplier} campaign active`
              : ''}
          </p>
        </div>
      ) : (
        <Note>Fill in a valid rule to see the toast preview.</Note>
      )}

      {parsed.errors.length > 0 ? (
        <ul className="errors" role="alert">
          {parsed.errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      {saveError !== null ? <ErrorNote error={saveError} /> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor="rule-id">Rule id</label>
        <input
          id="rule-id"
          value={form.id}
          onChange={(e) => update('id', e.target.value)}
          required
        />

        <label htmlFor="rule-track">Track</label>
        <select
          id="rule-track"
          value={form.track}
          onChange={(e) => update('track', e.target.value as Track)}
        >
          {TRACKS.map((track) => (
            <option key={track} value={track}>
              {track}
            </option>
          ))}
        </select>

        <label htmlFor="rule-status">Status</label>
        <select
          id="rule-status"
          value={form.status}
          onChange={(e) =>
            update('status', e.target.value as (typeof STATUSES)[number])
          }
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <label htmlFor="rule-kind">Event kind</label>
        <select
          id="rule-kind"
          value={form.eventKind}
          onChange={(e) => update('eventKind', e.target.value as EventKind)}
        >
          {EVENT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>

        <label htmlFor="rule-where">where conditions (JSON, optional)</label>
        <textarea
          id="rule-where"
          value={form.where}
          onChange={(e) => update('where', e.target.value)}
          placeholder='{ "isAssist": true }'
          spellCheck={false}
        />

        <label htmlFor="rule-amount">amount</label>
        <input
          id="rule-amount"
          type="number"
          value={form.amount}
          onChange={(e) => update('amount', e.target.value)}
        />

        <label htmlFor="rule-perxp">
          <input
            id="rule-perxp"
            type="checkbox"
            checked={form.perXp}
            onChange={(e) => update('perXp', e.target.checked)}
          />{' '}
          1 per XP (perXp)
        </label>

        <label htmlFor="rule-extras">
          award extras (JSON: overrides, milestones, tiers)
        </label>
        <textarea
          id="rule-extras"
          value={form.awardExtras}
          onChange={(e) => update('awardExtras', e.target.value)}
          placeholder='{ "overrides": [{ "where": {}, "amount": 60 }] }'
          spellCheck={false}
        />

        <label htmlFor="rule-ref">sourceRef (ref)</label>
        <select
          id="rule-ref"
          value={form.ref}
          onChange={(e) => update('ref', e.target.value as (typeof REFS)[number] | '')}
        >
          <option value="">action (default)</option>
          {REFS.map((ref) => (
            <option key={ref} value={ref}>
              {ref}
            </option>
          ))}
        </select>

        <fieldset>
          <legend>Caps</legend>
          {form.caps.map((cap, index) => (
            <div className="cap-row" key={index}>
              <div>
                <label htmlFor={`cap-scope-${index}`}>scope</label>
                <select
                  id={`cap-scope-${index}`}
                  value={cap.scope}
                  onChange={(e) => updateCap(index, { scope: e.target.value as CapScope })}
                >
                  {CAP_SCOPES.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`cap-window-${index}`}>window</label>
                <select
                  id={`cap-window-${index}`}
                  value={cap.window}
                  onChange={(e) => updateCap(index, { window: e.target.value as CapWindow })}
                >
                  {CAP_WINDOWS.map((window) => (
                    <option key={window} value={window}>
                      {window}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`cap-max-${index}`}>max</label>
                <input
                  id={`cap-max-${index}`}
                  type="number"
                  value={cap.max}
                  onChange={(e) => updateCap(index, { max: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`cap-pool-${index}`}>pool</label>
                <select
                  id={`cap-pool-${index}`}
                  value={cap.pool}
                  onChange={(e) => updateCap(index, { pool: e.target.value as CapPool })}
                >
                  <option value="">—</option>
                  {CAP_POOLS.map((pool) => (
                    <option key={pool} value={pool}>
                      {pool}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`cap-target-${index}`}>target</label>
                <select
                  id={`cap-target-${index}`}
                  value={cap.target}
                  onChange={(e) =>
                    updateCap(index, {
                      target: e.target.value as (typeof CAP_TARGETS)[number],
                    })
                  }
                >
                  <option value="">—</option>
                  {CAP_TARGETS.map((target) => (
                    <option key={target} value={target}>
                      {target}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    caps: current.caps.filter((_, i) => i !== index),
                  }))
                }
              >
                Remove cap
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() => setForm((current) => ({ ...current, caps: [...current.caps, emptyCapForm()] }))}
          >
            Add cap
          </button>
        </fieldset>

        <fieldset>
          <legend>Clawback</legend>
          {form.clawback.map((entry, index) => (
            <div className="clawback-row" key={index}>
              <div>
                <label htmlFor={`clawback-on-${index}`}>reverses on</label>
                <select
                  id={`clawback-on-${index}`}
                  value={entry.on}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      clawback: current.clawback.map((c, i) =>
                        i === index ? { on: e.target.value as EventKind } : c,
                      ),
                    }))
                  }
                >
                  {EVENT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    clawback: current.clawback.filter((_, i) => i !== index),
                  }))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setForm((current) => ({
                ...current,
                clawback: [...current.clawback, { on: 'ledger.undo-subtask' }],
              }))
            }
          >
            Add clawback
          </button>
        </fieldset>

        <label htmlFor="rule-spendable">spendableAfterHours</label>
        <input
          id="rule-spendable"
          type="number"
          value={form.spendableAfterHours}
          onChange={(e) => update('spendableAfterHours', e.target.value)}
        />

        <label htmlFor="rule-celebrate">celebrate moment</label>
        <select
          id="rule-celebrate"
          value={form.celebrateMoment}
          onChange={(e) =>
            update('celebrateMoment', e.target.value as (typeof CELEBRATE_MOMENTS)[number] | '')
          }
        >
          <option value="">none</option>
          {CELEBRATE_MOMENTS.map((moment) => (
            <option key={moment} value={moment}>
              {moment}
            </option>
          ))}
        </select>

        <label htmlFor="rule-copykey">celebrate copyKey</label>
        <input
          id="rule-copykey"
          value={form.celebrateCopyKey}
          onChange={(e) => update('celebrateCopyKey', e.target.value)}
        />

        <label htmlFor="rule-audience">audience.minHouseholdMembers</label>
        <input
          id="rule-audience"
          type="number"
          value={form.minHouseholdMembers}
          onChange={(e) => update('minHouseholdMembers', e.target.value)}
        />

        <label htmlFor="rule-active-from">activeFrom</label>
        <input
          id="rule-active-from"
          type="date"
          value={form.activeFrom}
          onChange={(e) => update('activeFrom', e.target.value)}
        />

        <label htmlFor="rule-active-to">activeTo</label>
        <input
          id="rule-active-to"
          type="date"
          value={form.activeTo}
          onChange={(e) => update('activeTo', e.target.value)}
        />

        <div className="row-actions">
          <button type="submit" disabled={parsed.value === null || saving}>
            {saving
              ? 'Saving…'
              : `Save into ${ruleSet.status === 'draft' ? `draft v${ruleSet.version}` : 'a new draft'}`}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Replace the rule by id, or append it when it is new. */
function mergeRule(rules: EarnRule[], edited: EarnRule): EarnRule[] {
  const index = rules.findIndex((r) => r.id === edited.id);
  if (index === -1) return [...rules, edited];
  return rules.map((r) => (r.id === edited.id ? edited : r));
}
