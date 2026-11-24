import { useState } from 'react';
import type {
  AdminLedgerRow,
  AdminLookupUserResponse,
  AdminPendingAdjustment,
} from '../api-types';
import { api } from '../api';
import { useAuth } from '../auth';
import { ConfirmButton, ErrorNote, Loading, Note } from '../ui';
import { ADJUST_REASON_CODES, needsSecondAdmin, parseAdjustmentForm } from '../validation';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function amountClass(amount: number): string {
  return amount < 0 ? 'amount-neg' : 'amount-pos';
}

function WalletSummary({ lookup }: { lookup: AdminLookupUserResponse }) {
  const wallet = lookup.wallet;
  if (!wallet) {
    return <Note>No wallet exists for this uid yet.</Note>;
  }
  return (
    <div className="card">
      <h3>Wallet</h3>
      <dl>
        <div>
          <dt>balance</dt>
          <dd>{wallet.balance}</dd>
        </div>
        <div>
          <dt>pending balance</dt>
          <dd>{wallet.pendingBalance}</dd>
        </div>
        <div>
          <dt>lifetime earned</dt>
          <dd>{wallet.lifetimeEarned}</dd>
        </div>
        <div>
          <dt>next spendable</dt>
          <dd>{wallet.nextSpendableAt ? formatDate(wallet.nextSpendableAt) : '—'}</dd>
        </div>
        <div>
          <dt>level / xpPeak</dt>
          <dd>
            {wallet.level} / {wallet.xpPeak}
          </dd>
        </div>
        <div>
          <dt>streak (current · record · folgas)</dt>
          <dd>
            {wallet.streak.current} · {wallet.streak.record} · {wallet.streak.folgas}
          </dd>
        </div>
        <div>
          <dt>household</dt>
          <dd>{wallet.householdId ?? '—'}</dd>
        </div>
      </dl>
    </div>
  );
}

