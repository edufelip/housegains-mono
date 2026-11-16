import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Button, Card, Label } from '@/components/housegains/ui';
import { leaveHousehold, removeMember, reportContent } from '@/features/account/account-api';
import {
  accountErrorKey,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  type ReportKind,
  type ReportReason,
} from '@/features/account/account-rules';
import { useAppearance } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { MemberBadge } from './screen-elements';
import type { Household, Member } from '@/features/household';

type ReportTarget = { kind: ReportKind; targetId: string };

/** Member list with Remove (creator only), Report, and Leave household. */
export function HouseholdPeopleSection({
  household,
  currentMember,
  onLeft,
}: {
  household: Household;
  currentMember: Member;
  onLeft(): void;
}) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const isCreator = currentMember.role === 'creator';
  const isLastMember = household.members.length <= 1;

  const run = async (operation: () => Promise<unknown>, onSuccess?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      onSuccess?.();
    } catch (cause) {
      setError(t(accountErrorKey(cause)));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = (member: Member) =>
    Alert.alert(
      t('housegains.account.members.removeTitle', { name: member.name }),
      t('housegains.account.members.removeBody', { name: member.name }),
      [
        { text: t('housegains.account.common.cancel'), style: 'cancel' },
        {
          text: t('housegains.account.members.removeConfirm'),
          style: 'destructive',
          onPress: () => void run(() => removeMember(household.id, member.id)),
        },
      ],
    );

  const confirmLeave = () => {
    const message = isLastMember
      ? t('housegains.account.leave.bodyLast')
      : isCreator
        ? `${t('housegains.account.leave.body')}\n\n${t('housegains.account.leave.bodyCreator')}`
        : t('housegains.account.leave.body');
    Alert.alert(t('housegains.account.leave.title', { household: household.name }), message, [
      { text: t('housegains.account.common.cancel'), style: 'cancel' },
      {
        text: t('housegains.account.leave.confirm'),
        style: 'destructive',
        onPress: () => void run(() => leaveHousehold(household.id), onLeft),
      },
    ]);
  };

  return (
    <Card style={{ gap: 12 }} testID="housegains.settings.people">
      <Label variant="heading">{t('housegains.account.section.household')}</Label>
      <Label variant="caption">{t('housegains.account.members.title')}</Label>
      {household.members.map((member) => {
        const isSelf = member.id === currentMember.id;
        return (
          <View
            key={member.id}
            style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}
            testID={`housegains.members.${member.id}`}
          >
            <MemberBadge
              accessibilityLabel={member.name}
              color={member.color}
              initials={member.initials}
              size={38}
            />
            <View style={{ flex: 1 }}>
              <Label style={{ fontWeight: '700' }}>
                {isSelf ? t('housegains.screens.dashboard.you') : member.name}
              </Label>
              <Label variant="caption">{t(`housegains.screens.common.role.${member.role}`)}</Label>
            </View>
            {isCreator && !isSelf ? (
              <Button
                disabled={busy}
                onPress={() => confirmRemove(member)}
                testID={`housegains.members.remove.${member.id}`}
                title={t('housegains.account.members.remove')}
                variant="ghost"
              />
            ) : null}
            {!isSelf ? (
              <Button
                disabled={busy}
                onPress={() => setReport({ kind: 'member', targetId: member.id })}
                testID={`housegains.members.report.${member.id}`}
                title={t('housegains.account.members.report')}
                variant="ghost"
              />
            ) : null}
          </View>
        );
      })}
      {error ? (
        <Label style={{ color: tokens.danger }} testID="housegains.household.error">
          {error}
        </Label>
      ) : null}
      <Button
        disabled={busy}
        onPress={() => setReport({ kind: 'household', targetId: household.id })}
        testID="housegains.household.report"
        title={t('housegains.account.household.report')}
        variant="secondary"
      />
      <Button
        disabled={busy}
        onPress={confirmLeave}
        testID="housegains.household.leave"
        title={t('housegains.account.household.leave')}
        variant="outline"
      />
      <ReportSheet householdId={household.id} onClose={() => setReport(null)} target={report} />
    </Card>
  );
}

/** Report sheet: a reason, an optional note, then one reportContent call. */
export function ReportSheet({
  householdId,
  target,
  onClose,
}: {
  householdId: string;
  target: ReportTarget | null;
  onClose(): void;
}) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const visible = target !== null;

  useEffect(() => {
    if (!visible) return;
    setReason(null);
    setNote('');
    setStatus('idle');
    setMessage(null);
  }, [visible, target?.kind, target?.targetId]);

  const submit = async () => {
    if (!target) return;
    if (!reason) {
      setStatus('error');
      setMessage(t('housegains.account.report.reasonRequired'));
      return;
    }
    setStatus('sending');
    setMessage(null);
    try {
      await reportContent({
        householdId,
        kind: target.kind,
        targetId: target.targetId,
        reason,
        note,
      });
      setStatus('sent');
      setMessage(t('housegains.account.report.sent'));
    } catch (cause) {
      setStatus('error');
      setMessage(t(accountErrorKey(cause)));
    }
  };

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
          testID="housegains.report.sheet"
        >
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <Label variant="heading">{t('housegains.account.report.title')}</Label>
            <Label variant="caption">{t('housegains.account.report.subtitle')}</Label>
            <Label variant="caption">{t('housegains.account.report.reasonLabel')}</Label>
            {REPORT_REASONS.map((value) => {
              const selected = reason === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={value}
                  onPress={() => setReason(value)}
                  style={{
                    alignItems: 'center',
                    borderColor: selected ? tokens.primary : tokens.border,
                    borderRadius: tokens.radius,
                    borderWidth: tokens.borderWidth,
                    flexDirection: 'row',
                    gap: 10,
                    padding: 12,
                  }}
                  testID={`housegains.report.reason.${value}`}
                >
                  <Label style={{ flex: 1 }}>
                    {t(`housegains.account.report.reason.${value}`)}
                  </Label>
                  <Label style={{ color: tokens.primary, fontWeight: '800' }}>
                    {selected ? '●' : '○'}
                  </Label>
                </Pressable>
              );
            })}
            <Label variant="caption">{t('housegains.account.report.noteLabel')}</Label>
            <TextInput
              maxLength={REPORT_NOTE_MAX}
              multiline
              onChangeText={setNote}
              placeholder={t('housegains.account.report.notePlaceholder')}
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
              testID="housegains.report.note"
              value={note}
            />
            <Label variant="caption" style={{ textAlign: 'right' }}>
              {t('housegains.account.report.noteCount', { count: note.length })}
            </Label>
            {message ? (
              <Label
                style={{ color: status === 'sent' ? tokens.text : tokens.danger }}
                testID="housegains.report.message"
              >
                {message}
              </Label>
            ) : null}
            {status === 'sent' ? (
              <Button
                onPress={onClose}
                testID="housegains.report.done"
                title={t('housegains.account.common.close')}
              />
            ) : (
              <Button
                disabled={status === 'sending'}
                onPress={() => void submit()}
                testID="housegains.report.submit"
                title={
                  status === 'sending'
                    ? t('housegains.account.report.sending')
                    : t('housegains.account.report.submit')
                }
              />
            )}
            {status !== 'sent' ? (
              <Button
                onPress={onClose}
                testID="housegains.report.cancel"
                title={t('housegains.account.common.cancel')}
                variant="ghost"
              />
            ) : null}
          </ScrollView>
        </Card>
      </View>
    </Modal>
  );
}
