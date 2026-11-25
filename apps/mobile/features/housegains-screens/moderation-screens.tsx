import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Button, Card, Label, Screen, StatePanel } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import {
  disputedSubtasks,
  hasModerationConflict,
  isPartialSelection,
  partialAvailable,
} from '@/features/household/moderation-rules';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { choreDisplayName, resolveInstanceChore, subtaskDisplayName } from './screen-model';
import type { Dispute, Instance, Member, Subtask } from '@/features/household';

// Moderation UI (contract Part A): the admin reports screen and the sheets the report
// flow, the verdict flow, and the creator's role toggle share. Sheets follow the
// ReportSheet model in household-safety.tsx: a scrim, a bottom card, and visible
// busy / error / success states.

/** The provider localizes callable failures; anything else falls back to the generic copy. */
export function actionErrorMessage(cause: unknown, t: (key: string) => string): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : t('housegains.screens.common.actionError');
}

export type ModerationStep = {
  id: string;
  label: string;
  completer?: string;
};

type SheetProps = {
  visible: boolean;
  onClose(): void;
  testID: string;
  children: ReactNode;
};

function SheetShell({ visible, onClose, testID, children }: SheetProps) {
  const { tokens } = useAppearance();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={{ backgroundColor: tokens.scrim, flex: 1, justifyContent: 'flex-end' }}>
        <Card
          style={{
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            gap: 12,
            maxHeight: '85%',
            padding: 20,
          }}
          testID={testID}
        >
          <ScrollView contentContainerStyle={{ gap: 12 }}>{children}</ScrollView>
        </Card>
      </View>
    </Modal>
  );
}

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmTitle: string;
  onConfirm(): Promise<void>;
} | null;

/** A title, a body, one confirm, one cancel — the role toggle and the whole-verdict confirm. */
export function ConfirmSheet({
  request,
  onClose,
  testID,
}: {
  request: ConfirmRequest;
  onClose(): void;
  testID: string;
}) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Reset after a close (request -> null) so a submit-in-flight keeps its busy state,
  // even though the caller rebuilds the request object on re-render.
  useEffect(() => {
    if (request === null) {
      setBusy(false);
      setMessage(null);
    }
  }, [request]);

  const confirm = async () => {
    if (!request || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await request.onConfirm();
      onClose();
    } catch (cause) {
      setMessage(actionErrorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell visible={request !== null} onClose={onClose} testID={testID}>
      {request ? (
        <>
          <Label variant="heading">{request.title}</Label>
          <Label>{request.body}</Label>
          {message ? (
            <Label style={{ color: tokens.danger }} testID={`${testID}.error`}>
              {message}
            </Label>
          ) : null}
          <Button
            disabled={busy}
            onPress={() => void confirm()}
            testID={`${testID}.confirm`}
            title={busy ? t('housegains.screens.moderation.submitting') : request.confirmTitle}
          />
          <Button
            disabled={busy}
            onPress={onClose}
            testID={`${testID}.cancel`}
            title={t('housegains.screens.common.cancel')}
            variant="ghost"
          />
        </>
      ) : null}
    </SheetShell>
  );
}

/** A step row with a checkbox state shown by an icon, never fill color alone. */
function StepRow({
  step,
  checked,
  onToggle,
  testID,
}: {
  step: ModerationStep;
  checked: boolean;
  onToggle(): void;
  testID: string;
}) {
  const { tokens } = useAppearance();
  return (
    <Pressable
      accessibilityLabel={step.completer ? `${step.label}, ${step.completer}` : step.label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={{
        alignItems: 'center',
        borderColor: checked ? tokens.primary : tokens.border,
        borderRadius: tokens.radius,
        borderWidth: tokens.borderWidth,
        flexDirection: 'row',
        gap: 10,
        minHeight: 48,
        padding: 12,
      }}
      testID={testID}
    >
      <Ionicons
        color={checked ? tokens.primary : tokens.muted}
        name={checked ? 'checkbox' : 'square-outline'}
        size={tokens.iconSize.md}
      />
      <View style={{ flex: 1 }}>
        <Label style={{ fontWeight: '700' }}>{step.label}</Label>
        {step.completer ? <Label variant="caption">{step.completer}</Label> : null}
      </View>
    </Pressable>
  );
}

/**
 * The partial-verdict picker: pick the steps that were NOT done. The confirm stays
 * disabled until the selection is a non-empty strict subset of the pool (contract A2), or a
 * non-empty subset when `allowFullSelection` says a step outside the pool stays done.
 */
export function PartialPickerSheet({
  visible,
  title,
  confirmTitle,
  steps,
  allowFullSelection = false,
  onSubmit,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  confirmTitle: string;
  steps: ModerationStep[];
  /**
   * True when a step the caller cannot pick stays done, so picking every listed step is still a
   * partial verdict (A2). Otherwise the selection must be a strict subset of the list.
   */
  allowFullSelection?: boolean;
  onSubmit(subtaskIds: string[]): Promise<void>;
  onClose(): void;
  testID: string;
}) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // A fresh open starts an empty draft; later step-list identities keep the draft.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set());
    setBusy(false);
    setMessage(null);
  }, [visible]);

  const pool = steps.map((step) => step.id);
  const valid = allowFullSelection
    ? selected.size > 0 && [...selected].every((subtaskId) => pool.includes(subtaskId))
    : isPartialSelection([...selected], pool);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await onSubmit([...selected]);
      onClose();
    } catch (cause) {
      setMessage(actionErrorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell visible={visible} onClose={onClose} testID={testID}>
      <Label variant="heading">{title}</Label>
      <Label variant="caption">{t('housegains.screens.moderation.pickHint')}</Label>
      {steps.map((step) => (
        <StepRow
          checked={selected.has(step.id)}
          key={step.id}
          onToggle={() =>
            setSelected((previous) => {
              const next = new Set(previous);
              if (next.has(step.id)) next.delete(step.id);
              else next.add(step.id);
              return next;
            })
          }
          step={step}
          testID={`${testID}.step.${step.id}`}
        />
      ))}
      {message ? (
        <Label style={{ color: tokens.danger }} testID={`${testID}.error`}>
          {message}
        </Label>
      ) : null}
      <Button
        disabled={busy || !valid}
        onPress={() => void submit()}
        testID={`${testID}.confirm`}
        title={busy ? t('housegains.screens.moderation.submitting') : confirmTitle}
      />
      <Button
        disabled={busy}
        onPress={onClose}
        testID={`${testID}.cancel`}
        title={t('housegains.screens.common.cancel')}
        variant="ghost"
      />
    </SheetShell>
  );
}

