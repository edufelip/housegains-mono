import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_AWAY_WEEKS_PER_YEAR,
  awayErrorForClient,
  awayErrorKey,
  dateKeyInTimeZone,
  isMondayKey,
  nextMilestone,
  streakStatus,
  upcomingMondays,
  validateAwayWeeks,
} from './streak-rules';

test('dateKeyInTimeZone uses the household time zone', () => {
  const instant = new Date('2026-11-24T02:30:00.000Z');
  assert.equal(dateKeyInTimeZone(instant, 'UTC'), '2026-11-24');
  assert.equal(dateKeyInTimeZone(instant, 'America/Sao_Paulo'), '2026-11-23');
});

test('isMondayKey', () => {
  assert.equal(isMondayKey('2026-11-23'), true);
  assert.equal(isMondayKey('2026-11-24'), false);
  assert.equal(isMondayKey('not-a-date'), false);
  assert.equal(isMondayKey('2026-13-40'), false);
});

test('upcomingMondays lists Mondays strictly after today', () => {
  // 2026-11-23 is a Monday: it is not "after today", the next one is.
  assert.deepEqual(upcomingMondays('2026-11-23', 3), ['2026-11-30', '2026-12-07', '2026-12-14']);
  assert.deepEqual(upcomingMondays('2026-11-25', 2), ['2026-11-30', '2026-12-07']);
});

test('streakStatus separates active, broken and not started', () => {
  assert.equal(streakStatus({ current: 4, record: 6 }), 'active');
  assert.equal(streakStatus({ current: 0, record: 6 }), 'broken');
  assert.equal(streakStatus({ current: 0, record: 0 }), 'none');
});

test('nextMilestone follows the 2/4/8/12/26 ladder', () => {
  assert.deepEqual(nextMilestone(0), { weeks: 2, reward: 25 });
  assert.deepEqual(nextMilestone(2), { weeks: 4, reward: 50 });
  assert.deepEqual(nextMilestone(7), { weeks: 8, reward: 100 });
  assert.deepEqual(nextMilestone(26), null);
});

test('away weeks must be future Mondays', () => {
  const today = '2026-11-24';
  assert.deepEqual(validateAwayWeeks({ selected: ['2026-11-30'], existing: [], today }), []);
  assert.deepEqual(validateAwayWeeks({ selected: ['2026-12-01'], existing: [], today }), [
    { code: 'notMonday', weekStart: '2026-12-01' },
  ]);
  assert.deepEqual(validateAwayWeeks({ selected: ['2026-11-23'], existing: [], today }), [
    { code: 'notFuture', weekStart: '2026-11-23' },
  ]);
  assert.deepEqual(validateAwayWeeks({ selected: ['junk'], existing: [], today }), [
    { code: 'notMonday', weekStart: 'junk' },
  ]);
});

test('at most three away weeks per calendar year, past weeks included', () => {
  const today = '2026-11-24';
  assert.equal(MAX_AWAY_WEEKS_PER_YEAR, 3);
  assert.deepEqual(
    validateAwayWeeks({
      selected: ['2026-11-30', '2026-12-07'],
      existing: ['2026-02-02', '2026-03-02'],
      today,
    }),
    [{ code: 'yearLimit', year: '2026' }],
  );
  // exactly three is fine
  assert.deepEqual(
    validateAwayWeeks({ selected: ['2026-11-30', '2026-12-07'], existing: ['2026-02-02'], today }),
    [],
  );
  // existing future weeks are replaced by the request, not added to it
  assert.deepEqual(
    validateAwayWeeks({
      selected: ['2026-12-07'],
      existing: ['2026-02-02', '2026-03-02', '2026-11-30'],
      today,
    }),
    [],
  );
  // weeks in another year count against that year
  assert.deepEqual(
    validateAwayWeeks({
      selected: ['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25'],
      existing: [],
      today,
    }),
    [{ code: 'yearLimit', year: '2027' }],
  );
});

test('more than twelve weeks is rejected before calling the server', () => {
  const selected = upcomingMondays('2026-11-24', 13);
  const errors = validateAwayWeeks({ selected, existing: [], today: '2026-11-24' });
  assert.ok(errors.some((error) => error.code === 'tooMany'));
});

test('awayErrorKey maps callable failures to localized messages', () => {
  assert.deepEqual(awayErrorKey('invalid-argument', 'weekStarts must be Mondays.'), {
    key: 'housegains.gamification.away.error.notMonday',
  });
  assert.deepEqual(awayErrorKey('invalid-argument', 'Too many away weeks.'), {
    key: 'housegains.gamification.away.error.tooMany',
  });
  assert.deepEqual(awayErrorKey('failed-precondition', 'Away weeks must start in the future.'), {
    key: 'housegains.gamification.away.error.notFuture',
  });
  assert.deepEqual(
    awayErrorKey('failed-precondition', 'At most 3 away weeks per calendar year (2026).'),
    { key: 'housegains.gamification.away.error.yearLimit', params: { max: 3, year: '2026' } },
  );
  assert.deepEqual(awayErrorKey('failed-precondition', 'Join a household first.'), {
    key: 'housegains.gamification.away.error.noHousehold',
  });
  assert.deepEqual(awayErrorKey('permission-denied', 'nope'), {
    key: 'housegains.gamification.away.error.generic',
  });
  assert.deepEqual(awayErrorKey('unavailable', 'offline'), {
    key: 'housegains.gamification.away.error.network',
  });
});

test('awayErrorForClient maps client-side validation errors', () => {
  assert.deepEqual(awayErrorForClient({ code: 'notMonday', weekStart: '2026-12-01' }), {
    key: 'housegains.gamification.away.error.notMonday',
  });
  assert.deepEqual(awayErrorForClient({ code: 'notFuture', weekStart: '2026-11-23' }), {
    key: 'housegains.gamification.away.error.notFuture',
  });
  assert.deepEqual(awayErrorForClient({ code: 'yearLimit', year: '2027' }), {
    key: 'housegains.gamification.away.error.yearLimit',
    params: { max: 3, year: '2027' },
  });
  assert.deepEqual(awayErrorForClient({ code: 'tooMany' }), {
    key: 'housegains.gamification.away.error.tooMany',
  });
});
