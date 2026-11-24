import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import './admin';
import { DomainError } from './domain/errors';
import { generateAllInstances, closeAllWeeks, runReminders } from './scheduled';
import { replayGamiLedgerRow } from './gamification/trigger';
import { runGamificationReminders } from './gamification/reminders';
import * as store from './store';

// Every callable and scheduled function in the HouseGains v1 contract, region us-central1.

const REGION = 'us-central1';

setGlobalOptions({ maxInstances: 10 });

/** Requires sign-in, then maps DomainError to the HttpsError codes the contract names. */
function callable(handler: (uid: string, data: unknown) => Promise<unknown>) {
  return onCall({ region: REGION }, async (request: CallableRequest<unknown>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    try {
      return await handler(request.auth.uid, request.data);
    } catch (error) {
      if (error instanceof DomainError) throw new HttpsError(error.code, error.message);
      throw error;
    }
  });
}

export const ensureProfile = callable(store.ensureProfile);
export const createHousehold = callable(store.createHousehold);
export const updateHousehold = callable(store.updateHousehold);
export const joinHousehold = callable(store.joinHousehold);
export const rotateInvite = callable(store.rotateInvite);
export const saveChore = callable(store.saveChore);
export const setAssignments = callable(store.setAssignments);
export const setChoreActive = callable(store.setChoreActive);
export const deleteChore = callable(store.deleteChore);
export const completeSubtask = callable(store.completeSubtask);
export const undoSubtask = callable(store.undoSubtask);
export const setMemberRole = callable(store.setMemberRole);
export const reportCompletion = callable(store.reportCompletion);
export const resolveDispute = callable(store.resolveDispute);
export const moderateInstance = callable(store.moderateInstance);
export const finishSetup = callable(store.finishSetup);
export const postCompletion = callable(store.postCompletion);
export const leaveHousehold = callable(store.leaveHousehold);
export const removeMember = callable(store.removeMember);
export const reportContent = callable(store.reportContent);
export const deleteAccount = callable((uid) => store.deleteAccount(uid));
export const ackCelebrations = callable(store.ackCelebrations);
export const setAwayWeeks = callable(store.setAwayWeeks);

export const generateInstances = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'UTC', region: REGION, timeoutSeconds: 540, maxInstances: 1 },
  async () => {
    await generateAllInstances(new Date());
  },
);

export const sendReminders = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'UTC', region: REGION, timeoutSeconds: 540, maxInstances: 1 },
  async () => {
    await runReminders(new Date());
  },
);

export const closeWeeks = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'UTC', region: REGION, timeoutSeconds: 540, maxInstances: 1 },
  async () => {
    await closeAllWeeks(new Date());
  },
);

/** Every 60 minutes: streak-at-risk (Sunday 18:00) and house-running-late (Saturday 10:00) reminders, live households only. */
export const gamificationReminders = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'UTC', region: REGION, timeoutSeconds: 540, maxInstances: 1 },
  async () => {
    await runGamificationReminders(new Date());
  },
);

/**
 * Safety net (contract C8): re-runs the engine for every XP ledger row the callable did not mark as
 * processed. The callable that wrote the row normally gets there first, so the replay is skipped; the grace
 * period lets that happen, so a client waiting on `celebrations` gets them in the response instead of the inbox.
 */
const REPLAY_GRACE_MS = 3_000;
export const replayGamiLedgerRowTrigger = onDocumentCreated(
  { document: 'households/{hid}/ledger/{entryId}', region: REGION },
  async (event) => {
    if (!event.data) return;
    await replayGamiLedgerRow(event.data, { graceMs: REPLAY_GRACE_MS });
  },
);
