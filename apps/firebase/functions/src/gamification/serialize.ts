import { Timestamp } from 'firebase-admin/firestore';
import {
  PROJECTION_VERSION,
  type AchievementState,
  type AlertDraft,
  type Celebration,
  type LedgerRowDraft,
  type OrganizerProjection,
  type ServerEventDraft,
  type WalletProjection,
} from '../domain/gamification';

// Firestore <-> engine conversions for the C3 projections, ledger rows,
// celebrations and server events. Parsers tolerate missing fields: a wallet
// written by setAwayWeeks or by an older version must still load.

const T = (date: Date | null) => (date === null ? null : Timestamp.fromDate(date));
const D = (value: unknown): Date | null => (value instanceof Timestamp ? value.toDate() : null);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === 'number') : [];
}

function asNumberMap(value: unknown): Record<string, number> {
  const record = asRecord(value);
  if (record === null) return {};
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'number' && Number.isFinite(entry)) out[key] = entry;
  }
  return out;
}

function parseAchievements(value: unknown): Record<string, AchievementState> {
  const record = asRecord(value);
  if (record === null) return {};
  const out: Record<string, AchievementState> = {};
  for (const [id, entry] of Object.entries(record)) {
    const data = asRecord(entry);
    if (data === null || (data.tier !== 'bronze' && data.tier !== 'silver' && data.tier !== 'gold')) continue;
    const unlockedAt = D(data.unlockedAt);
    if (unlockedAt === null) continue;
    // `active: false` (an active badge that lapsed) must survive the round trip: the engine keys its lost event on it.
    out[id] = { tier: data.tier, unlockedAt, ...(typeof data.active === 'boolean' ? { active: data.active } : {}) };
  }
  return out;
}

function achievementsToDoc(achievements: Record<string, AchievementState>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(achievements).map(([id, state]) => [
      id,
      { tier: state.tier, unlockedAt: Timestamp.fromDate(state.unlockedAt), ...(state.active !== undefined ? { active: state.active } : {}) },
    ]),
  );
}

// ---- wallet projection -----------------------------------------------------------

export function walletToDoc(wallet: WalletProjection): Record<string, unknown> {
  return {
    householdId: wallet.householdId,
    memberId: wallet.memberId,
    balance: wallet.balance,
    lifetimeEarned: wallet.lifetimeEarned,
    pendingBalance: wallet.pendingBalance,
    nextSpendableAt: T(wallet.nextSpendableAt),
    level: wallet.level,
    xpPeak: wallet.xpPeak,
    streak: {
      current: wallet.streak.current,
      record: wallet.streak.record,
      lastCountedWeek: wallet.streak.lastCountedWeek,
      lastActionWeek: wallet.streak.lastActionWeek,
      folgas: wallet.streak.folgas,
      folgaProgress: wallet.streak.folgaProgress,
      ...(wallet.streak.awayWeeks !== undefined ? { awayWeeks: wallet.streak.awayWeeks } : {}),
    },
    achievements: achievementsToDoc(wallet.achievements),
    stats: {
      assists: wallet.stats.assists,
      finals: wallet.stats.finals,
      onTime: wallet.stats.onTime,
      credits: wallet.stats.credits,
      categories: wallet.stats.categories,
      weeksCounted: wallet.stats.weeksCounted,
      ...(wallet.stats.welcomePaid !== undefined ? { welcomePaid: wallet.stats.welcomePaid } : {}),
      recentWeeks: wallet.stats.recentWeeks,
      householdXpByWeek: wallet.stats.householdXpByWeek,
      springSubtasks: wallet.stats.springSubtasks,
      springSeasonKey: wallet.stats.springSeasonKey,
      decemberGoalWeeks: wallet.stats.decemberGoalWeeks,
      streakMilestonesPaid: wallet.stats.streakMilestonesPaid,
    },
    caps: wallet.caps,
    projectionVersion: wallet.projectionVersion,
    updatedAt: Timestamp.fromDate(wallet.updatedAt),
  };
}

export function walletFromDoc(
  data: Record<string, unknown>,
  householdId: string,
  memberId: string,
): WalletProjection {
  const streak = asRecord(data.streak) ?? {};
  const stats = asRecord(data.stats) ?? {};
  return {
    householdId,
    memberId,
    balance: asNumber(data.balance),
    lifetimeEarned: asNumber(data.lifetimeEarned),
    pendingBalance: asNumber(data.pendingBalance),
    nextSpendableAt: D(data.nextSpendableAt),
    level: asNumber(data.level) || 1,
    xpPeak: asNumber(data.xpPeak),
    streak: {
      current: asNumber(streak.current),
      record: asNumber(streak.record),
      lastCountedWeek: asString(streak.lastCountedWeek),
      lastActionWeek: asString(streak.lastActionWeek),
      folgas: asNumber(streak.folgas),
      folgaProgress: asNumber(streak.folgaProgress),
      awayWeeks: asStringArray(streak.awayWeeks),
    },
    achievements: parseAchievements(data.achievements),
    stats: {
      assists: asNumber(stats.assists),
      finals: asNumber(stats.finals),
      onTime: asNumber(stats.onTime),
      credits: asNumber(stats.credits),
      categories: asNumberMap(stats.categories),
      weeksCounted: asNumber(stats.weeksCounted),
      welcomePaid: stats.welcomePaid === true,
      recentWeeks: (Array.isArray(stats.recentWeeks) ? stats.recentWeeks : []).flatMap((entry) => {
        const week = asRecord(entry);
        if (week === null) return [];
        return [{ weekStart: asString(week.weekStart) ?? '', counted: week.counted === true, xp: asNumber(week.xp) }];
      }),
      householdXpByWeek: asNumberMap(stats.householdXpByWeek),
      springSubtasks: asNumber(stats.springSubtasks),
      springSeasonKey: asString(stats.springSeasonKey),
      decemberGoalWeeks: asNumber(stats.decemberGoalWeeks),
      streakMilestonesPaid: asNumberArray(stats.streakMilestonesPaid),
    },
    caps: asNumberMap(data.caps),
    projectionVersion: asNumber(data.projectionVersion) || PROJECTION_VERSION,
    updatedAt: D(data.updatedAt) ?? new Date(0),
  };
}

