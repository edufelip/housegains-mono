// Crash reporting: collection on in release only, and an error boundary with a localized fallback.
// Crash reports are not linked to a user (no setCrashlyticsUser), matching the privacy label.
import crashlytics from '@react-native-firebase/crashlytics';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Label, Screen } from '@/components/housegains/ui';
import { useHouseGainsTranslation } from '@/localization/housegains';

void crashlytics()
  .setCrashlyticsCollectionEnabled(!__DEV__)
  .catch(() => undefined);

function CrashFallback() {
  const { t } = useHouseGainsTranslation();
  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, gap: 14, justifyContent: 'center', padding: 24 }}
      testID="housegains.crashFallback"
    >
      <Label variant="heading">{t('housegains.account.crash.title')}</Label>
      <Label>{t('housegains.account.crash.body')}</Label>
    </Screen>
  );
}

/**
 * Wrap the app stack in this boundary (in `_layout.tsx`, inside ThemeProvider and
 * LocaleProvider). A render error is recorded to Crashlytics and replaced by the fallback.
 */
export class HouseGainsCrashBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    crashlytics().recordError(error);
  }

  render() {
    return this.state.failed ? <CrashFallback /> : this.props.children;
  }
}
