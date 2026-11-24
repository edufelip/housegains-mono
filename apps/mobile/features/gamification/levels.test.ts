import assert from 'node:assert/strict';
import test from 'node:test';
import {
  displayedLevel,
  levelForXp,
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
