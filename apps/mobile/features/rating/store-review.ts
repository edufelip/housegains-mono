import * as StoreReview from 'expo-store-review';
import { Linking } from 'react-native';

export type StoreRatingOutcome = 'requested' | 'store-opened' | 'unavailable';

/**
 * Asks the OS for the native in-app review dialog and falls back to the store page. 'unavailable'
 * means neither is possible (for example no store URL is configured and the device has no native
 * dialog). Rejects when the OS call itself fails.
 */
export async function requestStoreRating(): Promise<StoreRatingOutcome> {
  if (!(await StoreReview.hasAction())) return 'unavailable';
  if (await StoreReview.isAvailableAsync()) {
    await StoreReview.requestReview();
    return 'requested';
  }
  const url = StoreReview.storeUrl();
  if (url === null) return 'unavailable';
  await Linking.openURL(url);
  return 'store-opened';
}
