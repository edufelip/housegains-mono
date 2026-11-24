import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from './default-rule-set';
import { evaluate } from './engine';
import type {
  EngineInput,
  EngineResult,
  FeedPostEvent,
  LedgerBonusEvent,
  LedgerSubtaskEvent,
  OrganizerProjection,
  WalletProjection,
} from './types';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const CREATOR = 'creator';
const HH = 'hh1';

function wallet(overrides?: Partial<WalletProjection>): WalletProjection {
  return {
    householdId: HH,
    memberId: 'uidA',
    balance: 0,
    lifetimeEarned: 0,
    pendingBalance: 0,
    nextSpendableAt: null,
    level: 1,
    xpPeak: 0,
    streak: {
      current: 0,
      record: 0,
      lastCountedWeek: null,
      lastActionWeek: null,
      folgas: 0,
      folgaProgress: 0,
      awayWeeks: [],
    },
    achievements: {},
    stats: {
      assists: 0,
      finals: 0,
      onTime: 0,
      credits: 0,
      categories: {},
      weeksCounted: 0,
      recentWeeks: [],
      householdXpByWeek: {},
      springSubtasks: 0,
      springSeasonKey: null,
      decemberGoalWeeks: 0,
      streakMilestonesPaid: [],
      welcomePaid: true, // default: tests about other rules don't want the welcome bonus
    },
    caps: {},
    projectionVersion: 1,
    updatedAt: NOW,
    ...overrides,
  };
}

/** A wallet whose welcome bonus has not been paid yet. */
function freshWallet(): WalletProjection {
  const base = wallet();
  base.stats.welcomePaid = false;
  return base;
}

function organizer(overrides?: Partial<OrganizerProjection>): OrganizerProjection {
  return {
    householdId: HH,
    memberId: CREATOR,
    zelo: 0,
    lifetimeZelo: 0,
    level: 1,
    streak: {
      current: 0,
      record: 0,
      lastCountedWeek: null,
      lastActionWeek: null,
      folgas: 0,
      folgaProgress: 0,
    },
    achievements: {},
    stats: {
      membersActivated: 0,
      maestroWeeks: 0,
      evenSplitWeeks: 0,
      customChoreCompletions: {},
      weeksCounted: 0,
      orderWeeks: [],
      streakMilestonesPaid: [],
    },
    caps: {},
    updatedAt: NOW,
    ...overrides,
  };
}

function input(overrides?: Partial<EngineInput>): EngineInput {
  return {
    now: NOW,
    rules: DEFAULT_RULE_SET,
    ruleSetVersion: null,
    wallet: null,
    organizer: undefined, // member-only context; pass an organizer where zelo is expected
    householdMemberCount: 3,
    timeZone: 'UTC',
    existingKeys: new Set<string>(),
    creatorUid: CREATOR,
    ...overrides,
  };
}

function subtaskEvent(overrides?: Partial<LedgerSubtaskEvent>): LedgerSubtaskEvent {
  return {
    kind: 'ledger.subtask',
    householdId: HH,
    ledgerRowId: 'row-1',
    instanceId: 'inst-1',
    subtaskId: 'wash',
    memberId: 'uidA',
    amount: 10,
    isAssist: false,
    isFinalCompleter: true,
    assigneeIds: ['uidA'],
    category: 'kitchen',
    choreId: 'chore-1',
    choreCreatedBy: CREATOR,
    choreIsCustom: true,
    choreUpdatedAt: null,
    completedAt: new Date('2026-11-24T10:00:00.000Z'),
    memberJoinedAt: null,
    xpPeakAfter: 10,
    choreXpRaised: false,
    recentSubtaskTimestamps: [],
    ...overrides,
  };
}

function bonusEvent(overrides?: Partial<LedgerBonusEvent>): LedgerBonusEvent {
  return {
    kind: 'ledger.bonus',
    householdId: HH,
    ledgerRowId: 'bonus-row-1',
    instanceId: 'inst-1',
    memberId: 'uidA',
    amount: 5,
    choreId: 'chore-1',
    choreUpdatedAt: null,
    completedAt: new Date('2026-11-24T10:05:00.000Z'),
    xpPeakAfter: null,
    ...overrides,
  };
}

