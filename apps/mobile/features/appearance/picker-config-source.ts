import remoteConfig from '@react-native-firebase/remote-config';

export const PICKER_CONFIG_PARAM = 'style_picker_config';

/** Value activated by an earlier session, parsed. null when unset, empty, or Remote Config is unavailable. Never throws. */
export async function loadActivatedPickerConfig(): Promise<unknown | null> {
  try {
    const config = remoteConfig();
    // Activated values load from disk asynchronously; reading before this returns the default.
    await config.ensureInitialized();
    const raw = config.getValue(PICKER_CONFIG_PARAM).asString();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Returning the raw string lets the validator report R1.
      return raw;
    }
  } catch {
    return null;
  }
}

/** Fetch + activate in the background for the NEXT cold start (R8). Never throws, never awaited by callers. */
export function refreshPickerConfigInBackground(): void {
  try {
    void remoteConfig()
      .setConfigSettings({ minimumFetchIntervalMillis: __DEV__ ? 0 : 3_600_000 })
      .then(() => remoteConfig().fetchAndActivate())
      .catch(() => undefined);
  } catch {
    // Ignored: the picker falls back to bundled styles.
  }
}
