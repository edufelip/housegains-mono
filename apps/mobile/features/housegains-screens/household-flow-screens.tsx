import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Share, TextInput, View } from 'react-native';
import { Button, Card, Label, Screen } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { isValidInviteCode, type Chore, type Household, type Member } from '@/features/household';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { extractInviteCode } from './invite-link';
import { InviteQrView } from './invite-qr-view';
import { ChoiceChip, HouseGainsGlyph, MemberBadge, ScreenTitle } from './screen-elements';
import { choreDisplayName } from './screen-model';

export function InviteHousematesScreen({
  household,
  currentMember,
  returnTo,
  onBack,
  onSkip,
  onRegenerate,
  hasError,
}: {
  household: Household;
  currentMember: Member;
  returnTo: 'setup' | 'settings';
  onBack(): void;
  onSkip(): void;
  onRegenerate(): Promise<void>;
  hasError: boolean;
}) {
  const { tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const inviteLink = `https://housegains.app/j/${household.invite.code}`;
  const expiry = new Date(household.invite.expiresAt);
  const expiryDays = Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86_400_000));
  const expiryDate = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(expiry);
  const usesLeft = Math.max(0, household.invite.maxUses - household.invite.uses);

  const copyValue = async (value: string, target: 'code' | 'link') => {
    try {
      await Clipboard.setStringAsync(value);
      setCopied(target);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const shareInvite = async () => {
    try {
      await Share.share({
        message: t('housegains.screens.invite.shareMessage', { link: inviteLink }),
        url: inviteLink,
      });
    } catch {
      setCopied(null);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      await onRegenerate();
    } catch {
      // The owning route displays the localized retry message.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, gap: 16, padding: 18, paddingBottom: 24 }}
      testID="housegains.onboarding.invite"
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable
          accessibilityLabel={t('housegains.screens.common.back')}
          accessibilityRole="button"
          onPress={onBack}
        >
          <Ionicons color={tokens.text} name="chevron-back" size={28} />
        </Pressable>
        {returnTo === 'setup' ? (
          <>
            <Label variant="eyebrow">
              {t('housegains.screens.onboarding.stepCount', { step: 3, total: 4 })}
            </Label>
            <Pressable accessibilityRole="button" onPress={onSkip} testID="housegains.invite.skip">
              <Label
                style={{
                  color: tokens.primary,
                  fontWeight: '800',
                  textDecorationLine: 'underline',
                }}
              >
                {t('housegains.screens.common.skip')}
              </Label>
            </Pressable>
          </>
        ) : (
          <View style={{ width: 28 }} />
        )}
      </View>
      <ScreenTitle
        title={t('housegains.screens.invite.title')}
        description={t('housegains.screens.invite.description')}
      />

      <Card style={{ backgroundColor: tokens.primary, gap: 12, padding: 16 }}>
        <Label style={{ color: tokens.onPrimary, fontWeight: '800' }}>
          {t('housegains.screens.invite.codeLabel')}
        </Label>
        <View
          accessibilityLabel={t('housegains.screens.invite.codeLabel')}
          style={{ flexDirection: 'row', gap: 5, justifyContent: 'space-between' }}
        >
          {household.invite.code.split('').map((character, index) => (
            <View
              key={`${character}-${index}`}
              style={{
                alignItems: 'center',
                backgroundColor: tokens.accent,
                borderColor: tokens.border,
                borderRadius: 11,
                borderWidth: tokens.borderWidth,
                flex: 1,
                justifyContent: 'center',
                minHeight: 52,
              }}
            >
              <Label
                style={{
                  color: tokens.text,
                  fontFamily: tokens.typography.mono,
                  fontSize: 22,
                  fontWeight: '900',
                }}
              >
                {character}
              </Label>
            </View>
          ))}
        </View>
        <View
          style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <Label style={{ color: tokens.onPrimary, flex: 1, fontSize: 13 }}>
            {t('housegains.screens.invite.validity', {
              days: expiryDays,
              date: expiryDate,
              uses: usesLeft,
            })}
          </Label>
          <Pressable
            accessibilityLabel={t(
              copied === 'code'
                ? 'housegains.screens.invite.codeCopied'
                : 'housegains.screens.invite.copyCode',
            )}
            accessibilityRole="button"
            onPress={() => void copyValue(household.invite.code, 'code')}
            style={{
              alignItems: 'center',
              backgroundColor: tokens.surface,
              borderColor: tokens.border,
              borderRadius: 11,
              borderWidth: tokens.borderWidth,
              flexDirection: 'row',
              gap: 5,
              minHeight: 44,
              paddingHorizontal: 11,
            }}
            testID="housegains.invite.copyCode"
          >
            <Ionicons
              color={tokens.text}
              name={copied === 'code' ? 'checkmark' : 'copy-outline'}
              size={16}
            />
            <Label style={{ color: tokens.text, fontSize: 13, fontWeight: '800' }}>
              {t(
                copied === 'code'
                  ? 'housegains.screens.invite.copied'
                  : 'housegains.screens.invite.copy',
              )}
            </Label>
          </Pressable>
          {currentMember.role === 'creator' ? (
            <Pressable
              accessibilityLabel={t('housegains.screens.invite.regenerate')}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void regenerate()}
              style={{
                alignItems: 'center',
                backgroundColor: tokens.surface,
                borderColor: tokens.border,
                borderRadius: 11,
                borderWidth: tokens.borderWidth,
                height: 44,
                justifyContent: 'center',
                marginLeft: 7,
                width: 44,
              }}
              testID="housegains.invite.regenerate"
            >
              <Ionicons color={tokens.text} name="refresh" size={20} />
            </Pressable>
          ) : null}
        </View>
      </Card>

      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
        <InviteQrView code={household.invite.code} label={t('housegains.screens.invite.qrLabel')} />
        <View style={{ flex: 1, gap: 9 }}>
          <Label variant="heading">{t('housegains.screens.invite.directLink')}</Label>
          <Card style={{ padding: 11 }}>
            <Label selectable style={{ fontSize: 13, textAlign: 'center' }}>
              {inviteLink}
            </Label>
          </Card>
          <Button
            onPress={() => void shareInvite()}
            title={t('housegains.screens.invite.shareLink')}
          />
          <Button
            onPress={() => void copyValue(inviteLink, 'link')}
            title={t(
              copied === 'link'
                ? 'housegains.screens.invite.linkCopied'
                : 'housegains.screens.invite.copyLink',
            )}
            variant="outline"
          />
        </View>
      </View>

      <Card style={{ gap: 12 }}>
        <Label style={{ fontWeight: '800' }}>
          {t('housegains.screens.invite.memberCount', {
            household: household.name,
            count: household.members.length,
          })}
        </Label>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
          {household.members.map((member) => (
            <MemberBadge
              accessibilityLabel={member.name}
              color={member.color}
              initials={member.initials}
              key={member.id}
              size={40}
            />
          ))}
          <Label variant="caption" style={{ flex: 1 }}>
            {t('housegains.screens.invite.membersLocalStatus')}
          </Label>
        </View>
        <Label variant="caption">
          {t('housegains.screens.invite.inviteCapacity', {
            uses: usesLeft,
            max: household.invite.maxUses,
          })}
        </Label>
      </Card>

      {hasError ? (
        <Card style={{ borderColor: tokens.danger }}>
          <Label style={{ color: tokens.danger }}>
            {t('housegains.screens.common.actionError')}
          </Label>
        </Card>
      ) : null}
      <View style={{ flex: 1 }} />
      <Button
        onPress={onSkip}
        testID={
          returnTo === 'setup' ? 'housegains.invite.nextAssignments' : 'housegains.invite.done'
        }
        title={t(
          returnTo === 'setup'
            ? 'housegains.screens.invite.nextAssignments'
            : 'housegains.screens.invite.done',
        )}
      />
    </Screen>
  );
}

export function AssignChoresScreen({
  household,
  chores,
  members,
  currentMember,
  onBack,
  onFinish,
  onSetAssignments,
  hasError,
}: {
  household: Household;
  chores: Chore[];
  members: Member[];
  currentMember: Member;
  onBack(): void;
  onFinish(): Promise<void>;
  onSetAssignments(choreId: string, memberIds: string[]): Promise<void>;
  hasError: boolean;
}) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [pendingChores, setPendingChores] = useState<ReadonlySet<string>>(new Set());
  const pendingChoresRef = useRef(new Set<string>());
  const pendingAssignmentsRef = useRef(new Map<string, string[]>());
  useEffect(() => {
    for (const choreId of pendingChoresRef.current) {
      const chore = chores.find((item) => item.id === choreId);
      const expected = pendingAssignmentsRef.current.get(choreId);
      if (
        chore &&
        expected &&
        chore.assigneeIds.length === expected.length &&
        expected.every((id) => chore.assigneeIds.includes(id))
      ) {
        pendingChoresRef.current.delete(choreId);
        pendingAssignmentsRef.current.delete(choreId);
      }
    }
    setPendingChores(new Set(pendingChoresRef.current));
  }, [chores]);
  const unassignedCount = chores.filter((chore) => chore.assigneeIds.length === 0).length;
  const canAssign = currentMember.role === 'creator';

  const toggleAssignment = async (chore: Chore, member: Member) => {
    if (!canAssign || pendingChoresRef.current.has(chore.id)) return;
    const current = chore.assigneeIds;
    const next = current.includes(member.id)
      ? current.filter((id) => id !== member.id)
      : [...current, member.id];
    pendingChoresRef.current.add(chore.id);
    pendingAssignmentsRef.current.set(chore.id, next);
    setPendingChores(new Set(pendingChoresRef.current));
    try {
      await onSetAssignments(chore.id, next);
    } catch {
      // The provider keeps the last saved assignment and the route shows an error.
      pendingChoresRef.current.delete(chore.id);
      pendingAssignmentsRef.current.delete(chore.id);
      setPendingChores(new Set(pendingChoresRef.current));
    }
  };

  const finish = async () => {
    try {
      await onFinish();
    } catch {
      // Keep the assignment screen open so the user can retry.
    }
  };

  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, gap: 16, padding: 18, paddingBottom: 24 }}
      testID="housegains.onboarding.assignments"
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable
          accessibilityLabel={t('housegains.screens.common.back')}
          accessibilityRole="button"
          onPress={onBack}
          testID="housegains.assignments.back"
        >
          <Ionicons color={tokens.text} name="chevron-back" size={28} />
        </Pressable>
        <Label variant="eyebrow">
          {t('housegains.screens.onboarding.stepCount', { step: 4, total: 4 })}
        </Label>
        <Label>{t('housegains.screens.onboarding.stepLabel', { step: 4 })}</Label>
      </View>
      <ScreenTitle
        title={t('housegains.screens.assignments.title')}
        description={t('housegains.screens.assignments.description')}
      />

      {chores.length === 0 ? (
        <Card style={{ gap: 6 }}>
          <Label variant="heading">{t('housegains.screens.assignments.emptyTitle')}</Label>
          <Label>{t('housegains.screens.assignments.emptyBody')}</Label>
        </Card>
      ) : (
        chores.map((chore) => {
          const name = choreDisplayName(chore, t);
          return (
            <Card key={chore.id} style={{ gap: 12, padding: 14 }}>
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
                <HouseGainsGlyph color={tokens.text} icon={chore.icon} size={21} />
                <Label style={{ flex: 1, fontWeight: '800' }}>{name}</Label>
                <Label
                  style={{
                    backgroundColor: tokens.accent,
                    borderRadius: 999,
                    fontWeight: '800',
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                  }}
                >
                  {t('housegains.screens.common.xp', {
                    xp:
                      chore.subtasks.reduce((sum, subtask) => sum + subtask.xp, 0) + chore.bonusXp,
                  })}
                </Label>
              </View>
              <View
                pointerEvents={pendingChores.has(chore.id) ? 'none' : 'auto'}
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
              >
                {members.map((member) => (
                  <ChoiceChip
                    accessibilityLabel={t('housegains.screens.assignments.assignTo', {
                      chore: name,
                      member: member.name,
                    })}
                    key={member.id}
                    onPress={() => void toggleAssignment(chore, member)}
                    selected={chore.assigneeIds.includes(member.id)}
                    testID={`housegains.assignments.${chore.id}.${member.id}`}
                    title={`${member.initials} · ${member.name}`}
                    style={{ opacity: pendingChores.has(chore.id) ? 0.62 : 1 }}
                  />
                ))}
              </View>
              <Label variant="caption">
                {chore.assigneeIds.length === 0
                  ? t('housegains.screens.dashboard.unassigned')
                  : t('housegains.screens.assignments.assignedCount', {
                      count: chore.assigneeIds.length,
                    })}
              </Label>
            </Card>
          );
        })
      )}

      <Card style={{ backgroundColor: tokens.accent, gap: 5 }}>
        <Label style={{ fontWeight: '800' }}>
          {t('housegains.screens.assignments.unassignedCount', { count: unassignedCount })}
        </Label>
        <Label>{t('housegains.screens.assignments.anyoneCanHelp')}</Label>
      </Card>
      {hasError ? (
        <Card style={{ borderColor: tokens.danger }}>
          <Label style={{ color: tokens.danger }}>
            {t('housegains.screens.common.actionError')}
          </Label>
        </Card>
      ) : null}
      <View style={{ flex: 1 }} />
      <Button
        onPress={() => void finish()}
        testID="housegains.assignments.finish"
        title={t('housegains.screens.assignments.finish')}
      />
    </Screen>
  );
}