function shareEvent(overrides?: Partial<FeedPostEvent>): FeedPostEvent {
  return {
    kind: 'feed.post',
    householdId: HH,
    postId: 'post-1',
    memberId: 'uidA',
    postedAt: new Date('2026-11-24T11:00:00.000Z'),
    ...overrides,
  };
}

describe('earn.subtask', () => {
  it('pays 1 Ganhos per XP and books balance, caps and stats', () => {
    const result = evaluate(subtaskEvent(), input({ wallet: wallet() }));
    expect(result.walletRows).toHaveLength(1);
    const row = result.walletRows[0];
    expect(row.key).toBe('earn.subtask:row-1:uidA');
    expect(row.amount).toBe(10);
    expect(row.track).toBe('ganhos');
    expect(row.sourceRef).toBe('row-1');
    expect(row.memberId).toBe('uidA');
    expect(row.createdAt.toISOString()).toBe('2026-11-24T10:00:00.000Z');
    expect(row.spendableAt.toISOString()).toBe('2026-11-25T10:00:00.000Z');

    const next = result.wallet;
    expect(next?.balance).toBe(10);
    expect(next?.lifetimeEarned).toBe(10);
    expect(next?.pendingBalance).toBe(10);
    expect(next?.nextSpendableAt?.toISOString()).toBe('2026-11-25T10:00:00.000Z');
    expect(next?.caps['day:2026-11-24:ganhos']).toBe(10);
    expect(next?.caps['instance:inst-1:ganhos']).toBe(10);
    expect(next?.stats.credits).toBe(1);
    expect(next?.stats.finals).toBe(1);
    expect(next?.stats.categories['kitchen']).toBe(1);
  });

  it('emits one toast with all parts of the action and a gami_earned event', () => {
    const result = evaluate(subtaskEvent(), input({ wallet: wallet() }));
    expect(result.celebrations).toEqual([
      expect.objectContaining({
        moment: 'toast',
        track: 'ganhos',
        amount: 10,
        parts: [{ ruleId: 'earn.subtask', amount: 10 }],
        copyKey: 'gami.earn.chore',
      }),
    ]);
    const earned = result.serverEvents.find((event) => event.name === 'gami_earned');
    expect(earned?.memberId).toBe('uidA');
    expect(earned?.data.amount).toBe(10);
  });

  it('pays the welcome bonus once, at the first subtask credit', () => {
    const first = evaluate(subtaskEvent(), input({ wallet: freshWallet() }));
    expect(first.walletRows.map((row) => row.key)).toEqual([
      'earn.subtask:row-1:uidA',
      'earn.welcome:row-1:uidA',
    ]);
    expect(first.walletRows[1].amount).toBe(50);
    expect(first.wallet?.stats.welcomePaid).toBe(true);
    expect(first.wallet?.caps['life:earn.welcome']).toBe(1);
    // One toast carries both earns.
    expect(first.celebrations[0].parts).toEqual([
      { ruleId: 'earn.subtask', amount: 10 },
      { ruleId: 'earn.welcome', amount: 50 },
    ]);

    const second = evaluate(
      subtaskEvent({ ledgerRowId: 'row-2', amount: 4, xpPeakAfter: 14 }),
      input({ wallet: first.wallet as WalletProjection, existingKeys: new Set(first.walletRows.map((r) => r.key)) }),
    );
    expect(second.walletRows.map((row) => row.key)).toEqual(['earn.subtask:row-2:uidA']);
    expect(second.wallet?.balance).toBe(64);
  });

  it('pays the welcome bonus even when the chore is in the new-chore cooldown', () => {
    const event = subtaskEvent({ choreUpdatedAt: new Date('2026-11-24T09:00:00.000Z') });
    const result = evaluate(event, input({ wallet: freshWallet() }));
    expect(result.walletRows.map((row) => row.key)).toEqual(['earn.welcome:row-1:uidA']);
    expect(result.wallet?.stats.credits).toBe(0); // no credit stats without a Ganhos award
  });

  it('skips Ganhos for chores edited less than 24h before the completion, XP untouched', () => {
    const within = evaluate(
      subtaskEvent({ choreUpdatedAt: new Date('2026-11-23T12:00:00.000Z') }),
      input({ wallet: wallet() }),
    );
    expect(within.walletRows).toEqual([]);
    expect(within.wallet?.balance).toBe(0);
    expect(within.wallet?.xpPeak).toBe(10); // xpPeak still follows the XP ledger
    expect(within.wallet?.level).toBe(1);

    const outside = evaluate(
      subtaskEvent({ choreUpdatedAt: new Date('2026-11-23T09:59:00.000Z') }),
      input({ wallet: wallet() }),
    );
    expect(outside.walletRows.map((row) => row.amount)).toEqual([10]);
  });

  it('trims the award to the remaining daily cap and skips at zero', () => {
    const trimmed = evaluate(
      subtaskEvent(),
      input({ wallet: wallet({ caps: { 'day:2026-11-24:ganhos': 397 } }) }),
    );
    expect(trimmed.walletRows[0].amount).toBe(3);
    expect(trimmed.wallet?.caps['day:2026-11-24:ganhos']).toBe(400);

    const blocked = evaluate(
      subtaskEvent({ xpPeakAfter: null }),
      input({ wallet: wallet({ caps: { 'day:2026-11-24:ganhos': 400 } }) }),
    );
    expect(blocked.walletRows).toEqual([]);
    expect(blocked.wallet).toBeNull();
  });

  it('trims to the per-instance cap of 150 across rules', () => {
    const trimmed = evaluate(
      subtaskEvent({ amount: 20 }),
      input({ wallet: wallet({ caps: { 'instance:inst-1:ganhos': 148 } }) }),
    );
    expect(trimmed.walletRows[0].amount).toBe(2);

    // The assist rule shares the same instance pool and gets nothing.
    const assistBlocked = evaluate(
      subtaskEvent({ amount: 20, isAssist: true, assigneeIds: ['uidB'] }),
      input({ wallet: wallet({ caps: { 'instance:inst-1:ganhos': 148 } }) }),
    );
    expect(assistBlocked.walletRows.map((row) => row.ruleId)).toEqual(['earn.subtask']);
  });

  it('is idempotent: an existing key yields no row and no counter change', () => {
    const replay = evaluate(
      subtaskEvent(),
      input({ wallet: wallet({ balance: 10, caps: { 'day:2026-11-24:ganhos': 10 } }), existingKeys: new Set(['earn.subtask:row-1:uidA']) }),
    );
    expect(replay.walletRows).toEqual([]);
    expect(replay.wallet).toBeNull();
    expect(replay.celebrations).toEqual([]);
    expect(replay.serverEvents).toEqual([]);
  });
});

