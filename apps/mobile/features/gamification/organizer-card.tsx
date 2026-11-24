import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { AchievementMedal } from '@/components/housegains/gamification/achievement-medal';
import { MOTION, timed, useMotionReduced } from '@/components/housegains/gamification/motion';
import { ProgressRing } from '@/components/housegains/gamification/progress-ring';
import { Card, Label, StatePanel } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';
import {
  ORGANIZER_ACHIEVEMENTS,
  achievementNameKey,
  tierKey,
  totalKey,
} from './gamification-catalog';
import { organizerTitleKey } from './levels';
import { streakStatus } from './streak-rules';
import type { LoadStatus } from './gamification-provider';
import type { Organizer, OrganizerWeek } from './types';

export type OrganizerCardProps = {
  status: LoadStatus;
  /** `null` before the organizer earned anything. */
  organizer: Organizer | null;
  creatorName: string;
  onRetry: () => void;
};

const HEALTH_BAR_HEIGHT = 48;

/** On-time rate over the recent closed weeks, 0..1 (null without any due instance). */
export function onTimeRate(weeks: readonly OrganizerWeek[]): number | null {
  const due = weeks.reduce((sum, week) => sum + week.due, 0);
  if (due <= 0) return null;
  return Math.min(1, weeks.reduce((sum, week) => sum + week.onTime, 0) / due);
}

