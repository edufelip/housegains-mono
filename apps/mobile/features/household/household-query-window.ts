const DAY_MS = 24 * 60 * 60 * 1000;
const INSTANCE_PAST_DAYS = 7;
const INSTANCE_FUTURE_DAYS = 14;
const LEDGER_DAYS = 70;

export function householdQueryWindow(now: Date): {
  instanceFrom: Date;
  instanceUntil: Date;
  ledgerFrom: Date;
} {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    instanceFrom: new Date(dayStart - INSTANCE_PAST_DAYS * DAY_MS),
    instanceUntil: new Date(dayStart + INSTANCE_FUTURE_DAYS * DAY_MS),
    ledgerFrom: new Date(dayStart - LEDGER_DAYS * DAY_MS),
  };
}
