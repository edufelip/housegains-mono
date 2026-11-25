import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { DomainError } from '../domain/errors';
import { adjust, approveAdjustment } from './adjust';
import { lookupUser } from './lookup';
import { backfillLevelFloors, listAlerts, rebuildWallet } from './maintenance';
import { listRuleSets, publish, rollback, saveDraft } from './rule-sets';
import { simulate } from './simulate';

// The 11 admin callables of the gamification back office (contract C10), implementing
// apps/admin/src/api-types.ts. Each one requires the Auth custom claim `admin: true`; every mutation
// writes a gamification/audit row inside the module it lives in.

const REGION = 'us-central1';

export interface AdminCaller {
  uid: string;
}

/** The claim check, separate from the wrapper so it can be unit tested. */
export function requireAdmin(auth: CallableRequest<unknown>['auth']): AdminCaller {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token.admin !== true) throw new HttpsError('permission-denied', 'Admin access required.');
  return { uid: auth.uid };
}

function adminCallable(handler: (caller: AdminCaller, data: unknown) => Promise<unknown>) {
  return onCall({ region: REGION, timeoutSeconds: 300, memory: '512MiB', maxInstances: 10 }, async (request: CallableRequest<unknown>) => {
    const caller = requireAdmin(request.auth);
    try {
      return await handler(caller, request.data);
    } catch (error) {
      if (error instanceof DomainError) throw new HttpsError(error.code, error.message);
      throw error;
    }
  });
}

export const adminListRuleSets = adminCallable(() => listRuleSets());
export const adminSaveDraft = adminCallable((caller, data) => saveDraft(caller.uid, data));
export const adminPublish = adminCallable((caller, data) => publish(caller.uid, data));
export const adminRollback = adminCallable((caller) => rollback(caller.uid));
export const adminSimulate = adminCallable((_caller, data) => simulate(data));
export const adminLookupUser = adminCallable((_caller, data) => lookupUser(data));
export const adminAdjust = adminCallable((caller, data) => adjust(caller.uid, data));
export const adminApproveAdjustment = adminCallable((caller, data) => approveAdjustment(caller.uid, data));
export const adminListAlerts = adminCallable(() => listAlerts());
export const adminRebuildWallet = adminCallable((caller, data) => rebuildWallet(caller.uid, data));
export const adminBackfillLevelFloors = adminCallable((caller) => backfillLevelFloors(caller.uid));
