import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { AchievementMedal } from '@/components/housegains/gamification/achievement-medal';
import { MOTION, useCountUp } from '@/components/housegains/gamification/motion';
import { ProgressRing } from '@/components/housegains/gamification/progress-ring';
import { Button, Card, Label, Screen, StatePanel } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { ScreenTitle } from '@/features/housegains-screens/screen-elements';
import { deriveProgression } from '@/features/housegains-screens/screen-model';
import { useHouseGainsTranslation } from '@/localization/housegains';
import {
  ACHIEVEMENTS,
  achievementDescriptionKey,
  achievementNameKey,
  achievementEntry,
  ledgerRowLabel,
  tierKey,
  totalKey,
  UNKNOWN_ACHIEVEMENT_ICON,
} from './gamification-catalog';
import { levelProgress } from './levels';
import type { LoadStatus } from './gamification-provider';
import type { AchievementState, Wallet, WalletLedgerRow } from './types';
import type { Member } from '@/features/household';
import type { ComponentProps } from 'react';

export type WalletScreenProps = {
  status: LoadStatus;
  wallet: Wallet | null;
  ledger: WalletLedgerRow[];
  /** The signed-in member: level and XP come from the member document (contract C3). */
  member: Member;
  totalXp: number;
  /** Balance this screen showed last time, to count up from. */
  lastSeenBalance: number | null;
  onBalanceSeen: (balance: number) => void;
  onBack: () => void;
  onRetry: () => void;
  onOpenStreak: () => void;
};

function Pill({
  icon,
  text,
  testID,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  text: string;
  testID?: string;
}) {
  const { tokens } = useAppearance();
  return (
    <View
      style={{
        alignItems: 'center',
        borderColor: tokens.border,
        borderRadius: tokens.radius,
        borderWidth: tokens.borderWidth,
        flexDirection: 'row',
        gap: tokens.spacing.xxs,
        paddingHorizontal: tokens.spacing.xs,
        paddingVertical: tokens.spacing.xxs,
      }}
      testID={testID}
    >
      <Ionicons color={tokens.muted} name={icon} size={tokens.iconSize.sm} />
      <Label variant="caption">{text}</Label>
    </View>
  );
}

function AchievementTile({ id, state }: { id: string; state: AchievementState | undefined }) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  const entry = achievementEntry(id);
  const paused = state?.active === false;
  const tierText = state ? t(tierKey(state.tier)) : '';
  const name = t(achievementNameKey(id));
  return (
    <View
      accessible
      accessibilityLabel={[
        name,
        state
          ? t('housegains.gamification.tier.label', { tier: tierText })
          : t('housegains.gamification.pill.locked'),
        paused ? t('housegains.gamification.pill.paused') : '',
      ]
        .filter(Boolean)
        .join('. ')}
      style={{
        alignItems: 'center',
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        borderRadius: tokens.radius,
        borderWidth: tokens.borderWidth,
        flexBasis: '47%',
        flexGrow: 1,
        gap: tokens.spacing.xs,
        padding: tokens.spacing.sm,
      }}
      testID={`housegains.wallet.achievement.${id}`}
    >
      <AchievementMedal
        icon={entry?.icon ?? UNKNOWN_ACHIEVEMENT_ICON}
        paused={paused}
        size={64}
        tier={state?.tier}
      />
      <Label style={{ textAlign: 'center' }}>{name}</Label>
      {state ? (
        <Label testID={`housegains.wallet.achievement.${id}.tier`} variant="caption">
          {t('housegains.gamification.tier.label', { tier: tierText })}
        </Label>
      ) : (
        <Label variant="caption">{t(achievementDescriptionKey(id))}</Label>
      )}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: tokens.spacing.xxs,
          justifyContent: 'center',
        }}
      >
        {!state ? (
          <Pill
            icon="lock-closed-outline"
            testID={`housegains.wallet.achievement.${id}.locked`}
            text={t('housegains.gamification.pill.locked')}
          />
        ) : null}
        {entry?.kind === 'active' && state ? (
          <Pill
            icon={paused ? 'pause-circle-outline' : 'pulse-outline'}
            testID={`housegains.wallet.achievement.${id}.${paused ? 'paused' : 'active'}`}
            text={t(
              paused
                ? 'housegains.gamification.pill.paused'
                : 'housegains.gamification.pill.active',
            )}
          />
        ) : null}
        {entry?.kind === 'seasonal' ? (
          <Pill icon="leaf-outline" text={t('housegains.gamification.pill.seasonal')} />
        ) : null}
      </View>
    </View>
  );
}

