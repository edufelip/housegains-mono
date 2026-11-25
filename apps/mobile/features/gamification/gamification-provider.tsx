import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useAuth } from '@/features/auth';
import { CallableError } from '@/features/firebase';
import { useHousehold } from '@/features/household';
import { AwayWeeksError } from './away-weeks-error';
import {
  ackRetryDelayMs,
  initialQueueState,
  queueReducer,
  type ActiveCelebration,
} from './celebration-queue';
import {
  gamificationCalls,
  subscribeToInbox,
  subscribeToOrganizer,
  subscribeToWallet,
  subscribeToWalletLedger,
} from './firebase-gamification-client';
import { awayErrorKey } from './streak-rules';
import type { Celebration, Organizer, Wallet, WalletLedgerRow } from './types';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface GamificationViewModel {
  /** True for a signed-in member of a household. Everything below is inert when false (no member yet). */
  visible: boolean;
  /** Wallet and recent ledger rows (private to the owner). Not affected by the inbox listener. */
  walletStatus: LoadStatus;
  /** The celebration inbox listener; an error here only delays celebrations. */
  inboxStatus: LoadStatus;
  wallet: Wallet | null;
  ledger: WalletLedgerRow[];
  /** Organizer projection of the household creator (members read it). */
  organizerStatus: LoadStatus;
  organizer: Organizer | null;
  /** Balance the wallet screen last showed, to count up from; null before the first visit. */
  lastSeenBalance: number | null;
  markBalanceSeen: (balance: number) => void;
  /** The celebration being shown now, or null. */
  active: ActiveCelebration | null;
  /** Hands the caller's celebrations of a completeSubtask / postCompletion response to the queue. */
  receiveActionCelebrations: (
    celebrations: Celebration[],
    completion?: { instanceId: string; completesInstance: boolean },
  ) => void;
  dismissCelebration: (id: string) => void;
  /** Badges earned by the action that completed this instance, for the S3 screen. */
  completionBadges: (instanceId: string) => Celebration[];
  consumeCompletionBadges: (instanceId: string) => void;
  /** Re-subscribes after a listener error. */
  retry: () => void;
  /** Replaces the future away weeks; resolves with the stored list, rejects with AwayWeeksError. */
  setAwayWeeks: (weekStarts: string[]) => Promise<string[]>;
}

const NO_BADGES: Celebration[] = [];
const NO_LEDGER: WalletLedgerRow[] = [];

/** What the app sees before a signed-in household member exists, or outside the provider. */
export const INERT_GAMIFICATION: GamificationViewModel = {
  visible: false,
  walletStatus: 'loading',
  inboxStatus: 'loading',
  wallet: null,
  ledger: NO_LEDGER,
  organizerStatus: 'loading',
  organizer: null,
  lastSeenBalance: null,
  markBalanceSeen: () => undefined,
  active: null,
  receiveActionCelebrations: () => undefined,
  dismissCelebration: () => undefined,
  completionBadges: () => NO_BADGES,
  consumeCompletionBadges: () => undefined,
  retry: () => undefined,
  setAwayWeeks: () => Promise.reject(new Error('Gamification is not visible.')),
};

const GamificationContext = createContext<GamificationViewModel>(INERT_GAMIFICATION);

const LAST_SEEN_KEY = 'housegains.gamification.lastSeenBalance.v1';
const ACK_BATCH = 50;

