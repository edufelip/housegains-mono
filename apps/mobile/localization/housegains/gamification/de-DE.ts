import type { gamificationEnUS } from './en-US';

/** Programm Gewinne und Fürsorge (de-DE). Beides heißt nie XP oder Punkte. */
export const gamificationDeDE: Record<keyof typeof gamificationEnUS, string> = {
  'housegains.gamification.ganhos.name': 'Gewinne',
  'housegains.gamification.zelo.name': 'Fürsorge',
  'housegains.gamification.amount.ganhos': '+{amount} Gewinne',
  'housegains.gamification.amount.zelo': '+{amount} Fürsorge',
  'housegains.gamification.total.ganhos': '{amount} Gewinne',
  'housegains.gamification.total.zelo': '{amount} Fürsorge',

  'housegains.gamification.toast.title.chore': 'Schritt erledigt',
  'housegains.gamification.toast.title.bonus': 'Aufgabenbonus',
  'housegains.gamification.toast.title.assist': 'Helfende Hand',
  'housegains.gamification.toast.title.on_time': 'Pünktlich',
  'housegains.gamification.toast.title.share': 'Mit dem Haushalt geteilt',
  'housegains.gamification.toast.title.week_goal': 'Wochenziel erreicht',
  'housegains.gamification.toast.title.welcome': 'Willkommensbonus',
  'housegains.gamification.toast.title.zelo': 'Danke fürs Organisieren',
  'housegains.gamification.toast.title.generic': 'Du hast verdient',
  'housegains.gamification.toast.title.badge': 'Erfolg freigeschaltet',
  'housegains.gamification.toast.title.streak': '{weeks} Wochen in Folge!',
  'housegains.gamification.toast.announce': '{title}. {amount}',
  'housegains.gamification.toast.dismiss': 'Schließen',
  'housegains.gamification.toast.part': '{rule} +{amount}',
  'housegains.gamification.toast.badgeDetail': '{name} · {tier}',

  'housegains.gamification.rule.earn.subtask': 'Aufgabenschritt',
  'housegains.gamification.rule.earn.bonus': 'Aufgabenbonus',
  'housegains.gamification.rule.earn.assist': 'Helfende Hand',
  'housegains.gamification.rule.earn.on_time': 'Pünktlich erledigt',
  'housegains.gamification.rule.earn.share': 'In der Aktivität geteilt',
  'housegains.gamification.rule.earn.week_goal': 'Wochenziel',
  'housegains.gamification.rule.earn.streak_milestone': 'Serien-Meilenstein',
  'housegains.gamification.rule.earn.achievement': 'Erfolg',
  'housegains.gamification.rule.earn.welcome': 'Willkommensbonus',
  'housegains.gamification.rule.zelo.setup': 'Haushalt eingerichtet',
  'housegains.gamification.rule.zelo.chore_done': 'Deine Aufgabe wurde erledigt',
  'housegains.gamification.rule.zelo.member_activated': 'Mitbewohner ist gestartet',
  'housegains.gamification.rule.zelo.on_time': 'Haushalt pünktlich',
  'housegains.gamification.rule.zelo.even_split': 'Faire Aufteilung',
  'housegains.gamification.rule.zelo.streak_milestone': 'Serien-Meilenstein',
  'housegains.gamification.rule.unknown': 'Anpassung',
  'housegains.gamification.ledger.reversal': 'Rückgängig: {rule}',

  'housegains.gamification.tier.bronze': 'Bronze',
  'housegains.gamification.tier.silver': 'Silber',
  'housegains.gamification.tier.gold': 'Gold',
  'housegains.gamification.tier.label': 'Stufe {tier}',

  'housegains.gamification.achievement.helper.name': 'Helfende Hand',
  'housegains.gamification.achievement.helper.description':
    'Hilf bei Schritten von Aufgaben anderer.',
  'housegains.gamification.achievement.closer.name': 'Abschließer',
  'housegains.gamification.achievement.closer.description':
    'Erledige den letzten Schritt einer Aufgabe.',
  'housegains.gamification.achievement.ontime.name': 'Pünktlich',
  'housegains.gamification.achievement.ontime.description':
    'Erledige Aufgaben, bevor sie fällig sind.',
  'housegains.gamification.achievement.kitchen.name': 'Küchenkönig',
  'housegains.gamification.achievement.kitchen.description':
    'Erledige Schritte von Küchenaufgaben.',
  'housegains.gamification.achievement.pets.name': 'Bester Freund',
  'housegains.gamification.achievement.pets.description': 'Erledige Schritte von Haustieraufgaben.',
  'housegains.gamification.achievement.marathon.name': 'Marathonläufer',
  'housegains.gamification.achievement.marathon.description': 'Halte deine Wochenserie am Laufen.',
  'housegains.gamification.achievement.fit.name': 'In Form',
  'housegains.gamification.achievement.fit.description': 'Lass 3 der letzten 4 Wochen zählen.',
  'housegains.gamification.achievement.pillar.name': 'Stütze des Hauses',
  'housegains.gamification.achievement.pillar.description':
    'Erledige in 4 Wochen mindestens ein Viertel der Haushaltsarbeit.',
  'housegains.gamification.achievement.spring.name': 'Frühjahrsputz',
  'housegains.gamification.achievement.spring.description': 'Erledige im Frühling 30 Schritte.',
  'housegains.gamification.achievement.yearend.name': 'Zuhause bereit fürs neue Jahr',
  'housegains.gamification.achievement.yearend.description':
    'Erreiche das Wochenziel in 2 Wochen im Dezember.',
  'housegains.gamification.achievement.host.name': 'Gastgeber',
  'housegains.gamification.achievement.host.description':
    'Hilf deinen Mitbewohnern beim Einstieg in die App.',
  'housegains.gamification.achievement.maestro.name': 'Maestro',
  'housegains.gamification.achievement.maestro.description':
    'Halte den Haushalt mehrere Wochen bei 90 % pünktlich oder besser.',
  'housegains.gamification.achievement.architect.name': 'Aufgaben-Architekt',
  'housegains.gamification.achievement.architect.description':
    'Erstelle eigene Aufgaben, die deine Mitbewohner weiter erledigen.',
  'housegains.gamification.achievement.fair.name': 'Faire Aufteilung',
  'housegains.gamification.achievement.fair.description':
    'Halte die Arbeit über die Wochen gleichmäßig verteilt.',
  'housegains.gamification.achievement.order.name': 'Haus in Ordnung',
  'housegains.gamification.achievement.order.description':
    'Halte 4 Wochen lang mindestens 80 % der Aufgaben pünktlich.',
  'housegains.gamification.achievement.unknown.name': 'Neuer Erfolg',
  'housegains.gamification.achievement.unknown.description':
    'Mach weiter, um herauszufinden, wie du ihn bekommst.',
  'housegains.gamification.pill.active': 'Aktiv',
  'housegains.gamification.pill.paused': 'Pausiert',
  'housegains.gamification.pill.seasonal': 'Saisonal',
  'housegains.gamification.pill.locked': 'Gesperrt',

  'housegains.gamification.unlock.eyebrow': 'Erfolg freigeschaltet',
  'housegains.gamification.unlock.a11y': 'Erfolg freigeschaltet: {name}, Stufe {tier}.',
  'housegains.gamification.unlock.continue': 'Weiter',
  'housegains.gamification.completion.badgesTitle': 'Freigeschaltete Erfolge',

  'housegains.gamification.level.title': 'Level {level}!',
  'housegains.gamification.level.titleLine': 'Neuer Titel: {title}',
  'housegains.gamification.level.announce': 'Level aufgestiegen! Du hast Level {level} erreicht.',

  'housegains.gamification.streak.title': 'Wochenserie',
  'housegains.gamification.streak.countOne': '{count} Woche in Folge',
  'housegains.gamification.streak.countOther': '{count} Wochen in Folge',
  'housegains.gamification.streak.recordOne': 'Rekord: {count} Woche',
  'housegains.gamification.streak.recordOther': 'Rekord: {count} Wochen',
  'housegains.gamification.streak.brokenOne': 'Deine Serie ruht sich aus. Rekord: {count} Woche.',
  'housegains.gamification.streak.brokenOther':
    'Deine Serie ruht sich aus. Rekord: {count} Wochen.',
  'housegains.gamification.streak.none.title': 'Starte deine Serie',
  'housegains.gamification.streak.none.body':
    'Erledige 3 Schritte in einer Woche, dann zählt sie. Wochen in Folge bilden deine Serie.',
  'housegains.gamification.streak.weekSecured': 'Woche gesichert',
  'housegains.gamification.streak.thisWeek': 'Diese Woche',
  'housegains.gamification.streak.week.counted': 'Woche vom {date}: gezählt',
  'housegains.gamification.streak.week.missed': 'Woche vom {date}: nicht gezählt',
  'housegains.gamification.streak.week.away': 'Woche vom {date}: abwesend',
  'housegains.gamification.streak.week.current': 'Diese Woche: läuft',
  'housegains.gamification.streak.weeks.title': 'Letzte Wochen',
  'housegains.gamification.streak.weeks.empty': 'Deine erste abgeschlossene Woche erscheint hier.',
  'housegains.gamification.streak.folgas.title': 'Ruhetage',
  'housegains.gamification.streak.folgas.count': '{count} verfügbar',
  'housegains.gamification.streak.folgas.hint':
    'Ein Ruhetag rettet deine Serie, wenn du eine Woche verpasst. Du bekommst einen alle {weeks} gezählten Wochen.',
  'housegains.gamification.streak.folgas.progress':
    '{progress} von {needed} Wochen bis zum nächsten',
  'housegains.gamification.streak.milestones.title': 'Meilensteine',
  'housegains.gamification.streak.milestone.reached': '{weeks} Wochen: erreicht',
  'housegains.gamification.streak.milestone.upcoming': '{weeks} Wochen: +{reward} Gewinne',
  'housegains.gamification.streak.milestones.next':
    'Nächster Meilenstein: {weeks} Wochen, +{reward} Gewinne',
  'housegains.gamification.streak.milestones.done': 'Du hast alle Meilensteine erreicht.',

  'housegains.gamification.away.title': 'Abwesenheitsmodus',
  'housegains.gamification.away.body':
    'Du verreist? Wähle die Wochen, in denen du weg bist. Deine Serie wartet auf dich und Erinnerungen bleiben still. Du kannst {max} Wochen pro Kalenderjahr nutzen.',
  'housegains.gamification.away.pick': 'Wochen, die montags beginnen',
  'housegains.gamification.away.week': 'Woche vom {date}',
  'housegains.gamification.away.selected': 'Ausgewählt',
  'housegains.gamification.away.used': '{count} von {max} Abwesenheitswochen in {year} genutzt',
  'housegains.gamification.away.save': 'Abwesenheitswochen speichern',
  'housegains.gamification.away.saving': 'Wird gespeichert…',
  'housegains.gamification.away.saved': 'Abwesenheitswochen gespeichert.',
  'housegains.gamification.away.error.notMonday':
    'Abwesenheitswochen müssen an einem Montag beginnen.',
  'housegains.gamification.away.error.notFuture':
    'Abwesenheitswochen müssen in der Zukunft beginnen.',
  'housegains.gamification.away.error.yearLimit':
    'Du kannst höchstens {max} Abwesenheitswochen pro Kalenderjahr haben ({year}).',
  'housegains.gamification.away.error.tooMany': 'Das sind zu viele Wochen auf einmal.',
  'housegains.gamification.away.error.noHousehold':
    'Tritt einem Haushalt bei, bevor du Abwesenheitswochen festlegst.',
  'housegains.gamification.away.error.network': 'Prüfe deine Verbindung und versuche es erneut.',
  'housegains.gamification.away.error.generic':
    'Deine Abwesenheitswochen konnten nicht gespeichert werden. Versuche es erneut.',

  'housegains.gamification.wallet.title': 'Deine Gewinne',
  'housegains.gamification.wallet.description': 'Nur du siehst diese Geldbörse.',
  'housegains.gamification.wallet.balanceLabel': 'Verfügbar',
  'housegains.gamification.wallet.pending': 'Ausstehend: {amount}',
  'housegains.gamification.wallet.pendingUntil': 'Verfügbar ab {date}',
  'housegains.gamification.wallet.lifetime': 'Insgesamt verdient: {amount}',
  'housegains.gamification.wallet.levelProgress': '{xp} XP bis Level {next}',
  'housegains.gamification.wallet.levelRing': 'Level {level}, {percent} % des Wegs zu Level {next}',
  'housegains.gamification.wallet.achievements.title': 'Erfolge',
  'housegains.gamification.wallet.achievements.count': '{count} freigeschaltet',
  'housegains.gamification.wallet.achievements.empty':
    'Dein erster Erfolg wartet. Erledige weiter Schritte.',
  'housegains.gamification.wallet.ledger.title': 'Letzte Aktivität',
  'housegains.gamification.wallet.ledger.empty':
    'Noch nichts. Erledige einen Schritt, um deine ersten Gewinne zu verdienen.',
  'housegains.gamification.wallet.ledger.rowA11y': '{rule}, {amount}, {date}',
  'housegains.gamification.wallet.streakCta': 'Wochenserie',
  'housegains.gamification.wallet.streakCtaA11y': 'Deine Wochenserie öffnen',
  'housegains.gamification.wallet.loading': 'Deine Gewinne werden geladen…',
  'housegains.gamification.wallet.empty.title': 'Noch keine Gewinne',
  'housegains.gamification.wallet.empty.body':
    'Erledige einen Aufgabenschritt, dann erscheinen hier deine ersten Gewinne.',
  'housegains.gamification.wallet.error.title': 'Deine Gewinne konnten nicht geladen werden',
  'housegains.gamification.wallet.error.body': 'Prüfe deine Verbindung und versuche es erneut.',
  'housegains.gamification.chip.label': '{amount} Gewinne',
  'housegains.gamification.chip.a11y': 'Deine Gewinne-Geldbörse öffnen. Verfügbar: {amount}',

  'housegains.gamification.organizer.title': 'Haushaltsorganisation',
  'housegains.gamification.organizer.level': 'Level {level} · {title}',
  'housegains.gamification.organizer.rank.organizer': 'Organisator',
  'housegains.gamification.organizer.rank.sindico': 'Hausverwalter',
  'housegains.gamification.organizer.rank.sindicoExperiente': 'Erfahrener Hausverwalter',
  'housegains.gamification.organizer.rank.sindicoMor': 'Oberverwalter',
  'housegains.gamification.organizer.rank.sindicoLendario': 'Legendärer Hausverwalter',
  'housegains.gamification.organizer.streakLabel': 'Haus auf Kurs',
  'housegains.gamification.organizer.streakNone':
    'Halte in einer Woche 60 % der Aufgaben pünktlich, um die Serie zu starten.',
  'housegains.gamification.organizer.streakBroken':
    'Die Serie ruht sich aus. Rekord: {count} Wochen.',
  'housegains.gamification.organizer.achievementsTitle': 'Organisationserfolge',
  'housegains.gamification.organizer.achievementsEmpty': 'Noch keine Organisationserfolge.',
  'housegains.gamification.organizer.health.title': 'Zuletzt pünktlich',
  'housegains.gamification.organizer.health.rate': '{percent} % pünktlich',
  'housegains.gamification.organizer.health.week': 'Woche vom {date}: {onTime} von {due} pünktlich',
  'housegains.gamification.organizer.health.empty':
    'Die Pünktlichkeitsquote erscheint nach der ersten abgeschlossenen Woche.',
  'housegains.gamification.organizer.a11y': 'Haushaltsorganisation: {title}, {zelo}',
};
