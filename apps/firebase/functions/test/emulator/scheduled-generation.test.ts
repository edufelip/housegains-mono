import { describe, expect, it, vi } from 'vitest';
import { db } from '../../src/admin';
import { generateAllInstances } from '../../src/scheduled';
import { addDaysToDateKey, dateKeyInTimeZone } from '../../src/domain/time';
import { INSTANCE_HORIZON_DAYS } from '../../src/domain/instances';
import { adminDb, choreInput, createHousehold, must, withProfile } from './helpers';

describe('generateInstances pass', () => {
  it('skips a chore already generated through the household horizon', async () => {
    const creator = await withProfile('generation', 'Alex');
    const { householdId } = await createHousehold(creator);
    const { choreId } = await must('saveChore', creator.token, {
      householdId,
      chore: choreInput(),
    });
    const now = new Date();
    const horizon = addDaysToDateKey(
      dateKeyInTimeZone(now, 'UTC'),
      INSTANCE_HORIZON_DAYS,
    );
    const choreRef = adminDb().doc(`households/${householdId}/chores/${choreId}`);
    await choreRef.update({ generatedThrough: horizon });

    const transactionSpy = vi.spyOn(db(), 'runTransaction');
    try {
      expect(await generateAllInstances(now)).toBe(0);
      expect(transactionSpy).not.toHaveBeenCalled();
      expect((await choreRef.get()).get('generatedThrough')).toBe(horizon);
    } finally {
      transactionSpy.mockRestore();
    }
  });
});
