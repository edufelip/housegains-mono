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

// Gamification pushes (gamification-moderation-contract.md Part C). Brand names
// (Ganhos, Zelo) stay untranslated; the pt-BR reminder copy is fixed by the contract.

const GAMI_WEEK_CLOSE_TITLE: Record<SupportedLocale, string> = {
  'en-US': 'Your week in Ganhos',
  'pt-BR': 'Seus Ganhos da semana',
  'es-ES': 'Tus Ganhos de la semana',
  'fr-FR': 'Tes Ganhos de la semaine',
  'de-DE': 'Deine Ganhos dieser Woche',
  'it-IT': 'I tuoi Ganhos della settimana',
};

const GAMI_WEEK_CLOSE_BODY: Record<SupportedLocale, string> = {
  'en-US': 'You earned {amount} Ganhos this week.',
  'pt-BR': 'Você ganhou {amount} Ganhos esta semana.',
  'es-ES': 'Conseguiste {amount} Ganhos esta semana.',
  'fr-FR': 'Tu as gagné {amount} Ganhos cette semaine.',
  'de-DE': 'Du hast diese Woche {amount} Ganhos verdient.',
  'it-IT': 'Hai guadagnato {amount} Ganhos questa settimana.',
};

const GAMI_ZELO_WEEK_CLOSE_BODY: Record<SupportedLocale, string> = {
  'en-US': 'You earned {amount} Zelo this week.',
  'pt-BR': 'Você ganhou {amount} Zelo esta semana.',
  'es-ES': 'Conseguiste {amount} Zelo esta semana.',
  'fr-FR': 'Tu as gagné {amount} Zelo cette semaine.',
  'de-DE': 'Du hast diese Woche {amount} Zelo verdient.',
  'it-IT': 'Hai guadagnato {amount} Zelo questa settimana.',
};

const GAMI_ZELO_WEEK_CLOSE_TITLE: Record<SupportedLocale, string> = {
  'en-US': 'Your week in Zelo',
  'pt-BR': 'Seu Zelo da semana',
  'es-ES': 'Tu Zelo de la semana',
  'fr-FR': 'Ton Zelo de la semaine',
  'de-DE': 'Dein Zelo dieser Woche',
  'it-IT': 'Il tuo Zelo della settimana',
};

export function gamiWeekCloseTitle(locale: unknown, track: 'ganhos' | 'zelo'): string {
  return (track === 'zelo' ? GAMI_ZELO_WEEK_CLOSE_TITLE : GAMI_WEEK_CLOSE_TITLE)[resolveLocale(locale)];
}

export function gamiWeekCloseBody(locale: unknown, track: 'ganhos' | 'zelo', amount: number): string {
  return (track === 'zelo' ? GAMI_ZELO_WEEK_CLOSE_BODY : GAMI_WEEK_CLOSE_BODY)[resolveLocale(locale)].replace(
    '{amount}',
    String(amount),
  );
}

// Gamification reminders (C7): Sunday 18:00 to members at risk of losing their
// streak, Saturday 10:00 to the creator when the house runs late.

const GAMI_STREAK_REMINDER_TITLE: Record<SupportedLocale, string> = {
  'en-US': 'Your streak',
  'pt-BR': 'Sua sequência',
  'es-ES': 'Tu racha',
  'fr-FR': 'Ta série',
  'de-DE': 'Deine Serie',
  'it-IT': 'La tua serie',
};

const GAMI_STREAK_REMINDER_BODY: Record<SupportedLocale, string> = {
  'en-US': '{steps} steps left to keep your {weeks}-week streak.',
  'pt-BR': 'Faltam {steps} etapas para manter suas {weeks} semanas.',
  'es-ES': 'Te faltan {steps} tareas para mantener tu racha de {weeks} semanas.',
  'fr-FR': 'Il te reste {steps} tâches pour garder ta série de {weeks} semaines.',
  'de-DE': 'Dir fehlen {steps} Schritte, um deine {weeks}-Wochen-Serie zu halten.',
  'it-IT': 'Ti mancano {steps} attività per mantenere le tue {weeks} settimane.',
};

const GAMI_HOUSE_RATE_TITLE: Record<SupportedLocale, string> = {
  'en-US': 'The house this week',
  'pt-BR': 'A casa esta semana',
  'es-ES': 'La casa esta semana',
  'fr-FR': 'La maison cette semaine',
  'de-DE': 'Das Haus diese Woche',
  'it-IT': 'La casa questa settimana',
};

const GAMI_HOUSE_RATE_BODY: Record<SupportedLocale, string> = {
  'en-US': 'The house is at {percent}% this week.',
  'pt-BR': 'A casa está em {percent}% esta semana.',
  'es-ES': 'La casa está al {percent}% esta semana.',
  'fr-FR': 'La maison est à {percent}% cette semaine.',
  'de-DE': 'Das Haus liegt diese Woche bei {percent}%.',
  'it-IT': 'La casa è al {percent}% questa settimana.',
};

export function gamiStreakReminderTitle(locale: unknown): string {
  return GAMI_STREAK_REMINDER_TITLE[resolveLocale(locale)];
}

export function gamiStreakReminderBody(locale: unknown, steps: number, weeks: number): string {
  return GAMI_STREAK_REMINDER_BODY[resolveLocale(locale)]
    .replace('{steps}', String(steps))
    .replace('{weeks}', String(weeks));
}

export function gamiHouseRateTitle(locale: unknown): string {
  return GAMI_HOUSE_RATE_TITLE[resolveLocale(locale)];
}

export function gamiHouseRateBody(locale: unknown, percent: number): string {
  return GAMI_HOUSE_RATE_BODY[resolveLocale(locale)].replace('{percent}', String(percent));
}
