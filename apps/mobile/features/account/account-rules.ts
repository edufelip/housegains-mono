// Pure account rules: no native imports, so they run under `bun test`.
import type { SupportedLocale } from '@/localization/core';

export const HOUSEGAINS_ORIGIN = 'https://housegains.app';

export type LegalKind = 'privacy' | 'terms' | 'support';

/**
 * Resolves a HouseGains legal or support URL. A configured link wins. Non-English locales get a path prefix
 * (https://housegains.app/pt-BR/privacy); other hosts are returned unchanged.
 */
export function legalUrl(
  kind: LegalKind,
  locale: SupportedLocale,
  configured?: string | null,
): string {
  const base = configured?.trim() || `${HOUSEGAINS_ORIGIN}/${kind}`;
  if (locale === 'en-US' || !base.startsWith(`${HOUSEGAINS_ORIGIN}/`)) return base;
  return `${HOUSEGAINS_ORIGIN}/${locale}/${base.slice(HOUSEGAINS_ORIGIN.length + 1)}`;
}

export type AccountErrorKey =
  | 'housegains.account.error.unauthenticated'
  | 'housegains.account.error.permissionDenied'
  | 'housegains.account.error.notFound'
  | 'housegains.account.error.failedPrecondition'
  | 'housegains.account.error.resourceExhausted'
  | 'housegains.account.error.invalidArgument'
  | 'housegains.account.error.network'
  | 'housegains.account.error.generic';

const ERROR_KEYS: Record<string, AccountErrorKey> = {
  unauthenticated: 'housegains.account.error.unauthenticated',
  'auth/requires-recent-login': 'housegains.account.error.unauthenticated',
  'auth/user-token-expired': 'housegains.account.error.unauthenticated',
  'permission-denied': 'housegains.account.error.permissionDenied',
  'not-found': 'housegains.account.error.notFound',
  'failed-precondition': 'housegains.account.error.failedPrecondition',
  'resource-exhausted': 'housegains.account.error.resourceExhausted',
  'invalid-argument': 'housegains.account.error.invalidArgument',
  unavailable: 'housegains.account.error.network',
  'deadline-exceeded': 'housegains.account.error.network',
  'network-request-failed': 'housegains.account.error.network',
  'auth/network-request-failed': 'housegains.account.error.network',
};

/** Maps a Firebase callable or Auth error (code `functions/x`, `auth/x`, or an HttpsError) to a message key. */
export function accountErrorKey(error: unknown): AccountErrorKey {
  const raw = (error as { code?: unknown } | null)?.code;
  if (typeof raw !== 'string') return 'housegains.account.error.generic';
  const code = raw.startsWith('functions/') ? raw.slice('functions/'.length) : raw;
  return ERROR_KEYS[code] ?? ERROR_KEYS[raw] ?? 'housegains.account.error.generic';
}

export const REPORT_REASONS = ['offensive_name', 'harassment', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportKind = 'member' | 'household' | 'chore';

export const REPORT_NOTE_MAX = 500;

/**
 * The backend stores `reason` as text (max 500). The reason label and the optional note
 * share that limit, so the note is cut to fit after the label.
 */
export function reportReasonText(reason: ReportReason, note: string): string {
  const trimmed = note.trim();
  if (!trimmed) return reason;
  const room = REPORT_NOTE_MAX - reason.length - 2;
  return `${reason}: ${trimmed.slice(0, Math.max(0, room))}`;
}
