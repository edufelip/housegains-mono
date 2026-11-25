import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
} from 'react-native-reanimated';
import {
  MOTION,
  timed,
  useCountUp,
  useMotionReduced,
} from '@/components/housegains/gamification/motion';
import { Button, Card, Label, Screen } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { ScreenTitle } from '@/features/housegains-screens/screen-elements';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { AwayWeeksError } from './away-weeks-error';
import {
  MAX_AWAY_WEEKS_PER_YEAR,
  MEMBER_FOLGA_EVERY_WEEKS,
  MEMBER_MILESTONE_WEEKS,
  awayErrorForClient,
  dateKeyInTimeZone,
  milestoneReward,
  nextMilestone,
  streakStatus,
  upcomingMondays,
  validateAwayWeeks,
  type MessageRef,
} from './streak-rules';
import type { Wallet } from './types';

const AWAY_CHOICES = 8;

export type WeeklyStreakScreenProps = {
  wallet: Wallet | null;
  /** Household time zone, to decide which Mondays are in the future. */
  timeZone: string;
  onBack: () => void;
  /** Replaces the future away weeks; rejects with AwayWeeksError. */
  onSaveAwayWeeks: (weekStarts: string[]) => Promise<string[]>;
  /** The current instant; tests pin it. */
  now?: Date;
};

type CellStatus = 'counted' | 'missed' | 'away' | 'current';

