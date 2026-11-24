import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, Label, Screen } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { CompletionBadges } from '@/features/gamification/completion-badges';
import {
  canReportCompletion,
  hasAdminRights,
  hasModerationConflict,
  moderatableSubtasks,
  partialAvailable,
  reportableSubtasks,
} from '@/features/household/moderation-rules';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { ReportSheet } from './household-safety';
import {
  ConfirmSheet,
  PartialPickerSheet,
  ReportCompletionSheet,
  VERDICT_LABEL_KEYS,
  moderationStepsFor,
  type ConfirmRequest,
} from './moderation-screens';
import { MemberBadge } from './screen-elements';
import { choreDisplayName, subtaskDisplayName } from './screen-model';
import type { Celebration } from '@/features/gamification/types';
import type { Dispute, Instance, Member } from '@/features/household';
import type { Chore, Completion } from '@/features/household/types';

const UNDO_WINDOW_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_000_000_000;

type ChoreDetailScreenProps = {
  householdId: string;
  instance: Instance;
  chore: Chore;
  members: Member[];
  currentMember: Member;
  onBack: () => void;
  onComplete: (instanceId: string, subtaskId: string) => Promise<void>;
  onUndo: (instanceId: string, subtaskId: string) => Promise<void>;
  /** Open disputes, or null while the listener has not delivered. */
  disputes?: Dispute[] | null;
  /** The live roster (admins counted for the conflict rule); defaults to `members`. */
  rosterMembers?: Member[];
  onReport?: (instanceId: string, subtaskIds: string[], reason: string) => Promise<void>;
  onModerate?: (
    instanceId: string,
    verdict: 'partial' | 'not_done',
    subtaskIds?: string[],
  ) => Promise<void>;
  hasError: boolean;
};

type CelebrationScreenProps = {
  instance: Instance;
  chore: Chore;
  members: Member[];
  currentMember: Member;
  onBack: () => void;
  onPostToFeed: (instanceId: string) => Promise<void>;
  hasError: boolean;
  /** Achievements earned by the action that completed the instance (gamification only). */
  badges?: Celebration[];
};

function getUndoDeadline(completion: Completion): number {
  return Date.parse(completion.completedAt) + UNDO_WINDOW_MS;
}

function isUndoAvailable(completion: Completion, memberId: string, now: number): boolean {
  const completedAt = Date.parse(completion.completedAt);
  return (
    completion.memberId === memberId &&
    Number.isFinite(completedAt) &&
    now <= completedAt + UNDO_WINDOW_MS
  );
}

function useEligibilityClock(instance: Instance, memberId: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const transitions = [Date.parse(instance.dueAt)];
    for (const completion of instance.completions) {
      if (completion.memberId === memberId) transitions.push(getUndoDeadline(completion) + 1);
    }
    const nextTransition = transitions
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now)
      .sort((left, right) => left - right)[0];
    if (nextTransition === undefined) return undefined;

    const delay = Math.min(MAX_TIMEOUT_MS, Math.max(1, nextTransition - now));
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [instance.completions, instance.dueAt, memberId, now]);

  return now;
}

