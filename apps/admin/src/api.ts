// Typed wrapper over the admin callables (api-types.ts is the contract).
// Every screen goes through this module, so tests mock it wholesale.

import { httpsCallable } from 'firebase/functions';
import type {
  AdminAdjustRequest,
  AdminAdjustResponse,
  AdminAlert,
  AdminApproveAdjustmentRequest,
  AdminApproveAdjustmentResponse,
  AdminBackfillLevelFloorsResponse,
  AdminConfig,
  AdminGetConfigRequest,
  AdminListAlertsRequest,
  AdminListRuleSetsRequest,
  AdminListRuleSetsResponse,
  AdminLookupUserRequest,
  AdminLookupUserResponse,
  AdminPublishRequest,
  AdminPublishResponse,
  AdminRebuildWalletRequest,
  AdminRebuildWalletResponse,
  AdminRollbackRequest,
  AdminRollbackResponse,
  AdminSaveDraftRequest,
  AdminSaveDraftResponse,
  AdminSetConfigRequest,
  AdminSimulateRequest,
  AdminSimulateResponse,
} from './api-types';
import { getFirebase } from './firebase';

export interface Api {
  getConfig(): Promise<AdminConfig>;
  setConfig(req: AdminSetConfigRequest): Promise<AdminConfig>;
  listRuleSets(): Promise<AdminListRuleSetsResponse['ruleSets']>;
  saveDraft(req: AdminSaveDraftRequest): Promise<AdminSaveDraftResponse>;
  publish(req: AdminPublishRequest): Promise<AdminPublishResponse>;
  rollback(): Promise<AdminRollbackResponse>;
  simulate(req: AdminSimulateRequest): Promise<AdminSimulateResponse>;
  lookupUser(req: AdminLookupUserRequest): Promise<AdminLookupUserResponse>;
  adjust(req: AdminAdjustRequest): Promise<AdminAdjustResponse>;
  approveAdjustment(req: AdminApproveAdjustmentRequest): Promise<AdminApproveAdjustmentResponse>;
  listAlerts(): Promise<AdminAlert[]>;
  rebuildWallet(req: AdminRebuildWalletRequest): Promise<AdminRebuildWalletResponse>;
  backfillLevelFloors(): Promise<AdminBackfillLevelFloorsResponse>;
}

function call<Req, Res>(name: string, req: Req): Promise<Res> {
  const callable = httpsCallable<Req, Res>(getFirebase().functions, name);
  return callable(req).then((result) => result.data);
}

export const api: Api = {
  getConfig: () => call<AdminGetConfigRequest, AdminConfig>('adminGetConfig', {}),
  setConfig: (req) => call<AdminSetConfigRequest, AdminConfig>('adminSetConfig', req),
  listRuleSets: () =>
    call<AdminListRuleSetsRequest, AdminListRuleSetsResponse>('adminListRuleSets', {}).then(
      (r) => r.ruleSets,
    ),
  saveDraft: (req) => call<AdminSaveDraftRequest, AdminSaveDraftResponse>('adminSaveDraft', req),
  publish: (req) => call<AdminPublishRequest, AdminPublishResponse>('adminPublish', req),
  rollback: () => call<AdminRollbackRequest, AdminRollbackResponse>('adminRollback', {}),
  simulate: (req) => call<AdminSimulateRequest, AdminSimulateResponse>('adminSimulate', req),
  lookupUser: (req) => call<AdminLookupUserRequest, AdminLookupUserResponse>('adminLookupUser', req),
  adjust: (req) => call<AdminAdjustRequest, AdminAdjustResponse>('adminAdjust', req),
  approveAdjustment: (req) =>
    call<AdminApproveAdjustmentRequest, AdminApproveAdjustmentResponse>(
      'adminApproveAdjustment',
      req,
    ),
  listAlerts: () =>
    call<AdminListAlertsRequest, { alerts: AdminAlert[] }>('adminListAlerts', {}).then(
      (r) => r.alerts,
    ),
  rebuildWallet: (req) =>
    call<AdminRebuildWalletRequest, AdminRebuildWalletResponse>('adminRebuildWallet', req),
  backfillLevelFloors: () =>
    call<Record<string, never>, AdminBackfillLevelFloorsResponse>('adminBackfillLevelFloors', {}),
};
