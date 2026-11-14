import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useAuth } from '@/features/auth';
import { CallableError } from '@/features/firebase';
import { useHouseGainsTranslation } from '@/localization/housegains';
import {
  householdCalls,
  subscribeToHousehold,
  subscribeToProfile,
  type HouseholdSlices,
  type ProfileSnapshot,
} from './firebase-household-client';
import { callableErrorKey, mapHousehold, mapInvite, placeholderMember } from './household-mapping';
import { deriveMemberStreak, deriveWeeklyTotals } from './household-rules';
import type { Chore, Household, HouseholdViewModel, Member, XpLedgerEntry } from './types';

const HouseholdContext = createContext<HouseholdViewModel | undefined>(undefined);
const WAIT_FOR_SNAPSHOT_MS = 5000;
const NO_LEDGER: XpLedgerEntry[] = [];
const NO_MEMBER_COLOR = '#7c5cff';

/** Live household state from Firestore, with the writes the screens call. Demo mode is gone. */
export function HouseholdProvider({ children }: PropsWithChildren): React.JSX.Element {
  const { status, user } = useAuth();
  const { t } = useHouseGainsTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  const uid = status === 'signedIn' ? (user?.uid ?? null) : null;
  const [profile, setProfile] = useState<ProfileSnapshot | undefined>(undefined);
  const [slices, setSlices] = useState<Partial<HouseholdSlices>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setProfile(undefined);
    if (!uid) return undefined;
    return subscribeToProfile(uid, setProfile, () =>
      setError(tRef.current('housegains.auth.sync.loadError')),
    );
  }, [uid, attempt]);

  const householdId = profile?.householdId ?? null;
  useEffect(() => {
    setSlices({});
    if (!householdId) return undefined;
    return subscribeToHousehold(
      householdId,
      (patch) => setSlices((previous) => ({ ...previous, ...patch })),
      () => setError(tRef.current('housegains.auth.sync.loadError')),
    );
  }, [householdId, attempt]);

  const household = useMemo<Household | null>(() => {
    const doc = slices.householdDoc;
    if (!householdId || !doc) return null;
    return mapHousehold(
      doc.id,
      doc.data,
      slices.members ?? [],
      slices.formerMembers ?? [],
      slices.invite ?? mapInvite(undefined),
    );
  }, [householdId, slices]);

  const loaded =
    profile !== undefined &&
    (householdId === null ||
      (slices.householdDoc !== undefined &&
        slices.members !== undefined &&
        slices.invite !== undefined &&
        slices.chores !== undefined &&
        slices.instances !== undefined &&
        slices.ledger !== undefined &&
        slices.feed !== undefined));
  // A listener error also ends hydration so the app can show its retry screen.
  const hydrated = uid !== null && (loaded || error !== null);

  const currentMember = useMemo<Member>(
    () =>
      household?.members.find((member) => member.id === uid) ??
      placeholderMember(uid ?? '', {
        displayName: profile?.displayName ?? '',
        initials: profile?.initials ?? '',
        color: profile?.color ?? NO_MEMBER_COLOR,
      }),
    [household, profile, uid],
  );

  const ledger = slices.ledger ?? NO_LEDGER;
  const weeklyTotals = useMemo(
    () =>
      deriveWeeklyTotals(
        ledger,
        household?.members.map((member) => member.id) ?? [],
        new Date(),
        household?.timeZone,
      ),
    [household, ledger],
  );
  const streak = useMemo(
    () => deriveMemberStreak(ledger, currentMember.id, new Date(), household?.timeZone),
    [currentMember.id, household?.timeZone, ledger],
  );

  // createHousehold and joinHousehold return before the listeners deliver the new household.
  // The screens move on only once it has arrived (or after a timeout).
  const latest = useRef({ hydrated, householdId: household?.id ?? null });
  latest.current = { hydrated, householdId: household?.id ?? null };
  const waiters = useRef(new Set<() => void>());
  useEffect(() => {
    waiters.current.forEach((check) => check());
  });
  const waitForHousehold = useCallback(
    (hid: string) =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (latest.current.hydrated && latest.current.householdId === hid) finish();
        };
        const finish = () => {
          clearTimeout(timer);
          waiters.current.delete(check);
          resolve();
        };
        const timer = setTimeout(finish, WAIT_FOR_SNAPSHOT_MS);
        waiters.current.add(check);
        check();
      }),
    [],
  );

  const perform = async (operation: () => Promise<void>): Promise<void> => {
    try {
      await operation();
    } catch (cause) {
      const message =
        cause instanceof CallableError
          ? tRef.current(callableErrorKey(cause.code, cause.message))
          : tRef.current('housegains.auth.error.generic');
      throw new Error(message);
    }
  };

  const requireHouseholdId = (): string => {
    const id = latest.current.householdId;
    if (!id) throw new CallableError('failed-precondition', 'You are not in a household.');
    return id;
  };

  const value: HouseholdViewModel = {
    hydrated,
    household,
    currentMember,
    chores: slices.chores ?? [],
    instances: slices.instances ?? [],
    error,
    retryHydration: async () => {
      setError(null);
      setAttempt((count) => count + 1);
    },
    createHousehold: (name, icon, color) =>
      perform(async () => {
        const { householdId: created } = await householdCalls.createHousehold({
          name,
          icon,
          color,
          timeZone: deviceTimeZone(),
        });
        await waitForHousehold(created);
      }),
    updateHousehold: (name, icon, color) =>
      perform(async () => {
        await householdCalls.updateHousehold({
          householdId: requireHouseholdId(),
          name,
          icon,
          color,
        });
      }),
    joinHousehold: (code) =>
      perform(async () => {
        const { householdId: joined } = await householdCalls.joinHousehold({
          code: code.trim().toUpperCase(),
        });
        await waitForHousehold(joined);
      }),
    saveChore: (chore) =>
      perform(async () => {
        const exists = (slices.chores ?? []).some((saved) => saved.id === chore.id);
        await householdCalls.saveChore({
          householdId: requireHouseholdId(),
          chore: choreInput(chore, exists),
        });
      }),
    setAssignments: (choreId, ids) =>
      perform(async () => {
        await householdCalls.setAssignments({
          householdId: requireHouseholdId(),
          choreId,
          assigneeIds: ids,
        });
      }),
    pauseChore: (id) =>
      perform(async () => {
        await householdCalls.setChoreActive({
          householdId: requireHouseholdId(),
          choreId: id,
          isActive: false,
        });
      }),
    deleteChore: (id) =>
      perform(async () => {
        await householdCalls.deleteChore({ householdId: requireHouseholdId(), choreId: id });
      }),
    completeSubtask: (instanceId, subtaskId) =>
      perform(async () => {
        await householdCalls.completeSubtask({
          householdId: requireHouseholdId(),
          instanceId,
          subtaskId,
        });
      }),
    undoSubtask: (instanceId, subtaskId) =>
      perform(async () => {
        await householdCalls.undoSubtask({
          householdId: requireHouseholdId(),
          instanceId,
          subtaskId,
        });
      }),
    regenerateInvite: () =>
      perform(async () => {
        await householdCalls.rotateInvite({ householdId: requireHouseholdId() });
      }),
    finishSetup: () =>
      perform(async () => {
        await householdCalls.finishSetup({ householdId: requireHouseholdId() });
      }),
    setupComplete: slices.householdDoc?.data.setupComplete === true,
    feed: slices.feed ?? [],
    postCompletion: (instanceId) =>
      perform(async () => {
        await householdCalls.postCompletion({
          householdId: requireHouseholdId(),
          instanceId,
        });
      }),
    weeklyTotals,
    streak,
    xpLedger: ledger,
  };

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdViewModel {
  const value = useContext(HouseholdContext);
  if (!value) throw new Error('useHousehold must be used inside HouseholdProvider.');
  return value;
}

export { HouseholdContext };

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** The callable accepts an id only for a chore that already exists; new chores get a server id. */
function choreInput(chore: Chore, exists: boolean): Record<string, unknown> {
  return {
    ...(exists ? { id: chore.id } : {}),
    name: chore.name,
    icon: chore.icon,
    category: chore.category,
    ...(chore.catalogId ? { catalogId: chore.catalogId } : {}),
    subtasks: chore.subtasks.map((subtask) => ({
      id: subtask.id,
      name: subtask.name,
      xp: subtask.xp,
      position: subtask.position,
      ...(subtask.catalogSubtaskId ? { catalogSubtaskId: subtask.catalogSubtaskId } : {}),
    })),
    bonusXp: chore.bonusXp,
    assigneeIds: chore.assigneeIds,
    recurrence: chore.recurrence,
    dueTime: chore.dueTime,
    isActive: chore.isActive,
  };
}
