import { useEffect } from 'react';
import { GanhosToast } from '@/components/housegains/gamification/ganhos-toast';
import { useHousehold } from '@/features/household';
import { useHouseGainsTranslation } from '@/localization/housegains';
import { AchievementUnlockScreen } from './achievement-unlock-screen';
import {
  achievementEntry,
  achievementNameKey,
  amountKey,
  ruleLabelKey,
  tierKey,
  toastTitleKey,
  UNKNOWN_ACHIEVEMENT_ICON,
} from './gamification-catalog';
import { useGamification } from './gamification-provider';
import { LevelUpMoment } from './level-up-moment';
import { levelMoment } from './levels';
import type { Celebration } from './types';

/** Toast copy for one celebration: title, amount line, optional detail, announcement. */
function useToastCopy(celebration: Celebration) {
  const { t } = useHouseGainsTranslation();
  const hasAmount = celebration.amount !== undefined && celebration.amount !== 0;
  const amount = hasAmount ? celebration.amount : undefined;
  const formatAmount = (value: number) => t(amountKey(celebration.track), { amount: value });

  if (celebration.moment === 'badge') {
    const id = celebration.achievementId ?? '';
    const detail = t('housegains.gamification.toast.badgeDetail', {
      name: t(achievementNameKey(id)),
      tier: celebration.tier ? t(tierKey(celebration.tier)) : '',
    });
    const title = t('housegains.gamification.toast.title.badge');
    return {
      title,
      detail,
      amount,
      formatAmount,
      icon: achievementEntry(id)?.icon ?? UNKNOWN_ACHIEVEMENT_ICON,
      announcement: [title, detail, amount === undefined ? null : formatAmount(amount)]
        .filter(Boolean)
        .join('. '),
    };
  }

  if (celebration.moment === 'streak') {
    const weeks = Number(celebration.data?.milestone ?? 0);
    const title = t('housegains.gamification.toast.title.streak', { weeks });
    const detail = t('housegains.gamification.streak.weekSecured');
    return {
      title,
      detail,
      amount,
      formatAmount,
      icon: 'flame' as const,
      announcement: [title, detail, amount === undefined ? null : formatAmount(amount)]
        .filter(Boolean)
        .join('. '),
    };
  }

  const title = t(toastTitleKey(celebration.copyKey, celebration.track));
  const parts =
    celebration.parts && celebration.parts.length > 1
      ? celebration.parts
          .map((part) =>
            t('housegains.gamification.toast.part', {
              rule: t(ruleLabelKey(part.ruleId)),
              amount: part.amount,
            }),
          )
          .join(' · ')
      : undefined;
  return {
    title,
    detail: parts,
    amount,
    formatAmount,
    icon: celebration.track === 'zelo' ? ('heart' as const) : ('sparkles' as const),
    announcement: [title, amount === undefined ? null : formatAmount(amount)]
      .filter(Boolean)
      .join('. '),
  };
}

function CelebrationToast({
  celebration,
  onDismiss,
}: {
  celebration: Celebration;
  onDismiss: () => void;
}) {
  const { t } = useHouseGainsTranslation();
  const copy = useToastCopy(celebration);
  return (
    <GanhosToast
      amount={copy.amount}
      announcement={copy.announcement}
      detail={copy.detail}
      dismissLabel={t('housegains.gamification.toast.dismiss')}
      formatAmount={copy.formatAmount}
      icon={copy.icon}
      onDismiss={onDismiss}
      title={copy.title}
    />
  );
}

/**
 * Renders what the celebration queue is showing right now: a toast, the streak milestone, the
 * level-up moment, or the one full-screen achievement unlock of the session. Renders nothing when
 * gamification is not visible, so the app is unchanged with the flag off.
 */
export function CelebrationHost() {
  const { visible, active, dismissCelebration } = useGamification();
  const { currentMember } = useHousehold();
  // A Ganhos level celebration at or below the member's displayed level floor is not a level-up in
  // the app (backfilled members keep their old-curve level): acknowledge it without showing it.
  // Organizer (Zelo) level-ups have their own curve and are never compared with the member level.
  const moment =
    active?.kind === 'level' && active.celebration.track === 'ganhos'
      ? levelMoment(active.celebration.level, {
          xp: currentMember.xp ?? 0,
          xpPeak: currentMember.xpPeak,
          levelFloor: currentMember.levelFloor,
        })
      : null;
  const skipId = visible && active && moment && !moment.show ? active.celebration.id : null;
  useEffect(() => {
    if (skipId) dismissCelebration(skipId);
  }, [skipId, dismissCelebration]);
  if (!visible || !active || skipId) return null;
  const { celebration } = active;
  const dismiss = () => dismissCelebration(celebration.id);

  switch (active.kind) {
    case 'unlock':
      return (
        <AchievementUnlockScreen
          celebration={celebration}
          key={celebration.id}
          onContinue={dismiss}
        />
      );
    case 'level':
      return (
        <LevelUpMoment
          key={celebration.id}
          level={moment?.level ?? celebration.level ?? 1}
          onDismiss={dismiss}
          track={celebration.track}
        />
      );
    default:
      return (
        <CelebrationToast celebration={celebration} key={celebration.id} onDismiss={dismiss} />
      );
  }
}
