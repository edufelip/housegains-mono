import { describe, expect, it } from 'vitest';
import { displayedLevel, levelForXp, memberTitleKey, organizerLevel, xpForLevel } from './levels';

describe('xpForLevel', () => {
  it('follows the curve base * L * (L - 1) with base 50', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(xpForLevel(4)).toBe(600);
    expect(xpForLevel(5)).toBe(1000);
    expect(xpForLevel(8)).toBe(2800);
    expect(xpForLevel(12)).toBe(6600);
    expect(xpForLevel(16)).toBe(12000);
  });
});

describe('levelForXp', () => {
  it('is the largest level whose threshold is within reach, minimum 1', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(300)).toBe(3);
    expect(levelForXp(999)).toBe(4);
    expect(levelForXp(1000)).toBe(5);
    expect(levelForXp(2800)).toBe(8);
    expect(levelForXp(6600)).toBe(12);
    expect(levelForXp(12000)).toBe(16);
  });

  it('maps the contract example xp 1840 to level 6', () => {
    expect(levelForXp(1840)).toBe(6);
  });

  it('never returns a level below 1', () => {
    expect(levelForXp(-50)).toBe(1);
  });

  it('keeps climbing for very high xp', () => {
    expect(levelForXp(50 * 30 * 29)).toBe(30);
    expect(levelForXp(50 * 30 * 29 - 1)).toBe(29);
  });
});

describe('memberTitleKey', () => {
  it('maps each level band to its title key', () => {
    expect(memberTitleKey(1)).toBe('rookie');
    expect(memberTitleKey(2)).toBe('rookie');
    expect(memberTitleKey(3)).toBe('helper');
    expect(memberTitleKey(4)).toBe('helper');
    expect(memberTitleKey(5)).toBe('tidyTitan');
    expect(memberTitleKey(7)).toBe('tidyTitan');
    expect(memberTitleKey(8)).toBe('cleanMaster');
    expect(memberTitleKey(11)).toBe('cleanMaster');
    expect(memberTitleKey(12)).toBe('homeLegend');
    expect(memberTitleKey(15)).toBe('homeLegend');
    expect(memberTitleKey(16)).toBe('houseGuardian');
    expect(memberTitleKey(99)).toBe('houseGuardian');
  });
});

describe('displayedLevel', () => {
  it('never drops below the migrated level floor', () => {
    expect(displayedLevel(5, 300)).toBe(5); // curve says 3, floor says 5
    expect(displayedLevel(4, 0)).toBe(4);
  });

  it('follows the curve when it is higher than the floor', () => {
    expect(displayedLevel(3, 1840)).toBe(6);
    expect(displayedLevel(1, 12000)).toBe(16);
  });
});

describe('organizerLevel', () => {
  it('crosses zelo thresholds exactly', () => {
    expect(organizerLevel(0)).toEqual({ level: 1, titleKey: 'organizer' });
    expect(organizerLevel(199)).toEqual({ level: 1, titleKey: 'organizer' });
    expect(organizerLevel(200)).toEqual({ level: 2, titleKey: 'sindico' });
    expect(organizerLevel(599)).toEqual({ level: 2, titleKey: 'sindico' });
    expect(organizerLevel(600)).toEqual({ level: 3, titleKey: 'sindicoExperiente' });
    expect(organizerLevel(1499)).toEqual({ level: 3, titleKey: 'sindicoExperiente' });
    expect(organizerLevel(1500)).toEqual({ level: 4, titleKey: 'sindicoMor' });
    expect(organizerLevel(2999)).toEqual({ level: 4, titleKey: 'sindicoMor' });
    expect(organizerLevel(3000)).toEqual({ level: 5, titleKey: 'sindicoLendario' });
    expect(organizerLevel(99999)).toEqual({ level: 5, titleKey: 'sindicoLendario' });
  });
});
