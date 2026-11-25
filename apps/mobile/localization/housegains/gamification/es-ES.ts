import type { gamificationEnUS } from './en-US';

/** Programa Ganhos y Zelo (es-ES): "Ganancias" y "Esmero". Nunca se llaman XP ni puntos. */
export const gamificationEsES: Record<keyof typeof gamificationEnUS, string> = {
  'housegains.gamification.ganhos.name': 'Ganancias',
  'housegains.gamification.zelo.name': 'Esmero',
  'housegains.gamification.amount.ganhos': '+{amount} Ganancias',
  'housegains.gamification.amount.zelo': '+{amount} Esmero',
  'housegains.gamification.total.ganhos': '{amount} Ganancias',
  'housegains.gamification.total.zelo': '{amount} Esmero',

  'housegains.gamification.toast.title.chore': 'Paso completado',
  'housegains.gamification.toast.title.bonus': 'Bono de la tarea',
  'housegains.gamification.toast.title.assist': 'Un empujón',
  'housegains.gamification.toast.title.on_time': 'Justo a tiempo',
  'housegains.gamification.toast.title.share': 'Compartido con la casa',
  'housegains.gamification.toast.title.week_goal': 'Meta semanal lograda',
  'housegains.gamification.toast.title.welcome': 'Bono de bienvenida',
  'housegains.gamification.toast.title.zelo': 'Gracias por organizar',
  'housegains.gamification.toast.title.generic': 'Has ganado',
  'housegains.gamification.toast.title.badge': 'Logro desbloqueado',
  'housegains.gamification.toast.title.streak': '¡{weeks} semanas seguidas!',
  'housegains.gamification.toast.announce': '{title}. {amount}',
  'housegains.gamification.toast.dismiss': 'Cerrar',
  'housegains.gamification.toast.part': '{rule} +{amount}',
  'housegains.gamification.toast.badgeDetail': '{name} · {tier}',

  'housegains.gamification.rule.earn.subtask': 'Paso de la tarea',
  'housegains.gamification.rule.earn.bonus': 'Bono de la tarea',
  'housegains.gamification.rule.earn.assist': 'Un empujón',
  'housegains.gamification.rule.earn.on_time': 'Hecho a tiempo',
  'housegains.gamification.rule.earn.share': 'Compartido en la actividad',
  'housegains.gamification.rule.earn.week_goal': 'Meta semanal',
  'housegains.gamification.rule.earn.streak_milestone': 'Hito de la racha',
  'housegains.gamification.rule.earn.achievement': 'Logro',
  'housegains.gamification.rule.earn.welcome': 'Bono de bienvenida',
  'housegains.gamification.rule.zelo.setup': 'Hogar configurado',
  'housegains.gamification.rule.zelo.chore_done': 'Se hizo tu tarea',
  'housegains.gamification.rule.zelo.member_activated': 'Un compañero empezó a usarla',
  'housegains.gamification.rule.zelo.on_time': 'Casa a tiempo',
  'housegains.gamification.rule.zelo.even_split': 'Reparto justo',
  'housegains.gamification.rule.zelo.streak_milestone': 'Hito de la racha',
  'housegains.gamification.rule.unknown': 'Ajuste',
  'housegains.gamification.ledger.reversal': 'Revertido: {rule}',

  'housegains.gamification.tier.bronze': 'Bronce',
  'housegains.gamification.tier.silver': 'Plata',
  'housegains.gamification.tier.gold': 'Oro',
  'housegains.gamification.tier.label': 'Nivel {tier}',

  'housegains.gamification.achievement.helper.name': 'Mano amiga',
  'housegains.gamification.achievement.helper.description':
    'Ayuda con pasos de tareas de otras personas.',
  'housegains.gamification.achievement.closer.name': 'Cierra-tareas',
  'housegains.gamification.achievement.closer.description': 'Completa el último paso de una tarea.',
  'housegains.gamification.achievement.ontime.name': 'Puntual',
  'housegains.gamification.achievement.ontime.description': 'Completa tareas antes de que venzan.',
  'housegains.gamification.achievement.kitchen.name': 'Rey de la cocina',
  'housegains.gamification.achievement.kitchen.description':
    'Completa pasos de tareas de la cocina.',
  'housegains.gamification.achievement.pets.name': 'Mejor amigo',
  'housegains.gamification.achievement.pets.description':
    'Completa pasos de tareas de las mascotas.',
  'housegains.gamification.achievement.marathon.name': 'Maratoniano',
  'housegains.gamification.achievement.marathon.description': 'Mantén tu racha semanal.',
  'housegains.gamification.achievement.fit.name': 'En forma',
  'housegains.gamification.achievement.fit.description': 'Consigue 3 de las últimas 4 semanas.',
  'housegains.gamification.achievement.pillar.name': 'Pilar de la casa',
  'housegains.gamification.achievement.pillar.description':
    'Haz al menos una cuarta parte del trabajo de la casa en 4 semanas.',
  'housegains.gamification.achievement.spring.name': 'Limpieza de primavera',
  'housegains.gamification.achievement.spring.description':
    'Completa 30 pasos durante la primavera.',
  'housegains.gamification.achievement.yearend.name': 'Casa lista para el año nuevo',
  'housegains.gamification.achievement.yearend.description':
    'Alcanza la meta semanal en 2 semanas de diciembre.',
  'housegains.gamification.achievement.host.name': 'Anfitrión',
  'housegains.gamification.achievement.host.description':
    'Ayuda a tus compañeros a empezar a usar la app.',
  'housegains.gamification.achievement.maestro.name': 'Maestro',
  'housegains.gamification.achievement.maestro.description':
    'Mantén la casa al 90 % a tiempo o más durante varias semanas.',
  'housegains.gamification.achievement.architect.name': 'Arquitecto de tareas',
  'housegains.gamification.achievement.architect.description':
    'Crea tareas propias que tus compañeros siguen haciendo.',
  'housegains.gamification.achievement.fair.name': 'Reparto justo',
  'housegains.gamification.achievement.fair.description':
    'Mantén el trabajo bien repartido a lo largo de las semanas.',
  'housegains.gamification.achievement.order.name': 'Casa en orden',
  'housegains.gamification.achievement.order.description':
    'Mantén al menos el 80 % de las tareas a tiempo durante 4 semanas.',
  'housegains.gamification.achievement.unknown.name': 'Logro nuevo',
  'housegains.gamification.achievement.unknown.description':
    'Sigue adelante para descubrir cómo conseguirlo.',
  'housegains.gamification.pill.active': 'Activo',
  'housegains.gamification.pill.paused': 'En pausa',
  'housegains.gamification.pill.seasonal': 'De temporada',
  'housegains.gamification.pill.locked': 'Bloqueado',

  'housegains.gamification.unlock.eyebrow': 'Logro desbloqueado',
  'housegains.gamification.unlock.a11y': 'Logro desbloqueado: {name}, nivel {tier}.',
  'housegains.gamification.unlock.continue': 'Continuar',
  'housegains.gamification.completion.badgesTitle': 'Logros desbloqueados',

  'housegains.gamification.level.title': '¡Nivel {level}!',
  'housegains.gamification.level.titleLine': 'Nuevo título: {title}',
  'housegains.gamification.level.announce': '¡Subes de nivel! Has llegado al nivel {level}.',

  'housegains.gamification.streak.title': 'Racha semanal',
  'housegains.gamification.streak.countOne': '{count} semana seguida',
  'housegains.gamification.streak.countOther': '{count} semanas seguidas',
  'housegains.gamification.streak.recordOne': 'Récord: {count} semana',
  'housegains.gamification.streak.recordOther': 'Récord: {count} semanas',
  'housegains.gamification.streak.brokenOne': 'Tu racha está descansando. Récord: {count} semana.',
  'housegains.gamification.streak.brokenOther':
    'Tu racha está descansando. Récord: {count} semanas.',
  'housegains.gamification.streak.none.title': 'Empieza tu racha',
  'housegains.gamification.streak.none.body':
    'Completa 3 pasos en una semana y esa semana cuenta. Las semanas seguidas forman tu racha.',
  'housegains.gamification.streak.weekSecured': 'Semana asegurada',
  'housegains.gamification.streak.thisWeek': 'Esta semana',
  'housegains.gamification.streak.week.counted': 'Semana del {date}: contó',
  'housegains.gamification.streak.week.missed': 'Semana del {date}: no contó',
  'housegains.gamification.streak.week.away': 'Semana del {date}: ausente',
  'housegains.gamification.streak.week.current': 'Esta semana: en curso',
  'housegains.gamification.streak.weeks.title': 'Semanas recientes',
  'housegains.gamification.streak.weeks.empty': 'Tu primera semana cerrada aparecerá aquí.',
  'housegains.gamification.streak.folgas.title': 'Días de descanso',
  'housegains.gamification.streak.folgas.count': '{count} disponibles',
  'housegains.gamification.streak.folgas.hint':
    'Un día de descanso mantiene tu racha cuando te saltas una semana. Ganas uno cada {weeks} semanas contadas.',
  'housegains.gamification.streak.folgas.progress':
    '{progress} de {needed} semanas para el siguiente',
  'housegains.gamification.streak.milestones.title': 'Hitos',
  'housegains.gamification.streak.milestone.reached': '{weeks} semanas: conseguido',
  'housegains.gamification.streak.milestone.upcoming': '{weeks} semanas: +{reward} Ganancias',
  'housegains.gamification.streak.milestones.next':
    'Próximo hito: {weeks} semanas, +{reward} Ganancias',
  'housegains.gamification.streak.milestones.done': 'Has alcanzado todos los hitos.',

  'housegains.gamification.away.title': 'Modo ausente',
  'housegains.gamification.away.body':
    '¿Te vas de viaje? Elige las semanas que estarás fuera. Tu racha te espera y los recordatorios se silencian. Puedes usar {max} semanas por año natural.',
  'housegains.gamification.away.pick': 'Semanas que empiezan en lunes',
  'housegains.gamification.away.week': 'Semana del {date}',
  'housegains.gamification.away.selected': 'Seleccionada',
  'housegains.gamification.away.used': '{count} de {max} semanas ausentes usadas en {year}',
  'housegains.gamification.away.save': 'Guardar semanas ausentes',
  'housegains.gamification.away.saving': 'Guardando…',
  'housegains.gamification.away.saved': 'Semanas ausentes guardadas.',
  'housegains.gamification.away.error.notMonday': 'Las semanas ausentes deben empezar en lunes.',
  'housegains.gamification.away.error.notFuture':
    'Las semanas ausentes deben empezar en el futuro.',
  'housegains.gamification.away.error.yearLimit':
    'Puedes tener como máximo {max} semanas ausentes por año natural ({year}).',
  'housegains.gamification.away.error.tooMany': 'Son demasiadas semanas a la vez.',
  'housegains.gamification.away.error.noHousehold':
    'Únete a un hogar antes de indicar semanas ausentes.',
  'housegains.gamification.away.error.network': 'Revisa tu conexión e inténtalo de nuevo.',
  'housegains.gamification.away.error.generic':
    'No se pudieron guardar tus semanas ausentes. Inténtalo de nuevo.',

  'housegains.gamification.wallet.title': 'Tus Ganancias',
  'housegains.gamification.wallet.description': 'Solo tú ves esta cartera.',
  'housegains.gamification.wallet.balanceLabel': 'Disponible',
  'housegains.gamification.wallet.pending': 'Pendiente: {amount}',
  'housegains.gamification.wallet.pendingUntil': 'Estará disponible desde el {date}',
  'housegains.gamification.wallet.lifetime': 'Total ganado: {amount}',
  'housegains.gamification.wallet.levelProgress': '{xp} XP para el nivel {next}',
  'housegains.gamification.wallet.levelRing':
    'Nivel {level}, {percent} % del camino al nivel {next}',
  'housegains.gamification.wallet.achievements.title': 'Logros',
  'housegains.gamification.wallet.achievements.count': '{count} desbloqueados',
  'housegains.gamification.wallet.achievements.empty':
    'Tu primer logro te espera. Sigue completando pasos.',
  'housegains.gamification.wallet.ledger.title': 'Actividad reciente',
  'housegains.gamification.wallet.ledger.empty':
    'Aún nada. Completa un paso para ganar tus primeras Ganancias.',
  'housegains.gamification.wallet.ledger.rowA11y': '{rule}, {amount}, {date}',
  'housegains.gamification.wallet.streakCta': 'Racha semanal',
  'housegains.gamification.wallet.streakCtaA11y': 'Abrir tu racha semanal',
  'housegains.gamification.wallet.loading': 'Cargando tus Ganancias…',
  'housegains.gamification.wallet.empty.title': 'Aún no hay Ganancias',
  'housegains.gamification.wallet.empty.body':
    'Completa un paso de una tarea y tus primeras Ganancias aparecerán aquí.',
  'housegains.gamification.wallet.error.title': 'No pudimos cargar tus Ganancias',
  'housegains.gamification.wallet.error.body': 'Revisa tu conexión e inténtalo de nuevo.',
  'housegains.gamification.chip.label': '{amount} Ganancias',
  'housegains.gamification.chip.a11y': 'Abrir tu cartera de Ganancias. Disponible: {amount}',

  'housegains.gamification.organizer.title': 'Organización de la casa',
  'housegains.gamification.organizer.level': 'Nivel {level} · {title}',
  'housegains.gamification.organizer.rank.organizer': 'Organizador',
  'housegains.gamification.organizer.rank.sindico': 'Administrador',
  'housegains.gamification.organizer.rank.sindicoExperiente': 'Administrador experto',
  'housegains.gamification.organizer.rank.sindicoMor': 'Administrador mayor',
  'housegains.gamification.organizer.rank.sindicoLendario': 'Administrador legendario',
  'housegains.gamification.organizer.streakLabel': 'Casa al día',
  'housegains.gamification.organizer.streakNone':
    'Mantén el 60 % de las tareas a tiempo en una semana para empezar la racha.',
  'housegains.gamification.organizer.streakBroken':
    'La racha está descansando. Récord: {count} semanas.',
  'housegains.gamification.organizer.achievementsTitle': 'Logros de organización',
  'housegains.gamification.organizer.achievementsEmpty': 'Aún no hay logros de organización.',
  'housegains.gamification.organizer.health.title': 'A tiempo últimamente',
  'housegains.gamification.organizer.health.rate': '{percent} % a tiempo',
  'housegains.gamification.organizer.health.week': 'Semana del {date}: {onTime} de {due} a tiempo',
  'housegains.gamification.organizer.health.empty':
    'El porcentaje a tiempo aparece tras la primera semana cerrada.',
  'housegains.gamification.organizer.a11y': 'Organización de la casa: {title}, {zelo}',
};
