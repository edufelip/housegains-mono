import { ActivityIndicator, View } from 'react-native';
import { useAppearance } from '@/features/appearance';
import { SignInScreen, useAuth } from '@/features/auth';
import { HouseGainsApp } from '@/features/housegains-screens';
import { useHousehold } from '@/features/household';
import ThemePickerScreen from '@/features/onboarding/theme-picker-screen';
import { useLocale } from '@/localization/locale-context';

export default function HouseGainsEntry() {
  const { hydrated, selected, tokens } = useAppearance();
  const auth = useAuth();
  const household = useHousehold();
  const { diagnostic } = useLocale();
  const spinner = (
    <View
      style={{
        flex: 1,
        backgroundColor: tokens.canvas,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator color={tokens.primary} />
    </View>
  );
  if (!hydrated || auth.status === 'loading' || diagnostic.hydration === 'pending') return spinner;
  if (!selected) return <ThemePickerScreen onContinue={() => {}} />;
  if (auth.status === 'signedOut') return <SignInScreen />;
  if (!household.hydrated) return spinner;
  return <HouseGainsApp />;
}