export function WalletScreen({
  status,
  wallet,
  ledger,
  member,
  totalXp,
  lastSeenBalance,
  onBalanceSeen,
  onBack,
  onRetry,
  onOpenStreak,
}: WalletScreenProps) {
  const { tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const balance = wallet?.balance ?? 0;
  const shown = useCountUp(lastSeenBalance ?? 0, balance, MOTION.walletCountUp);
  const ready = status === 'ready';

  useEffect(() => {
    if (ready) onBalanceSeen(balance);
  }, [balance, onBalanceSeen, ready]);

  const header = (
    <>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          onPress={onBack}
          testID="housegains.wallet.back"
          title={t('housegains.screens.common.back')}
          variant="ghost"
        />
      </View>
      <ScreenTitle
        title={t('housegains.gamification.wallet.title')}
        description={t('housegains.gamification.wallet.description')}
      />
    </>
  );

  if (status === 'loading') {
    return (
      <Screen
        contentContainerStyle={{ gap: tokens.spacing.md, padding: tokens.layout.gutter }}
        testID="housegains.wallet"
      >
        {header}
        <StatePanel
          kind="loading"
          testID="housegains.wallet.loading"
          title={t('housegains.gamification.wallet.loading')}
        />
      </Screen>
    );
  }
  if (status === 'error') {
    return (
      <Screen
        contentContainerStyle={{ gap: tokens.spacing.md, padding: tokens.layout.gutter }}
        testID="housegains.wallet"
      >
        {header}
        <StatePanel
          actionTitle={t('housegains.screens.common.retry')}
          description={t('housegains.gamification.wallet.error.body')}
          kind="error"
          onAction={onRetry}
          testID="housegains.wallet.error"
          title={t('housegains.gamification.wallet.error.title')}
        />
      </Screen>
    );
  }
  if (wallet === null && ledger.length === 0) {
    return (
      <Screen
        contentContainerStyle={{ gap: tokens.spacing.md, padding: tokens.layout.gutter }}
        testID="housegains.wallet"
      >
        {header}
        <StatePanel
          actionTitle={t('housegains.gamification.wallet.streakCta')}
          description={t('housegains.gamification.wallet.empty.body')}
          kind="empty"
          onAction={onOpenStreak}
          testID="housegains.wallet.empty"
          title={t('housegains.gamification.wallet.empty.title')}
        />
      </Screen>
    );
  }

  const progression = deriveProgression(totalXp, member);
  const progress = levelProgress(progression.level, Math.max(member.xpPeak ?? 0, totalXp));
  const percent = Math.round(progress.fraction * 100);
  const achievements = wallet?.achievements ?? {};
  const memberTiles = ACHIEVEMENTS.filter(({ track }) => track === 'member').map(({ id }) => id);
  const extraIds = Object.keys(achievements).filter((id) => !achievementEntry(id));
  const unlockedCount = Object.keys(achievements).length;
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const signed = new Intl.NumberFormat(locale, { signDisplay: 'always' });
  const ganhosRows = ledger.filter((row) => row.track === 'ganhos');
  const pending = wallet?.pendingBalance ?? 0;

  return (
    <Screen
      contentContainerStyle={{ gap: tokens.spacing.md, padding: tokens.layout.gutter }}
      testID="housegains.wallet"
    >
      {header}

      <Card
        accessible
        accessibilityLabel={`${t('housegains.gamification.wallet.balanceLabel')}: ${t(totalKey('ganhos'), { amount: balance })}`}
        style={{ gap: tokens.spacing.xs }}
        testID="housegains.wallet.balance"
      >
        <Label variant="eyebrow">{t('housegains.gamification.wallet.balanceLabel')}</Label>
        <View
          style={{
            alignItems: 'baseline',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: tokens.spacing.xs,
          }}
        >
          <Label testID="housegains.wallet.balance.value" variant="display">
            {shown}
          </Label>
          <Label>{t('housegains.gamification.ganhos.name')}</Label>
        </View>
        {pending > 0 ? (
          <View style={{ gap: tokens.spacing.xxs }} testID="housegains.wallet.pending">
            <Label>
              {t('housegains.gamification.wallet.pending', {
                amount: t(totalKey('ganhos'), { amount: pending }),
              })}
            </Label>
            {wallet?.nextSpendableAt ? (
              <Label variant="caption">
                {t('housegains.gamification.wallet.pendingUntil', {
                  date: dateFormat.format(new Date(wallet.nextSpendableAt)),
                })}
              </Label>
            ) : null}
          </View>
        ) : null}
        <Label testID="housegains.wallet.lifetime" variant="caption">
          {t('housegains.gamification.wallet.lifetime', {
            amount: t(totalKey('ganhos'), { amount: wallet?.lifetimeEarned ?? 0 }),
          })}
        </Label>
      </Card>

      <Card
        style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.md }}
        testID="housegains.wallet.level"
      >
        <ProgressRing
          accessibilityLabel={t('housegains.gamification.wallet.levelRing', {
            level: progression.level,
            percent,
            next: progression.level + 1,
          })}
          color={tokens.primary}
          fraction={progress.fraction}
          size={84}
          strokeWidth={8}
          trackColor={tokens.border}
        >
          <Label variant="heading">{progression.level}</Label>
        </ProgressRing>
        <View style={{ flex: 1, gap: tokens.spacing.xxs }}>
          <Label testID="housegains.wallet.level.title" variant="heading">
            {t('housegains.screens.dashboard.levelTitle', {
              level: progression.level,
              title: t(`housegains.screens.dashboard.title.${progression.titleKey}`),
            })}
          </Label>
          <Label testID="housegains.wallet.level.progress" variant="caption">
            {t('housegains.gamification.wallet.levelProgress', {
              xp: progress.xpToNext,
              next: progression.level + 1,
            })}
          </Label>
        </View>
      </Card>

      <Pressable
        accessibilityLabel={t('housegains.gamification.wallet.streakCtaA11y')}
        accessibilityRole="button"
        onPress={onOpenStreak}
        testID="housegains.wallet.streak"
      >
        <Card style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.sm }}>
          <Ionicons color={tokens.accent} name="flame" size={tokens.iconSize.lg} />
          <View style={{ flex: 1 }}>
            <Label>{t('housegains.gamification.wallet.streakCta')}</Label>
            <Label variant="caption">
              {t(
                `housegains.gamification.streak.count${(wallet?.streak.current ?? 0) === 1 ? 'One' : 'Other'}`,
                { count: wallet?.streak.current ?? 0 },
              )}
            </Label>
          </View>
          <Ionicons color={tokens.muted} name="chevron-forward" size={tokens.iconSize.md} />
        </Card>
      </Pressable>

      <Card style={{ gap: tokens.spacing.sm }} testID="housegains.wallet.achievements">
        <Label accessibilityRole="header" variant="heading">
          {t('housegains.gamification.wallet.achievements.title')}
        </Label>
        <Label variant="caption">
          {unlockedCount === 0
            ? t('housegains.gamification.wallet.achievements.empty')
            : t('housegains.gamification.wallet.achievements.count', { count: unlockedCount })}
        </Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.xs }}>
          {[...memberTiles, ...extraIds].map((id) => (
            <AchievementTile id={id} key={id} state={achievements[id]} />
          ))}
        </View>
      </Card>

      <Card style={{ gap: tokens.spacing.sm }} testID="housegains.wallet.ledger">
        <Label accessibilityRole="header" variant="heading">
          {t('housegains.gamification.wallet.ledger.title')}
        </Label>
        {ganhosRows.length === 0 ? (
          <Label variant="caption">{t('housegains.gamification.wallet.ledger.empty')}</Label>
        ) : (
          ganhosRows.map((row, index) => {
            const label = ledgerRowLabel(row);
            const text = label.ruleKey ? t(label.key, { rule: t(label.ruleKey) }) : t(label.key);
            const amountText = `${signed.format(row.amount)} ${t('housegains.gamification.ganhos.name')}`;
            const dateText = row.createdAt ? dateFormat.format(new Date(row.createdAt)) : '';
            return (
              <Animated.View
                accessible
                accessibilityLabel={t('housegains.gamification.wallet.ledger.rowA11y', {
                  rule: text,
                  amount: amountText,
                  date: dateText,
                })}
                entering={FadeInDown.duration(200)
                  .delay(index * MOTION.rowStagger)
                  .reduceMotion(ReduceMotion.System)}
                key={row.key}
                style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.sm }}
                testID={`housegains.wallet.ledger.row.${row.key}`}
              >
                <View style={{ flex: 1 }}>
                  <Label>{text}</Label>
                  <Label variant="caption">{dateText}</Label>
                </View>
                <Label testID={`housegains.wallet.ledger.row.${row.key}.amount`} variant="heading">
                  {amountText}
                </Label>
              </Animated.View>
            );
          })
        )}
      </Card>
    </Screen>
  );
}
