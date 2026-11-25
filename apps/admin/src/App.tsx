import { useState } from 'react';
import { AuthProvider, useAuth } from './auth';
import { Alerts } from './screens/Alerts';
import { Ledger } from './screens/Ledger';
import { Maintenance } from './screens/Maintenance';
import { RuleSets } from './screens/RuleSets';
import { Simulator } from './screens/Simulator';

const SCREENS = [
  { id: 'rules', label: 'Rule sets', component: RuleSets },
  { id: 'simulator', label: 'Simulator', component: Simulator },
  { id: 'ledger', label: 'Ledger lookup', component: Ledger },
  { id: 'alerts', label: 'Alerts', component: Alerts },
  { id: 'maintenance', label: 'Maintenance', component: Maintenance },
] as const;

type ScreenId = (typeof SCREENS)[number]['id'];

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { state, error, signIn, signOut } = useAuth();

  if (state === 'loading') return <p role="status">Loading…</p>;

  if (state === 'signed-out') {
    return (
      <main className="gate">
        <h1>HouseGains Admin</h1>
        <p className="muted">Gamification rules engine administration.</p>
        <button type="button" onClick={() => void signIn()}>
          Sign in with Google
        </button>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
      </main>
    );
  }

  if (state === 'unauthorized') {
    return (
      <main className="gate">
        <h1>HouseGains Admin</h1>
        <p role="alert" className="error">
          Not authorized
        </p>
        <p className="muted">
          This account does not have the admin claim. Ask an existing admin to grant it.
        </p>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </main>
    );
  }

  return <Main />;
}

function Main() {
  const [screen, setScreen] = useState<ScreenId>('rules');
  const Active = SCREENS.find((s) => s.id === screen)?.component ?? RuleSets;
  const { uid, signOut } = useAuth();

  return (
    <>
      <header className="topbar">
        <h1>HouseGains Admin</h1>
        <p className="muted topbar-user">{uid}</p>
        <nav aria-label="Screens">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={s.id === screen ? 'page' : undefined}
              onClick={() => setScreen(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <button type="button" className="secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <main>
        <Active />
      </main>
    </>
  );
}
