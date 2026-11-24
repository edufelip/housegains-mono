// Member level curve and titles (contract Part C6) and the organizer (Zelo) titles (C5).
// Pure, no React Native imports, so it runs under `bun test`.

const BASE = 50;

export type MemberTitleKey =
  'rookie' | 'helper' | 'tidyTitan' | 'cleanMaster' | 'homeLegend' | 'houseGuardian';

export type OrganizerTitleKey =
  'organizer' | 'sindico' | 'sindicoExperiente' | 'sindicoMor' | 'sindicoLendario';

const MEMBER_TITLES: readonly { fromLevel: number; key: MemberTitleKey }[] = [
  { fromLevel: 1, key: 'rookie' },
  { fromLevel: 3, key: 'helper' },
  { fromLevel: 5, key: 'tidyTitan' },
  { fromLevel: 8, key: 'cleanMaster' },
  { fromLevel: 12, key: 'homeLegend' },
  { fromLevel: 16, key: 'houseGuardian' },
];

const ORGANIZER_TITLES: readonly { zelo: number; key: OrganizerTitleKey }[] = [
  { zelo: 0, key: 'organizer' },
  { zelo: 200, key: 'sindico' },
  { zelo: 600, key: 'sindicoExperiente' },
  { zelo: 1500, key: 'sindicoMor' },
  { zelo: 3000, key: 'sindicoLendario' },
];

export const MEMBER_TITLE_KEYS: readonly MemberTitleKey[] = MEMBER_TITLES.map(({ key }) => key);
export const ORGANIZER_TITLE_KEYS: readonly OrganizerTitleKey[] = ORGANIZER_TITLES.map(
  ({ key }) => key,
);

/** XP needed to reach `level`: 50·L·(L−1). */
export function xpForLevel(level: number): number {
  return BASE * level * (level - 1);
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Largest level whose threshold is reached; at least 1. */
export function levelForXp(xp: number): number {
  const earned = finiteOrZero(xp);
  let level = 1;
  // ~sqrt(xp / 50) steps; the bound only guards absurd inputs.
  while (level < 1000 && xpForLevel(level + 1) <= earned) level += 1;
  return level;
}

export function memberTitleKey(level: number): MemberTitleKey {
  let key: MemberTitleKey = MEMBER_TITLES[0].key;
  for (const title of MEMBER_TITLES) if (level >= title.fromLevel) key = title.key;
  return key;
}

export interface LevelInputs {
  /** Current XP (members/{uid}.xp). */
  xp: number;
  /** Highest XP ever; missing on old member documents. */
  xpPeak?: number;
  /** Old-curve level written once by the migration; missing on old member documents. */
  levelFloor?: number;
}

/**
 * Displayed member level = max(levelFloor ?? floor(xp/100)+1, levelForXp(xpPeak ?? xp)).
 * Documents without `levelFloor` keep their old-curve level so nobody drops until the
 * backfill has run.
 */
export function displayedLevel({ xp, xpPeak, levelFloor }: LevelInputs): number {
  const current = Math.max(0, Math.floor(finiteOrZero(xp)));
  const floor =
    typeof levelFloor === 'number' && Number.isFinite(levelFloor)
      ? levelFloor
      : Math.floor(current / 100) + 1;
  const peak = typeof xpPeak === 'number' && Number.isFinite(xpPeak) ? xpPeak : current;
  return Math.max(floor, levelForXp(peak));
}

export interface LevelMoment {
  /** False when the celebration must be acknowledged without being shown. */
  show: boolean;
  /** The level to show: the level the rest of the app displays for this member. */
  level: number;
}

/**
 * Whether a `moment: 'level'` celebration is a real level-up for this member, and which level to
 * show. The server only knows the new curve and sends `levelForXp(xpPeak)`; a backfilled member
 * keeps `levelFloor` (or, before the backfill, the old-curve level) as a floor of their displayed
 * level. A celebration at or below that floor is not a level-up in the app (they stay on the floor
 * level), so it is acknowledged silently. Above the floor the new-curve level is the displayed
 * level, so the shown number never disagrees with the rest of the app.
 */
export function levelMoment(
  celebrationLevel: number | undefined,
  member: LevelInputs,
): LevelMoment {
  const displayed = displayedLevel(member);
  if (typeof celebrationLevel !== 'number' || !Number.isFinite(celebrationLevel)) {
    return { show: false, level: displayed };
  }
  const current = Math.max(0, Math.floor(finiteOrZero(member.xp)));
  const floor =
    typeof member.levelFloor === 'number' && Number.isFinite(member.levelFloor)
      ? member.levelFloor
      : Math.floor(current / 100) + 1;
  return {
    show: celebrationLevel > floor,
    // The member snapshot can lag the celebration by a moment: never show a lower level than sent.
    level: Math.max(displayed, celebrationLevel),
  };
}

export interface LevelProgress {
  currentThreshold: number;
  nextThreshold: number;
  xpIntoLevel: number;
  xpToNext: number;
  /** 0..1 */
  fraction: number;
}

/** Progress from this level's threshold to the next one, on the peak XP. Never negative. */
export function levelProgress(level: number, xpPeak: number): LevelProgress {
  const peak = Math.max(0, finiteOrZero(xpPeak));
  const currentThreshold = xpForLevel(level);
  const nextThreshold = xpForLevel(level + 1);
  const xpIntoLevel = Math.max(0, peak - currentThreshold);
  const span = nextThreshold - currentThreshold;
  return {
    currentThreshold,
    nextThreshold,
    xpIntoLevel,
    xpToNext: Math.max(0, nextThreshold - peak),
    fraction: span > 0 ? Math.min(1, xpIntoLevel / span) : 0,
  };
}

export function organizerTitleKey(zelo: number): OrganizerTitleKey {
  const value = finiteOrZero(zelo);
  let key: OrganizerTitleKey = ORGANIZER_TITLES[0].key;
  for (const title of ORGANIZER_TITLES) if (value >= title.zelo) key = title.key;
  return key;
}
