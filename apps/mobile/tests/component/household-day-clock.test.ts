import { AppState } from 'react-native';
import { dayKey, subscribeToDayTicks } from '@/features/household/household-day-clock';

it('follows the household day, not only the UTC day', () => {
  // 02:00 UTC is still the previous evening in São Paulo (UTC-3).
  const at = new Date('2026-11-16T02:00:00.000Z');
  const later = new Date('2026-11-16T03:30:00.000Z');
  expect(dayKey(at, 'America/Sao_Paulo')).toBe('2026-11-16|2026-11-15');
  expect(dayKey(later, 'America/Sao_Paulo')).toBe('2026-11-16|2026-11-16');
});

it('ticks every minute and when the app returns to the foreground', () => {
  jest.useFakeTimers();
  let onAppState: ((state: string) => void) | undefined;
  const addListener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    onAppState = listener as (state: string) => void;
    return { remove: jest.fn() };
  });
  const onTick = jest.fn();
  const unsubscribe = subscribeToDayTicks(onTick);

  jest.advanceTimersByTime(60_000);
  expect(onTick).toHaveBeenCalledTimes(1);
  onAppState?.('active');
  expect(onTick).toHaveBeenCalledTimes(2);

  unsubscribe();
  jest.advanceTimersByTime(60_000);
  expect(onTick).toHaveBeenCalledTimes(2);
  addListener.mockRestore();
  jest.useRealTimers();
});