describe('earn.assist', () => {
  it('pays 5 on assists with per-day and per-assignee-target caps', () => {
    const event = subtaskEvent({ isAssist: true, assigneeIds: ['uidB'], isFinalCompleter: false, xpPeakAfter: null });
    const result = evaluate(event, input({ wallet: wallet() }));
    expect(result.walletRows.map((row) => row.key)).toEqual(['earn.subtask:row-1:uidA', 'earn.assist:row-1:uidA']);
    expect(result.walletRows[1].amount).toBe(5);
    expect(result.wallet?.stats.assists).toBe(1);
    expect(result.wallet?.caps['day:2026-11-24:earn.assist']).toBe(1);
    expect(result.wallet?.caps['day:2026-11-24:earn.assist:target:uidB']).toBe(1);
    expect(result.celebrations[0].parts).toEqual([
      { ruleId: 'earn.subtask', amount: 10 },
      { ruleId: 'earn.assist', amount: 5 },
    ]);
  });

  it('stops after three assists in a day', () => {
    const event = subtaskEvent({ isAssist: true, assigneeIds: ['uidB'] });
    const result = evaluate(event, input({ wallet: wallet({ caps: { 'day:2026-11-24:earn.assist': 3 } }) }));
    expect(result.walletRows.map((row) => row.ruleId)).toEqual(['earn.subtask']);
  });

  it('stops after two assists per assignee target in a day', () => {
    const event = subtaskEvent({ isAssist: true, assigneeIds: ['uidB'] });
    const result = evaluate(event, input({ wallet: wallet({ caps: { 'day:2026-11-24:earn.assist:target:uidB': 2 } }) }));
    expect(result.walletRows.map((row) => row.ruleId)).toEqual(['earn.subtask']);
  });
});