const REPORT_REASON_MAX = 280;

/** The member report sheet: pick the steps that were not done, add an optional reason. */
export function ReportCompletionSheet({
  visible,
  steps,
  onSubmit,
  onClose,
  testID,
}: {
  visible: boolean;
  steps: ModerationStep[];
  onSubmit(subtaskIds: string[], reason: string): Promise<void>;
  onClose(): void;
  testID: string;
}) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  // A fresh open starts from every step selected; later step-list identities keep the draft.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set(stepsRef.current.map((step) => step.id)));
    setReason('');
    setStatus('idle');
    setMessage(null);
  }, [visible]);

  const submit = async () => {
    if (selected.size === 0 || status === 'sending') return;
    setStatus('sending');
    setMessage(null);
    try {
      await onSubmit([...selected], reason.trim());
      setStatus('sent');
      setMessage(t('housegains.screens.choreDetail.reportSent'));
    } catch (cause) {
      setStatus('idle');
      setMessage(actionErrorMessage(cause, t));
    }
  };

  return (
    <SheetShell visible={visible} onClose={onClose} testID={testID}>
      <Label variant="heading">{t('housegains.screens.choreDetail.reportSheetTitle')}</Label>
      <Label variant="caption">{t('housegains.screens.choreDetail.reportSheetBody')}</Label>
      {steps.map((step) => (
        <StepRow
          checked={selected.has(step.id)}
          key={step.id}
          onToggle={() =>
            setSelected((previous) => {
              const next = new Set(previous);
              if (next.has(step.id)) next.delete(step.id);
              else next.add(step.id);
              return next;
            })
          }
          step={step}
          testID={`${testID}.step.${step.id}`}
        />
      ))}
      <Label variant="caption">{t('housegains.screens.choreDetail.reportReasonLabel')}</Label>
      <TextInput
        maxLength={REPORT_REASON_MAX}
        multiline
        onChangeText={setReason}
        placeholder={t('housegains.screens.choreDetail.reportReasonPlaceholder')}
        placeholderTextColor={tokens.muted}
        style={{
          borderColor: tokens.border,
          borderRadius: tokens.radius,
          borderWidth: tokens.borderWidth,
          color: tokens.text,
          minHeight: 80,
          padding: 12,
          textAlignVertical: 'top',
        }}
        testID={`${testID}.reason`}
        value={reason}
      />
      <Label variant="caption" style={{ textAlign: 'right' }} testID={`${testID}.reasonCount`}>
        {t('housegains.screens.choreDetail.reportReasonCount', { count: reason.length })}
      </Label>
      {message ? (
        <Label
          style={{ color: status === 'sent' ? tokens.text : tokens.danger }}
          testID={`${testID}.message`}
        >
          {message}
        </Label>
      ) : null}
      {status === 'sent' ? (
        <Button
          onPress={onClose}
          testID={`${testID}.done`}
          title={t('housegains.screens.common.close')}
        />
      ) : (
        <Button
          disabled={status === 'sending' || selected.size === 0}
          onPress={() => void submit()}
          testID={`${testID}.submit`}
          title={
            status === 'sending'
              ? t('housegains.screens.choreDetail.reportSending')
              : t('housegains.screens.choreDetail.reportSubmit')
          }
        />
      )}
      {status !== 'sent' ? (
        <Button
          disabled={status === 'sending'}
          onPress={onClose}
          testID={`${testID}.cancel`}
          title={t('housegains.screens.common.cancel')}
          variant="ghost"
        />
      ) : null}
    </SheetShell>
  );
}

