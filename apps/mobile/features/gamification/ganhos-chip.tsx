import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Label } from '@/components/housegains/ui';
import { useAppearance } from '@/features/appearance';
import { useHouseGainsTranslation } from '@/localization/housegains';

/** The dashboard entry to the Ganhos wallet. Rendered once a household member is signed in. */
export function GanhosChip({ balance, onPress }: { balance: number; onPress: () => void }) {
  const { tokens } = useAppearance();
  const { t } = useHouseGainsTranslation();
  return (
    <Pressable
      accessibilityLabel={t('housegains.gamification.chip.a11y', {
        amount: t('housegains.gamification.total.ganhos', { amount: balance }),
      })}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        borderRadius: tokens.radius,
        borderWidth: tokens.borderWidth,
        flexDirection: 'row',
        gap: tokens.spacing.xs,
        minHeight: tokens.touchTarget.min,
        paddingHorizontal: tokens.spacing.md,
      }}
      testID="housegains.ganhosChip"
    >
      <Ionicons color={tokens.primary} name="wallet-outline" size={tokens.iconSize.md} />
      <Label testID="housegains.ganhosChip.label">
        {t('housegains.gamification.chip.label', { amount: balance })}
      </Label>
    </Pressable>
  );
}