function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatTime(value: string, locale: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function bonusTotal(instance: Instance): number {
  return Object.values(instance.bonusAwards).reduce((total, amount) => total + amount, 0);
}

function progressFor(instance: Instance) {
  const completed = new Set(instance.completions.map((completion) => completion.subtaskId));
  return {
    completed,
    count: instance.subtasks.filter((subtask) => completed.has(subtask.id)).length,
    total: instance.subtasks.length,
    paidXp: instance.completions.reduce((total, completion) => total + completion.xp, 0),
    possibleXp: instance.subtasks.reduce((total, subtask) => total + subtask.xp, 0),
  };
}

function usePendingActions() {
  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState(false);

  const run = async (key: string, action: () => Promise<void>) => {
    if (pendingRef.current.has(key)) return;
    pendingRef.current.add(key);
    setPending(new Set(pendingRef.current));
    setActionError(false);
    try {
      await action();
    } catch {
      setActionError(true);
    } finally {
      pendingRef.current.delete(key);
      setPending(new Set(pendingRef.current));
    }
  };

  return { pending, actionError, run };
}

function getAssigneeLabel(
  instance: Instance,
  members: readonly Member[],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (instance.assigneeIds.length === 0) return t('housegains.screens.choreDetail.upForGrabs');
  const memberById = new Map(members.map((member) => [member.id, member]));
  const names = instance.assigneeIds
    .map((memberId) => memberById.get(memberId)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return t('housegains.screens.choreDetail.anyoneCanHelp');
  return t('housegains.screens.choreDetail.assigneesWithHelp', { names: names.join(', ') });
}

export function ChoreDetailScreen({
  householdId,
  instance,
  chore,
  members,
  currentMember,
  onBack,
  onComplete,
  onUndo,
  disputes,
  rosterMembers,
  onReport,
  onModerate,
  hasError,
}: ChoreDetailScreenProps) {
  const { themeId, tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const now = useEligibilityClock(instance, currentMember.id);
  const { pending, actionError, run } = usePendingActions();
  const progress = progressFor(instance);
  const isPastDue = instance.status !== 'done' && Date.parse(instance.dueAt) <= now;
  const isClosed = isPastDue;
  const ownCompletions = instance.completions.filter(
    (completion) => completion.memberId === currentMember.id,
  );
  const hasUndoWindow = ownCompletions.some((completion) =>
    isUndoAvailable(completion, currentMember.id, now),
  );
  const memberById = new Map(members.map((member) => [member.id, member]));
  const completionBySubtask = new Map(
    instance.completions.map((completion) => [completion.subtaskId, completion]),
  );
  const shouldShowError = hasError || actionError;
  const sticker = themeId === 'sticker';
  const [reportingChore, setReportingChore] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [partialOpen, setPartialOpen] = useState(false);
  const [moderateConfirm, setModerateConfirm] = useState<ConfirmRequest>(null);

  // Moderation eligibility (contract A2): the 72-hour window, the caller's rights,
  // the open dispute state, and the conflict-of-interest rule.
  const isAdmin = hasAdminRights(currentMember.role);
  const openDispute = disputes?.find((dispute) => dispute.instanceId === instance.id);
  const moderatable = moderatableSubtasks(instance, now);
  const completedCount = new Set(instance.completions.map(({ subtaskId }) => subtaskId)).size;
  const canModerate = isAdmin && moderatable.length > 0 && onModerate !== undefined;
  const conflicted = canModerate
    ? hasModerationConflict(instance, moderatable, currentMember.id, rosterMembers ?? members)
    : false;
  const canReport = canReportCompletion(currentMember, instance, openDispute, now);
  const alreadyReported =
    openDispute?.reports.some((report) => report.uid === currentMember.id) ?? false;
  const reportSteps = moderationStepsFor(
    reportableSubtasks(instance, currentMember.id, now),
    instance,
    members,
    t,
  );

  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, gap: 18, padding: 18, paddingBottom: 30 }}
      testID="housegains.choreDetail"
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 14 }}>
        <Pressable
          accessibilityLabel={t('housegains.screens.choreDetail.back')}
          accessibilityRole="button"
          onPress={onBack}
          style={{
            alignItems: 'center',
            backgroundColor: tokens.surface,
            borderColor: tokens.border,
            borderRadius: tokens.radius,
            borderWidth: tokens.borderWidth,
            height: 48,
            justifyContent: 'center',
            width: 48,
          }}
          testID="housegains.choreDetail.back"
        >
          <Ionicons
            accessibilityElementsHidden
            color={tokens.text}
            importantForAccessibility="no"
            name="chevron-back"
            size={tokens.iconSize.lg}
          />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Label variant="caption">
            {t('housegains.screens.choreDetail.dueAt', {
              dateTime: formatDateTime(instance.dueAt, locale),
            })}
          </Label>
          {isPastDue ? (
            <Label variant="caption" style={{ color: tokens.danger, fontWeight: '700' }}>
              {t('housegains.screens.choreDetail.pastDue')}
            </Label>
          ) : null}
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <Label variant="title">
          {t('housegains.screens.choreDetail.title', {
            chore: `${instance.choreSnapshot?.icon ?? chore.icon} ${choreDisplayName({ ...chore, ...instance.choreSnapshot }, t)}`,
          })}
        </Label>
        <Label variant="body">{getAssigneeLabel(instance, members, t)}</Label>
      </View>

      <Card style={{ backgroundColor: tokens.primary, gap: 12 }}>
        <View
          style={{
            alignItems: 'flex-end',
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 4,
          }}
        >
          <Label variant="heading" style={{ color: tokens.onPrimary }}>
            {t('housegains.screens.choreDetail.progress', {
              done: progress.count,
              total: progress.total,
            })}
          </Label>
          <Label variant="caption" style={{ color: tokens.onPrimary, fontWeight: '700' }}>
            {t('housegains.screens.choreDetail.xpPaid', {
              earned: progress.paidXp,
              total: progress.possibleXp,
            })}
          </Label>
        </View>
        <View
          accessibilityLabel={t('housegains.screens.choreDetail.progress', {
            done: progress.count,
            total: progress.total,
          })}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: progress.total, now: progress.count }}
          style={{ flexDirection: 'row', gap: 6 }}
        >
          {instance.subtasks.map((subtask) => {
            const completed = progress.completed.has(subtask.id);
            return (
              <View
                key={subtask.id}
                style={{
                  backgroundColor: completed ? tokens.success : tokens.surface,
                  borderColor: tokens.border,
                  borderRadius: 99,
                  borderWidth: tokens.borderWidth,
                  flex: 1,
                  height: 15,
                  minWidth: 12,
                }}
              />
            );
          })}
        </View>
      </Card>

      {shouldShowError ? (
        <Card
          style={{ alignItems: 'center', borderColor: tokens.danger, flexDirection: 'row', gap: 8 }}
          testID="housegains.choreDetail.error"
        >
          <Ionicons color={tokens.danger} name="alert-circle-outline" size={tokens.iconSize.md} />
          <Label style={{ flex: 1, fontWeight: '700' }}>
            {t('housegains.screens.choreDetail.error')}
          </Label>
        </Card>
      ) : null}

      {hasUndoWindow ? (
        <Label variant="caption">{t('housegains.screens.choreDetail.undoHint')}</Label>
      ) : null}

      <View style={{ gap: 12 }}>
        {instance.subtasks.map((subtask) => {
          const completion = completionBySubtask.get(subtask.id);
          const member = completion ? memberById.get(completion.memberId) : undefined;
          const isPending =
            pending.has(`undo:${subtask.id}`) || pending.has(`complete:${subtask.id}`);
          const canUndo = completion ? isUndoAvailable(completion, currentMember.id, now) : false;
          const undoExpired = completion?.memberId === currentMember.id && !canUndo;
          const doneLabel = t('housegains.screens.choreDetail.doneButton', { xp: subtask.xp });

          return (
            <Card
              key={subtask.id}
              style={{ gap: 10, padding: 14 }}
              testID={`housegains.choreDetail.subtask.${subtask.id}`}
            >
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
                {member ? (
                  <MemberBadge
                    accessibilityLabel={member.name}
                    color={member.color}
                    initials={member.initials}
                    size={44}
                  />
                ) : (
                  <View
                    accessibilityElementsHidden
                    style={{
                      borderColor: tokens.muted,
                      borderRadius: 24,
                      borderStyle: 'dashed',
                      borderWidth: 2,
                      height: 44,
                      width: 44,
                    }}
                  />
                )}
                <View style={{ flex: 1, gap: 1 }}>
                  <Label variant="heading">{subtaskDisplayName(subtask, t)}</Label>
                  {completion ? (
                    <Label
                      variant="caption"
                      testID={`housegains.choreDetail.subtask.${subtask.id}.receipt`}
                    >
                      {t('housegains.screens.choreDetail.completedByAt', {
                        member:
                          member?.name ?? t('housegains.screens.choreDetail.unknownContributor'),
                        time: formatTime(completion.completedAt, locale),
                        xp: completion.xp,
                      })}
                    </Label>
                  ) : (
                    <Label variant="caption">
                      {t('housegains.screens.choreDetail.openSubtask', { xp: subtask.xp })}
                    </Label>
                  )}
                  {completion?.isAssist ? (
                    <Label
                      variant="caption"
                      style={{ color: tokens.accent, fontWeight: '700' }}
                      testID={`housegains.choreDetail.subtask.${subtask.id}.assist`}
                    >
                      {t('housegains.screens.choreDetail.assist')}
                    </Label>
                  ) : null}
                  {undoExpired ? (
                    <Label
                      variant="caption"
                      testID={`housegains.choreDetail.subtask.${subtask.id}.undoExpired`}
                    >
                      {t('housegains.screens.choreDetail.undoWindowClosed')}
                    </Label>
                  ) : null}
                </View>
                {completion ? (
                  canUndo ? (
                    <Button
                      disabled={isPending}
                      onPress={() =>
                        void run(`undo:${subtask.id}`, () => onUndo(instance.id, subtask.id))
                      }
                      testID={`housegains.choreDetail.undo.${subtask.id}`}
                      title={t('housegains.screens.choreDetail.undoRemaining', {
                        time: formatRemaining(getUndoDeadline(completion) - now),
                      })}
                      variant="secondary"
                    />
                  ) : null
                ) : (
                  <Pressable
                    accessibilityLabel={doneLabel}
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: isClosed || instance.status === 'done' || isPending,
                    }}
                    disabled={isClosed || instance.status === 'done' || isPending}
                    onPress={() =>
                      void run(`complete:${subtask.id}`, () => onComplete(instance.id, subtask.id))
                    }
                    style={({ pressed }) => ({
                      alignItems: 'center',
                      backgroundColor: sticker ? tokens.accent : tokens.primary,
                      borderColor: tokens.border,
                      borderRadius: tokens.radius,
                      borderWidth: tokens.borderWidth,
                      elevation:
                        isClosed || instance.status === 'done' || isPending
                          ? 0
                          : tokens.shadow.elevation,
                      justifyContent: 'center',
                      minHeight: 48,
                      minWidth: 104,
                      opacity:
                        isClosed || instance.status === 'done' || isPending
                          ? 0.52
                          : pressed
                            ? 0.88
                            : 1,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      shadowColor: tokens.shadow.color,
                      shadowOffset: tokens.shadow.offset,
                      shadowOpacity:
                        isClosed || instance.status === 'done' || isPending
                          ? 0
                          : tokens.shadow.opacity,
                      shadowRadius: tokens.shadow.radius,
                    })}
                    testID={`housegains.choreDetail.done.${subtask.id}`}
                  >
                    <Label
                      style={{
                        color: sticker ? tokens.text : tokens.onPrimary,
                        fontWeight: '800',
                        textAlign: 'center',
                      }}
                    >
                      {doneLabel}
                    </Label>
                  </Pressable>
                )}
              </View>
            </Card>
          );
        })}
      </View>

      {isClosed ? (
        <Card
          style={{ backgroundColor: tokens.accent, borderStyle: 'dashed' }}
          testID="housegains.choreDetail.partialClosed"
        >
          <Label style={{ fontWeight: '700' }}>
            {t('housegains.screens.choreDetail.partialClosed')}
          </Label>
        </Card>
      ) : null}

      {instance.bonusXp > 0 ? (
        instance.status === 'done' ? (
          <Card
            style={{ backgroundColor: tokens.success }}
            testID="housegains.choreDetail.bonusAwarded"
          >
            <Label style={{ fontWeight: '700' }}>
              {t('housegains.screens.choreDetail.bonusAwarded', { bonus: bonusTotal(instance) })}
            </Label>
          </Card>
        ) : !isClosed ? (
          <Card
            style={{ backgroundColor: tokens.accent, borderStyle: 'dashed' }}
            testID="housegains.choreDetail.bonusLocked"
          >
            <Label style={{ fontWeight: '700' }}>
              {t('housegains.screens.choreDetail.bonusLocked', {
                bonus: instance.bonusXp,
                done: progress.count,
                total: progress.total,
              })}
            </Label>
          </Card>
        ) : null
      ) : null}
      {instance.disputeStatus === 'open' ? (
        <Card style={{ gap: 8 }} testID="housegains.choreDetail.underReview">
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
            <Ionicons
              accessibilityElementsHidden
              color={tokens.accent}
              name="hourglass-outline"
              size={tokens.iconSize.lg}
            />
            <Label style={{ fontWeight: '700' }}>
              {t('housegains.screens.choreDetail.underReview')}
            </Label>
          </View>
        </Card>
      ) : null}

      {instance.revocations && instance.revocations.length > 0 ? (
        <Card style={{ gap: 8 }} testID="housegains.choreDetail.revocations">
          <Label variant="heading">{t('housegains.screens.choreDetail.revocationsTitle')}</Label>
          {instance.revocations.map((revocation) => {
            const subtask = instance.subtasks.find(({ id }) => id === revocation.subtaskId);
            return (
              <Label
                key={`${revocation.subtaskId}-${revocation.at}`}
                variant="caption"
                testID={`housegains.choreDetail.revocation.${revocation.subtaskId}`}
              >
                {t('housegains.screens.choreDetail.revocationNote', {
                  actor:
                    memberById.get(revocation.actorUid)?.name ??
                    t('housegains.screens.choreDetail.unknownContributor'),
                  subtask: subtask ? subtaskDisplayName(subtask, t) : revocation.subtaskId,
                  verdict: t(VERDICT_LABEL_KEYS[revocation.verdict]),
                  xp: revocation.xp,
                })}
              </Label>
            );
          })}
        </Card>
      ) : null}

      {canModerate && conflicted ? (
        <Card style={{ gap: 8 }} testID="housegains.choreDetail.conflict">
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
            <Ionicons
              accessibilityElementsHidden
              color={tokens.danger}
              name="person-outline"
              size={tokens.iconSize.md}
            />
            <Label style={{ color: tokens.danger, fontWeight: '700' }}>
              {t('housegains.screens.choreDetail.conflictNote')}
            </Label>
          </View>
        </Card>
      ) : null}

      {canModerate && !conflicted ? (
        <Card style={{ gap: 10 }} testID="housegains.choreDetail.moderation">
          {partialAvailable(completedCount) ? (
            <Button
              onPress={() => setPartialOpen(true)}
              testID="housegains.choreDetail.markPartial"
              title={t('housegains.screens.choreDetail.markPartial')}
              variant="secondary"
            />
          ) : null}
          <Button
            onPress={() =>
              setModerateConfirm({
                title: t('housegains.screens.choreDetail.confirmNotDoneTitle'),
                body: t('housegains.screens.choreDetail.confirmNotDoneBody', {
                  steps: moderationStepsFor(moderatable, instance, members, t)
                    .map((step) => step.label)
                    .join(', '),
                }),
                confirmTitle: t('housegains.screens.choreDetail.markNotDone'),
                onConfirm: () => onModerate(instance.id, 'not_done', moderatable),
              })
            }
            testID="housegains.choreDetail.markNotDone"
            title={t('housegains.screens.choreDetail.markNotDone')}
            variant="secondary"
          />
        </Card>
      ) : null}

      {isAdmin && moderatable.length === 0 && completedCount > 0 ? (
        <Label variant="caption" testID="housegains.choreDetail.reviewWindowClosed">
          {t('housegains.screens.choreDetail.reviewWindowClosed')}
        </Label>
      ) : null}

      {canReport && onReport ? (
        <Button
          onPress={() => setReportOpen(true)}
          testID="housegains.choreDetail.reportNotDone"
          title={t('housegains.screens.choreDetail.reportNotDone')}
          variant="secondary"
        />
      ) : null}

      {!isAdmin && alreadyReported ? (
        <Label variant="caption" testID="housegains.choreDetail.alreadyReported">
          {t('housegains.screens.choreDetail.alreadyReported')}
        </Label>
      ) : null}

      <Button
        onPress={() => setReportingChore(true)}
        testID="housegains.choreDetail.report"
        title={t('housegains.account.report.chore')}
        variant="ghost"
      />
      <ReportSheet
        householdId={householdId}
        onClose={() => setReportingChore(false)}
        target={reportingChore ? { kind: 'chore', targetId: chore.id } : null}
      />
      {onReport ? (
        <ReportCompletionSheet
          onClose={() => setReportOpen(false)}
          onSubmit={(subtaskIds, reason) => onReport(instance.id, subtaskIds, reason)}
          steps={reportSteps}
          testID="housegains.choreDetail.reportSheet"
          visible={reportOpen}
        />
      ) : null}
      {onModerate && partialOpen ? (
        <PartialPickerSheet
          confirmTitle={t('housegains.screens.choreDetail.markPartial')}
          onClose={() => setPartialOpen(false)}
          onSubmit={(subtaskIds) => onModerate(instance.id, 'partial', subtaskIds)}
          steps={moderationStepsFor(moderatable, instance, members, t)}
          testID="housegains.choreDetail.partialSheet"
          title={t('housegains.screens.moderation.pickTitle')}
          visible={partialOpen}
        />
      ) : null}
      <ConfirmSheet
        onClose={() => setModerateConfirm(null)}
        request={moderateConfirm}
        testID="housegains.choreDetail.confirmSheet"
      />
    </Screen>
  );
}