describe('rule gating', () => {
  function rulesWithRule(patch: Record<string, unknown>) {
    const rules = JSON.parse(JSON.stringify(DEFAULT_RULE_SET)) as typeof DEFAULT_RULE_SET;
    Object.assign(rules.earnRules[0], patch);
    return rules;
  }

  it('skips paused rules', () => {
    const rules = rulesWithRule({ status: 'paused' });
    const result = evaluate(subtaskEvent(), input({ wallet: wallet(), rules }));
    expect(result.walletRows).toEqual([]);
  });

  it('honors activeFrom/activeTo local dates', () => {
    const future = rulesWithRule({ activeFrom: '2026-11-25' });
    expect(evaluate(subtaskEvent(), input({ wallet: wallet(), rules: future })).walletRows).toEqual([]);

    const past = rulesWithRule({ activeTo: '2026-11-23' });
    expect(evaluate(subtaskEvent(), input({ wallet: wallet(), rules: past })).walletRows).toEqual([]);

    const active = rulesWithRule({ activeFrom: '2026-11-24', activeTo: '2026-11-24' });
    expect(evaluate(subtaskEvent(), input({ wallet: wallet(), rules: active })).walletRows).toHaveLength(1);
  });

  it('honors the minHouseholdMembers audience', () => {
    const rules = rulesWithRule({ audience: { minHouseholdMembers: 5 } });
    expect(evaluate(subtaskEvent(), input({ wallet: wallet(), rules, householdMemberCount: 3 })).walletRows).toEqual([]);
    expect(
      evaluate(subtaskEvent(), input({ wallet: wallet(), rules, householdMemberCount: 5 })).walletRows,
    ).toHaveLength(1);
  });
});

describe('Turbo campaigns', () => {
  function rulesWithCampaign(multiplier: 1.5 | 2, window?: { from: string; to: string | null }) {
    const rules = JSON.parse(JSON.stringify(DEFAULT_RULE_SET)) as typeof DEFAULT_RULE_SET;
    rules.campaigns = [
      {
        id: 'turbo',
        multiplier,
        ruleIds: ['earn.subtask'],
        activeFrom: window?.from ?? '2026-11-24',
        activeTo: window?.to ?? '2026-11-30',
      },
    ];
    return rules;
  }

  it('multiplies the award and rounds down', () => {
    const doubled = evaluate(subtaskEvent(), input({ wallet: wallet(), rules: rulesWithCampaign(2) }));
    expect(doubled.walletRows[0].amount).toBe(20);

    const half = evaluate(
      subtaskEvent({ amount: 3 }),
      input({ wallet: wallet(), rules: rulesWithCampaign(1.5) }),
    );
    expect(half.walletRows[0].amount).toBe(4); // floor(4.5)
  });

  it('applies only within the campaign window and audience', () => {
    const inactive = evaluate(
      subtaskEvent(),
      input({ wallet: wallet(), rules: rulesWithCampaign(2, { from: '2026-11-25', to: null }) }),
    );
    expect(inactive.walletRows[0].amount).toBe(10);

    const rules = rulesWithCampaign(2);
    rules.campaigns[0].audience = { minHouseholdMembers: 9 };
    expect(evaluate(subtaskEvent(), input({ wallet: wallet(), rules, householdMemberCount: 3 })).walletRows[0].amount).toBe(10);
  });

  it('leaves non-listed rules alone', () => {
    const rules = rulesWithCampaign(2);
    const result = evaluate(bonusEvent(), input({ wallet: wallet(), rules }));
    expect(result.walletRows[0].amount).toBe(5);
  });
});

