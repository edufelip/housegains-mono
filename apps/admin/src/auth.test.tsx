import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Captures the onAuthStateChanged callback so each test can "sign in" a user.
const h = vi.hoisted(() => ({
  callback: null as null | ((user: unknown) => void),
}));

vi.mock('./firebase', () => ({
  getFirebase: () => ({
    auth: { name: 'fake-auth' },
    functions: { name: 'fake-functions' },
  }),
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (user: unknown) => void) => {
    h.callback = cb;
    return () => {};
  }),
  signInWithPopup: vi.fn(async () => ({ user: { uid: 'u' } })),
  signOut: vi.fn(async () => {}),
}));

vi.mock('./api', async () => {
  const { createApiMock } = await import('./test/api-mock');
  return { api: createApiMock() };
});

import { App } from './App';
import { api } from './api';
import { signInWithPopup } from 'firebase/auth';

const apiMock = vi.mocked(api);
const popupMock = vi.mocked(signInWithPopup);

function fakeUser(admin: boolean) {
  return {
    uid: 'admin-1',
    getIdTokenResult: async () => ({ claims: admin ? { admin: true } : {} }),
  };
}

beforeEach(() => {
  Object.values(apiMock).forEach((fn) => fn.mockReset().mockImplementation(() => new Promise(() => {})));
});

describe('authorization gate', () => {
  it('offers Google sign-in while signed out', async () => {
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    await act(async () => {
      h.callback?.(null);
    });
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rule sets' })).not.toBeInTheDocument();
  });

  it('blocks users without the admin claim', async () => {
    render(<App />);
    await act(async () => {
      h.callback?.(fakeUser(false));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Not authorized');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rule sets' })).not.toBeInTheDocument();
  });

  it('shows the screens for an admin and signs in through the popup', async () => {
    render(<App />);
    await act(async () => {
      h.callback?.(fakeUser(true));
    });
    for (const label of ['Rollout', 'Rule sets', 'Simulator', 'Ledger lookup', 'Alerts', 'Maintenance']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    // The active screen loads its data (mocked pending) and shows a loading state.
    expect(apiMock.getConfig).toHaveBeenCalled();

    // Back to signed-out and sign in through the popup provider.
    await act(async () => {
      h.callback?.(null);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await act(async () => {});
    expect(popupMock).toHaveBeenCalled();
  });
});