export function GamificationProvider({ children }: PropsWithChildren): React.JSX.Element {
  const { status, user } = useAuth();
  const { household } = useHousehold();
  const uid = status === 'signedIn' ? (user?.uid ?? null) : null;
  const householdId = household?.id ?? null;
  const creatorId = household?.members.find((member) => member.role === 'creator')?.id ?? null;

  // The program is always on: no flag and no cohort, only a signed-in member of a household.
  const visible = uid !== null && householdId !== null;

  const [attempt, setAttempt] = useState(0);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletStatus, setWalletStatus] = useState<LoadStatus>('loading');
  const [inboxStatus, setInboxStatus] = useState<LoadStatus>('loading');
  const [ledger, setLedger] = useState<WalletLedgerRow[]>(NO_LEDGER);
  const [organizer, setOrganizer] = useState<Organizer | null>(null);
  const [organizerStatus, setOrganizerStatus] = useState<LoadStatus>('loading');
  const [queue, dispatch] = useReducer(queueReducer, initialQueueState);

  // The queue (what was shown, what still needs an acknowledgement) belongs to the signed-in user
  // while a member is signed in. A listener retry must not clear it, or inbox rows that are
  // shown but not yet acknowledged would be celebrated again.
  useEffect(() => {
    dispatch({ type: 'reset' });
  }, [visible, uid]);

  // Wallet, recent ledger rows and the inbox: only for a signed-in household member. The wallet screen
  // and the inbox fail independently, so each listener reports into its own status.
  useEffect(() => {
    setWallet(null);
    setLedger(NO_LEDGER);
    setWalletStatus('loading');
    setInboxStatus('loading');
    if (!visible || !uid) return undefined;
    let ledgerReady = false;
    let walletReady = false;
    const settle = () => {
      if (ledgerReady && walletReady) setWalletStatus('ready');
    };
    const failWallet = () => setWalletStatus('error');
    const unsubscribes = [
      subscribeToWallet(
        uid,
        (next) => {
          setWallet(next);
          walletReady = true;
          settle();
        },
        failWallet,
      ),
      subscribeToWalletLedger(
        uid,
        (rows) => {
          setLedger(rows);
          ledgerReady = true;
          settle();
        },
        failWallet,
      ),
      subscribeToInbox(
        uid,
        (rows) => {
          setInboxStatus('ready');
          if (rows.length === 0) return;
          dispatch({
            type: 'receive',
            celebrations: rows,
            source: 'inbox',
            now: Date.now(),
            createdAt: Object.fromEntries(rows.map((row) => [row.id, row.createdAt])),
          });
        },
        () => setInboxStatus('error'),
      ),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [visible, uid, attempt]);

  useEffect(() => {
    setOrganizer(null);
    setOrganizerStatus('loading');
    if (!visible || !householdId || !creatorId) return undefined;
    return subscribeToOrganizer(
      householdId,
      creatorId,
      (next) => {
        setOrganizer(next);
        setOrganizerStatus('ready');
      },
      () => setOrganizerStatus('error'),
    );
  }, [visible, householdId, creatorId, attempt]);

  // Acknowledge inbox rows once they were shown. Acknowledging is idempotent. A failed call is
  // retried with a bounded backoff (ackRetryDelayMs) and also goes out with the next batch;
  // meanwhile the queue dedupes by id, so nothing shows twice in this session.
  const acking = useRef(false);
  const ackFailures = useRef(0);
  const ackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [ackTick, setAckTick] = useState(0);
  useEffect(
    () => () => {
      if (ackTimer.current) clearTimeout(ackTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (queue.toAck.length === 0 || acking.current) return;
    const ids = queue.toAck.slice(0, ACK_BATCH);
    acking.current = true;
    gamificationCalls.ackCelebrations({ ids }).then(
      () => {
        acking.current = false;
        ackFailures.current = 0;
        dispatch({ type: 'acked', ids });
      },
      () => {
        acking.current = false;
        ackFailures.current += 1;
        const delay = ackRetryDelayMs(ackFailures.current);
        if (delay !== null) {
          if (ackTimer.current) clearTimeout(ackTimer.current);
          ackTimer.current = setTimeout(() => setAckTick((tick) => tick + 1), delay);
        }
      },
    );
  }, [queue.toAck, ackTick]);

  const [lastSeenBalance, setLastSeenBalance] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!uid) return undefined;
    void AsyncStorage.getItem(`${LAST_SEEN_KEY}.${uid}`)
      .then((stored) => {
        const value = stored === null ? NaN : Number(stored);
        if (!cancelled) setLastSeenBalance(Number.isFinite(value) ? value : null);
      })
      // Without a stored value the wallet simply counts up from zero.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [uid]);
  const markBalanceSeen = useCallback(
    (balance: number) => {
      setLastSeenBalance(balance);
      if (uid) {
        // Persisting is a convenience: a failure only means the next count-up starts from zero.
        void AsyncStorage.setItem(`${LAST_SEEN_KEY}.${uid}`, String(balance)).catch(
          () => undefined,
        );
      }
    },
    [uid],
  );

  const receiveActionCelebrations = useCallback(
    (
      celebrations: Celebration[],
      completion?: { instanceId: string; completesInstance: boolean },
    ) => {
      if (!visible || celebrations.length === 0) return;
      dispatch({ type: 'receive', celebrations, source: 'callable', now: Date.now(), completion });
    },
    [visible],
  );
  const dismissCelebration = useCallback((id: string) => dispatch({ type: 'dismiss', id }), []);
  const consumeCompletionBadges = useCallback(
    (instanceId: string) => dispatch({ type: 'consumeCompletionBadges', instanceId }),
    [],
  );
  const completionBadges = useCallback(
    (instanceId: string) => queue.completionBadges[instanceId] ?? NO_BADGES,
    [queue.completionBadges],
  );
  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
    // A manual retry also gives failed acknowledgements a fresh set of attempts.
    ackFailures.current = 0;
    setAckTick((tick) => tick + 1);
  }, []);

  const setAwayWeeks = useCallback(
    async (weekStarts: string[]) => {
      try {
        const result = await gamificationCalls.setAwayWeeks({
          ...(householdId ? { householdId } : {}),
          weekStarts,
        });
        return result.weekStarts;
      } catch (cause) {
        if (cause instanceof CallableError) {
          throw new AwayWeeksError(awayErrorKey(cause.code, cause.message));
        }
        throw new AwayWeeksError({ key: 'housegains.gamification.away.error.generic' });
      }
    },
    [householdId],
  );

  const value = useMemo<GamificationViewModel>(
    () =>
      visible
        ? {
            visible,
            walletStatus,
            inboxStatus,
            wallet,
            ledger,
            organizerStatus,
            organizer,
            lastSeenBalance,
            markBalanceSeen,
            active: queue.active,
            receiveActionCelebrations,
            dismissCelebration,
            completionBadges,
            consumeCompletionBadges,
            retry,
            setAwayWeeks,
          }
        : INERT_GAMIFICATION,
    [
      visible,
      walletStatus,
      inboxStatus,
      wallet,
      ledger,
      organizerStatus,
      organizer,
      lastSeenBalance,
      markBalanceSeen,
      queue.active,
      receiveActionCelebrations,
      dismissCelebration,
      completionBadges,
      consumeCompletionBadges,
      retry,
      setAwayWeeks,
    ],
  );

  return <GamificationContext.Provider value={value}>{children}</GamificationContext.Provider>;
}

export function useGamification(): GamificationViewModel {
  return useContext(GamificationContext);
}

export { GamificationContext };