describe('earn.bonus', () => {
  it('pays 1 per XP and counts toward the daily and instance pools', () => {
    const result = evaluate(bonusEvent(), input({ wallet: wallet() }));
    expect(result.walletRows[0]).toMatchObject({ key: 'earn.bonus:bonus-row-1:uidA', amount: 5, track: 'ganhos' });
    expect(result.wallet?.caps['day:2026-11-24:ganhos']).toBe(5);
    expect(result.wallet?.caps['instance:inst-1:ganhos']).toBe(5);
    expect(result.wallet?.stats.credits).toBe(0); // a bonus is not a subtask credit
  });

  it('trims against the daily pool together with subtask awards', () => {
    const result = evaluate(bonusEvent({ amount: 9 }), input({ wallet: wallet({ caps: { 'day:2026-11-24:ganhos': 397 } }) }));
    expect(result.walletRows[0].amount).toBe(3);
  });

  it('skips when the chore was just edited (cooldown), paying nothing', () => {
    const result = evaluate(
      bonusEvent({ choreUpdatedAt: new Date('2026-11-24T09:30:00.000Z') }),
      input({ wallet: wallet() }),
    );
    expect(result.walletRows).toEqual([]);
  });
});

describe('earn.share', () => {
  it('pays 2 once per day per member', () => {
    const first = evaluate(shareEvent(), input({ wallet: wallet() }));
    expect(first.walletRows[0]).toMatchObject({ key: 'earn.share:post-1:uidA', amount: 2 });
    expect(first.wallet?.caps['day:2026-11-24:earn.share']).toBe(1);

    const sameDay = evaluate(
      shareEvent({ postId: 'post-2' }),
      input({ wallet: wallet({ caps: { 'day:2026-11-24:earn.share': 1 } }) }),
    );
    expect(sameDay.walletRows).toEqual([]);

    const nextDay = evaluate(
      shareEvent({ postId: 'post-3', postedAt: new Date('2026-11-25T11:00:00.000Z') }),
      input({ wallet: wallet({ caps: { 'day:2026-11-24:earn.share': 1 } }) }),
    );
    expect(nextDay.walletRows[0].key).toBe('earn.share:post-3:uidA');
  });

  it('never produces clawback rows', () => {
    const result = evaluate(shareEvent(), input({ wallet: wallet() }));
    expect(result.zeloRows).toEqual([]);
    expect(result.walletRows.every((row) => row.amount > 0)).toBe(true);
  });
});

describe('level-ups', () => {
  it('celebrates when xpPeak crosses a level threshold', () => {
    const result = evaluate(
      subtaskEvent({ xpPeakAfter: 100 }),
      input({ wallet: wallet({ xpPeak: 95, level: 1 }) }),
    );
    expect(result.wallet?.level).toBe(2);
    const levelUp = result.celebrations.find((c) => c.moment === 'level');
    expect(levelUp).toMatchObject({ moment: 'level', track: 'ganhos', level: 2 });
    expect(result.serverEvents.some((e) => e.name === 'gami_level_up')).toBe(true);
  });

  it('does not celebrate when no threshold is crossed', () => {
    const result = evaluate(subtaskEvent({ xpPeakAfter: 99 }), input({ wallet: wallet({ xpPeak: 95, level: 1 }) }));
    expect(result.celebrations.some((c) => c.moment === 'level')).toBe(false);
    expect(result.serverEvents.some((e) => e.name === 'gami_level_up')).toBe(false);
  });

  it('sets the level without celebrating on a brand-new wallet', () => {
    const result = evaluate(subtaskEvent({ xpPeakAfter: 1840 }), input({ wallet: null }));
    expect(result.wallet?.level).toBe(6);
    expect(result.celebrations.some((c) => c.moment === 'level')).toBe(false);
  });
});

