import { DEFAULT_RULE_SET } from './default-rule-set';
import type { RuleSet } from './types';

/** XP required to reach `level` on the member curve: base * L * (L - 1) (C6). */
export function xpForLevel(level: number, base: number = DEFAULT_RULE_SET.levels.member.base): number {
  return base * level * (level - 1);
}

/** Largest L with xpForLevel(L) <= xp; at least 1 (C6). */
export function levelForXp(xp: number, base: number = DEFAULT_RULE_SET.levels.member.base): number {
  let level = 1;
  // shortcut: guard against runaway loops on absurd inputs; ~sqrt(xp/base) steps.
  while (level < 1000 && xpForLevel(level + 1, base) <= xp) level += 1;
  return level;
}

/** Title key for a level band, e.g. 8 -> 'cleanMaster'. */
export function memberTitleKey(
  level: number,
  titles: RuleSet['levels']['member']['titles'] = DEFAULT_RULE_SET.levels.member.titles,
): string {
  let key = titles.length > 0 ? titles[0].key : 'rookie';
  for (const title of titles) if (level >= title.fromLevel) key = title.key;
  return key;
}

/** Displayed level = max(migrated floor, curve level from xpPeak) (C3). */
export function displayedLevel(levelFloor: number, xpPeak: number): number {
  return Math.max(levelFloor, levelForXp(xpPeak));
}

/** Organizer level and title key for a zelo balance (C5). */
export function organizerLevel(
  zelo: number,
  thresholds: RuleSet['levels']['organizer']['thresholds'] = DEFAULT_RULE_SET.levels.organizer.thresholds,
): { level: number; titleKey: string } {
  let level = 0;
  let titleKey = thresholds.length > 0 ? thresholds[0].key : 'organizer';
  thresholds.forEach((threshold, index) => {
    if (zelo >= threshold.zelo) {
      level = index + 1;
      titleKey = threshold.key;
    }
  });
  return { level: Math.max(1, level), titleKey };
}