function stepLabel(subtask: Subtask | undefined, t: (key: string) => string): string {
  return subtask ? subtaskDisplayName(subtask, t) : '';
}

/** Resolves a dispute's steps into display rows: name from the instance, completer from members. */
export function moderationStepsFor(
  subtaskIds: readonly string[],
  instance: Instance | undefined,
  members: readonly Member[],
  t: (key: string) => string,
): ModerationStep[] {
  const memberById = new Map(members.map((member) => [member.id, member]));
  return subtaskIds.flatMap((subtaskId) => {
    const subtask = instance?.subtasks.find((candidate) => candidate.id === subtaskId);
    const completion = instance?.completions.find((candidate) => candidate.subtaskId === subtaskId);
    if (!subtask) {
      // Without the instance snapshot only the stored id is known; show it rather than nothing.
      return [{ id: subtaskId, label: subtaskId, completer: undefined }];
    }
    return [
      {
        id: subtaskId,
        label: stepLabel(subtask, t),
        completer: completion
          ? (memberById.get(completion.memberId)?.name ??
            t('housegains.screens.feed.memberUnavailable'))
          : undefined,
      },
    ];
  });
}

export const VERDICT_LABEL_KEYS = {
  done: 'housegains.screens.reports.verdict.done',
  partial: 'housegains.screens.reports.verdict.partial',
  not_done: 'housegains.screens.reports.verdict.not_done',
} as const;

