import type { Tier, Track } from './types';

// Static knowledge the screens need about the program: achievement ids (contract C7), their icons and
// kind, the readable names of ledger rules, and the copy key -> toast title mapping.

export type AchievementKind = 'standard' | 'active' | 'seasonal';
export type AchievementTrack = 'member' | 'organizer';

export interface AchievementEntry {
  id: string;
  track: AchievementTrack;
  /** `active` badges lapse and can pause; `seasonal` ones come back each year. */
  kind: AchievementKind;
  /** Ionicons glyph name. */
  icon:
    | 'people-outline'
    | 'checkmark-done-outline'
    | 'alarm-outline'
    | 'restaurant-outline'
    | 'paw-outline'
    | 'footsteps-outline'
    | 'fitness-outline'
    | 'home-outline'
    | 'flower-outline'
    | 'sparkles-outline'
    | 'person-add-outline'
    | 'musical-notes-outline'
    | 'construct-outline'
    | 'scale-outline'
    | 'shield-checkmark-outline'
    | 'ribbon-outline';
}

export const ACHIEVEMENTS: readonly AchievementEntry[] = [
  { id: 'helper', track: 'member', kind: 'standard', icon: 'people-outline' },
  { id: 'closer', track: 'member', kind: 'standard', icon: 'checkmark-done-outline' },
  { id: 'ontime', track: 'member', kind: 'standard', icon: 'alarm-outline' },
  { id: 'kitchen', track: 'member', kind: 'standard', icon: 'restaurant-outline' },
  { id: 'pets', track: 'member', kind: 'standard', icon: 'paw-outline' },
  { id: 'marathon', track: 'member', kind: 'standard', icon: 'footsteps-outline' },
  { id: 'fit', track: 'member', kind: 'active', icon: 'fitness-outline' },
  { id: 'pillar', track: 'member', kind: 'active', icon: 'home-outline' },
  { id: 'spring', track: 'member', kind: 'seasonal', icon: 'flower-outline' },
  { id: 'yearend', track: 'member', kind: 'seasonal', icon: 'sparkles-outline' },
  { id: 'host', track: 'organizer', kind: 'standard', icon: 'person-add-outline' },
  { id: 'maestro', track: 'organizer', kind: 'standard', icon: 'musical-notes-outline' },
  { id: 'architect', track: 'organizer', kind: 'standard', icon: 'construct-outline' },
  { id: 'fair', track: 'organizer', kind: 'standard', icon: 'scale-outline' },
  { id: 'order', track: 'organizer', kind: 'active', icon: 'shield-checkmark-outline' },
];

export const MEMBER_ACHIEVEMENTS = ACHIEVEMENTS.filter(({ track }) => track === 'member');
export const ORGANIZER_ACHIEVEMENTS = ACHIEVEMENTS.filter(({ track }) => track === 'organizer');

/** An achievement id the backend may add later renders with the generic copy. */
export const UNKNOWN_ACHIEVEMENT_ICON = 'ribbon-outline' as const;

export function achievementEntry(id: string): AchievementEntry | null {
  return ACHIEVEMENTS.find((entry) => entry.id === id) ?? null;
}

export function achievementNameKey(id: string): string {
  return achievementEntry(id)
    ? `housegains.gamification.achievement.${id}.name`
    : 'housegains.gamification.achievement.unknown.name';
}

export function achievementDescriptionKey(id: string): string {
  return achievementEntry(id)
    ? `housegains.gamification.achievement.${id}.description`
    : 'housegains.gamification.achievement.unknown.description';
}

/** 1, 2 or 3 pips: the tier is always readable without color. */
export function tierPips(tier: Tier): number {
  return tier === 'gold' ? 3 : tier === 'silver' ? 2 : 1;
}

export function tierKey(tier: Tier): string {
  return `housegains.gamification.tier.${tier}`;
}

export function amountKey(track: Track): string {
  return `housegains.gamification.amount.${track}`;
}

export function totalKey(track: Track): string {
  return `housegains.gamification.total.${track}`;
}

const TOAST_TITLES: Record<string, string> = {
  'gami.earn.chore': 'chore',
  'gami.earn.bonus': 'bonus',
  'gami.earn.assist': 'assist',
  'gami.earn.on_time': 'on_time',
  'gami.earn.share': 'share',
  'gami.earn.week_goal': 'week_goal',
  'gami.earn.welcome': 'welcome',
  'gami.zelo.earned': 'zelo',
  'gami.achievement.unlocked': 'badge',
};

/** Title of a toast from the celebration's copy key; unknown keys fall back by track. */
export function toastTitleKey(copyKey: string, track: Track): string {
  const known = TOAST_TITLES[copyKey];
  if (known) return `housegains.gamification.toast.title.${known}`;
  return track === 'zelo'
    ? 'housegains.gamification.toast.title.zelo'
    : 'housegains.gamification.toast.title.generic';
}

const KNOWN_RULES = new Set([
  'earn.subtask',
  'earn.bonus',
  'earn.assist',
  'earn.on_time',
  'earn.share',
  'earn.week_goal',
  'earn.streak_milestone',
  'earn.achievement',
  'earn.welcome',
  'zelo.setup',
  'zelo.chore_done',
  'zelo.member_activated',
  'zelo.on_time',
  'zelo.even_split',
  'zelo.streak_milestone',
]);

export const RULE_IDS: readonly string[] = [...KNOWN_RULES];

export function ruleLabelKey(ruleId: string): string {
  return KNOWN_RULES.has(ruleId)
    ? `housegains.gamification.rule.${ruleId}`
    : 'housegains.gamification.rule.unknown';
}

/** The label of a wallet ledger row; a reversal names the rule it reverses. */
export function ledgerRowLabel(row: { ruleId: string; amount: number; reversesEntryId?: string }): {
  key: string;
  ruleKey?: string;
} {
  if (row.reversesEntryId !== undefined || row.amount < 0) {
    return { key: 'housegains.gamification.ledger.reversal', ruleKey: ruleLabelKey(row.ruleId) };
  }
  return { key: ruleLabelKey(row.ruleId) };
}
