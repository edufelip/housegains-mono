import type { Wallet, WalletLedgerRow } from '@/features/gamification/types';
import type { Household, Member } from '@/features/household';

// Shared fixtures for the gamification component tests. Mocks themselves (jest.mock) must live in
// each test file because Jest hoists them.

export const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

export const me: Member = {
  id: 'me',
  name: 'Edu',
  initials: 'ED',
  color: '#FFD33D',
  role: 'creator',
};
export const bia: Member = {
  id: 'bia',
  name: 'Bia',
  initials: 'BI',
  color: '#F58BB7',
  role: 'member',
};

export function fakeHousehold(cohort?: 'live' | 'control' | 'shadow'): Household {
  return {
    id: 'home',
    name: 'Willow House',
    icon: '🏠',
    color: '#FFD33D',
    timeZone: 'UTC',
    ...(cohort ? { gamificationCohort: cohort } : {}),
    members: [me, bia],
    invite: {
      code: 'HG7K2P',
      expiresAt: '2027-01-01T00:00:00.000Z',
      uses: 0,
      maxUses: 8,
      revoked: false,
    },
  };
}

export function fakeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    householdId: 'home',
    memberId: 'me',
    balance: 120,
    lifetimeEarned: 340,
    pendingBalance: 30,
    nextSpendableAt: '2026-11-25T08:00:00.000Z',
    level: 4,
    xpPeak: 1000,
    streak: {
      current: 5,
      record: 9,
      lastCountedWeek: '2026-11-16',
      lastActionWeek: '2026-11-16',
      folgas: 1,
      folgaProgress: 2,
      awayWeeks: [],
    },
    achievements: {
      helper: { tier: 'silver', unlockedAt: '2026-11-01T10:00:00.000Z' },
      fit: { tier: 'bronze', unlockedAt: '2026-11-02T10:00:00.000Z', active: false },
      pillar: { tier: 'bronze', unlockedAt: '2026-11-03T10:00:00.000Z', active: true },
      spring: { tier: 'bronze', unlockedAt: '2026-11-04T10:00:00.000Z' },
    },
    recentWeeks: [
      { weekStart: '2026-10-26', counted: true, xp: 120 },
      { weekStart: '2026-11-02', counted: true, xp: 90 },
      { weekStart: '2026-11-09', counted: false, xp: 10 },
      { weekStart: '2026-11-16', counted: true, xp: 150 },
    ],
    updatedAt: '2026-11-24T10:00:00.000Z',
    ...overrides,
  };
}

export function fakeLedger(): WalletLedgerRow[] {
  return [
    {
      key: 'earn.subtask:a:me',
      ruleId: 'earn.subtask',
      track: 'ganhos',
      amount: 20,
      sourceRef: 'a',
      createdAt: '2026-11-24T10:00:00.000Z',
      spendableAt: '2026-11-25T10:00:00.000Z',
    },
    {
      key: 'earn.assist:a:me',
      ruleId: 'earn.assist',
      track: 'ganhos',
      amount: 5,
      sourceRef: 'a',
      createdAt: '2026-11-24T10:01:00.000Z',
      spendableAt: '2026-11-25T10:01:00.000Z',
    },
    {
      key: 'rev:earn.subtask:b:me',
      ruleId: 'earn.subtask',
      track: 'ganhos',
      amount: -10,
      sourceRef: 'b',
      reversesEntryId: 'earn.subtask:b:me',
      createdAt: '2026-11-23T10:00:00.000Z',
      spendableAt: '2026-11-24T10:00:00.000Z',
    },
  ];
}
