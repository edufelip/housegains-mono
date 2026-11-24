import type { Celebration } from './types';

// The one place that decides what to celebrate and when (pure reducer, no React).
//  - dedupes by celebration id;
//  - allows at most ONE full-screen unlock per app session (later full-screen badges become toasts);
//  - folds a badge earned by the action that completed the instance into the S3 celebration screen;
//  - shows toasts / level / streak moments one after another;
//  - reports inbox ids to acknowledge once they were shown (or were stale).

/** Inbox rows older than this are acknowledged silently instead of shown. */
export const INBOX_STALE_MS = 3 * 24 * 60 * 60 * 1000;

export type CelebrationSource = 'callable' | 'inbox';

export type PresentationKind = 'toast' | 'unlock' | 'level' | 'streak';

export interface QueuedCelebration {
  celebration: Celebration;
  source: CelebrationSource;
}

export interface ActiveCelebration extends QueuedCelebration {
  kind: PresentationKind;
}

export interface QueueState {
  /** Every id received this session, so repeats are ignored. */
  known: string[];
  pending: QueuedCelebration[];
  active: ActiveCelebration | null;
  /** True once the session's single full-screen unlock has been used. */
  fullScreenUsed: boolean;
  /** Badges folded into the S3 celebration screen, by instance id. */
  completionBadges: Record<string, Celebration[]>;
  /** Inbox ids received this session (the ones that can be acknowledged). */
  inboxIds: string[];
  /** Inbox ids shown (or stale) and not yet acknowledged. */
  toAck: string[];
}

export type QueueAction =
  | {
      type: 'receive';
      celebrations: Celebration[];
      source: CelebrationSource;
      now: number;
      /** Inbox row creation times (ISO) by id, to detect stale rows. */
      createdAt?: Record<string, string>;
      /** Set for the response of the action that may have completed an instance. */
      completion?: { instanceId: string; completesInstance: boolean };
    }
  | { type: 'dismiss'; id: string }
  | { type: 'acked'; ids: string[] }
  | { type: 'consumeCompletionBadges'; instanceId: string }
  | { type: 'reset' };

export const initialQueueState: QueueState = {
  known: [],
  pending: [],
  active: null,
  fullScreenUsed: false,
  completionBadges: {},
  inboxIds: [],
  toAck: [],
};

function kindFor(celebration: Celebration, fullScreenUsed: boolean): PresentationKind {
  switch (celebration.moment) {
    case 'badge':
      return celebration.fullScreen === true && !fullScreenUsed ? 'unlock' : 'toast';
    case 'level':
      return 'level';
    case 'streak':
      return 'streak';
    default:
      return 'toast';
  }
}

/** Start the next pending celebration when nothing is showing. */
function settle(state: QueueState): QueueState {
  if (state.active || state.pending.length === 0) return state;
  const [next, ...rest] = state.pending;
  const kind = kindFor(next.celebration, state.fullScreenUsed);
  return {
    ...state,
    pending: rest,
    active: { ...next, kind },
    fullScreenUsed: state.fullScreenUsed || kind === 'unlock',
  };
}

function withAck(state: QueueState, id: string): QueueState {
  return state.inboxIds.includes(id) && !state.toAck.includes(id)
    ? { ...state, toAck: [...state.toAck, id] }
    : state;
}

function receive(state: QueueState, action: Extract<QueueAction, { type: 'receive' }>): QueueState {
  let next = state;
  for (const celebration of action.celebrations) {
    const { id } = celebration;
    if (action.source === 'inbox' && !next.inboxIds.includes(id)) {
      next = { ...next, inboxIds: [...next.inboxIds, id] };
    }
    if (next.known.includes(id)) {
      // Already received (usually from the callable response): the inbox copy only needs its
      // acknowledgement, once the celebration has been shown (never while it still waits).
      const waiting =
        next.active?.celebration.id === id ||
        next.pending.some((item) => item.celebration.id === id);
      if (action.source === 'inbox' && !waiting) next = withAck(next, id);
      continue;
    }
    next = { ...next, known: [...next.known, id] };

    if (action.source === 'inbox') {
      const created = action.createdAt?.[id];
      const age = created ? action.now - Date.parse(created) : 0;
      if (Number.isFinite(age) && age > INBOX_STALE_MS) {
        next = withAck(next, id);
        continue;
      }
    }

    if (
      action.source === 'callable' &&
      action.completion?.completesInstance &&
      celebration.moment === 'badge'
    ) {
      const instanceId = action.completion.instanceId;
      next = {
        ...next,
        completionBadges: {
          ...next.completionBadges,
          [instanceId]: [...(next.completionBadges[instanceId] ?? []), celebration],
        },
      };
      continue;
    }

    next = { ...next, pending: [...next.pending, { celebration, source: action.source }] };
  }
  return settle(next);
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'receive':
      return receive(state, action);
    case 'dismiss': {
      if (state.active?.celebration.id !== action.id) return state;
      return settle(withAck({ ...state, active: null }, action.id));
    }
    case 'acked':
      return { ...state, toAck: state.toAck.filter((id) => !action.ids.includes(id)) };
    case 'consumeCompletionBadges': {
      const { [action.instanceId]: _removed, ...rest } = state.completionBadges;
      return { ...state, completionBadges: rest };
    }
    case 'reset':
      return { ...initialQueueState, fullScreenUsed: state.fullScreenUsed };
  }
}
