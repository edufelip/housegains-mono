import { AppState } from 'react-native';
import { dateKeyInTimeZone, deviceTimeZone } from './household-rules';

/** Changes when the UTC day (query windows) or the household's day (Today, streaks) changes. */
export function dayKey(date: Date, timeZone = deviceTimeZone()): string {
  return `${date.toISOString().slice(0, 10)}|${dateKeyInTimeZone(date, timeZone)}`;
}

/** Calls onTick every minute and when the app returns to the foreground. */
export function subscribeToDayTicks(onTick: () => void): () => void {
  const timer = setInterval(onTick, 60_000);
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') onTick();
  });
  return () => {
    clearInterval(timer);
    subscription.remove();
  };
}
