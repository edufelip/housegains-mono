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
import { signInWithPopup, signOut } from 'firebase/auth';

const apiMock = vi.mocked(api);
const popupMock = vi.mocked(signInWithPopup);
const signOutMock = vi.mocked(signOut);

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
    for (const label of ['Rule sets', 'Simulator', 'Ledger lookup', 'Alerts', 'Maintenance']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    // The program has no rollout switch, so there is no Rollout screen.
    expect(screen.queryByRole('button', { name: 'Rollout' })).not.toBeInTheDocument();
    // The active screen (rule sets) loads its data (mocked pending) and shows a loading state.
    expect(apiMock.listRuleSets).toHaveBeenCalled();

    // Back to signed-out and sign in through the popup provider.
    await act(async () => {
      h.callback?.(null);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await act(async () => {});
    expect(popupMock).toHaveBeenCalled();
  });
});

describe('claims read', () => {
  it('falls back to the sign-in gate with the reason when the claims read fails', async () => {
    render(<App />);
    await act(async () => {
      h.callback?.({
        uid: 'admin-1',
        getIdTokenResult: async () => {
          throw new Error('network down');
        },
      });
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not verify admin access: network down');
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rule sets' })).not.toBeInTheDocument();
    expect(signOutMock).toHaveBeenCalled();
  });

  it('ignores a claims read that finishes after the user signed out', async () => {
    let finish: (token: { claims: { admin: boolean } }) => void = () => {};
    const slowUser = {
      uid: 'admin-1',
      getIdTokenResult: () =>
        new Promise<{ claims: { admin: boolean } }>((resolve) => {
          finish = resolve;
        }),
    };
    render(<App />);
    await act(async () => {
      h.callback?.(slowUser);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');

    await act(async () => {
      h.callback?.(null);
    });
    await act(async () => {
      finish({ claims: { admin: true } });
    });

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rule sets' })).not.toBeInTheDocument();
  });

  it('lets the newest account win when claims reads finish out of order', async () => {
    let finishFirst: (token: { claims: { admin: boolean } }) => void = () => {};
    const first = {
      uid: 'first',
      getIdTokenResult: () =>
        new Promise<{ claims: { admin: boolean } }>((resolve) => {
          finishFirst = resolve;
        }),
    };
    render(<App />);
    await act(async () => {
      h.callback?.(first);
    });
    await act(async () => {
      h.callback?.({ uid: 'second', getIdTokenResult: async () => ({ claims: {} }) });
    });
    await act(async () => {
      finishFirst({ claims: { admin: true } });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Not authorized');
    expect(screen.queryByRole('button', { name: 'Rule sets' })).not.toBeInTheDocument();
  });
  it('drops the previous admin as soon as another account signs in, until its claims resolve', async () => {
    let finishSecond: (token: { claims: { admin: boolean } }) => void = () => {};
    const second = {
      uid: 'second',
      getIdTokenResult: () =>
        new Promise<{ claims: { admin: boolean } }>((resolve) => {
          finishSecond = resolve;
        }),
    };
    render(<App />);
    await act(async () => {
      h.callback?.(fakeUser(true));
    });
    expect(screen.getByRole('button', { name: 'Rule sets' })).toBeInTheDocument();
    expect(screen.getByText('admin-1')).toBeInTheDocument();

    // Account B is signed in but its claims are still being read: A's access must be gone.
    await act(async () => {
      h.callback?.(second);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('button', { name: 'Rule sets' })).not.toBeInTheDocument();
    expect(screen.queryByText('admin-1')).not.toBeInTheDocument();

    await act(async () => {
      finishSecond({ claims: { admin: false } });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Not authorized');
    expect(screen.queryByRole('button', { name: 'Rule sets' })).not.toBeInTheDocument();
  });
});
