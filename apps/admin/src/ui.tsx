// Tiny shared UI helpers: loading, inline errors/notes and a confirm-gated
// button. Kept dependency-free so every screen reads the same way.

import { errorMessage } from './auth';
import type { ReactNode } from 'react';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="muted">
      {label}
    </p>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <p role="alert" className="error">
      {errorMessage(error)}
    </p>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}

export function ConfirmButton({
  label,
  confirmText,
  onConfirm,
  disabled = false,
  className,
}: {
  label: string;
  confirmText: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => {
        if (window.confirm(confirmText)) onConfirm();
      }}
    >
      {label}
    </button>
  );
}