function mondayOf(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const back = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

function formatWeek(dateKey: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function WeekCell({
  status,
  label,
  accessibilityLabel,
  index,
  testID,
}: {
  status: CellStatus;
  label: string;
  accessibilityLabel: string;
  index: number;
  testID: string;
}) {
  const { tokens } = useAppearance();
  const reduced = useMotionReduced();
  const filled = status === 'counted';
  const fill = useSharedValue(reduced || !filled ? 1 : 0);
  useEffect(() => {
    if (reduced || !filled) {
      fill.value = 1;
      return;
    }
    fill.value = 0;
    fill.value = withDelay(index * 80, timed(1, MOTION.weekCellFill), ReduceMotion.System);
  }, [fill, filled, index, reduced]);
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  const icon =
    status === 'counted'
      ? 'checkmark'
      : status === 'away'
        ? 'airplane-outline'
        : status === 'current'
          ? 'time-outline'
          : 'remove';
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={{ alignItems: 'center', flex: 1, gap: tokens.spacing.xxs }}
      testID={testID}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: tokens.surface,
          borderColor: tokens.border,
          borderRadius: tokens.radius,
          borderWidth: tokens.borderWidth,
          height: tokens.touchTarget.comfortable,
          justifyContent: 'center',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {filled ? (
          <Animated.View
            style={[
              {
                backgroundColor: tokens.primary,
                bottom: 0,
                left: 0,
                position: 'absolute',
                right: 0,
                top: 0,
              },
              fillStyle,
            ]}
          />
        ) : null}
        <Ionicons
          color={filled ? tokens.onPrimary : tokens.muted}
          name={icon}
          size={tokens.iconSize.md}
        />
      </View>
      <Label variant="caption">{label}</Label>
    </View>
  );
}

function messageText(
  t: (key: string, params?: Record<string, string | number>) => string,
  ref: MessageRef,
): string {
  return t(ref.key, ref.params);
}

export function WeeklyStreakScreen({
  wallet,
  timeZone,
  onBack,
  onSaveAwayWeeks,
  now,
}: WeeklyStreakScreenProps) {
  const { tokens } = useAppearance();
  const { t, locale } = useHouseGainsTranslation();
  const reduced = useMotionReduced();
  const streak = wallet?.streak ?? {
    current: 0,
    record: 0,
    lastCountedWeek: null,
    lastActionWeek: null,
    folgas: 0,
    folgaProgress: 0,
    awayWeeks: [] as string[],
  };
  const status = streakStatus(streak);
  const today = dateKeyInTimeZone(now ?? new Date(), timeZone);
  const thisWeek = mondayOf(today);

  const currentWeeks = streak.current;
  const ticked = useCountUp(Math.max(0, streak.current - 1), streak.current, MOTION.counterTick);
  const flame = useSharedValue(1);
  const chip = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    // Runs again when the count changes, so a new week replays the tick.
    if (status !== 'active' || currentWeeks <= 0) return;
    flame.value = reduced
      ? 1
      : withSequence(timed(1.25, MOTION.counterTick / 2), timed(1, MOTION.counterTick / 2));
    chip.value = reduced
      ? 1
      : withDelay(MOTION.milestoneChipDelay, timed(1, MOTION.counterTick), ReduceMotion.System);
  }, [chip, currentWeeks, flame, reduced, status]);
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flame.value }] }));
  const chipStyle = useAnimatedStyle(() => ({ opacity: chip.value }));

  const cells = useMemo(
    () =>
      [...(wallet?.recentWeeks ?? [])]
        .sort((left, right) => left.weekStart.localeCompare(right.weekStart))
        .map((week, index): { weekStart: string; status: CellStatus; index: number } => ({
          weekStart: week.weekStart,
          status: streak.awayWeeks.includes(week.weekStart)
            ? 'away'
            : week.counted
              ? 'counted'
              : 'missed',
          index,
        })),
    [streak.awayWeeks, wallet?.recentWeeks],
  );
  const lastCounted = cells.length > 0 && cells[cells.length - 1].status === 'counted';

  const next = nextMilestone(streak.current);
  const futureAway = useMemo(
    () => streak.awayWeeks.filter((week) => week > today),
    [streak.awayWeeks, today],
  );
  const choices = useMemo(
    () => [...new Set([...upcomingMondays(today, AWAY_CHOICES), ...futureAway])].sort(),
    [today, futureAway],
  );
  const [selected, setSelected] = useState<string[]>(futureAway);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [errors, setErrors] = useState<MessageRef[]>([]);

  const toggle = (week: string) => {
    setSaveState('idle');
    setErrors([]);
    setSelected((current) =>
      current.includes(week) ? current.filter((item) => item !== week) : [...current, week].sort(),
    );
  };

  const save = async () => {
    const problems = validateAwayWeeks({ selected, existing: streak.awayWeeks, today });
    if (problems.length > 0) {
      setSaveState('idle');
      setErrors(problems.map(awayErrorForClient));
      return;
    }
    setErrors([]);
    setSaveState('saving');
    try {
      const stored = await onSaveAwayWeeks(selected);
      setSelected(stored.filter((week) => week > today));
      setSaveState('saved');
    } catch (cause) {
      setSaveState('idle');
      setErrors([
        cause instanceof AwayWeeksError
          ? cause.ref
          : { key: 'housegains.gamification.away.error.generic' },
      ]);
    }
  };

  const awayYear = today.slice(0, 4);
  const usedThisYear = new Set([...streak.awayWeeks.filter((week) => week <= today), ...selected]);
  const usedCount = [...usedThisYear].filter((week) => week.startsWith(awayYear)).length;

  const plural = (base: string, count: number) =>
    t(`housegains.gamification.streak.${base}${count === 1 ? 'One' : 'Other'}`, { count });

  return (
    <Screen
      contentContainerStyle={{ gap: tokens.spacing.md, padding: tokens.layout.gutter }}
      testID="housegains.streak"
    >
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          onPress={onBack}
          testID="housegains.streak.back"
          title={t('housegains.screens.common.back')}
          variant="ghost"
        />
      </View>
      <ScreenTitle title={t('housegains.gamification.streak.title')} />

      <Card style={{ gap: tokens.spacing.sm }} testID="housegains.streak.hero">
        {status === 'active' ? (
          <>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.md }}>
              <Animated.View style={flameStyle}>
                <Ionicons color={tokens.accent} name="flame" size={tokens.iconSize.lg * 2} />
              </Animated.View>
              <View style={{ flex: 1 }}>
                <Label
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  testID="housegains.streak.counter"
                  variant="display"
                >
                  {ticked}
                </Label>
                <Label testID="housegains.streak.count">{plural('count', streak.current)}</Label>
              </View>
            </View>
            <Label testID="housegains.streak.record" variant="caption">
              {plural('record', streak.record)}
            </Label>
            {lastCounted ? (
              <Label accessibilityLiveRegion="polite" testID="housegains.streak.secured">
                {t('housegains.gamification.streak.weekSecured')}
              </Label>
            ) : null}
            {next ? (
              <Animated.View style={chipStyle}>
                <View
                  style={{
                    alignSelf: 'flex-start',
                    borderColor: tokens.border,
                    borderRadius: tokens.radius,
                    borderWidth: tokens.borderWidth,
                    paddingHorizontal: tokens.spacing.sm,
                    paddingVertical: tokens.spacing.xs,
                  }}
                  testID="housegains.streak.nextMilestone"
                >
                  <Label variant="caption">
                    {t('housegains.gamification.streak.milestones.next', {
                      weeks: next.weeks,
                      reward: next.reward,
                    })}
                  </Label>
                </View>
              </Animated.View>
            ) : (
              <Label variant="caption">{t('housegains.gamification.streak.milestones.done')}</Label>
            )}
          </>
        ) : status === 'broken' ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.md }}>
            <Ionicons color={tokens.muted} name="flame-outline" size={tokens.iconSize.lg * 2} />
            <Label style={{ flex: 1 }} testID="housegains.streak.broken">
              {plural('broken', streak.record)}
            </Label>
          </View>
        ) : (
          <View style={{ gap: tokens.spacing.xs }} testID="housegains.streak.none">
            <Label variant="heading">{t('housegains.gamification.streak.none.title')}</Label>
            <Label>{t('housegains.gamification.streak.none.body')}</Label>
          </View>
        )}
      </Card>

      <Card style={{ gap: tokens.spacing.sm }}>
        <Label accessibilityRole="header" variant="heading">
          {t('housegains.gamification.streak.weeks.title')}
        </Label>
        {cells.length === 0 ? (
          <Label variant="caption">{t('housegains.gamification.streak.weeks.empty')}</Label>
        ) : null}
        <View
          style={{ flexDirection: 'row', gap: tokens.spacing.xs }}
          testID="housegains.streak.weeks"
        >
          {cells.map((cell) => (
            <WeekCell
              accessibilityLabel={t(`housegains.gamification.streak.week.${cell.status}`, {
                date: formatWeek(cell.weekStart, locale),
              })}
              index={cell.index}
              key={cell.weekStart}
              label={formatWeek(cell.weekStart, locale)}
              status={cell.status}
              testID={`housegains.streak.week.${cell.weekStart}`}
            />
          ))}
          <WeekCell
            accessibilityLabel={t('housegains.gamification.streak.week.current')}
            index={cells.length}
            label={t('housegains.gamification.streak.thisWeek')}
            status="current"
            testID={`housegains.streak.week.${thisWeek}`}
          />
        </View>
      </Card>

      <Card style={{ gap: tokens.spacing.xs }} testID="housegains.streak.folgas">
        <Label accessibilityRole="header" variant="heading">
          {t('housegains.gamification.streak.folgas.title')}
        </Label>
        <Label testID="housegains.streak.folgas.count">
          {t('housegains.gamification.streak.folgas.count', { count: streak.folgas })}
        </Label>
        <Label variant="caption">
          {t('housegains.gamification.streak.folgas.progress', {
            progress: streak.folgaProgress,
            needed: MEMBER_FOLGA_EVERY_WEEKS,
          })}
        </Label>
        <Label variant="caption">
          {t('housegains.gamification.streak.folgas.hint', { weeks: MEMBER_FOLGA_EVERY_WEEKS })}
        </Label>
      </Card>

      <Card style={{ gap: tokens.spacing.xs }} testID="housegains.streak.milestones">
        <Label accessibilityRole="header" variant="heading">
          {t('housegains.gamification.streak.milestones.title')}
        </Label>
        {MEMBER_MILESTONE_WEEKS.map((weeks) => {
          const reached = streak.record >= weeks;
          return (
            <View
              key={weeks}
              style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.xs }}
              testID={`housegains.streak.milestone.${weeks}`}
            >
              <Ionicons
                color={reached ? tokens.success : tokens.muted}
                name={reached ? 'checkmark-circle' : 'ellipse-outline'}
                size={tokens.iconSize.md}
              />
              <Label>
                {reached
                  ? t('housegains.gamification.streak.milestone.reached', { weeks })
                  : t('housegains.gamification.streak.milestone.upcoming', {
                      weeks,
                      reward: milestoneReward(weeks) ?? 0,
                    })}
              </Label>
            </View>
          );
        })}
      </Card>

      <Card style={{ gap: tokens.spacing.sm }} testID="housegains.streak.away">
        <Label accessibilityRole="header" variant="heading">
          {t('housegains.gamification.away.title')}
        </Label>
        <Label>{t('housegains.gamification.away.body', { max: MAX_AWAY_WEEKS_PER_YEAR })}</Label>
        <Label variant="caption">
          {t('housegains.gamification.away.used', {
            count: usedCount,
            max: MAX_AWAY_WEEKS_PER_YEAR,
            year: awayYear,
          })}
        </Label>
        <Label variant="eyebrow">{t('housegains.gamification.away.pick')}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.xs }}>
          {choices.map((week) => {
            const on = selected.includes(week);
            return (
              <Pressable
                accessibilityLabel={t('housegains.gamification.away.week', {
                  date: formatWeek(week, locale),
                })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                key={week}
                onPress={() => toggle(week)}
                style={{
                  alignItems: 'center',
                  backgroundColor: on ? tokens.primary : tokens.surface,
                  borderColor: tokens.border,
                  borderRadius: tokens.radius,
                  borderWidth: tokens.borderWidth,
                  flexDirection: 'row',
                  gap: tokens.spacing.xxs,
                  minHeight: tokens.touchTarget.min,
                  paddingHorizontal: tokens.spacing.sm,
                }}
                testID={`housegains.streak.away.week.${week}`}
              >
                <Ionicons
                  color={on ? tokens.onPrimary : tokens.muted}
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={tokens.iconSize.sm}
                />
                <Label style={{ color: on ? tokens.onPrimary : tokens.text }}>
                  {formatWeek(week, locale)}
                </Label>
              </Pressable>
            );
          })}
        </View>
        {errors.length > 0 ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ gap: tokens.spacing.xxs }}
            testID="housegains.streak.away.errors"
          >
            {errors.map((error, index) => (
              <View
                key={`${error.key}-${index}`}
                style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.xs }}
              >
                <Ionicons
                  color={tokens.danger}
                  name="alert-circle-outline"
                  size={tokens.iconSize.md}
                />
                <Label style={{ color: tokens.danger, flex: 1 }}>{messageText(t, error)}</Label>
              </View>
            ))}
          </View>
        ) : null}
        {saveState === 'saved' ? (
          <Label accessibilityLiveRegion="polite" testID="housegains.streak.away.saved">
            {t('housegains.gamification.away.saved')}
          </Label>
        ) : null}
        <Button
          disabled={saveState === 'saving'}
          onPress={() => void save()}
          testID="housegains.streak.away.save"
          title={t(
            saveState === 'saving'
              ? 'housegains.gamification.away.saving'
              : 'housegains.gamification.away.save',
          )}
        />
      </Card>
    </Screen>
  );
}