describe('C9 velocity and chore-xp-raise alerts', () => {
  it('raises a velocity alert above 12 subtasks in 10 minutes', () => {
    const at = new Date('2026-11-24T10:00:00.000Z');
    const stamps = Array.from({ length: 13 }, (_, i) => new Date(at.getTime() - i * 30_000));
    const fast = evaluate(subtaskEvent({ recentSubtaskTimestamps: stamps }), input({ wallet: wallet() }));
    expect(fast.alerts).toEqual([
      expect.objectContaining({ kind: 'velocity', memberId: 'uidA', data: expect.objectContaining({ count: 13 }) }),
    ]);

    const slow = evaluate(
      subtaskEvent({ recentSubtaskTimestamps: stamps.slice(1) }),
      input({ wallet: wallet() }),
    );
    expect(slow.alerts).toEqual([]);
  });

  it('raises an alert when the creator completes a freshly raised chore within 48h', () => {
    const raised = subtaskEvent({
      memberId: CREATOR,
      choreXpRaised: true,
      choreUpdatedAt: new Date('2026-11-24T02:00:00.000Z'),
    });
    const result = evaluate(raised, input({ wallet: wallet({ memberId: CREATOR }) }));
    expect(result.alerts.map((alert) => alert.kind)).toEqual(['chore-xp-raise']);

    const byOther = evaluate(
      subtaskEvent({ choreXpRaised: true, choreUpdatedAt: new Date('2026-11-24T02:00:00.000Z') }),
      input({ wallet: wallet() }),
    );
    expect(byOther.alerts).toEqual([]);

    const tooOld = evaluate(
      subtaskEvent({ memberId: CREATOR, choreXpRaised: true, choreUpdatedAt: new Date('2026-11-22T02:00:00.000Z') }),
      input({ wallet: wallet({ memberId: CREATOR }) }),
    );
    expect(tooOld.alerts).toEqual([]);
  });
});

describe('engine contract', () => {
  it('creates a wallet projection for a member without one', () => {
    const result = evaluate(subtaskEvent(), input({ wallet: null }));
    expect(result.wallet?.memberId).toBe('uidA');
    expect(result.wallet?.householdId).toBe(HH);
    expect(result.wallet?.level).toBe(1);
  });

  it('never mutates the caller projections', () => {
    const before = wallet({ balance: 5, caps: { 'day:2026-11-24:ganhos': 5 } });
    const frozen = JSON.parse(JSON.stringify(before));
    evaluate(subtaskEvent(), input({ wallet: before }));
    expect(JSON.parse(JSON.stringify(before))).toEqual(frozen);
  });

  it('returns null projections when nothing changed', () => {
    const result = evaluate(
      subtaskEvent({ choreUpdatedAt: new Date('2026-11-24T09:00:00.000Z'), xpPeakAfter: null }),
      input({ wallet: wallet({ stats: { ...wallet().stats, welcomePaid: true } }) }),
    );
    expect(result.wallet).toBeNull();
    expect(result.organizer).toBeNull();
    expect(result.walletRows).toEqual([]);
  });

  it('is deterministic: the same input produces the same output', () => {
    const run = (): EngineResult => evaluate(subtaskEvent(), input({ wallet: wallet() }));
    const a = run();
    const b = run();
    expect(JSON.stringify(a, (_, value) => (value instanceof Date ? value.toISOString() : value))).toBe(
      JSON.stringify(b, (_, value) => (value instanceof Date ? value.toISOString() : value)),
    );
  });

  it('ignores informational events', () => {
    for (const event of [
      { kind: 'member.joined', householdId: HH, memberId: 'uidA', joinedAt: NOW },
      { kind: 'member.activated', householdId: HH, memberId: 'uidA', joinedAt: NOW, activatedAt: NOW },
      {
        kind: 'chore.created',
        householdId: HH,
        choreId: 'chore-2',
        createdBy: CREATOR,
        isCustom: true,
        createdAt: NOW,
      },
    ] as const) {
      const result = evaluate(event, input({ wallet: wallet() }));
      expect(result.walletRows).toEqual([]);
      expect(result.zeloRows).toEqual([]);
      expect(result.wallet).toBeNull();
    }
  });

  it('skips organizer rules when no organizer context is given', () => {
    const event = subtaskEvent({ memberId: 'uidB', choreCreatedBy: CREATOR });
    const result = evaluate(event, { ...input({ wallet: wallet({ memberId: 'uidB' }) }), organizer: undefined });
    expect(result.zeloRows).toEqual([]);
    expect(result.organizer).toBeNull();
  });
});
