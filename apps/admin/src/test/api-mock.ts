// Shared fixtures and a mock factory for the api module. Screen tests do
// `vi.mock('../api', async () => { const m = await import('./test/api-mock'); return { api: m.createApiMock() }; })`
// and then drive `vi.mocked(api)`.

import { vi, type Mock } from 'vitest';
import type { Api } from '../api';
import type {
  AdminAlert,
  AdminLookupUserResponse,
  AdminRuleSet,
  AdminSimulateResponse,
} from '../api-types';
import type { RuleSet } from '../engine-types';

export type ApiMock = { [K in keyof Api]: Mock };

export function createApiMock(): ApiMock {
  return {
    listRuleSets: vi.fn(),
    saveDraft: vi.fn(),
    publish: vi.fn(),
    rollback: vi.fn(),
    simulate: vi.fn(),
    lookupUser: vi.fn(),
    adjust: vi.fn(),
    approveAdjustment: vi.fn(),
    listAlerts: vi.fn(),
    rebuildWallet: vi.fn(),
    backfillLevelFloors: vi.fn(),
  } as ApiMock;
}

export function sampleRulesV1(): RuleSet {
  return {
    schemaVersion: 1,
    earnRules: [
      {
        id: 'earn.subtask',
        track: 'ganhos',
        status: 'active',
        on: { kind: 'ledger.subtask' },
        award: { amount: 1, perXp: true },
        caps: [{ scope: 'member', window: 'day', max: 400, pool: 'dailyGanhos' }],
        clawback: [{ on: 'ledger.undo-subtask', match: 'sourceRef' }],
        spendableAfterHours: 24,
        celebrate: { moment: 'toast', copyKey: 'gami.earn.chore' },
      },
      {
        id: 'earn.share',
        track: 'ganhos',
        status: 'active',
        on: { kind: 'feed.post' },
        award: { amount: 2 },
        caps: [{ scope: 'member', window: 'day', max: 1 }],
        spendableAfterHours: 24,
        celebrate: { moment: 'toast', copyKey: 'gami.earn.share' },
      },
    ],
    achievements: [],
    streak: {
      member: {
        minWeekCredits: 3,
        folgaEveryWeeks: 4,
        folgaMax: 1,
        folgaHighLevelFrom: 8,
        folgaMaxHighLevel: 2,
      },
      organizer: {
        minOnTimeRatePercent: 60,
        minWeekInstancesDue: 5,
        folgaEveryWeeks: 6,
        folgaMax: 1,
      },
    },
    levels: {
      member: { base: 50, titles: [{ fromLevel: 1, key: 'rookie' }] },
      organizer: { thresholds: [{ zelo: 0, key: 'organizer' }] },
    },
    caps: {
      dailyGanhos: 400,
      perInstanceGanhos: 150,
      weeklyZelo: 200,
      newChoreCooldownHours: 24,
    },
    quests: [],
    campaigns: [],
  };
}

/** V2 = V1 with earn.share bumped to 3; used for diff and simulator fixtures. */
export function sampleRulesV2(): RuleSet {
  return {
    ...sampleRulesV1(),
    earnRules: sampleRulesV1().earnRules.map((rule) =>
      rule.id === 'earn.share' ? { ...rule, award: { ...rule.award, amount: 3 } } : rule,
    ),
    campaigns: [
      {
        id: 'turbo-launch',
        multiplier: 2,
        ruleIds: ['earn.subtask'],
        activeFrom: '2026-01-01',
        activeTo: null,
      },
    ],
  };
}

export function sampleRuleSets(): AdminRuleSet[] {
  return [
    {
      version: 1,
      status: 'published',
      notes: 'Initial publish',
      createdBy: 'admin-1',
      createdAt: '2026-11-01T10:00:00.000Z',
      publishedAt: '2026-11-02T10:00:00.000Z',
      rules: sampleRulesV1(),
    },
    {
      version: 2,
      status: 'draft',
      notes: 'Bump share, add turbo',
      createdBy: 'admin-1',
      createdAt: '2026-11-20T10:00:00.000Z',
      publishedAt: null,
      rules: sampleRulesV2(),
    },
  ];
}