export function AdminReportsScreen({
  currentMember,
  rosterMembers,
  disputes,
  members,
  instances,
  hasError,
  onRetry,
  onBack,
  onResolve,
}: {
  /** The signed-in admin: a dispute they took part in is reviewed by another admin. */
  currentMember: Member;
  /** The live roster (admins counted for the sole-admin rule); defaults to `members`. */
  rosterMembers?: Member[];
  /** Open disputes, or null while the listener has not delivered. */
  disputes: Dispute[] | null;
  members: Member[];
  instances: Instance[];
  hasError: boolean;
  onRetry(): void;
  onBack(): void;
  onResolve(
    disputeId: string,
    verdict: 'done' | 'partial' | 'not_done',
    subtaskIds?: string[],
  ): Promise<void>;
}) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [confirm, setConfirm] = useState<ConfirmRequest>(null);
  const [partialFor, setPartialFor] = useState<Dispute | null>(null);

  const memberName = (memberId: string): string =>
    members.find((member) => member.id === memberId)?.name ??
    t('housegains.screens.feed.memberUnavailable');

  const renderRow = (dispute: Dispute) => {
    const instance = instances.find((candidate) => candidate.id === dispute.instanceId);
    const resolved = instance ? resolveInstanceChore(instance, []) : undefined;
    const choreName =
      instance && resolved
        ? choreDisplayName({ ...resolved, ...instance.choreSnapshot }, t)
        : dispute.choreName;
    const reporterNames = dispute.reports.map((report) => memberName(report.uid)).join(', ');
    const steps = moderationStepsFor(dispute.subtaskIds, instance, members, t);
    const showPartial = partialAvailable(dispute.subtaskIds.length);
    // Contract A2: the server rejects a verdict when any step the dispute still covers was
    // completed by the caller, unless they are the only member with admin rights.
    const conflicted = instance
      ? hasModerationConflict(
          instance,
          disputedSubtasks(dispute, instance.completions),
          currentMember.id,
          rosterMembers ?? members,
        )
      : false;
    return (
      <Card
        key={dispute.id}
        style={{ gap: 10 }}
        testID={`housegains.reports.dispute.${dispute.id}`}
      >
        <Label variant="heading" testID={`housegains.reports.dispute.${dispute.id}.chore`}>
          {choreName}
        </Label>
        <Label variant="caption">
          {t('housegains.screens.reports.reportedBy', { names: reporterNames })}
        </Label>
        {dispute.reports
          .filter((report) => report.reason.trim().length > 0)
          .map((report) => (
            <Label
              key={`${report.uid}-${report.createdAt}`}
              variant="caption"
              testID={`housegains.reports.dispute.${dispute.id}.reason`}
            >
              {t('housegains.screens.reports.reasonLine', { reason: report.reason })}
            </Label>
          ))}
        <Label variant="caption" style={{ fontWeight: '700' }}>
          {t('housegains.screens.reports.disputedSteps')}
        </Label>
        {steps.map((step) => (
          <Label key={step.id} variant="caption">
            {step.completer
              ? t('housegains.screens.moderation.stepBy', {
                  step: step.label,
                  member: step.completer,
                })
              : step.label}
          </Label>
        ))}
        {conflicted ? (
          <View
            style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}
            testID={`housegains.reports.dispute.${dispute.id}.conflict`}
          >
            <Ionicons
              accessibilityElementsHidden
              color={tokens.danger}
              name="person-outline"
              size={tokens.iconSize.md}
            />
            <Label style={{ color: tokens.danger, flex: 1, fontWeight: '700' }}>
              {t('housegains.screens.choreDetail.conflictNote')}
            </Label>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              onPress={() =>
                setConfirm({
                  title: t('housegains.screens.reports.confirmDoneTitle'),
                  body: t('housegains.screens.reports.confirmDoneBody'),
                  confirmTitle: t(VERDICT_LABEL_KEYS.done),
                  onConfirm: () => onResolve(dispute.id, 'done'),
                })
              }
              testID={`housegains.reports.dispute.${dispute.id}.done`}
              title={t(VERDICT_LABEL_KEYS.done)}
              variant="secondary"
            />
            {showPartial ? (
              <Button
                onPress={() => setPartialFor(dispute)}
                testID={`housegains.reports.dispute.${dispute.id}.partial`}
                title={t(VERDICT_LABEL_KEYS.partial)}
                variant="secondary"
              />
            ) : null}
            <Button
              onPress={() =>
                setConfirm({
                  title: t('housegains.screens.reports.confirmNotDoneTitle'),
                  body: t('housegains.screens.reports.confirmNotDoneBody'),
                  confirmTitle: t(VERDICT_LABEL_KEYS.not_done),
                  onConfirm: () => onResolve(dispute.id, 'not_done'),
                })
              }
              testID={`housegains.reports.dispute.${dispute.id}.notDone`}
              title={t(VERDICT_LABEL_KEYS.not_done)}
              variant="secondary"
            />
          </View>
        )}
      </Card>
    );
  };

  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, gap: 16, padding: 18, paddingBottom: 30 }}
      testID="housegains.reports"
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
          testID="housegains.reports.back"
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
          <Label variant="title">{t('housegains.screens.reports.title')}</Label>
          <Label variant="caption">{t('housegains.screens.reports.description')}</Label>
        </View>
      </View>

      {hasError ? (
        <StatePanel
          actionTitle={t('housegains.screens.common.retry')}
          description={t('housegains.screens.common.loadErrorBody')}
          kind="error"
          onAction={onRetry}
          testID="housegains.reports.error"
          title={t('housegains.screens.common.loadErrorTitle')}
        />
      ) : disputes === null ? (
        <StatePanel
          kind="loading"
          testID="housegains.reports.loading"
          title={t('housegains.screens.common.loading')}
        />
      ) : disputes.length === 0 ? (
        <StatePanel
          description={t('housegains.screens.reports.emptyBody')}
          kind="empty"
          testID="housegains.reports.empty"
          title={t('housegains.screens.reports.emptyTitle')}
        />
      ) : (
        [...disputes]
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map(renderRow)
      )}

      <ConfirmSheet
        onClose={() => setConfirm(null)}
        request={confirm}
        testID="housegains.reports.confirm"
      />
      {partialFor ? (
        <PartialPickerSheet
          confirmTitle={t(VERDICT_LABEL_KEYS.partial)}
          onClose={() => setPartialFor(null)}
          onSubmit={(subtaskIds) => onResolve(partialFor.id, 'partial', subtaskIds)}
          steps={moderationStepsFor(
            partialFor.subtaskIds,
            instances.find((candidate) => candidate.id === partialFor.instanceId),
            members,
            t,
          )}
          testID="housegains.reports.partial"
          title={t('housegains.screens.moderation.pickTitle')}
          visible={partialFor !== null}
        />
      ) : null}
    </Screen>
  );
}
