import { AppState } from 'react-native';

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function subscribeToUtcDayChanges(onChange: (dayKey: string) => void): () => void {
  const refresh = () => onChange(utcDayKey(new Date()));
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    const now = new Date();
    const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    timer = setTimeout(() => {
      refresh();
      schedule();
    }, nextMidnight - now.getTime());
  };
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') refresh();
  });
  schedule();
  return () => {
    clearTimeout(timer);
    subscription.remove();
  };
}