function LedgerTable({ rows }: { rows: AdminLedgerRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="muted">Wallet ledger (newest key order as returned)</caption>
        <thead>
          <tr>
            <th scope="col">Created</th>
            <th scope="col">Key</th>
            <th scope="col">Rule</th>
            <th scope="col">v</th>
            <th scope="col">Amount</th>
            <th scope="col">Spendable</th>
            <th scope="col">Explanation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{formatDate(row.createdAt)}</td>
              <td>
                {row.key}
                {row.reversesEntryId ? (
                  <>
                    {' '}
                    <span className="muted" title={`reverses ${row.reversesEntryId}`}>
                      ↩ reversal
                    </span>
                  </>
                ) : null}
              </td>
              <td>{row.ruleId}</td>
              <td>{row.ruleSetVersion ?? '—'}</td>
              <td className={amountClass(row.amount)}>
                {row.amount > 0 ? `+${row.amount}` : row.amount}
              </td>
              <td>{formatDate(row.spendableAt)}</td>
              <td>{row.explanation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PendingAdjustments({
  pending,
  currentUid,
  onApprove,
}: {
  pending: AdminPendingAdjustment[];
  currentUid: string | null;
  onApprove: (id: string) => void;
}) {
  if (pending.length === 0) return null;
  return (
    <div className="table-wrap">
      <table>
        <caption className="muted">Pending adjustments (over ±500, need a second admin)</caption>
        <thead>
          <tr>
            <th scope="col">Amount</th>
            <th scope="col">Reason</th>
            <th scope="col">Note</th>
            <th scope="col">Requested by</th>
            <th scope="col">Created</th>
            <th scope="col">Approve</th>
          </tr>
        </thead>
        <tbody>
          {pending.map((adjustment) => (
            <tr key={adjustment.id}>
              <td className={amountClass(adjustment.amount)}>{adjustment.amount}</td>
              <td>{adjustment.reasonCode}</td>
              <td>{adjustment.note}</td>
              <td>{adjustment.createdBy}</td>
              <td>{formatDate(adjustment.createdAt)}</td>
              <td>
                <ConfirmButton
                  label={`Approve ${adjustment.amount}`}
                  confirmText={`Apply the pending adjustment of ${adjustment.amount} Ganhos?`}
                  disabled={adjustment.createdBy === currentUid}
                  onConfirm={() => onApprove(adjustment.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Ledger() {
  const { uid: currentUid } = useAuth();
  const [uid, setUid] = useState('');
  const [lookup, setLookup] = useState<AdminLookupUserResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<unknown>(null);

  const [amount, setAmount] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [adjustError, setAdjustError] = useState<unknown>(null);
  const [adjustNote, setAdjustNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const [actionError, setActionError] = useState<unknown>(null);
  const [actionNote, setActionNote] = useState('');

  const parsedAdjustment = parseAdjustmentForm(amount, reasonCode, note);
  const showSecondAdminNote =
    parsedAdjustment.value !== null && needsSecondAdmin(parsedAdjustment.value.amount);

  async function runLookup() {
    const trimmed = uid.trim();
    if (!trimmed) return;
    setLoading(true);
    setLookupError(null);
    try {
      setLookup(await api.lookupUser({ uid: trimmed }));
    } catch (e) {
      setLookupError(e);
    } finally {
      setLoading(false);
    }
  }

  async function submitAdjustment() {
    if (!parsedAdjustment.value) return;
    setAdjusting(true);
    setAdjustError(null);
    setAdjustNote('');
    try {
      const result = await api.adjust({ uid: uid.trim(), ...parsedAdjustment.value });
      setAdjustNote(
        result.status === 'pending'
          ? 'Pending: over ±500 needs approval by a second admin.'
          : 'Adjustment applied.',
      );
      await runLookup();
    } catch (e) {
      setAdjustError(e);
    } finally {
      setAdjusting(false);
    }
  }

  async function approve(id: string) {
    setActionError(null);
    setActionNote('');
    try {
      await api.approveAdjustment({ id });
      setActionNote('Adjustment approved and applied.');
      await runLookup();
    } catch (e) {
      setActionError(e);
    }
  }

  async function rebuild() {
    setActionError(null);
    setActionNote('');
    try {
      const result = await api.rebuildWallet({ uid: uid.trim() });
      setActionNote(`Wallet rebuilt from ${result.rows} rows; balance is now ${result.balance}.`);
      await runLookup();
    } catch (e) {
      setActionError(e);
    }
  }

  return (
    <section>
      <h2>Ledger lookup</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runLookup();
        }}
      >
        <label htmlFor="lookup-uid">User uid</label>
        <input
          id="lookup-uid"
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder="the Auth uid"
        />
        <div className="row-actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Looking up…' : 'Look up'}
          </button>
          <ConfirmButton
            label="Rebuild wallet"
            confirmText={`Rebuild ${uid.trim() || 'this user'}'s wallet by replaying the whole ledger?`}
            disabled={loading}
            onConfirm={() => void rebuild()}
          />
        </div>
      </form>

      {lookupError !== null ? <ErrorNote error={lookupError} /> : null}
      {actionNote ? (
        <p role="status" className="ok">
          {actionNote}
        </p>
      ) : null}
      {actionError !== null ? <ErrorNote error={actionError} /> : null}
      {loading ? <Loading label="Looking up…" /> : null}

      {lookup ? (
        <>
          <WalletSummary lookup={lookup} />
          {lookup.ledger.length > 0 ? (
            <LedgerTable rows={lookup.ledger} />
          ) : (
            <Note>No ledger rows for this uid.</Note>
          )}
          <PendingAdjustments
            pending={lookup.pendingAdjustments}
            currentUid={currentUid}
            onApprove={(id) => void approve(id)}
          />
        </>
      ) : null}

      <h3>Adjustment</h3>
      <p className="muted">Signed integer Ganhos amount; positive credits, negative debits.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitAdjustment();
        }}
      >
        <label htmlFor="adjust-amount">Amount</label>
        <input
          id="adjust-amount"
          type="number"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <label htmlFor="adjust-reason">Reason code</label>
        <select
          id="adjust-reason"
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value)}
        >
          <option value="">— pick one —</option>
          {ADJUST_REASON_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        <label htmlFor="adjust-note">Note (required)</label>
        <textarea
          id="adjust-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {showSecondAdminNote ? (
          <p role="alert" className="note">
            Over ±500: this adjustment needs approval by a second admin before it applies.
          </p>
        ) : null}
        {adjustNote ? (
          <p role="status" className="ok">
            {adjustNote}
          </p>
        ) : null}
        {adjustError !== null ? <ErrorNote error={adjustError} /> : null}
        {parsedAdjustment.errors.length > 0 ? (
          <ul className="errors" role="alert">
            {parsedAdjustment.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}

        <div className="row-actions">
          <button
            type="submit"
            disabled={parsedAdjustment.value === null || adjusting || uid.trim() === ''}
          >
            {adjusting ? 'Applying…' : 'Apply adjustment'}
          </button>
        </div>
      </form>
    </section>
  );
}