type ContributorBreakdown = {
  memberId: string;
  member?: Member;
  completions: Completion[];
  bonus: number;
  subtaskXp: number;
  total: number;
};

function deriveContributorBreakdown(
  instance: Instance,
  members: readonly Member[],
): ContributorBreakdown[] {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const completionById = new Map(
    instance.completions.map((completion) => [completion.memberId, [] as Completion[]]),
  );
  for (const completion of instance.completions)
    completionById.get(completion.memberId)?.push(completion);

  const memberIds = new Set([...completionById.keys(), ...Object.keys(instance.bonusAwards)]);
  return [...memberIds].map((memberId) => {
    const completions = [...(completionById.get(memberId) ?? [])].sort((left, right) => {
      const leftPosition =
        instance.subtasks.find((subtask) => subtask.id === left.subtaskId)?.position ?? 0;
      const rightPosition =
        instance.subtasks.find((subtask) => subtask.id === right.subtaskId)?.position ?? 0;
      return leftPosition - rightPosition;
    });
    const subtaskXp = completions.reduce((total, completion) => total + completion.xp, 0);
    const bonus = instance.bonusAwards[memberId] ?? 0;
    return {
      memberId,
      member: memberById.get(memberId),
      completions,
      bonus,
      subtaskXp,
      total: subtaskXp + bonus,
    };
  });
}

