import type {
  Chore,
  Completion,
  FeedPost,
  Household,
  Instance,
  Invite,
  Member,
  Subtask,
  XpLedgerEntry,
} from './types';

// Pure Firestore-document -> view-model mapping. No Firebase imports here, so it runs under bun test.

type DocData = Record<string, any>;

export const DEFAULT_INVITE_MAX_USES = 8;

/** Firestore Timestamps and Dates become ISO strings; a missing value becomes ''. */
export function isoOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const toDate = (value as { toDate?: () => Date } | null | undefined)?.toDate;
  return typeof toDate === 'function' ? toDate.call(value).toISOString() : '';
}

export function mapMember(id: string, data: DocData): Member {
  return {
    id,
    name: data.name ?? '',
    initials: data.initials ?? '',
    color: data.color ?? '#7c5cff',
    role: data.role === 'creator' ? 'creator' : 'member',
    ...(typeof data.xp === 'number' ? { xp: data.xp } : {}),
  };
}

/** Tombstones (deleted members) stay out of the roster but still resolve names in history. */
export function splitMembers(docs: { id: string; data: DocData }[]): {
  roster: Member[];
  formerMembers: Member[];
} {
  const roster: Member[] = [];
  const formerMembers: Member[] = [];
  for (const { id, data } of docs) {
    (data.deleted === true ? formerMembers : roster).push(mapMember(id, data));
  }
  return { roster, formerMembers };
}

export function mapInvite(data: DocData | undefined): Invite {
  return {
    code: data?.code ?? '',
    expiresAt: isoOf(data?.expiresAt),
    uses: data?.uses ?? 0,
    maxUses: data?.maxUses ?? DEFAULT_INVITE_MAX_USES,
    revoked: data?.revoked === true,
  };
}

function mapSubtask(data: DocData): Subtask {
  return {
    id: data.id,
    name: data.name,
    xp: data.xp,
    position: data.position,
    ...(data.catalogSubtaskId ? { catalogSubtaskId: data.catalogSubtaskId } : {}),
  };
}

export function mapChore(id: string, data: DocData): Chore {
  return {
    id,
    name: data.name,
    icon: data.icon,
    category: data.category ?? '',
    ...(data.catalogId ? { catalogId: data.catalogId } : {}),
    subtasks: (data.subtasks ?? []).map(mapSubtask),
    bonusXp: data.bonusXp,
    assigneeIds: data.assigneeIds ?? [],
    recurrence: data.recurrence,
    dueTime: data.dueTime,
    isActive: data.isActive !== false,
  };
}

function mapCompletion(data: DocData): Completion {
  return {
    id: data.id,
    instanceId: data.instanceId,
    subtaskId: data.subtaskId,
    memberId: data.memberId,
    xp: data.xp,
    completedAt: isoOf(data.completedAt),
    isAssist: data.isAssist === true,
  };
}

export function mapInstance(id: string, data: DocData): Instance {
  return {
    id,
    choreId: data.choreId,
    dueAt: isoOf(data.dueAt),
    subtasks: (data.subtasks ?? []).map(mapSubtask),
    bonusXp: data.bonusXp,
    assigneeIds: data.assigneeIds ?? [],
    status: data.status,
    completions: (data.completions ?? []).map(mapCompletion),
    bonusAwards: data.bonusAwards ?? {},
    ...(data.choreSnapshot ? { choreSnapshot: data.choreSnapshot } : {}),
  };
}

export function mapLedgerEntry(id: string, data: DocData): XpLedgerEntry {
  return {
    id,
    instanceId: data.instanceId,
    ...(data.subtaskId ? { subtaskId: data.subtaskId } : {}),
    memberId: data.memberId,
    amount: data.amount,
    source: data.source,
    createdAt: isoOf(data.createdAt),
    ...(data.reversesEntryId ? { reversesEntryId: data.reversesEntryId } : {}),
  };
}

export function mapFeedPost(id: string, data: DocData): FeedPost {
  return {
    id,
    instanceId: data.instanceId,
    memberId: data.memberId,
    createdAt: isoOf(data.createdAt),
  };
}

export function mapHousehold(
  id: string,
  data: DocData,
  members: Member[],
  formerMembers: Member[],
  invite: Invite,
): Household {
  return {
    id,
    name: data.name,
    icon: data.icon,
    color: data.color,
    timeZone: data.timeZone,
    weeklyGoalXp: data.weeklyGoalXp ?? null,
    members,
    formerMembers,
    invite,
  };
}

/** The signed-in member before the household snapshot arrives (or when there is none). */
export function placeholderMember(
  uid: string,
  profile: { displayName: string; initials: string; color: string },
): Member {
  return {
    id: uid,
    name: profile.displayName,
    initials: profile.initials,
    color: profile.color,
    role: 'member',
  };
}

/**
 * Maps a callable failure to a translation key. The backend names every failure with an
 * HttpsError code; the few that share a code (e.g. failed-precondition) are told apart by
 * the message the callable sends, which is fixed in apps/firebase/functions/src/store.ts.
 */
export function callableErrorKey(code: string, message = ''): string {
  const name = code.replace(/^functions\//, '');
  switch (name) {
    case 'not-found':
      return /invite/i.test(message)
        ? 'housegains.auth.sync.inviteNotFound'
        : 'housegains.auth.sync.notFound';
    case 'failed-precondition':
      if (/expired/i.test(message)) return 'housegains.auth.sync.inviteExpired';
      if (/revoked/i.test(message)) return 'housegains.auth.sync.inviteRevoked';
      if (/use limit/i.test(message)) return 'housegains.auth.sync.inviteFull';
      if (/already belong/i.test(message)) return 'housegains.auth.sync.alreadyInHousehold';
      if (/already completed/i.test(message)) return 'housegains.auth.sync.alreadyCompleted';
      if (/deadline/i.test(message)) return 'housegains.auth.sync.deadlinePassed';
      if (/undo is available/i.test(message)) return 'housegains.auth.sync.undoExpired';
      if (/profile/i.test(message)) return 'housegains.auth.sync.profileMissing';
      return 'housegains.auth.error.generic';
    case 'already-exists':
      return 'housegains.auth.sync.stepDone';
    case 'resource-exhausted':
      return 'housegains.auth.sync.householdFull';
    case 'permission-denied':
    case 'unauthenticated':
      return 'housegains.auth.sync.notAllowed';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'housegains.auth.sync.offline';
    default:
      return 'housegains.auth.error.generic';
  }
}