function HealthBar({
  week,
  locale,
  label,
}: {
  week: OrganizerWeek;
  locale: string;
  label: string;
}) {
  const { tokens } = useAppearance();
  const reduced = useMotionReduced();
  const rate = week.due > 0 ? Math.min(1, week.onTime / week.due) : 0;
  const grow = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    grow.value = reduced ? 1 : timed(1, MOTION.healthBars);
  }, [grow, reduced]);
  const style = useAnimatedStyle(() => ({ height: HEALTH_BAR_HEIGHT * rate * grow.value }));
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${week.weekStart}T00:00:00.000Z`));
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ alignItems: 'center', flex: 1, gap: tokens.spacing.xxs }}
      testID={`housegains.organizer.week.${week.weekStart}`}
    >
      <View style={{ height: HEALTH_BAR_HEIGHT, justifyContent: 'flex-end', width: '100%' }}>
        <Animated.View
          style={[
            {
              backgroundColor: tokens.primary,
              borderRadius: tokens.spacing.xxs,
              minHeight: week.due > 0 ? 2 : 0,
            },
            style,
          ]}
        />
      </View>
      <Label variant="caption">{date}</Label>
    </View>
  );
}

/**
 * The household organizer (the creator) on Ranks: Care (Zelo), organizer title, the
 * "house up to date" streak, the recent on-time rate and organizer achievements. Every member
 * can see it; it never shows spendable balances.
 */
export function OrganizerCard({ status, organizer, creatorName, onRetry }: OrganizerCardProps) {
  const { tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();

  if (status === 'loading') {
    return (
      <StatePanel
        kind="loading"
        testID="housegains.organizer.loading"
        title={t('housegains.screens.common.loading')}
      />
    );
  }
  if (status === 'error') {
    return (
      <StatePanel
        actionTitle={t('housegains.screens.common.retry')}
        kind="error"
        onAction={onRetry}
        testID="housegains.organizer.error"
        title={t('housegains.screens.common.loadErrorTitle')}
      />
    );
  }

  const zelo = organizer?.zelo ?? 0;
  const titleKey = organizerTitleKey(zelo);
  const title = t(`housegains.gamification.organizer.rank.${titleKey}`);
  const streak = organizer?.streak ?? {
    current: 0,
    record: 0,
    lastCountedWeek: null,
    lastActionWeek: null,
    folgas: 0,
    folgaProgress: 0,
  };
  const streakState = streakStatus(streak);
  const weeks = organizer?.orderWeeks ?? [];
  const rate = onTimeRate(weeks);
  const percent = rate === null ? 0 : Math.round(rate * 100);
  const unlocked = ORGANIZER_ACHIEVEMENTS.filter(({ id }) => organizer?.achievements[id]);

  return (
    <Card style={{ gap: tokens.spacing.md }} testID="housegains.organizer.card">
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.sm }}>
        <Ionicons color={tokens.accent} name="ribbon-outline" size={tokens.iconSize.lg} />
        <View
          accessible
          accessibilityLabel={t('housegains.gamification.organizer.a11y', {
            title,
            zelo: t(totalKey('zelo'), { amount: zelo }),
          })}
          style={{ flex: 1, gap: tokens.spacing.xxs }}
        >
          <Label variant="eyebrow">{t('housegains.gamification.organizer.title')}</Label>
          <Label variant="heading">{creatorName}</Label>
          <Label testID="housegains.organizer.rank" variant="caption">
            {t('housegains.gamification.organizer.level', {
              level: organizer?.level ?? 1,
              title,
            })}
          </Label>
        </View>
        <Label testID="housegains.organizer.zelo" variant="heading">
          {t(totalKey('zelo'), { amount: zelo })}
        </Label>
      </View>

      <View style={{ gap: tokens.spacing.xxs }} testID="housegains.organizer.streak">
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.xs }}>
          <Ionicons
            color={streakState === 'active' ? tokens.accent : tokens.muted}
            name={streakState === 'active' ? 'flame' : 'flame-outline'}
            size={tokens.iconSize.md}
          />
          <Label>{t('housegains.gamification.organizer.streakLabel')}</Label>
        </View>
        <Label testID="housegains.organizer.streak.text" variant="caption">
          {streakState === 'active'
            ? t(`housegains.gamification.streak.count${streak.current === 1 ? 'One' : 'Other'}`, {
                count: streak.current,
              })
            : streakState === 'broken'
              ? t('housegains.gamification.organizer.streakBroken', { count: streak.record })
              : t('housegains.gamification.organizer.streakNone')}
        </Label>
      </View>

      <View style={{ gap: tokens.spacing.xs }} testID="housegains.organizer.health">
        <Label variant="eyebrow">{t('housegains.gamification.organizer.health.title')}</Label>
        {rate === null ? (
          <Label variant="caption">{t('housegains.gamification.organizer.health.empty')}</Label>
        ) : (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.md }}>
            <ProgressRing
              accessibilityLabel={t('housegains.gamification.organizer.health.rate', { percent })}
              color={tokens.primary}
              durationMs={MOTION.healthRing}
              fraction={rate}
              size={72}
              strokeWidth={7}
              trackColor={tokens.border}
            >
              <Label testID="housegains.organizer.health.percent">
                {new Intl.NumberFormat(locale, { style: 'percent' }).format(percent / 100)}
              </Label>
            </ProgressRing>
            <View style={{ flex: 1, flexDirection: 'row', gap: tokens.spacing.xs }}>
              {weeks.slice(-4).map((week) => (
                <HealthBar
                  key={week.weekStart}
                  label={t('housegains.gamification.organizer.health.week', {
                    date: week.weekStart,
                    onTime: week.onTime,
                    due: week.due,
                  })}
                  locale={locale}
                  week={week}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={{ gap: tokens.spacing.xs }} testID="housegains.organizer.achievements">
        <Label variant="eyebrow">{t('housegains.gamification.organizer.achievementsTitle')}</Label>
        {unlocked.length === 0 ? (
          <Label variant="caption">
            {t('housegains.gamification.organizer.achievementsEmpty')}
          </Label>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
            {unlocked.map((entry) => {
              const state = organizer?.achievements[entry.id];
              return (
                <View
                  accessible
                  accessibilityLabel={`${t(achievementNameKey(entry.id))}. ${t('housegains.gamification.tier.label', { tier: state ? t(tierKey(state.tier)) : '' })}`}
                  key={entry.id}
                  style={{ alignItems: 'center', gap: tokens.spacing.xxs, maxWidth: 96 }}
                  testID={`housegains.organizer.achievement.${entry.id}`}
                >
                  <AchievementMedal
                    icon={entry.icon}
                    paused={state?.active === false}
                    size={52}
                    tier={state?.tier}
                  />
                  <Label style={{ textAlign: 'center' }} variant="caption">
                    {t(achievementNameKey(entry.id))}
                  </Label>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Card>
  );
}