export function sampleSimulateResponse(): AdminSimulateResponse {
  return {
    days: 7,
    published: {
      ganhos: 900,
      zelo: 40,
      membersAffected: 12,
      capHits: 3,
      averagePerMember: 75,
    },
    draft: {
      ganhos: 1000,
      zelo: 40,
      membersAffected: 12,
      capHits: 2,
      averagePerMember: 83,
    },
    perRule: [
      {
        ruleId: 'earn.subtask',
        track: 'ganhos',
        published: { total: 800, membersAffected: 12, capHits: 3, averagePerMember: 66 },
        draft: { total: 800, membersAffected: 12, capHits: 2, averagePerMember: 66 },
      },
      {
        ruleId: 'earn.share',
        track: 'ganhos',
        published: { total: 100, membersAffected: 8, capHits: 0, averagePerMember: 12 },
        draft: { total: 200, membersAffected: 8, capHits: 0, averagePerMember: 25 },
      },
      {
        ruleId: 'earn.welcome',
        track: 'ganhos',
        published: null,
        draft: { total: 50, membersAffected: 1, capHits: 0, averagePerMember: 50 },
      },
    ],
  };
}

export function sampleLookup(): AdminLookupUserResponse {
  return {
    uid: 'user-1',
    wallet: {
      uid: 'user-1',
      householdId: 'house-1',
      balance: 120,
      pendingBalance: 20,
      lifetimeEarned: 300,
      nextSpendableAt: '2026-11-25T10:00:00.000Z',
      level: 2,
      xpPeak: 130,
      streak: { current: 4, record: 9, folgas: 1 },
      updatedAt: '2026-11-24T10:00:00.000Z',
    },
    ledger: [
      {
        key: 'earn.subtask:row-1:user-1',
        ruleId: 'earn.subtask',
        ruleSetVersion: 1,
        track: 'ganhos',
        amount: 20,
        sourceRef: 'row-1',
        householdId: 'house-1',
        memberId: 'user-1',
        reversesEntryId: null,
        reason: null,
        createdAt: '2026-11-23T18:00:00.000Z',
        spendableAt: '2026-11-24T18:00:00.000Z',
        explanation: 'Washed the dinner dishes (+20 XP).',
      },
      {
        key: 'rev:earn.share:post-9:user-1',
        ruleId: 'earn.share',
        ruleSetVersion: 1,
        track: 'ganhos',
        amount: -2,
        sourceRef: 'post-9',
        householdId: 'house-1',
        memberId: 'user-1',
        reversesEntryId: 'earn.share:post-9:user-1',
        reason: 'post deleted',
        createdAt: '2026-11-23T19:00:00.000Z',
        spendableAt: '2026-11-23T19:00:00.000Z',
        explanation: 'Reversal of a deleted feed post.',
      },
    ],
    pendingAdjustments: [
      {
        id: 'adj-1',
        uid: 'user-1',
        amount: 600,
        reasonCode: 'correction',
        note: 'Missed double-credit fix',
        createdBy: 'admin-1',
        createdAt: '2026-11-24T09:00:00.000Z',
      },
    ],
  };
}

export function sampleAlerts(): AdminAlert[] {
  return [
    {
      id: 'alert-1',
      kind: 'velocity',
      householdId: 'house-1',
      memberId: 'user-2',
      data: { subtasksIn10Minutes: 14 },
      createdAt: '2026-11-24T08:00:00.000Z',
    },
    {
      id: 'alert-2',
      kind: 'undo-rate',
      householdId: 'house-2',
      memberId: null,
      data: { undoRatePercent: 42 },
      createdAt: '2026-11-23T08:00:00.000Z',
    },
  ];
}
