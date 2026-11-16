import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_700Bold,
  useFonts,
} from '@expo-google-fonts/geist';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { statusBarStyleFor, ThemeProvider, useAppearance } from '@/features/appearance';
import { AuthProvider } from '@/features/auth';
import { HouseholdProvider } from '@/features/household';
import { HouseGainsCrashBoundary } from '@/features/observability/crashlytics';
import { LocaleProvider } from '@/localization/locale-context';

function HouseGainsStack() {
  const { tokens } = useAppearance();
  useFonts({ Geist_400Regular, Geist_500Medium, Geist_700Bold, GeistMono_500Medium });
  return (
    <>
      <StatusBar style={statusBarStyleFor(tokens.canvas)} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.canvas } }}
      />
    </>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <ThemeProvider>
          <HouseGainsCrashBoundary>
            <AuthProvider>
              <HouseholdProvider>
                <HouseGainsStack />
              </HouseholdProvider>
            </AuthProvider>
          </HouseGainsCrashBoundary>
        </ThemeProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
