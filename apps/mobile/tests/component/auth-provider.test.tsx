import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';

jest.mock('@/features/appearance', () => ({ useAppearance: () => ({ themeId: 'soft' }) }));
jest.mock('@/localization/locale-context', () => ({
  useLocale: () => ({ activeLocale: 'en-US' }),
}));

const fake = (globalThis as unknown as { mockFirebase: any }).mockFirebase;
const user = { uid: 'member-1', email: 'member@example.com', displayName: 'Member' };
async function renderAuth() {
  return await render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );
}

function AuthProbe() {
  const value = useAuth();
  return (
    <>
      <Text>{value.status}</Text>
      <Text>{value.signInProblem ?? 'no problem'}</Text>
      <Pressable
        testID="auth.email"
        onPress={() => void value.signInWithEmail('member@example.com', 'pw')}
      />
      <Pressable testID="auth.clearProblem" onPress={() => value.clearSignInProblem()} />
      <Pressable
        testID="auth.register"
        onPress={() => void value.createAccountWithEmail('New Name', 'member@example.com', 'pw')}
      />
    </>
  );
}

beforeEach(() => {
  fake.currentUser = user;
  fake.docs = {};
  fake.calls = [];
  fake.authStateListener = undefined;
});

it('uses a cached profile to sign in without waiting for ensureProfile', async () => {
  fake.docs['users/member-1'] = { displayName: 'Member' };
  const view = await renderAuth();
  await waitFor(() => expect(fake.authStateListener).toBeDefined());

  await act(async () => fake.authStateListener?.(user));

  await waitFor(() => expect(view.getByText('signedIn')).toBeTruthy());
  expect(fake.calls).toEqual([]);
});

it('creates a missing profile once through the central auth-state path', async () => {
  const view = await renderAuth();
  await waitFor(() => expect(fake.authStateListener).toBeDefined());

  await fireEvent.press(view.getByTestId('auth.email'));
  expect(fake.calls).toEqual([]);
  await act(async () => fake.authStateListener?.(user));

  await waitFor(() => expect(view.getByText('signedIn')).toBeTruthy());
  expect(fake.calls.map(({ name }: { name: string }) => name)).toEqual(['ensureProfile']);
});

it('ignores a late auth-state result for a different current account', async () => {
  const view = await renderAuth();
  await waitFor(() => expect(fake.authStateListener).toBeDefined());
  fake.currentUser = { ...user, uid: 'new-account' };

  await act(async () => fake.authStateListener?.(user));

  expect(view.getByText('loading')).toBeTruthy();
  expect(fake.calls).toEqual([]);
});

it('keeps a registration name for the central profile creation call', async () => {
  const view = await renderAuth();
  await waitFor(() => expect(fake.authStateListener).toBeDefined());

  await fireEvent.press(view.getByTestId('auth.register'));
  await act(async () => fake.authStateListener?.(user));

  await waitFor(() => expect(view.getByText('signedIn')).toBeTruthy());
  expect(fake.calls[0]?.data).toEqual({
    displayName: 'New Name',
    locale: 'en-US',
    themeId: 'soft',
  });
});

it('signs out of Firebase when profile setup fails, so signing in again fires a new auth event', async () => {
  fake.failures = { ensureProfile: { code: 'unavailable' } };
  fake.signOuts = 0;
  const view = await renderAuth();
  await waitFor(() => expect(fake.authStateListener).toBeDefined());

  await act(async () => fake.authStateListener?.(user));

  await waitFor(() => expect(view.getByText('signedOut')).toBeTruthy());
  expect(view.getByText('housegains.auth.error.network')).toBeTruthy();
  expect(fake.signOuts).toBe(1);
  fake.failures = {};
});

it('reports a profile setup failure that has no clearer message', async () => {
  fake.failures = { ensureProfile: { code: 'internal' } };
  const view = await renderAuth();
  await waitFor(() => expect(fake.authStateListener).toBeDefined());

  await act(async () => fake.authStateListener?.(user));

  await waitFor(() => expect(view.getByText('signedOut')).toBeTruthy());
  expect(view.getByText('housegains.auth.error.profileSetup')).toBeTruthy();
  fake.failures = {};
});

it('keeps the Firebase session when only the profile read fails, e.g. offline', async () => {
  fake.signOuts = 0;
  const view = await renderAuth();
  await waitFor(() => expect(fake.authStateListener).toBeDefined());
  const get = fake.failProfileRead;
  fake.failProfileRead = true;

  await act(async () => fake.authStateListener?.(user));

  await waitFor(() => expect(view.getByText('signedOut')).toBeTruthy());
  expect(fake.signOuts).toBe(0);
  fake.failProfileRead = get;
});

it('clears a sign-in problem when the user dismisses it', async () => {
  fake.failures = { ensureProfile: { code: 'internal' } };
  const view = await renderAuth();
  await waitFor(() => expect(fake.authStateListener).toBeDefined());
  await act(async () => fake.authStateListener?.(user));
  await waitFor(() => expect(view.getByText('housegains.auth.error.profileSetup')).toBeTruthy());
  fake.failures = {};

  await fireEvent.press(view.getByTestId('auth.clearProblem'));

  expect(view.queryByText('housegains.auth.error.profileSetup')).toBeNull();
  expect(view.getByText('no problem')).toBeTruthy();
});

it('clears the previous sign-in problem when a new sign-in attempt starts', async () => {
  fake.failures = { ensureProfile: { code: 'internal' } };
  const view = await renderAuth();
  await waitFor(() => expect(fake.authStateListener).toBeDefined());
  await act(async () => fake.authStateListener?.(user));
  await waitFor(() => expect(view.getByText('housegains.auth.error.profileSetup')).toBeTruthy());
  fake.failures = {};

  await fireEvent.press(view.getByTestId('auth.email'));

  await waitFor(() => expect(view.getByText('no problem')).toBeTruthy());
});
