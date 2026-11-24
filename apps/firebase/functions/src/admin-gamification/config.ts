import { randomBytes } from 'node:crypto';
import { db } from '../admin';
import { DomainError } from '../domain/errors';
import type { RolloutMode } from '../domain/gamification';
import { GAMI_CONFIG_PATH } from '../gamification/paths';
import { invalidateGamiConfigCache } from '../gamification/config';
import type { AdminConfig, AdminSetConfigRequest } from './api-types';
import { writeAuditTx } from './audit';
import { asObject, numberOr, stringOr } from './parse';

// adminGetConfig / adminSetConfig (C1, C10). The raw config document is read leniently,
// exactly like the runner does (unknown mode reads as off, versions must be positive integers).

const MODES: readonly RolloutMode[] = ['off', 'shadow', 'live'];

export function configFromDoc(data: Record<string, unknown> | undefined): AdminConfig {
  const d = data ?? {};
  const version = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
  return {
    mode: d.mode === 'shadow' || d.mode === 'live' ? d.mode : 'off',
    activeVersion: version(d.activeVersion),
    previousVersion: version(d.previousVersion),
    cohortSalt: stringOr(d.cohortSalt, ''),
    livePercent: numberOr(d.livePercent, 0),
    controlPercent: numberOr(d.controlPercent, 0),
  };
}

export function newCohortSalt(): string {
  return randomBytes(16).toString('hex');
}

export async function getConfig(): Promise<AdminConfig> {
  const snap = await db().doc(GAMI_CONFIG_PATH).get();
  return configFromDoc(snap.data());
}

function percent(data: Record<string, unknown>, field: 'livePercent' | 'controlPercent'): number {
  const value = data[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new DomainError('invalid-argument', `${field} must be a number from 0 to 100.`);
  }
  return value;
}

export function parseSetConfig(raw: unknown): AdminSetConfigRequest {
  const data = asObject(raw);
  const mode = data.mode;
  if (typeof mode !== 'string' || !MODES.includes(mode as RolloutMode)) {
    throw new DomainError('invalid-argument', `mode must be one of ${MODES.join(', ')}.`);
  }
  const livePercent = percent(data, 'livePercent');
  const controlPercent = percent(data, 'controlPercent');
  if (livePercent + controlPercent > 100) {
    throw new DomainError('invalid-argument', 'livePercent + controlPercent must not exceed 100.');
  }
  return { mode: mode as RolloutMode, livePercent, controlPercent };
}

/**
 * Sets mode and percentages. The cohort salt is created the first time the config is written and never
 * changed afterwards: changing it would re-draw every household's cohort. activeVersion/previousVersion
 * belong to publish/rollback and are left alone.
 */
export async function setConfig(actorUid: string, raw: unknown): Promise<AdminConfig> {
  const request = parseSetConfig(raw);
  const ref = db().doc(GAMI_CONFIG_PATH);
  const next = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const before = configFromDoc(snap.data());
    const cohortSalt = before.cohortSalt !== '' ? before.cohortSalt : newCohortSalt();
    const after: AdminConfig = { ...before, ...request, cohortSalt };
    tx.set(
      ref,
      {
        mode: after.mode,
        livePercent: after.livePercent,
        controlPercent: after.controlPercent,
        cohortSalt,
        activeVersion: after.activeVersion,
        previousVersion: after.previousVersion,
      },
      { merge: true },
    );
    writeAuditTx(tx, {
      action: 'config.set',
      actorUid,
      before: { mode: before.mode, livePercent: before.livePercent, controlPercent: before.controlPercent },
      after: { mode: after.mode, livePercent: after.livePercent, controlPercent: after.controlPercent },
      at: new Date(),
    });
    return after;
  });
  invalidateGamiConfigCache();
  return next;
}