export function JoinHouseholdScreen({
  initialCode,
  household,
  choreCount,
  onBack,
  onJoin,
  hasError,
}: {
  initialCode?: string;
  household: Household | null;
  choreCount: number;
  onBack(): void;
  onJoin(code: string): Promise<void>;
  hasError: boolean;
}) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const [code, setCode] = useState((initialCode ?? '').toUpperCase().slice(0, 6));
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState(false);
  const [joining, setJoining] = useState(false);
  const codeIsValid = isValidInviteCode(code);
  const localPreview = household?.invite.code === code ? household : null;
  const canShowScanner = permission?.granted === true;

  useEffect(() => {
    if (initialCode) setCode(initialCode.toUpperCase().slice(0, 6));
  }, [initialCode]);

  const startScan = async () => {
    setScannerError(false);
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (result.granted) setScannerOpen(true);
      else setScannerError(true);
    } catch {
      setScannerError(true);
    }
  };

  const handleScan = (value: string) => {
    const extracted = extractInviteCode(value);
    if (!extracted) {
      setScannerError(true);
      return;
    }
    setCode(extracted);
    setScannerOpen(false);
  };

  const submit = async () => {
    if (!codeIsValid) return;
    setJoining(true);
    try {
      await onJoin(code);
    } catch {
      // Domain failures are shown as a generic localized invite error.
    } finally {
      setJoining(false);
    }
  };

  const scanner = useMemo(() => {
    if (!scannerOpen) return null;
    return (
      <Modal animationType="slide" onRequestClose={() => setScannerOpen(false)} visible>
        <Screen
          contentContainerStyle={{ backgroundColor: '#050505', flex: 1 }}
          edges={[]}
          scrollable={false}
        >
          <View style={{ flex: 1 }}>
            {canShowScanner ? (
              <CameraView
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={(result) => handleScan(result.data)}
                style={{ flex: 1 }}
              />
            ) : null}
            <View style={{ backgroundColor: '#050505', gap: 12, padding: 18 }}>
              <Label style={{ color: '#FFFFFF' }}>{t('housegains.screens.join.scanFrame')}</Label>
              {scannerError ? (
                <Label style={{ color: '#FF8A4C' }}>{t('housegains.screens.join.scanError')}</Label>
              ) : null}
              <Button
                onPress={() => setScannerOpen(false)}
                title={t('housegains.screens.common.cancel')}
                variant="outline"
              />
            </View>
          </View>
        </Screen>
      </Modal>
    );
  }, [canShowScanner, scannerError, scannerOpen, t]);

  return (
    <>
      <Screen
        contentContainerStyle={{ flexGrow: 1, gap: 17, padding: 18, paddingBottom: 24 }}
        testID="housegains.join"
      >
        <Pressable
          accessibilityLabel={t('housegains.screens.common.back')}
          accessibilityRole="button"
          onPress={onBack}
          testID="housegains.join.back"
        >
          <Ionicons color={tokens.text} name="chevron-back" size={28} />
        </Pressable>
        <ScreenTitle
          title={t('housegains.screens.join.title')}
          description={t('housegains.screens.join.description')}
        />

        {localPreview ? (
          <Card style={{ alignItems: 'center', gap: 11, padding: 18 }}>
            <View
              style={{
                alignItems: 'center',
                backgroundColor: localPreview.color,
                borderRadius: 18,
                height: 72,
                justifyContent: 'center',
                width: 72,
              }}
            >
              <HouseGainsGlyph color={tokens.text} icon={localPreview.icon} size={30} />
            </View>
            <Label variant="title">{localPreview.name}</Label>
            <Label style={{ textAlign: 'center' }}>
              {t('housegains.screens.join.householdPreview', {
                creator: localPreview.members[0]?.name ?? '',
                members: localPreview.members.length,
                chores: choreCount,
              })}
            </Label>
            <View style={{ flexDirection: 'row' }}>
              {localPreview.members.map((member) => (
                <MemberBadge
                  accessibilityLabel={member.name}
                  color={member.color}
                  initials={member.initials}
                  key={member.id}
                  size={36}
                />
              ))}
            </View>
          </Card>
        ) : (
          <Card style={{ gap: 8 }}>
            <Label variant="heading">{t('housegains.screens.join.previewUnavailable')}</Label>
            <Label>{t('housegains.screens.join.previewUnavailableDetail')}</Label>
          </Card>
        )}

        <View style={{ gap: 9 }}>
          <Label variant="eyebrow">{t('housegains.screens.join.codeLabel')}</Label>
          <View style={{ height: 58, position: 'relative' }}>
            <View pointerEvents="none" style={{ flexDirection: 'row', gap: 6 }}>
              {Array.from({ length: 6 }, (_, index) => (
                <View
                  key={index}
                  style={{
                    alignItems: 'center',
                    backgroundColor: tokens.surface,
                    borderColor: tokens.border,
                    borderRadius: 12,
                    borderWidth: tokens.borderWidth,
                    flex: 1,
                    height: 54,
                    justifyContent: 'center',
                  }}
                >
                  <Label
                    style={{
                      color: tokens.text,
                      fontFamily: tokens.typography.mono,
                      fontSize: 22,
                      fontWeight: '900',
                    }}
                  >
                    {code[index] ?? ''}
                  </Label>
                </View>
              ))}
            </View>
            <TextInput
              accessibilityHint={t('housegains.screens.join.codeHint')}
              accessibilityLabel={t('housegains.screens.join.codeLabel')}
              autoCapitalize="characters"
              autoCorrect={false}
              caretHidden
              maxLength={6}
              onChangeText={(text) =>
                setCode(
                  text
                    .toUpperCase()
                    .replace(/[^A-HJ-NP-Z2-9]/g, '')
                    .slice(0, 6),
                )
              }
              style={{
                backgroundColor: 'transparent',
                color: 'transparent',
                fontSize: 22,
                height: 54,
                left: 0,
                letterSpacing: 22,
                opacity: 0.03,
                padding: 0,
                position: 'absolute',
                right: 0,
                textAlign: 'center',
                top: 0,
                width: '100%',
                zIndex: 2,
              }}
              testID="housegains.join.codeInput"
              value={code}
            />
          </View>
        </View>

        {hasError ? (
          <Card style={{ borderColor: tokens.danger }} testID="housegains.join.error">
            <Label style={{ color: tokens.danger }}>
              {t('housegains.screens.join.invalidCode')}
            </Label>
          </Card>
        ) : null}
        {scannerError ? (
          <Label style={{ color: tokens.danger }}>
            {t('housegains.screens.join.scanUnavailable')}
          </Label>
        ) : null}

        <Button
          onPress={() => void startScan()}
          title={t('housegains.screens.join.scanQr')}
          variant="outline"
        />
        <View style={{ flex: 1 }} />
        <Button
          disabled={!codeIsValid || joining}
          onPress={() => void submit()}
          testID="housegains.join.submit"
          title={t('housegains.screens.join.joinButton')}
        />
      </Screen>
      {scanner}
    </>
  );
}
