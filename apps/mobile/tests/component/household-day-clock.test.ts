import { AppState } from 'react-native';
import { subscribeToUtcDayChanges } from '@/features/household/household-day-clock';

it('refreshes the day key at UTC midnight and when the app returns to foreground', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-15T23:59:30.000Z'));
  let onAppState: ((state: string) => void) | undefined;
  const addListener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    onAppState = listener as (state: string) => void;
    return { remove: jest.fn() };
  });
  const dayKeys: string[] = [];
  const unsubscribe = subscribeToUtcDayChanges((key) => dayKeys.push(key));

  jest.advanceTimersByTime(30_000);
  expect(dayKeys).toEqual(['2026-11-16']);
  jest.setSystemTime(new Date('2026-11-17T01:00:00.000Z'));
  onAppState?.('active');
  expect(dayKeys).toEqual(['2026-11-16', '2026-11-17']);

  unsubscribe();
  addListener.mockRestore();
  jest.useRealTimers();
});