function DecorativeConfetti({ sticker }: { sticker: boolean }) {
  const { tokens } = useAppearance();
  const colors = sticker
    ? [tokens.accent, tokens.danger, tokens.success, tokens.onPrimary]
    : [tokens.accent, tokens.primary, tokens.text, tokens.success];
  return (
    <View
      accessibilityElementsHidden
      pointerEvents="none"
      style={{ height: 38, position: 'relative' }}
    >
      {colors.map((color, index) => (
        <View
          key={`${color}-${index}`}
          style={{
            backgroundColor: color,
            borderColor: tokens.border,
            borderRadius: index % 2 === 0 ? 2 : 99,
            borderWidth: index % 2 === 0 ? 1 : 0,
            height: index % 2 === 0 ? 14 : 11,
            left: `${10 + index * 24}%`,
            position: 'absolute',
            top: index % 2 === 0 ? 5 : 14,
            transform: [{ rotate: `${index * 18 - 20}deg` }],
            width: index % 2 === 0 ? 14 : 11,
          }}
        />
      ))}
    </View>
  );
}

export function CelebrationScreen({
  instance,
  chore,
  members,
  currentMember,
  onBack,
  onPostToFeed,
  hasError,
  badges = [],
}: CelebrationScreenProps) {
  const { themeId, tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [postState, setPostState] = useState<'idle' | 'pending' | 'posted' | 'error'>('idle');
  const postPending = useRef(false);
  const sticker = themeId === 'sticker';
  const soft = themeId === 'soft';
  const breakdown = deriveContributorBreakdown(instance, members);
  const allocatedBonus = bonusTotal(instance);
  const shouldShowError = hasError || postState === 'error';

  const post = async () => {
    if (postPending.current || postState === 'posted') return;
    postPending.current = true;
    setPostState('pending');
    try {
      await onPostToFeed(instance.id);
      setPostState('posted');
    } catch {
      setPostState('error');
    } finally {
      postPending.current = false;
    }
  };

  return (
    <Screen
      contentContainerStyle={{
        alignItems: 'stretch',
        flexGrow: 1,
        gap: 16,
        justifyContent: 'center',
        padding: 20,
        paddingBottom: 28,
      }}
      style={{ backgroundColor: sticker ? tokens.primary : tokens.canvas }}
      testID="housegains.celebration"
    >
      <DecorativeConfetti sticker={sticker} />
      <View style={{ alignItems: 'center', gap: 10 }}>
        {/* The disc grows with its text (minWidth/minHeight, no fixed size) so "100%" and its word
            fit at the largest text size in every language; the bonus sentence sits below it. */}
        <View
          accessible
          accessibilityLabel={t('housegains.screens.celebration.percent', { percent: 100 })}
          style={{
            alignItems: 'center',
            alignSelf: 'center',
            backgroundColor: sticker ? tokens.accent : tokens.primary,
            borderColor: tokens.border,
            borderRadius: 999,
            borderWidth: sticker ? tokens.borderWidth : Math.max(1, tokens.borderWidth),
            gap: tokens.spacing.xxs,
            justifyContent: 'center',
            maxWidth: '100%',
            minHeight: sticker ? 148 : 132,
            minWidth: sticker ? 148 : 132,
            paddingHorizontal: tokens.spacing.lg,
            paddingVertical: tokens.spacing.md,
            shadowColor: tokens.shadow.color,
            shadowOffset: tokens.shadow.offset,
            shadowOpacity: tokens.shadow.opacity,
            shadowRadius: tokens.shadow.radius,
            elevation: tokens.shadow.elevation,
          }}
          testID="housegains.celebration.disc"
        >
          <Label
            adjustsFontSizeToFit
            numberOfLines={1}
            style={{
              color: sticker ? tokens.text : tokens.onPrimary,
              textAlign: 'center',
              transform: sticker ? [{ rotate: '-8deg' }] : undefined,
            }}
            testID="housegains.celebration.percentValue"
            variant="display"
          >
            {t('housegains.screens.celebration.percentValue', { percent: 100 })}
          </Label>
          <Label
            adjustsFontSizeToFit
            numberOfLines={1}
            style={{
              color: sticker ? tokens.text : tokens.onPrimary,
              textAlign: 'center',
            }}
            testID="housegains.celebration.percentWord"
          >
            {t('housegains.screens.celebration.percentWord')}
          </Label>
        </View>
        <Label
          style={{
            color: sticker ? tokens.onPrimary : tokens.text,
            fontWeight: '800',
            textAlign: 'center',
          }}
          testID="housegains.celebration.bonus"
        >
          {t('housegains.screens.celebration.bonusEarned', { bonus: allocatedBonus })}
        </Label>
        <Label
          variant="title"
          style={{
            color: sticker ? tokens.onPrimary : tokens.text,
            fontFamily: soft ? tokens.typography.heading : tokens.typography.bold,
            textAlign: 'center',
          }}
        >
          {t('housegains.screens.celebration.title', {
            chore: choreDisplayName({ ...chore, ...instance.choreSnapshot }, t),
          })}
        </Label>
        <Label
          variant="body"
          style={{
            color: sticker ? tokens.onPrimary : tokens.muted,
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          {t('housegains.screens.celebration.contributors', { count: breakdown.length })}
        </Label>
      </View>

      <CompletionBadges badges={badges} />

      <Card
        style={{ gap: 0, paddingHorizontal: 16, paddingVertical: 8 }}
        testID="housegains.celebration.breakdown"
      >
        {breakdown.map((entry, index) => (
          <View
            key={entry.memberId}
            style={{
              borderBottomColor: tokens.border,
              borderBottomWidth:
                index < breakdown.length - 1 ? Math.max(1, tokens.borderWidth / 2) : 0,
              flexDirection: 'row',
              gap: 11,
              paddingVertical: 11,
            }}
            testID={`housegains.celebration.contributor.${entry.memberId}`}
          >
            {entry.member ? (
              <MemberBadge
                accessibilityLabel={entry.member.name}
                color={entry.member.color}
                initials={entry.member.initials}
                size={42}
              />
            ) : null}
            <View style={{ flex: 1, gap: 3 }}>
              <View
                style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
              >
                <Label variant="body" style={{ fontWeight: '800' }}>
                  {entry.member?.name ?? t('housegains.screens.choreDetail.unknownContributor')}
                </Label>
                {entry.memberId === currentMember.id ? (
                  <Label variant="caption">({t('housegains.screens.dashboard.you')})</Label>
                ) : null}
              </View>
              <View
                style={{ gap: 1 }}
                testID={`housegains.celebration.contributor.${entry.memberId}.subtasks`}
              >
                {entry.completions.map((completion) => {
                  const subtask = instance.subtasks.find(
                    (candidate) => candidate.id === completion.subtaskId,
                  );
                  const taskName =
                    subtask?.name ?? t('housegains.screens.celebration.unknownSubtask');
                  const copy = t('housegains.screens.celebration.subtaskXp', {
                    subtask: taskName,
                    xp: completion.xp,
                  });
                  return (
                    <Label key={completion.id} variant="caption">
                      {completion.isAssist
                        ? `${copy} · ${t('housegains.screens.choreDetail.assist')}`
                        : copy}
                    </Label>
                  );
                })}
              </View>
              {instance.bonusXp > 0 || entry.bonus > 0 ? (
                <Label
                  variant="caption"
                  testID={`housegains.celebration.contributor.${entry.memberId}.bonus`}
                >
                  {t('housegains.screens.celebration.bonusShare', { bonus: entry.bonus })}
                </Label>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
              <Label
                variant="heading"
                testID={`housegains.celebration.contributor.${entry.memberId}.total`}
              >
                {t('housegains.screens.celebration.contributorTotal', { total: entry.total })}
              </Label>
            </View>
          </View>
        ))}
      </Card>

      {shouldShowError ? (
        <Card
          style={{ alignItems: 'center', borderColor: tokens.danger, flexDirection: 'row', gap: 8 }}
          testID="housegains.celebration.postError"
        >
          <Ionicons color={tokens.danger} name="alert-circle-outline" size={tokens.iconSize.md} />
          <Label style={{ flex: 1, fontWeight: '700' }}>
            {t(
              postState === 'error'
                ? 'housegains.screens.celebration.postError'
                : 'housegains.screens.celebration.error',
            )}
          </Label>
        </Card>
      ) : null}

      <View style={{ gap: 8, marginTop: 'auto', paddingTop: 4 }}>
        {postState === 'posted' ? (
          <View accessibilityLiveRegion="polite" testID="housegains.celebration.posted">
            <Label
              style={{
                color: sticker ? tokens.onPrimary : tokens.success,
                fontWeight: '800',
                textAlign: 'center',
              }}
            >
              {t('housegains.screens.celebration.posted')}
            </Label>
          </View>
        ) : (
          <Pressable
            accessibilityLabel={t(
              postState === 'pending'
                ? 'housegains.screens.celebration.posting'
                : 'housegains.screens.celebration.postToFeed',
            )}
            accessibilityRole="button"
            accessibilityState={{ disabled: postState === 'pending' }}
            disabled={postState === 'pending'}
            onPress={() => void post()}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: sticker ? tokens.accent : tokens.primary,
              borderColor: tokens.border,
              borderRadius: tokens.radius,
              borderWidth: tokens.borderWidth,
              justifyContent: 'center',
              minHeight: 54,
              opacity: postState === 'pending' ? 0.6 : pressed ? 0.86 : 1,
              paddingHorizontal: 18,
              paddingVertical: 12,
              shadowColor: tokens.shadow.color,
              shadowOffset: tokens.shadow.offset,
              shadowOpacity: postState === 'pending' ? 0 : tokens.shadow.opacity,
              shadowRadius: tokens.shadow.radius,
              elevation: postState === 'pending' ? 0 : tokens.shadow.elevation,
            })}
            testID="housegains.celebration.postToFeed"
          >
            <Label
              style={{
                color: sticker ? tokens.text : tokens.onPrimary,
                fontWeight: '800',
                textAlign: 'center',
              }}
            >
              {t(
                postState === 'pending'
                  ? 'housegains.screens.celebration.posting'
                  : 'housegains.screens.celebration.postToFeed',
              )}
            </Label>
          </Pressable>
        )}
        <Pressable
          accessibilityLabel={t('housegains.screens.celebration.backToToday')}
          accessibilityRole="button"
          onPress={onBack}
          style={{ alignItems: 'center', justifyContent: 'center', minHeight: 48 }}
          testID="housegains.celebration.back"
        >
          <Label
            style={{
              color: sticker ? tokens.onPrimary : tokens.primary,
              fontWeight: '800',
              textAlign: 'center',
            }}
          >
            {t('housegains.screens.celebration.backToToday')}
          </Label>
        </Pressable>
      </View>
    </Screen>
  );
}
