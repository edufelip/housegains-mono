import assert from 'node:assert/strict';
import test from 'node:test';
import {
  displayedLevel,
  levelForXp,
  levelMoment,
  levelProgress,
  memberTitleKey,
  organizerTitleKey,
  xpForLevel,
} from './levels';

test('xpForLevel follows 50·L·(L−1)', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 100);
  assert.equal(xpForLevel(3), 300);
  assert.equal(xpForLevel(6), 1500);
  assert.equal(xpForLevel(16), 12000);
});

test('levelForXp returns the largest level whose threshold is reached, minimum 1', () => {
  assert.equal(levelForXp(-20), 1);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(299), 2);
  assert.equal(levelForXp(300), 3);
  assert.equal(levelForXp(1499), 5);
  assert.equal(levelForXp(1500), 6);
  assert.equal(levelForXp(1840), 6);
  assert.equal(levelForXp(Number.NaN), 1);
});

test('member title bands follow the table', () => {
  const expected: [number, string][] = [
    [1, 'rookie'],
    [2, 'rookie'],
    [3, 'helper'],
    [4, 'helper'],
    [5, 'tidyTitan'],
    [7, 'tidyTitan'],
    [8, 'cleanMaster'],
    [11, 'cleanMaster'],
    [12, 'homeLegend'],
    [15, 'homeLegend'],
    [16, 'houseGuardian'],
    [40, 'houseGuardian'],
  ];
  for (const [level, key] of expected) assert.equal(memberTitleKey(level), key, `level ${level}`);
});

test('displayed level never drops for members without levelFloor (old-curve fallback)', () => {
  // 1840 XP: old curve floor(1840/100)+1 = 19, new curve 6.
  assert.equal(displayedLevel({ xp: 1840 }), 19);
  assert.equal(displayedLevel({ xp: 1840, xpPeak: 1840 }), 19);
  // A migrated member (levelFloor 1) is shown on the new curve.
  assert.equal(displayedLevel({ xp: 1840, xpPeak: 1840, levelFloor: 1 }), 6);
  // xpPeak never decreases: an undo that lowers xp keeps the peak level.
  assert.equal(displayedLevel({ xp: 1000, xpPeak: 1840, levelFloor: 1 }), 6);
  // The floor wins when it is higher than the curve.
  assert.equal(displayedLevel({ xp: 0, xpPeak: 0, levelFloor: 4 }), 4);
  // A brand new member.
  assert.equal(displayedLevel({ xp: 0, xpPeak: 0, levelFloor: 1 }), 1);
  assert.equal(displayedLevel({ xp: 0 }), 1);
});

test('levelProgress reports the fraction toward the next threshold', () => {
  assert.deepEqual(levelProgress(2, 150), {
    currentThreshold: 100,
    nextThreshold: 300,
    xpIntoLevel: 50,
    xpToNext: 150,
    fraction: 0.25,
  });
  // A floor-boosted level (peak below its own threshold) starts at zero, never negative.
  const boosted = levelProgress(19, 1840);
  assert.equal(boosted.xpIntoLevel, 0);
  assert.equal(boosted.fraction, 0);
  assert.equal(boosted.xpToNext, boosted.nextThreshold - 1840);
});

test('organizer title thresholds', () => {
  assert.equal(organizerTitleKey(0), 'organizer');
  assert.equal(organizerTitleKey(199), 'organizer');
  assert.equal(organizerTitleKey(200), 'sindico');
  assert.equal(organizerTitleKey(599), 'sindico');
  assert.equal(organizerTitleKey(600), 'sindicoExperiente');
  assert.equal(organizerTitleKey(1500), 'sindicoMor');
  assert.equal(organizerTitleKey(3000), 'sindicoLendario');
  assert.equal(organizerTitleKey(99999), 'sindicoLendario');
});

test('levelMoment: a new-curve level at or below the level floor is not a level-up', () => {
  // Backfilled {xp:450, levelFloor:5} crossing 600 XP: the server sends level 4, the app shows 5.
  const member = { xp: 600, xpPeak: 600, levelFloor: 5 };
  assert.equal(displayedLevel(member), 5);
  assert.deepEqual(levelMoment(4, member), { show: false, level: 5 });
  assert.equal(levelMoment(5, member).show, false);
});

test('levelMoment: a migrated member crossing a level shows it, even after the snapshot caught up', () => {
  const member = { xp: 600, xpPeak: 600, levelFloor: 1 };
  assert.deepEqual(levelMoment(4, member), { show: true, level: 4 });
  // The member snapshot may lag the celebration: never show a lower level than the one sent.
  assert.deepEqual(levelMoment(4, { xp: 450, xpPeak: 450, levelFloor: 1 }), {
    show: true,
    level: 4,
  });
});

test('levelMoment: above the floor the shown level is the displayed level', () => {
  const member = { xp: 1500, xpPeak: 1500, levelFloor: 5 };
  assert.deepEqual(levelMoment(6, member), { show: true, level: 6 });
  // Two level-ups queued: both show the level the rest of the app displays.
  assert.deepEqual(levelMoment(5, { xp: 3000, xpPeak: 3000, levelFloor: 4 }), {
    show: true,
    level: 8,
  });
});

test('levelMoment: before the backfill the old-curve level is the floor; a bad level is skipped', () => {
  // {xp: 600} without levelFloor displays old-curve level 7: the new-curve level 4 is no level-up.
  assert.deepEqual(levelMoment(4, { xp: 600 }), { show: false, level: 7 });
  assert.equal(levelMoment(undefined, { xp: 600, levelFloor: 1 }).show, false);
});
