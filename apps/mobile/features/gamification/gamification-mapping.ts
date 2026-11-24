import type {
  AchievementMap,
  Celebration,
  CelebrationMoment,
  CelebrationPart,
  InboxCelebration,
  Organizer,
  StreakRecentWeek,
  Tier,
  Track,
  Wallet,
  WalletLedgerRow,
} from './types';

// Pure Firestore-document / callable-response -> view-model mapping. No Firebase imports, so it runs
// under `bun test`. Parsers tolerate missing fields (a wallet created by setAwayWeeks has almost none).

type Dict = Record<string, unknown>;

function asRecord(value: unknown): Dict | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Dict)
    : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** Firestore Timestamps and Dates become ISO strings; anything else becomes ''. */
function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const toDate = (value as { toDate?: () => Date } | null | undefined)?.toDate;
  return typeof toDate === 'function' ? toDate.call(value).toISOString() : '';
}

const MOMENTS: readonly CelebrationMoment[] = ['toast', 'badge', 'streak', 'level', 'standings'];
const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];

function asTier(value: unknown): Tier | undefined {
  return TIERS.find((tier) => tier === value);
}

function asTrack(value: unknown): Track | null {
  return value === 'ganhos' || value === 'zelo' ? value : null;
}

function parseParts(value: unknown): CelebrationPart[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value.flatMap((entry) => {
    const part = asRecord(entry);
    const ruleId = part ? asString(part.ruleId) : null;
    return part && ruleId && typeof part.amount === 'number'
      ? [{ ruleId, amount: asNumber(part.amount) }]
      : [];
  });
  return parts.length > 0 ? parts : undefined;
}

function parseData(value: unknown): Record<string, string | number> | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const out: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'string' || (typeof entry === 'number' && Number.isFinite(entry))) {
      out[key] = entry;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A celebration from a callable response; null when it lacks an id, a known moment/track or a copy key. */
export function parseCelebration(value: unknown, fallbackId?: string): Celebration | null {
  const data = asRecord(value);
  if (!data) return null;
  const id = asString(data.id) ?? fallbackId ?? null;
  const moment = MOMENTS.find((candidate) => candidate === data.moment);
  const track = asTrack(data.track);
  const copyKey = asString(data.copyKey);
  if (!id || !moment || !track || !copyKey) return null;
  const parts = parseParts(data.parts);
  const tier = asTier(data.tier);
  const achievementId = asString(data.achievementId);
  const celebrationData = parseData(data.data);
  return {
    id,
    moment,
    track,
    ...(typeof data.amount === 'number' ? { amount: asNumber(data.amount) } : {}),
    ...(parts ? { parts } : {}),
    copyKey,
    ...(achievementId ? { achievementId } : {}),
    ...(tier ? { tier } : {}),
    ...(typeof data.level === 'number' ? { level: asNumber(data.level) } : {}),
    ...(typeof data.fullScreen === 'boolean' ? { fullScreen: data.fullScreen } : {}),
    ...(celebrationData ? { data: celebrationData } : {}),
  };
}

/** `celebrations` of a completeSubtask / postCompletion response; a missing or malformed field is []. */
export function parseCelebrations(response: unknown): Celebration[] {
  const list = asRecord(response)?.celebrations;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => {
    const celebration = parseCelebration(entry);
    return celebration ? [celebration] : [];
  });
}

/** users/{uid}/inbox/{id}: the document id is the celebration id. */
export function mapInboxCelebration(id: string, data: unknown): InboxCelebration | null {
  const celebration = parseCelebration(data, id);
  if (!celebration) return null;
  const record = asRecord(data);
  return {
    ...celebration,
    id,
    seen: record?.seen === true,
    createdAt: iso(record?.createdAt),
  };
}

