import { SUPPORTED_LOCALES, type SupportedLocale } from './validate';

// Profile derivation, creator succession, and reminder copy.

const MEMBER_COLORS = ['#7c5cff', '#21a67a', '#fa9f42', '#ed6b84', '#2684ff'];

export function initialsFor(displayName: string): string {
  const letters = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
  return letters || '?';
}

/** Stable color per uid, so a profile keeps its color across function calls. */
export function colorFor(uid: string): string {
  let hash = 0;
  for (const char of uid) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MEMBER_COLORS[hash % MEMBER_COLORS.length];
}

/** The longest-standing remaining member becomes creator. Ties break by uid. */
export function pickSuccessor(members: { uid: string; joinedAt: Date }[]): string | null {
  if (members.length === 0) return null;
  const sorted = [...members].sort(
    (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.uid.localeCompare(b.uid),
  );
  return sorted[0].uid;
}

// Body text for "Your turn: {chore} is due at {time}", written per locale.
const REMINDER_BODY: Record<SupportedLocale, string> = {
  'en-US': 'Your turn: {chore} is due at {time}',
  'pt-BR': 'Sua vez: {chore} vence às {time}',
  'es-ES': 'Te toca: {chore} vence a las {time}',
  'fr-FR': "C'est ton tour : {chore} est à faire avant {time}",
  'de-DE': 'Du bist dran: {chore} ist um {time} fällig',
  'it-IT': 'Tocca a te: {chore} scade alle {time}',
};

export function resolveLocale(locale: unknown): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale as string) ? (locale as SupportedLocale) : 'en-US';
}

export function reminderBody(locale: unknown, choreName: string, time: string): string {
  return REMINDER_BODY[resolveLocale(locale)].replace('{chore}', choreName).replace('{time}', time);
}