// ---- organizer projection --------------------------------------------------------

export function organizerToDoc(organizer: OrganizerProjection): Record<string, unknown> {
  return {
    householdId: organizer.householdId,
    memberId: organizer.memberId,
    zelo: organizer.zelo,
    lifetimeZelo: organizer.lifetimeZelo,
    level: organizer.level,
    streak: {
      current: organizer.streak.current,
      record: organizer.streak.record,
      lastCountedWeek: organizer.streak.lastCountedWeek,
      lastActionWeek: organizer.streak.lastActionWeek,
      folgas: organizer.streak.folgas,
      folgaProgress: organizer.streak.folgaProgress,
    },
    achievements: achievementsToDoc(organizer.achievements),
    stats: {
      membersActivated: organizer.stats.membersActivated,
      maestroWeeks: organizer.stats.maestroWeeks,
      evenSplitWeeks: organizer.stats.evenSplitWeeks,
      customChoreCompletions: organizer.stats.customChoreCompletions,
      weeksCounted: organizer.stats.weeksCounted,
      orderWeeks: organizer.stats.orderWeeks,
      streakMilestonesPaid: organizer.stats.streakMilestonesPaid,
    },
    caps: organizer.caps,
    updatedAt: Timestamp.fromDate(organizer.updatedAt),
  };
}

export function organizerFromDoc(
  data: Record<string, unknown>,
  householdId: string,
  memberId: string,
): OrganizerProjection {
  const streak = asRecord(data.streak) ?? {};
  const stats = asRecord(data.stats) ?? {};
  return {
    householdId,
    memberId,
    zelo: asNumber(data.zelo),
    lifetimeZelo: asNumber(data.lifetimeZelo),
    level: asNumber(data.level) || 1,
    streak: {
      current: asNumber(streak.current),
      record: asNumber(streak.record),
      lastCountedWeek: asString(streak.lastCountedWeek),
      lastActionWeek: asString(streak.lastActionWeek),
      folgas: asNumber(streak.folgas),
      folgaProgress: asNumber(streak.folgaProgress),
    },
    achievements: parseAchievements(data.achievements),
    stats: {
      membersActivated: asNumber(stats.membersActivated),
      maestroWeeks: asNumber(stats.maestroWeeks),
      evenSplitWeeks: asNumber(stats.evenSplitWeeks),
      customChoreCompletions: asNumberMap(stats.customChoreCompletions),
      weeksCounted: asNumber(stats.weeksCounted),
      orderWeeks: (Array.isArray(stats.orderWeeks) ? stats.orderWeeks : []).flatMap((entry) => {
        const week = asRecord(entry);
        if (week === null) return [];
        return [{ weekStart: asString(week.weekStart) ?? '', due: asNumber(week.due), onTime: asNumber(week.onTime) }];
      }),
      streakMilestonesPaid: asNumberArray(stats.streakMilestonesPaid),
    },
    caps: asNumberMap(data.caps),
    updatedAt: D(data.updatedAt) ?? new Date(0),
  };
}

// ---- ledger rows, events, alerts -------------------------------------------------

export function ledgerRowToDoc(row: LedgerRowDraft): Record<string, unknown> {
  return {
    key: row.key,
    ruleId: row.ruleId,
    ruleSetVersion: row.ruleSetVersion,
    track: row.track,
    amount: row.amount,
    sourceRef: row.sourceRef,
    householdId: row.householdId,
    memberId: row.memberId,
    ...(row.reversesEntryId !== undefined ? { reversesEntryId: row.reversesEntryId } : {}),
    ...(row.reason !== undefined ? { reason: row.reason } : {}),
    createdAt: Timestamp.fromDate(row.createdAt),
    spendableAt: Timestamp.fromDate(row.spendableAt),
  };
}

export function serverEventToDoc(event: ServerEventDraft): Record<string, unknown> {
  return {
    name: event.name,
    householdId: event.householdId,
    ...(event.memberId !== undefined ? { memberId: event.memberId } : {}),
    data: event.data,
    createdAt: Timestamp.fromDate(event.createdAt),
  };
}

export function alertToDoc(alert: AlertDraft): Record<string, unknown> {
  return {
    kind: alert.kind,
    householdId: alert.householdId,
    ...(alert.memberId !== undefined ? { memberId: alert.memberId } : {}),
    data: alert.data,
    createdAt: Timestamp.fromDate(alert.createdAt),
  };
}

export function celebrationToDoc(celebration: Celebration, now: Date): Record<string, unknown> {
  return {
    id: celebration.id,
    moment: celebration.moment,
    track: celebration.track,
    ...(celebration.amount !== undefined ? { amount: celebration.amount } : {}),
    ...(celebration.parts !== undefined ? { parts: celebration.parts } : {}),
    copyKey: celebration.copyKey,
    ...(celebration.achievementId !== undefined ? { achievementId: celebration.achievementId } : {}),
    ...(celebration.tier !== undefined ? { tier: celebration.tier } : {}),
    ...(celebration.level !== undefined ? { level: celebration.level } : {}),
    ...(celebration.fullScreen !== undefined ? { fullScreen: celebration.fullScreen } : {}),
    ...(celebration.data !== undefined ? { data: celebration.data } : {}),
    seen: false,
    createdAt: Timestamp.fromDate(now),
  };
}