function mapAchievements(value: unknown): AchievementMap {
  const record = asRecord(value);
  if (!record) return {};
  const out: AchievementMap = {};
  for (const [id, entry] of Object.entries(record)) {
    const data = asRecord(entry);
    const tier = data ? asTier(data.tier) : undefined;
    const unlockedAt = data ? iso(data.unlockedAt) : '';
    if (!data || !tier || unlockedAt === '') continue;
    out[id] = {
      tier,
      unlockedAt,
      ...(typeof data.active === 'boolean' ? { active: data.active } : {}),
    };
  }
  return out;
}

function mapStreak(value: unknown) {
  const streak = asRecord(value) ?? {};
  return {
    current: asNumber(streak.current),
    record: asNumber(streak.record),
    lastCountedWeek: asString(streak.lastCountedWeek),
    lastActionWeek: asString(streak.lastActionWeek),
    folgas: asNumber(streak.folgas),
    folgaProgress: asNumber(streak.folgaProgress),
    awayWeeks: asStringArray(streak.awayWeeks),
  };
}

function mapRecentWeeks(value: unknown): StreakRecentWeek[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const week = asRecord(entry);
    const weekStart = week ? asString(week.weekStart) : null;
    return week && weekStart
      ? [{ weekStart, counted: week.counted === true, xp: asNumber(week.xp) }]
      : [];
  });
}

/** wallets/{uid} -> Wallet. Never throws. */
export function mapWallet(data: Dict): Wallet {
  const stats = asRecord(data.stats) ?? {};
  return {
    householdId: asString(data.householdId) ?? '',
    memberId: asString(data.memberId) ?? '',
    balance: asNumber(data.balance),
    lifetimeEarned: asNumber(data.lifetimeEarned),
    pendingBalance: asNumber(data.pendingBalance),
    nextSpendableAt: iso(data.nextSpendableAt) || null,
    level: asNumber(data.level) || 1,
    xpPeak: asNumber(data.xpPeak),
    streak: mapStreak(data.streak),
    achievements: mapAchievements(data.achievements),
    recentWeeks: mapRecentWeeks(stats.recentWeeks),
    updatedAt: iso(data.updatedAt),
  };
}

/** wallets/{uid}/ledger/{key} -> WalletLedgerRow. */
export function mapLedgerRow(id: string, data: Dict): WalletLedgerRow {
  const reversesEntryId = asString(data.reversesEntryId);
  const reason = asString(data.reason);
  return {
    key: asString(data.key) ?? id,
    ruleId: asString(data.ruleId) ?? '',
    track: asTrack(data.track) ?? 'ganhos',
    amount: asNumber(data.amount),
    sourceRef: asString(data.sourceRef) ?? '',
    ...(reversesEntryId ? { reversesEntryId } : {}),
    ...(reason ? { reason } : {}),
    createdAt: iso(data.createdAt),
    spendableAt: iso(data.spendableAt),
  };
}

/** households/{hid}/organizer/{creatorUid} -> Organizer. */
export function mapOrganizer(memberId: string, data: Dict): Organizer {
  const streak = mapStreak(data.streak);
  const stats = asRecord(data.stats) ?? {};
  const orderWeeks = Array.isArray(stats.orderWeeks)
    ? stats.orderWeeks.flatMap((entry) => {
        const week = asRecord(entry);
        const weekStart = week ? asString(week.weekStart) : null;
        return week && weekStart
          ? [{ weekStart, due: asNumber(week.due), onTime: asNumber(week.onTime) }]
          : [];
      })
    : [];
  return {
    memberId,
    zelo: asNumber(data.zelo),
    lifetimeZelo: asNumber(data.lifetimeZelo),
    level: asNumber(data.level) || 1,
    streak: {
      current: streak.current,
      record: streak.record,
      lastCountedWeek: streak.lastCountedWeek,
      lastActionWeek: streak.lastActionWeek,
      folgas: streak.folgas,
      folgaProgress: streak.folgaProgress,
    },
    achievements: mapAchievements(data.achievements),
    orderWeeks: orderWeeks.sort((left, right) => left.weekStart.localeCompare(right.weekStart)),
  };
}
