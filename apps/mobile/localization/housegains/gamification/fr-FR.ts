import type { gamificationEnUS } from './en-US';

/** Programme Gains et Soin (fr-FR). Ni l’un ni l’autre ne s’appelle XP ou points. */
export const gamificationFrFR: Record<keyof typeof gamificationEnUS, string> = {
  'housegains.gamification.ganhos.name': 'Gains',
  'housegains.gamification.zelo.name': 'Soin',
  'housegains.gamification.amount.ganhos': '+{amount} Gains',
  'housegains.gamification.amount.zelo': '+{amount} Soin',
  'housegains.gamification.total.ganhos': '{amount} Gains',
  'housegains.gamification.total.zelo': '{amount} Soin',

  'housegains.gamification.toast.title.chore': 'Étape terminée',
  'housegains.gamification.toast.title.bonus': 'Bonus de la tâche',
  'housegains.gamification.toast.title.assist': 'Coup de main',
  'housegains.gamification.toast.title.on_time': 'Pile à l’heure',
  'housegains.gamification.toast.title.share': 'Partagé avec le foyer',
  'housegains.gamification.toast.title.week_goal': 'Objectif de la semaine atteint',
  'housegains.gamification.toast.title.welcome': 'Bonus de bienvenue',
  'housegains.gamification.toast.title.zelo': 'Merci d’organiser',
  'housegains.gamification.toast.title.generic': 'Tu as gagné',
  'housegains.gamification.toast.title.badge': 'Succès débloqué',
  'housegains.gamification.toast.title.streak': '{weeks} semaines d’affilée !',
  'housegains.gamification.toast.announce': '{title}. {amount}',
  'housegains.gamification.toast.dismiss': 'Fermer',
  'housegains.gamification.toast.part': '{rule} +{amount}',
  'housegains.gamification.toast.badgeDetail': '{name} · {tier}',

  'housegains.gamification.rule.earn.subtask': 'Étape de tâche',
  'housegains.gamification.rule.earn.bonus': 'Bonus de la tâche',
  'housegains.gamification.rule.earn.assist': 'Coup de main',
  'housegains.gamification.rule.earn.on_time': 'Fait à temps',
  'housegains.gamification.rule.earn.share': 'Partagé dans l’activité',
  'housegains.gamification.rule.earn.week_goal': 'Objectif hebdomadaire',
  'housegains.gamification.rule.earn.streak_milestone': 'Palier de série',
  'housegains.gamification.rule.earn.achievement': 'Succès',
  'housegains.gamification.rule.earn.welcome': 'Bonus de bienvenue',
  'housegains.gamification.rule.zelo.setup': 'Foyer configuré',
  'housegains.gamification.rule.zelo.chore_done': 'Ta tâche a été faite',
  'housegains.gamification.rule.zelo.member_activated': 'Un colocataire s’est lancé',
  'housegains.gamification.rule.zelo.on_time': 'Foyer à l’heure',
  'housegains.gamification.rule.zelo.even_split': 'Partage équitable',
  'housegains.gamification.rule.zelo.streak_milestone': 'Palier de série',
  'housegains.gamification.rule.unknown': 'Ajustement',
  'housegains.gamification.ledger.reversal': 'Annulé : {rule}',

  'housegains.gamification.tier.bronze': 'Bronze',
  'housegains.gamification.tier.silver': 'Argent',
  'housegains.gamification.tier.gold': 'Or',
  'housegains.gamification.tier.label': 'Niveau {tier}',

  'housegains.gamification.achievement.helper.name': 'Main tendue',
  'housegains.gamification.achievement.helper.description':
    'Aide pour des étapes de tâches d’autres personnes.',
  'housegains.gamification.achievement.closer.name': 'Finisseur',
  'housegains.gamification.achievement.closer.description':
    'Termine la dernière étape d’une tâche.',
  'housegains.gamification.achievement.ontime.name': 'Ponctuel',
  'housegains.gamification.achievement.ontime.description': 'Termine des tâches avant l’échéance.',
  'housegains.gamification.achievement.kitchen.name': 'Roi de la cuisine',
  'housegains.gamification.achievement.kitchen.description':
    'Termine des étapes de tâches de cuisine.',
  'housegains.gamification.achievement.pets.name': 'Meilleur ami',
  'housegains.gamification.achievement.pets.description':
    'Termine des étapes de tâches pour les animaux.',
  'housegains.gamification.achievement.marathon.name': 'Marathonien',
  'housegains.gamification.achievement.marathon.description': 'Garde ta série hebdomadaire.',
  'housegains.gamification.achievement.fit.name': 'En forme',
  'housegains.gamification.achievement.fit.description': 'Valide 3 des 4 dernières semaines.',
  'housegains.gamification.achievement.pillar.name': 'Pilier du foyer',
  'housegains.gamification.achievement.pillar.description':
    'Fais au moins un quart du travail du foyer sur 4 semaines.',
  'housegains.gamification.achievement.spring.name': 'Grand ménage de printemps',
  'housegains.gamification.achievement.spring.description': 'Termine 30 étapes au printemps.',
  'housegains.gamification.achievement.yearend.name': 'Maison prête pour la nouvelle année',
  'housegains.gamification.achievement.yearend.description':
    'Atteins l’objectif hebdomadaire pendant 2 semaines de décembre.',
  'housegains.gamification.achievement.host.name': 'Hôte',
  'housegains.gamification.achievement.host.description':
    'Aide tes colocataires à se lancer dans l’app.',
  'housegains.gamification.achievement.maestro.name': 'Maestro',
  'housegains.gamification.achievement.maestro.description':
    'Garde le foyer à 90 % à temps ou plus pendant plusieurs semaines.',
  'housegains.gamification.achievement.architect.name': 'Architecte de tâches',
  'housegains.gamification.achievement.architect.description':
    'Crée des tâches personnalisées que tes colocataires continuent de faire.',
  'housegains.gamification.achievement.fair.name': 'Partage équitable',
  'housegains.gamification.achievement.fair.description':
    'Garde le travail bien réparti au fil des semaines.',
  'housegains.gamification.achievement.order.name': 'Maison en ordre',
  'housegains.gamification.achievement.order.description':
    'Garde au moins 80 % des tâches à temps pendant 4 semaines.',
  'housegains.gamification.achievement.unknown.name': 'Nouveau succès',
  'housegains.gamification.achievement.unknown.description':
    'Continue pour découvrir comment l’obtenir.',
  'housegains.gamification.pill.active': 'Actif',
  'housegains.gamification.pill.paused': 'En pause',
  'housegains.gamification.pill.seasonal': 'Saisonnier',
  'housegains.gamification.pill.locked': 'Verrouillé',

  'housegains.gamification.unlock.eyebrow': 'Succès débloqué',
  'housegains.gamification.unlock.a11y': 'Succès débloqué : {name}, niveau {tier}.',
  'housegains.gamification.unlock.continue': 'Continuer',
  'housegains.gamification.completion.badgesTitle': 'Succès débloqués',

  'housegains.gamification.level.title': 'Niveau {level} !',
  'housegains.gamification.level.titleLine': 'Nouveau titre : {title}',
  'housegains.gamification.level.announce': 'Niveau supérieur ! Tu as atteint le niveau {level}.',

  'housegains.gamification.streak.title': 'Série hebdomadaire',
  'housegains.gamification.streak.countOne': '{count} semaine d’affilée',
  'housegains.gamification.streak.countOther': '{count} semaines d’affilée',
  'housegains.gamification.streak.recordOne': 'Record : {count} semaine',
  'housegains.gamification.streak.recordOther': 'Record : {count} semaines',
  'housegains.gamification.streak.brokenOne': 'Ta série se repose. Record : {count} semaine.',
  'housegains.gamification.streak.brokenOther': 'Ta série se repose. Record : {count} semaines.',
  'housegains.gamification.streak.none.title': 'Lance ta série',
  'housegains.gamification.streak.none.body':
    'Termine 3 étapes dans une semaine et elle compte. Les semaines d’affilée forment ta série.',
  'housegains.gamification.streak.weekSecured': 'Semaine assurée',
  'housegains.gamification.streak.thisWeek': 'Cette semaine',
  'housegains.gamification.streak.week.counted': 'Semaine du {date} : comptée',
  'housegains.gamification.streak.week.missed': 'Semaine du {date} : non comptée',
  'housegains.gamification.streak.week.away': 'Semaine du {date} : absent',
  'housegains.gamification.streak.week.current': 'Cette semaine : en cours',
  'housegains.gamification.streak.weeks.title': 'Semaines récentes',
  'housegains.gamification.streak.weeks.empty': 'Ta première semaine terminée apparaîtra ici.',
  'housegains.gamification.streak.folgas.title': 'Jours de repos',
  'housegains.gamification.streak.folgas.count': '{count} disponibles',
  'housegains.gamification.streak.folgas.hint':
    'Un jour de repos garde ta série en vie quand tu manques une semaine. Tu en gagnes un toutes les {weeks} semaines comptées.',
  'housegains.gamification.streak.folgas.progress':
    '{progress} semaines sur {needed} avant le prochain',
  'housegains.gamification.streak.milestones.title': 'Paliers',
  'housegains.gamification.streak.milestone.reached': '{weeks} semaines : atteint',
  'housegains.gamification.streak.milestone.upcoming': '{weeks} semaines : +{reward} Gains',
  'housegains.gamification.streak.milestones.next':
    'Prochain palier : {weeks} semaines, +{reward} Gains',
  'housegains.gamification.streak.milestones.done': 'Tu as atteint tous les paliers.',

  'housegains.gamification.away.title': 'Mode absence',
  'housegains.gamification.away.body':
    'Tu pars ? Choisis les semaines d’absence. Ta série t’attend et les rappels restent muets. Tu peux utiliser {max} semaines par année civile.',
  'housegains.gamification.away.pick': 'Semaines commençant un lundi',
  'housegains.gamification.away.week': 'Semaine du {date}',
  'housegains.gamification.away.selected': 'Sélectionnée',
  'housegains.gamification.away.used': '{count} semaines d’absence sur {max} utilisées en {year}',
  'housegains.gamification.away.save': 'Enregistrer les semaines d’absence',
  'housegains.gamification.away.saving': 'Enregistrement…',
  'housegains.gamification.away.saved': 'Semaines d’absence enregistrées.',
  'housegains.gamification.away.error.notMonday':
    'Les semaines d’absence doivent commencer un lundi.',
  'housegains.gamification.away.error.notFuture':
    'Les semaines d’absence doivent commencer dans le futur.',
  'housegains.gamification.away.error.yearLimit':
    'Tu peux avoir au maximum {max} semaines d’absence par année civile ({year}).',
  'housegains.gamification.away.error.tooMany': 'Ça fait trop de semaines d’un coup.',
  'housegains.gamification.away.error.noHousehold':
    'Rejoins un foyer avant d’indiquer des semaines d’absence.',
  'housegains.gamification.away.error.network': 'Vérifie ta connexion et réessaie.',
  'housegains.gamification.away.error.generic':
    'Impossible d’enregistrer tes semaines d’absence. Réessaie.',

  'housegains.gamification.wallet.title': 'Tes Gains',
  'housegains.gamification.wallet.description': 'Personne d’autre que toi ne voit ce portefeuille.',
  'housegains.gamification.wallet.balanceLabel': 'Disponible',
  'housegains.gamification.wallet.pending': 'En attente : {amount}',
  'housegains.gamification.wallet.pendingUntil': 'Disponible à partir du {date}',
  'housegains.gamification.wallet.lifetime': 'Total gagné : {amount}',
  'housegains.gamification.wallet.levelProgress': '{xp} XP avant le niveau {next}',
  'housegains.gamification.wallet.levelRing':
    'Niveau {level}, {percent} % du chemin vers le niveau {next}',
  'housegains.gamification.wallet.achievements.title': 'Succès',
  'housegains.gamification.wallet.achievements.count': '{count} débloqués',
  'housegains.gamification.wallet.achievements.empty':
    'Ton premier succès t’attend. Continue à terminer des étapes.',
  'housegains.gamification.wallet.ledger.title': 'Activité récente',
  'housegains.gamification.wallet.ledger.empty':
    'Rien pour l’instant. Termine une étape pour gagner tes premiers Gains.',
  'housegains.gamification.wallet.ledger.rowA11y': '{rule}, {amount}, {date}',
  'housegains.gamification.wallet.streakCta': 'Série hebdomadaire',
  'housegains.gamification.wallet.streakCtaA11y': 'Ouvrir ta série hebdomadaire',
  'housegains.gamification.wallet.loading': 'Chargement de tes Gains…',
  'housegains.gamification.wallet.empty.title': 'Pas encore de Gains',
  'housegains.gamification.wallet.empty.body':
    'Termine une étape de tâche et tes premiers Gains apparaîtront ici.',
  'housegains.gamification.wallet.error.title': 'Impossible de charger tes Gains',
  'housegains.gamification.wallet.error.body': 'Vérifie ta connexion et réessaie.',
  'housegains.gamification.chip.label': '{amount} Gains',
  'housegains.gamification.chip.a11y': 'Ouvrir ton portefeuille de Gains. Disponible : {amount}',

  'housegains.gamification.organizer.title': 'Organisation du foyer',
  'housegains.gamification.organizer.level': 'Niveau {level} · {title}',
  'housegains.gamification.organizer.rank.organizer': 'Organisateur',
  'housegains.gamification.organizer.rank.sindico': 'Syndic',
  'housegains.gamification.organizer.rank.sindicoExperiente': 'Syndic expérimenté',
  'housegains.gamification.organizer.rank.sindicoMor': 'Syndic en chef',
  'housegains.gamification.organizer.rank.sindicoLendario': 'Syndic légendaire',
  'housegains.gamification.organizer.streakLabel': 'Maison à jour',
  'housegains.gamification.organizer.streakNone':
    'Garde 60 % des tâches à temps dans une semaine pour lancer la série.',
  'housegains.gamification.organizer.streakBroken':
    'La série se repose. Record : {count} semaines.',
  'housegains.gamification.organizer.achievementsTitle': 'Succès d’organisation',
  'housegains.gamification.organizer.achievementsEmpty': 'Pas encore de succès d’organisation.',
  'housegains.gamification.organizer.health.title': 'À temps récemment',
  'housegains.gamification.organizer.health.rate': '{percent} % à temps',
  'housegains.gamification.organizer.health.week': 'Semaine du {date} : {onTime} sur {due} à temps',
  'housegains.gamification.organizer.health.empty':
    'Le taux à temps apparaît après la première semaine terminée.',
  'housegains.gamification.organizer.a11y': 'Organisation du foyer : {title}, {zelo}',
};
