import Constants from 'expo-constants';

/** Empty until the Google OAuth web client is provisioned; the Google button stays hidden then. */
export function googleWebClientId(): string {
  const id: unknown = Constants.expoConfig?.extra?.googleAuth?.webClientId;
  return typeof id === 'string' ? id.trim() : '';
}
