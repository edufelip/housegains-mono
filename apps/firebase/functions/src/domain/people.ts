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

// Moderation pushes (gamification-moderation-contract.md A2): "new report to review"
// goes to members with admin rights; "an admin reviewed your chore" to completers and reporters.
const REPORT_REVIEW_BODY: Record<SupportedLocale, string> = {
  'en-US': "{name} says {chore} wasn't done. Review it.",
  'pt-BR': '{name} diz que {chore} não foi feito. Revise.',
  'es-ES': '{name} dice que {chore} no se hizo. Revísalo.',
  'fr-FR': "{name} dit que {chore} n'a pas été fait. Vérifie.",
  'de-DE': '{name} sagt, {chore} wurde nicht erledigt. Prüfe es.',
  'it-IT': '{name} dice che {chore} non è stato fatto. Verificalo.',
};

const COMPLETION_REVIEWED_BODY: Record<SupportedLocale, string> = {
  'en-US': 'An admin reviewed your chore.',
  'pt-BR': 'Um administrador revisou sua tarefa.',
  'es-ES': 'Un administrador revisó tu tarea.',
  'fr-FR': 'Un administrateur a révisé ta tâche.',
  'de-DE': 'Ein Admin hat deine Aufgabe geprüft.',
  'it-IT': 'Un amministratore ha revisionato la tua attività.',
};

export function reportReviewBody(locale: unknown, reporterName: string, choreName: string): string {
  return REPORT_REVIEW_BODY[resolveLocale(locale)]
    .replace('{name}', reporterName)
    .replace('{chore}', choreName);
}

export function completionReviewedBody(locale: unknown): string {
  return COMPLETION_REVIEWED_BODY[resolveLocale(locale)];
}
