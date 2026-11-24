import type { gamificationEnUS } from './en-US';

/** Programa Ganhos & Zelo (pt-BR). "Ganhos" e "Zelo" nunca são chamados de XP ou pontos. */
export const gamificationPtBR: Record<keyof typeof gamificationEnUS, string> = {
  'housegains.gamification.ganhos.name': 'Ganhos',
  'housegains.gamification.zelo.name': 'Zelo',
  'housegains.gamification.amount.ganhos': '+{amount} Ganhos',
  'housegains.gamification.amount.zelo': '+{amount} Zelo',
  'housegains.gamification.total.ganhos': '{amount} Ganhos',
  'housegains.gamification.total.zelo': '{amount} Zelo',

  'housegains.gamification.toast.title.chore': 'Etapa concluída',
  'housegains.gamification.toast.title.bonus': 'Bônus da tarefa',
  'housegains.gamification.toast.title.assist': 'Mão amiga',
  'housegains.gamification.toast.title.on_time': 'Na hora certa',
  'housegains.gamification.toast.title.share': 'Compartilhado com a casa',
  'housegains.gamification.toast.title.week_goal': 'Meta da semana batida',
  'housegains.gamification.toast.title.welcome': 'Bônus de boas-vindas',
  'housegains.gamification.toast.title.zelo': 'Obrigado por organizar',
  'housegains.gamification.toast.title.generic': 'Você ganhou',
  'housegains.gamification.toast.title.badge': 'Conquista desbloqueada',
  'housegains.gamification.toast.title.streak': '{weeks} semanas seguidas!',
  'housegains.gamification.toast.announce': '{title}. {amount}',
  'housegains.gamification.toast.dismiss': 'Dispensar',
  'housegains.gamification.toast.part': '{rule} +{amount}',
  'housegains.gamification.toast.badgeDetail': '{name} · {tier}',

  'housegains.gamification.rule.earn.subtask': 'Etapa da tarefa',
  'housegains.gamification.rule.earn.bonus': 'Bônus da tarefa',
  'housegains.gamification.rule.earn.assist': 'Mão amiga',
  'housegains.gamification.rule.earn.on_time': 'Feito no prazo',
  'housegains.gamification.rule.earn.share': 'Compartilhado na atividade',
  'housegains.gamification.rule.earn.week_goal': 'Meta semanal',
  'housegains.gamification.rule.earn.streak_milestone': 'Marco da sequência',
  'housegains.gamification.rule.earn.achievement': 'Conquista',
  'housegains.gamification.rule.earn.welcome': 'Bônus de boas-vindas',
  'housegains.gamification.rule.zelo.setup': 'Casa configurada',
  'housegains.gamification.rule.zelo.chore_done': 'Sua tarefa foi feita',
  'housegains.gamification.rule.zelo.member_activated': 'Morador começou a usar',
  'housegains.gamification.rule.zelo.on_time': 'Casa no prazo',
  'housegains.gamification.rule.zelo.even_split': 'Divisão justa',
  'housegains.gamification.rule.zelo.streak_milestone': 'Marco da sequência',
  'housegains.gamification.rule.unknown': 'Ajuste',
  'housegains.gamification.ledger.reversal': 'Estornado: {rule}',

  'housegains.gamification.tier.bronze': 'Bronze',
  'housegains.gamification.tier.silver': 'Prata',
  'housegains.gamification.tier.gold': 'Ouro',
  'housegains.gamification.tier.label': 'Nível {tier}',

  'housegains.gamification.achievement.helper.name': 'Mão amiga',
  'housegains.gamification.achievement.helper.description':
    'Ajude em etapas de tarefas de outras pessoas.',
  'housegains.gamification.achievement.closer.name': 'Fecha-tarefa',
  'housegains.gamification.achievement.closer.description': 'Conclua a última etapa de uma tarefa.',
  'housegains.gamification.achievement.ontime.name': 'Pontual',
  'housegains.gamification.achievement.ontime.description': 'Conclua tarefas antes do prazo.',
  'housegains.gamification.achievement.kitchen.name': 'Rei da cozinha',
  'housegains.gamification.achievement.kitchen.description':
    'Conclua etapas de tarefas da cozinha.',
  'housegains.gamification.achievement.pets.name': 'Melhor amigo',
  'housegains.gamification.achievement.pets.description': 'Conclua etapas de tarefas dos pets.',
  'housegains.gamification.achievement.marathon.name': 'Maratonista',
  'housegains.gamification.achievement.marathon.description': 'Mantenha sua sequência semanal.',
  'housegains.gamification.achievement.fit.name': 'Em forma',
  'housegains.gamification.achievement.fit.description': 'Garanta 3 das últimas 4 semanas.',
  'housegains.gamification.achievement.pillar.name': 'Pilar da casa',
  'housegains.gamification.achievement.pillar.description':
    'Faça pelo menos um quarto do trabalho da casa em 4 semanas.',
  'housegains.gamification.achievement.spring.name': 'Faxina de primavera',
  'housegains.gamification.achievement.spring.description':
    'Conclua 30 etapas durante a primavera.',
  'housegains.gamification.achievement.yearend.name': 'Casa pronta pro ano novo',
  'housegains.gamification.achievement.yearend.description':
    'Bata a meta semanal em 2 semanas de dezembro.',
  'housegains.gamification.achievement.host.name': 'Anfitrião',
  'housegains.gamification.achievement.host.description':
    'Ajude os moradores a começar a usar o app.',
  'housegains.gamification.achievement.maestro.name': 'Maestro',
  'housegains.gamification.achievement.maestro.description':
    'Mantenha a casa com 90% no prazo ou mais por várias semanas.',
  'housegains.gamification.achievement.architect.name': 'Arquiteto de tarefas',
  'housegains.gamification.achievement.architect.description':
    'Crie tarefas personalizadas que seus moradores continuam fazendo.',
  'housegains.gamification.achievement.fair.name': 'Divisão justa',
  'housegains.gamification.achievement.fair.description':
    'Mantenha o trabalho bem dividido ao longo das semanas.',
  'housegains.gamification.achievement.order.name': 'Casa em ordem',
  'housegains.gamification.achievement.order.description':
    'Mantenha pelo menos 80% das tarefas no prazo por 4 semanas.',
  'housegains.gamification.achievement.unknown.name': 'Nova conquista',
  'housegains.gamification.achievement.unknown.description':
    'Continue para descobrir como conquistar.',
  'housegains.gamification.pill.active': 'Ativa',
  'housegains.gamification.pill.paused': 'Pausada',
  'housegains.gamification.pill.seasonal': 'Sazonal',
  'housegains.gamification.pill.locked': 'Bloqueada',

  'housegains.gamification.unlock.eyebrow': 'Conquista desbloqueada',
  'housegains.gamification.unlock.a11y': 'Conquista desbloqueada: {name}, nível {tier}.',
  'housegains.gamification.unlock.continue': 'Continuar',
  'housegains.gamification.completion.badgesTitle': 'Conquistas desbloqueadas',

  'housegains.gamification.level.title': 'Nível {level}!',
  'housegains.gamification.level.titleLine': 'Novo título: {title}',
  'housegains.gamification.level.announce': 'Subiu de nível! Você chegou ao nível {level}.',

  'housegains.gamification.streak.title': 'Sequência semanal',
  'housegains.gamification.streak.countOne': '{count} semana seguida',
  'housegains.gamification.streak.countOther': '{count} semanas seguidas',
  'housegains.gamification.streak.recordOne': 'Recorde: {count} semana',
  'housegains.gamification.streak.recordOther': 'Recorde: {count} semanas',
  'housegains.gamification.streak.brokenOne': 'Sua sequência descansou. Recorde: {count} semana.',
  'housegains.gamification.streak.brokenOther':
    'Sua sequência descansou. Recorde: {count} semanas.',
  'housegains.gamification.streak.none.title': 'Comece sua sequência',
  'housegains.gamification.streak.none.body':
    'Conclua 3 etapas em uma semana e ela conta. Semanas seguidas formam sua sequência.',
  'housegains.gamification.streak.weekSecured': 'Semana garantida',
  'housegains.gamification.streak.thisWeek': 'Esta semana',
  'housegains.gamification.streak.week.counted': 'Semana de {date}: contou',
  'housegains.gamification.streak.week.missed': 'Semana de {date}: não contou',
  'housegains.gamification.streak.week.away': 'Semana de {date}: ausente',
  'housegains.gamification.streak.week.current': 'Esta semana: em andamento',
  'housegains.gamification.streak.weeks.title': 'Semanas recentes',
  'housegains.gamification.streak.weeks.empty': 'Sua primeira semana fechada aparecerá aqui.',
  'housegains.gamification.streak.folgas.title': 'Folgas',
  'housegains.gamification.streak.folgas.count': '{count} disponíveis',
  'housegains.gamification.streak.folgas.hint':
    'Uma folga mantém sua sequência quando você perde uma semana. Você ganha uma a cada {weeks} semanas contadas.',
  'housegains.gamification.streak.folgas.progress': '{progress} de {needed} semanas para a próxima',
  'housegains.gamification.streak.milestones.title': 'Marcos',
  'housegains.gamification.streak.milestone.reached': '{weeks} semanas: alcançado',
  'housegains.gamification.streak.milestone.upcoming': '{weeks} semanas: +{reward} Ganhos',
  'housegains.gamification.streak.milestones.next':
    'Próximo marco: {weeks} semanas, +{reward} Ganhos',
  'housegains.gamification.streak.milestones.done': 'Você alcançou todos os marcos.',

  'housegains.gamification.away.title': 'Modo ausente',
  'housegains.gamification.away.body':
    'Vai viajar? Escolha as semanas em que estará fora. Sua sequência espera por você e os lembretes ficam em silêncio. Você pode usar {max} semanas por ano civil.',
  'housegains.gamification.away.pick': 'Semanas que começam na segunda-feira',
  'housegains.gamification.away.week': 'Semana de {date}',
  'housegains.gamification.away.selected': 'Selecionada',
  'housegains.gamification.away.used': '{count} de {max} semanas ausentes usadas em {year}',
  'housegains.gamification.away.save': 'Salvar semanas ausentes',
  'housegains.gamification.away.saving': 'Salvando…',
  'housegains.gamification.away.saved': 'Semanas ausentes salvas.',
  'housegains.gamification.away.error.notMonday':
    'As semanas ausentes precisam começar numa segunda-feira.',
  'housegains.gamification.away.error.notFuture': 'As semanas ausentes precisam começar no futuro.',
  'housegains.gamification.away.error.yearLimit':
    'Você pode ter no máximo {max} semanas ausentes por ano civil ({year}).',
  'housegains.gamification.away.error.tooMany': 'São semanas demais de uma só vez.',
  'housegains.gamification.away.error.noHousehold':
    'Entre em uma casa antes de definir semanas ausentes.',
  'housegains.gamification.away.error.network': 'Verifique sua conexão e tente novamente.',
  'housegains.gamification.away.error.generic':
    'Não foi possível salvar suas semanas ausentes. Tente novamente.',

  'housegains.gamification.wallet.title': 'Seus Ganhos',
  'housegains.gamification.wallet.description': 'Só você vê esta carteira.',
  'housegains.gamification.wallet.balanceLabel': 'Disponível',
  'housegains.gamification.wallet.pending': 'Pendente: {amount}',
  'housegains.gamification.wallet.pendingUntil': 'Fica disponível a partir de {date}',
  'housegains.gamification.wallet.lifetime': 'Total ganho: {amount}',
  'housegains.gamification.wallet.levelProgress': '{xp} XP para o nível {next}',
  'housegains.gamification.wallet.levelRing':
    'Nível {level}, {percent}% do caminho até o nível {next}',
  'housegains.gamification.wallet.achievements.title': 'Conquistas',
  'housegains.gamification.wallet.achievements.count': '{count} desbloqueadas',
  'housegains.gamification.wallet.achievements.empty':
    'Sua primeira conquista está esperando. Continue concluindo etapas.',
  'housegains.gamification.wallet.ledger.title': 'Atividade recente',
  'housegains.gamification.wallet.ledger.empty':
    'Nada por enquanto. Conclua uma etapa para ganhar seus primeiros Ganhos.',
  'housegains.gamification.wallet.ledger.rowA11y': '{rule}, {amount}, {date}',
  'housegains.gamification.wallet.streakCta': 'Sequência semanal',
  'housegains.gamification.wallet.streakCtaA11y': 'Abrir sua sequência semanal',
  'housegains.gamification.wallet.loading': 'Carregando seus Ganhos…',
  'housegains.gamification.wallet.empty.title': 'Ainda sem Ganhos',
  'housegains.gamification.wallet.empty.body':
    'Conclua uma etapa de tarefa e seus primeiros Ganhos aparecerão aqui.',
  'housegains.gamification.wallet.error.title': 'Não foi possível carregar seus Ganhos',
  'housegains.gamification.wallet.error.body': 'Verifique sua conexão e tente novamente.',
  'housegains.gamification.chip.label': '{amount} Ganhos',
  'housegains.gamification.chip.a11y': 'Abrir sua carteira de Ganhos. Disponível: {amount}',

  'housegains.gamification.organizer.title': 'Organização da casa',
  'housegains.gamification.organizer.level': 'Nível {level} · {title}',
  'housegains.gamification.organizer.rank.organizer': 'Organizador',
  'housegains.gamification.organizer.rank.sindico': 'Síndico',
  'housegains.gamification.organizer.rank.sindicoExperiente': 'Síndico experiente',
  'housegains.gamification.organizer.rank.sindicoMor': 'Síndico-mor',
  'housegains.gamification.organizer.rank.sindicoLendario': 'Síndico lendário',
  'housegains.gamification.organizer.streakLabel': 'Casa em dia',
  'housegains.gamification.organizer.streakNone':
    'Mantenha 60% das tarefas no prazo em uma semana para começar a sequência.',
  'housegains.gamification.organizer.streakBroken':
    'A sequência descansou. Recorde: {count} semanas.',
  'housegains.gamification.organizer.achievementsTitle': 'Conquistas de organização',
  'housegains.gamification.organizer.achievementsEmpty': 'Nenhuma conquista de organização ainda.',
  'housegains.gamification.organizer.health.title': 'No prazo recentemente',
  'housegains.gamification.organizer.health.rate': '{percent}% no prazo',
  'housegains.gamification.organizer.health.week': 'Semana de {date}: {onTime} de {due} no prazo',
  'housegains.gamification.organizer.health.empty':
    'A taxa no prazo aparece depois da primeira semana fechada.',
  'housegains.gamification.organizer.a11y': 'Organização da casa: {title}, {zelo}',
};
