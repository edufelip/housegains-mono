/** Per-user persistence of the rating banner state. Clients cannot write arbitrary `users/{uid}` fields (firestore.rules), so it lives on the device. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseRatingPromptState,
  serializeRatingPromptState,
  type RatingPromptState,
} from './rating-prompt';

export function ratingPromptKey(uid: string): string {
  return `housegains.rating.prompt.v1.${uid}`;
}

/** Rejects when storage cannot be read; callers must treat that as "not eligible right now". */
export async function loadRatingPromptState(uid: string): Promise<RatingPromptState> {
  return parseRatingPromptState(await AsyncStorage.getItem(ratingPromptKey(uid)));
}

export async function saveRatingPromptState(uid: string, state: RatingPromptState): Promise<void> {
  await AsyncStorage.setItem(ratingPromptKey(uid), serializeRatingPromptState(state));
}
