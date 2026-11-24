import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import './admin';
import { DomainError } from './domain/errors';
import { generateAllInstances, closeAllWeeks, runReminders } from './scheduled';
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
