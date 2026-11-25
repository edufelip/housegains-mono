import remoteConfig from '@react-native-firebase/remote-config';
import { GAMIFICATION_FLAG_PARAM } from './gating';

/**
 * Value an earlier session activated. Same pattern as the style picker config
 * (features/appearance/picker-config-source.ts): wait for the activated values to load from disk,
 * then read. Never throws; Remote Config being unavailable reads as `false` (the bundled default).
 *
 * The picker's background `fetchAndActivate` (started once per cold start by ThemeProvider) fetches
 * every parameter, so a newly published flag value takes effect on the next cold start, never mid-session.
 */
export async function loadActivatedGamificationFlag(): Promise<boolean> {
  try {
    const config = remoteConfig();
    await config.ensureInitialized();
    return config.getValue(GAMIFICATION_FLAG_PARAM).asBoolean() === true;
  } catch {
    // Unavailable Remote Config means the feature stays off.
    return false;
  }
}
