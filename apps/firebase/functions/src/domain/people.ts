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

// Weekly standings pushes (gamification-moderation-contract.md Part B). The en and
// pt-BR names are fixed by the contract; the other locales use natural equivalents.
const WEEK_TOP_TITLE: Record<SupportedLocale, string> = {
  'en-US': 'Top member of the week',
  'pt-BR': 'Destaque da semana',
  'es-ES': 'Miembro de la semana',
  'fr-FR': 'Membre de la semaine',
  'de-DE': 'Mitglied der Woche',
  'it-IT': 'Membro della settimana',
};

const WEEK_SHAME_TITLE: Record<SupportedLocale, string> = {
  'en-US': 'Wall of shame',
  'pt-BR': 'Mural da vergonha',
  'es-ES': 'Muro de la vergüenza',
  'fr-FR': 'Mur de la honte',
  'de-DE': 'Mauer der Schande',
  'it-IT': 'Muro della vergogna',
};

const WEEK_TOP_BODY: Record<SupportedLocale, string> = {
  'en-US': '{name} earned {xp} XP this week.',
  'pt-BR': '{name} ganhou {xp} XP nesta semana.',
  'es-ES': '{name} consiguió {xp} XP esta semana.',
  'fr-FR': '{name} a gagné {xp} XP cette semaine.',
  'de-DE': '{name} hat diese Woche {xp} XP verdient.',
  'it-IT': '{name} ha guadagnato {xp} XP questa settimana.',
};

const WEEK_SHAME_BODY: Record<SupportedLocale, string> = {
  'en-US': '{name} missed {missed} of their chores this week.',
  'pt-BR': '{name} deixou {missed} tarefa(s) para trás nesta semana.',
  'es-ES': '{name} dejó {missed} tarea(s) sin hacer esta semana.',
  'fr-FR': '{name} a laissé {missed} tâche(s) inachevée(s) cette semaine.',
  'de-DE': '{name} hat diese Woche {missed} Aufgabe(n) verpasst.',
  'it-IT': '{name} ha lasciato {missed} attività da fare questa settimana.',
};

export function weekTopTitle(locale: unknown): string {
  return WEEK_TOP_TITLE[resolveLocale(locale)];
}

export function weekShameTitle(locale: unknown): string {
  return WEEK_SHAME_TITLE[resolveLocale(locale)];
}

export function weekTopBody(locale: unknown, name: string, xp: number): string {
  return WEEK_TOP_BODY[resolveLocale(locale)]
    .replace('{name}', name)
    .replace('{xp}', String(xp));
}

export function weekShameBody(locale: unknown, name: string, missed: number): string {
  return WEEK_SHAME_BODY[resolveLocale(locale)]
    .replace('{name}', name)
    .replace('{missed}', String(missed));
}
