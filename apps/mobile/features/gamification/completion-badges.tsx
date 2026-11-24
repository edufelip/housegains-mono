import { View } from 'react-native';
import { AchievementMedal } from '@/components/housegains/gamification/achievement-medal';
import { Card, Label } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';
import {
  achievementDescriptionKey,
  achievementEntry,
  achievementNameKey,
  amountKey,
  tierKey,
  UNKNOWN_ACHIEVEMENT_ICON,
} from './gamification-catalog';
import type { Celebration } from './types';

/**
 * Achievements earned by the action that completed the chore, shown inside the S3 completion
 * screen instead of a second full screen.
 */
export function CompletionBadges({ badges }: { badges: Celebration[] }) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  if (badges.length === 0) return null;
  return (
    <Card style={{ gap: tokens.spacing.md }} testID="housegains.celebration.badges">
      <Label accessibilityRole="header" variant="heading">
        {t('housegains.gamification.completion.badgesTitle')}
      </Label>
      {badges.map((badge) => {
        const id = badge.achievementId ?? '';
        const tier = badge.tier ?? 'bronze';
        return (
          <View
            accessible
            accessibilityLabel={[
              t(achievementNameKey(id)),
              t('housegains.gamification.tier.label', { tier: t(tierKey(tier)) }),
              badge.amount ? t(amountKey(badge.track), { amount: badge.amount }) : '',
            ]
              .filter(Boolean)
              .join('. ')}
            key={badge.id}
            style={{ alignItems: 'center', flexDirection: 'row', gap: tokens.spacing.md }}
            testID={`housegains.celebration.badge.${id}`}
          >
            <AchievementMedal
              icon={achievementEntry(id)?.icon ?? UNKNOWN_ACHIEVEMENT_ICON}
              size={56}
              tier={tier}
            />
            <View style={{ flex: 1, gap: tokens.spacing.xxs }}>
              <Label>{t(achievementNameKey(id))}</Label>
              <Label variant="caption">
                {t('housegains.gamification.tier.label', { tier: t(tierKey(tier)) })}
              </Label>
              <Label variant="caption">{t(achievementDescriptionKey(id))}</Label>
            </View>
            {badge.amount ? (
              <Label variant="heading">{t(amountKey(badge.track), { amount: badge.amount })}</Label>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}
