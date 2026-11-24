import type { gamificationEnUS } from './en-US';

/** Programma Guadagni e Cura (it-IT). Nessuno dei due si chiama XP o punti. */
export const gamificationItIT: Record<keyof typeof gamificationEnUS, string> = {
  'housegains.gamification.ganhos.name': 'Guadagni',
  'housegains.gamification.zelo.name': 'Cura',
  'housegains.gamification.amount.ganhos': '+{amount} Guadagni',
  'housegains.gamification.amount.zelo': '+{amount} Cura',
  'housegains.gamification.total.ganhos': '{amount} Guadagni',
  'housegains.gamification.total.zelo': '{amount} Cura',

  'housegains.gamification.toast.title.chore': 'Passaggio completato',
  'housegains.gamification.toast.title.bonus': 'Bonus dell’attività',
  'housegains.gamification.toast.title.assist': 'Una mano',
  'housegains.gamification.toast.title.on_time': 'Puntuale',
  'housegains.gamification.toast.title.share': 'Condiviso con la casa',
  'housegains.gamification.toast.title.week_goal': 'Obiettivo settimanale raggiunto',
  'housegains.gamification.toast.title.welcome': 'Bonus di benvenuto',
  'housegains.gamification.toast.title.zelo': 'Grazie per l’organizzazione',
  'housegains.gamification.toast.title.generic': 'Hai guadagnato',
  'housegains.gamification.toast.title.badge': 'Traguardo sbloccato',
  'housegains.gamification.toast.title.streak': '{weeks} settimane di fila!',
  'housegains.gamification.toast.announce': '{title}. {amount}',
  'housegains.gamification.toast.dismiss': 'Chiudi',
  'housegains.gamification.toast.part': '{rule} +{amount}',
  'housegains.gamification.toast.badgeDetail': '{name} · {tier}',

  'housegains.gamification.rule.earn.subtask': 'Passaggio dell’attività',
  'housegains.gamification.rule.earn.bonus': 'Bonus dell’attività',
  'housegains.gamification.rule.earn.assist': 'Una mano',
  'housegains.gamification.rule.earn.on_time': 'Fatto in tempo',
  'housegains.gamification.rule.earn.share': 'Condiviso nell’attività',
  'housegains.gamification.rule.earn.week_goal': 'Obiettivo settimanale',
  'housegains.gamification.rule.earn.streak_milestone': 'Traguardo della serie',
  'housegains.gamification.rule.earn.achievement': 'Traguardo',
  'housegains.gamification.rule.earn.welcome': 'Bonus di benvenuto',
  'housegains.gamification.rule.zelo.setup': 'Casa configurata',
  'housegains.gamification.rule.zelo.chore_done': 'La tua attività è stata fatta',
  'housegains.gamification.rule.zelo.member_activated': 'Un coinquilino ha iniziato',
  'housegains.gamification.rule.zelo.on_time': 'Casa in tempo',
  'housegains.gamification.rule.zelo.even_split': 'Divisione equa',
  'housegains.gamification.rule.zelo.streak_milestone': 'Traguardo della serie',
  'housegains.gamification.rule.unknown': 'Rettifica',
  'housegains.gamification.ledger.reversal': 'Annullato: {rule}',

  'housegains.gamification.tier.bronze': 'Bronzo',
  'housegains.gamification.tier.silver': 'Argento',
  'housegains.gamification.tier.gold': 'Oro',
  'housegains.gamification.tier.label': 'Livello {tier}',

  'housegains.gamification.achievement.helper.name': 'Mano amica',
  'housegains.gamification.achievement.helper.description':
    'Aiuta con i passaggi delle attività degli altri.',
  'housegains.gamification.achievement.closer.name': 'Chiudi-attività',
  'housegains.gamification.achievement.closer.description':
    'Completa l’ultimo passaggio di un’attività.',
  'housegains.gamification.achievement.ontime.name': 'Puntuale',
  'housegains.gamification.achievement.ontime.description':
    'Completa le attività prima della scadenza.',
  'housegains.gamification.achievement.kitchen.name': 'Re della cucina',
  'housegains.gamification.achievement.kitchen.description':
    'Completa passaggi di attività della cucina.',
  'housegains.gamification.achievement.pets.name': 'Miglior amico',
  'housegains.gamification.achievement.pets.description':
    'Completa passaggi di attività degli animali.',
  'housegains.gamification.achievement.marathon.name': 'Maratoneta',
  'housegains.gamification.achievement.marathon.description': 'Mantieni la tua serie settimanale.',
  'housegains.gamification.achievement.fit.name': 'In forma',
  'housegains.gamification.achievement.fit.description': 'Fai contare 3 delle ultime 4 settimane.',
  'housegains.gamification.achievement.pillar.name': 'Pilastro della casa',
  'housegains.gamification.achievement.pillar.description':
    'Fai almeno un quarto del lavoro della casa in 4 settimane.',
  'housegains.gamification.achievement.spring.name': 'Pulizie di primavera',
  'housegains.gamification.achievement.spring.description': 'Completa 30 passaggi in primavera.',
  'housegains.gamification.achievement.yearend.name': 'Casa pronta per l’anno nuovo',
  'housegains.gamification.achievement.yearend.description':
    'Raggiungi l’obiettivo settimanale in 2 settimane di dicembre.',
  'housegains.gamification.achievement.host.name': 'Ospite',
  'housegains.gamification.achievement.host.description':
    'Aiuta i coinquilini a iniziare a usare l’app.',
  'housegains.gamification.achievement.maestro.name': 'Maestro',
  'housegains.gamification.achievement.maestro.description':
    'Tieni la casa al 90% in tempo o più per diverse settimane.',
  'housegains.gamification.achievement.architect.name': 'Architetto di attività',
  'housegains.gamification.achievement.architect.description':
    'Crea attività personalizzate che i coinquilini continuano a fare.',
  'housegains.gamification.achievement.fair.name': 'Divisione equa',
  'housegains.gamification.achievement.fair.description':
    'Mantieni il lavoro ben distribuito nel corso delle settimane.',
  'housegains.gamification.achievement.order.name': 'Casa in ordine',
  'housegains.gamification.achievement.order.description':
    'Mantieni almeno l’80% delle attività in tempo per 4 settimane.',
  'housegains.gamification.achievement.unknown.name': 'Nuovo traguardo',
  'housegains.gamification.achievement.unknown.description':
    'Continua per scoprire come ottenerlo.',
  'housegains.gamification.pill.active': 'Attivo',
  'housegains.gamification.pill.paused': 'In pausa',
  'housegains.gamification.pill.seasonal': 'Stagionale',
  'housegains.gamification.pill.locked': 'Bloccato',

  'housegains.gamification.unlock.eyebrow': 'Traguardo sbloccato',
  'housegains.gamification.unlock.a11y': 'Traguardo sbloccato: {name}, livello {tier}.',
  'housegains.gamification.unlock.continue': 'Continua',
  'housegains.gamification.completion.badgesTitle': 'Traguardi sbloccati',

  'housegains.gamification.level.title': 'Livello {level}!',
  'housegains.gamification.level.titleLine': 'Nuovo titolo: {title}',
  'housegains.gamification.level.announce':
    'Sei salito di livello! Hai raggiunto il livello {level}.',

  'housegains.gamification.streak.title': 'Serie settimanale',
  'housegains.gamification.streak.countOne': '{count} settimana di fila',
  'housegains.gamification.streak.countOther': '{count} settimane di fila',
  'housegains.gamification.streak.recordOne': 'Record: {count} settimana',
  'housegains.gamification.streak.recordOther': 'Record: {count} settimane',
  'housegains.gamification.streak.brokenOne':
    'La tua serie si sta riposando. Record: {count} settimana.',
  'housegains.gamification.streak.brokenOther':
    'La tua serie si sta riposando. Record: {count} settimane.',
  'housegains.gamification.streak.none.title': 'Inizia la tua serie',
  'housegains.gamification.streak.none.body':
    'Completa 3 passaggi in una settimana e la settimana conta. Le settimane di fila formano la tua serie.',
  'housegains.gamification.streak.weekSecured': 'Settimana assicurata',
  'housegains.gamification.streak.thisWeek': 'Questa settimana',
  'housegains.gamification.streak.week.counted': 'Settimana del {date}: contata',
  'housegains.gamification.streak.week.missed': 'Settimana del {date}: non contata',
  'housegains.gamification.streak.week.away': 'Settimana del {date}: assente',
  'housegains.gamification.streak.week.current': 'Questa settimana: in corso',
  'housegains.gamification.streak.weeks.title': 'Settimane recenti',
  'housegains.gamification.streak.weeks.empty': 'La tua prima settimana chiusa apparirà qui.',
  'housegains.gamification.streak.folgas.title': 'Giorni di riposo',
  'housegains.gamification.streak.folgas.count': '{count} disponibili',
  'housegains.gamification.streak.folgas.hint':
    'Un giorno di riposo salva la tua serie quando salti una settimana. Ne ottieni uno ogni {weeks} settimane contate.',
  'housegains.gamification.streak.folgas.progress': '{progress} settimane su {needed} al prossimo',
  'housegains.gamification.streak.milestones.title': 'Traguardi',
  'housegains.gamification.streak.milestone.reached': '{weeks} settimane: raggiunto',
  'housegains.gamification.streak.milestone.upcoming': '{weeks} settimane: +{reward} Guadagni',
  'housegains.gamification.streak.milestones.next':
    'Prossimo traguardo: {weeks} settimane, +{reward} Guadagni',
  'housegains.gamification.streak.milestones.done': 'Hai raggiunto tutti i traguardi.',

  'housegains.gamification.away.title': 'Modalità assenza',
  'housegains.gamification.away.body':
    'Parti? Scegli le settimane in cui sarai via. La tua serie ti aspetta e i promemoria restano in silenzio. Puoi usare {max} settimane per anno solare.',
  'housegains.gamification.away.pick': 'Settimane che iniziano di lunedì',
  'housegains.gamification.away.week': 'Settimana del {date}',
  'housegains.gamification.away.selected': 'Selezionata',
  'housegains.gamification.away.used': '{count} di {max} settimane di assenza usate nel {year}',
  'housegains.gamification.away.save': 'Salva le settimane di assenza',
  'housegains.gamification.away.saving': 'Salvataggio…',
  'housegains.gamification.away.saved': 'Settimane di assenza salvate.',
  'housegains.gamification.away.error.notMonday':
    'Le settimane di assenza devono iniziare di lunedì.',
  'housegains.gamification.away.error.notFuture':
    'Le settimane di assenza devono iniziare nel futuro.',
  'housegains.gamification.away.error.yearLimit':
    'Puoi avere al massimo {max} settimane di assenza per anno solare ({year}).',
  'housegains.gamification.away.error.tooMany': 'Sono troppe settimane in una volta.',
  'housegains.gamification.away.error.noHousehold':
    'Unisciti a una casa prima di impostare le settimane di assenza.',
  'housegains.gamification.away.error.network': 'Controlla la connessione e riprova.',
  'housegains.gamification.away.error.generic':
    'Impossibile salvare le tue settimane di assenza. Riprova.',

  'housegains.gamification.wallet.title': 'I tuoi Guadagni',
  'housegains.gamification.wallet.description': 'Solo tu vedi questo portafoglio.',
  'housegains.gamification.wallet.balanceLabel': 'Disponibili',
  'housegains.gamification.wallet.pending': 'In attesa: {amount}',
  'housegains.gamification.wallet.pendingUntil': 'Disponibili dal {date}',
  'housegains.gamification.wallet.lifetime': 'Guadagnati in totale: {amount}',
  'housegains.gamification.wallet.levelProgress': '{xp} XP al livello {next}',
  'housegains.gamification.wallet.levelRing':
    'Livello {level}, {percent}% del percorso verso il livello {next}',
  'housegains.gamification.wallet.achievements.title': 'Traguardi',
  'housegains.gamification.wallet.achievements.count': '{count} sbloccati',
  'housegains.gamification.wallet.achievements.empty':
    'Il tuo primo traguardo ti aspetta. Continua a completare passaggi.',
  'housegains.gamification.wallet.ledger.title': 'Attività recente',
  'housegains.gamification.wallet.ledger.empty':
    'Ancora niente. Completa un passaggio per guadagnare i tuoi primi Guadagni.',
  'housegains.gamification.wallet.ledger.rowA11y': '{rule}, {amount}, {date}',
  'housegains.gamification.wallet.streakCta': 'Serie settimanale',
  'housegains.gamification.wallet.streakCtaA11y': 'Apri la tua serie settimanale',
  'housegains.gamification.wallet.loading': 'Caricamento dei tuoi Guadagni…',
  'housegains.gamification.wallet.empty.title': 'Ancora nessun Guadagno',
  'housegains.gamification.wallet.empty.body':
    'Completa un passaggio di un’attività e i tuoi primi Guadagni appariranno qui.',
  'housegains.gamification.wallet.error.title': 'Impossibile caricare i tuoi Guadagni',
  'housegains.gamification.wallet.error.body': 'Controlla la connessione e riprova.',
  'housegains.gamification.chip.label': '{amount} Guadagni',
  'housegains.gamification.chip.a11y': 'Apri il tuo portafoglio Guadagni. Disponibili: {amount}',

  'housegains.gamification.organizer.title': 'Organizzazione della casa',
  'housegains.gamification.organizer.level': 'Livello {level} · {title}',
  'housegains.gamification.organizer.rank.organizer': 'Organizzatore',
  'housegains.gamification.organizer.rank.sindico': 'Amministratore',
  'housegains.gamification.organizer.rank.sindicoExperiente': 'Amministratore esperto',
  'housegains.gamification.organizer.rank.sindicoMor': 'Amministratore capo',
  'housegains.gamification.organizer.rank.sindicoLendario': 'Amministratore leggendario',
  'housegains.gamification.organizer.streakLabel': 'Casa in regola',
  'housegains.gamification.organizer.streakNone':
    'Tieni il 60% delle attività in tempo in una settimana per avviare la serie.',
  'housegains.gamification.organizer.streakBroken':
    'La serie si sta riposando. Record: {count} settimane.',
  'housegains.gamification.organizer.achievementsTitle': 'Traguardi di organizzazione',
  'housegains.gamification.organizer.achievementsEmpty':
    'Ancora nessun traguardo di organizzazione.',
  'housegains.gamification.organizer.health.title': 'In tempo di recente',
  'housegains.gamification.organizer.health.rate': '{percent}% in tempo',
  'housegains.gamification.organizer.health.week':
    'Settimana del {date}: {onTime} su {due} in tempo',
  'housegains.gamification.organizer.health.empty':
    'La percentuale in tempo appare dopo la prima settimana chiusa.',
  'housegains.gamification.organizer.a11y': 'Organizzazione della casa: {title}, {zelo}',
};
