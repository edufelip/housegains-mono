import { houseGainsScreensPtBR } from './screens/pt-BR';
import type { enUS } from './en-US';

const ptBR: Record<keyof typeof enUS, string> = {
  'housegains.appearance.title': 'Escolha seu estilo',
  'housegains.appearance.subtitle':
    'Escolha o visual da sua casa. Você pode mudar quando quiser em Configurações.',
  'housegains.appearance.preview_hint': 'Prévia de uma casa de exemplo',
  'housegains.appearance.continue': 'Continuar',
  'housegains.appearance.retry_load': 'Tentar carregar novamente',
  'housegains.appearance.retry_save': 'Tentar salvar novamente',
  'housegains.appearance.saving': 'Salvando estilo…',
  'housegains.appearance.selected': 'Selecionado',
  'housegains.appearance.select': 'Selecionar {theme}',
  'housegains.appearance.error.load':
    'Não foi possível carregar seu estilo salvo. Escolha um estilo ou tente novamente.',
  'housegains.appearance.error.save':
    'Seu estilo está na prévia, mas não foi salvo. Tente novamente para continuar.',
  'housegains.theme.arcade.name': 'Arcade',
  'housegains.theme.arcade.description':
    'Missões escuras, verde-limão elétrico e progresso cheio de energia.',
  'housegains.theme.sticker.name': 'Sticker Pop',
  'housegains.theme.sticker.description':
    'Amarelo-manteiga, azul vibrante, contornos fortes e sombras marcadas.',
  'housegains.theme.soft.name': 'Soft Home',
  'housegains.theme.soft.description':
    'Lavanda clara, progresso tranquilo e títulos elegantes com serifa.',
  'housegains.preview.home_name': 'Apto 302',
  'housegains.preview.member_name': 'Edu',
  'housegains.preview.member_initials': 'ED',
  'housegains.preview.sticker_greeting': 'Oi, {name}!',
  'housegains.preview.level': 'NVL 7 · TITÃ DA CASA',
  'housegains.preview.streak': '12 dias seguidos',
  'housegains.preview.week': 'Esta semana',
  'housegains.preview.points': 'Pontos nesta semana',
  'housegains.preview.points_unit': 'PTS',
  'housegains.preview.points_fraction': 'de {goal} pts',
  'housegains.preview.rank': 'posição',
  'housegains.preview.arcade_delta':
    '{member} lidera por {lead} pts. Faltam {pointsToPass} pontos para passar.',
  'housegains.preview.sticker_delta': 'Mais {pointsToPass} pontos para passar {member}.',
  'housegains.preview.goal': 'Meta semanal',
  'housegains.preview.goal_progress': '{percent}% concluídos',
  'housegains.preview.arcade_tasks': 'Missões de hoje',
  'housegains.preview.sticker_tasks': 'Tarefas de hoje',
  'housegains.preview.soft_tasks': 'Sua vez hoje',
  'housegains.preview.done_count': '{done} de {total} concluídas',
  'housegains.preview.task_recycling': 'Levar a reciclagem',
  'housegains.preview.task_dishes': 'Lavar a louça do jantar',
  'housegains.preview.task_vacuum': 'Aspirar a sala',
  'housegains.preview.task_plants': 'Regar as plantas',
  'housegains.preview.task_done_time': 'Concluída às 18h40',
  'housegains.preview.task_dishes_hint': 'Sua tarefa · após o jantar',
  'housegains.preview.task_vacuum_hint': 'Bia · para hoje',
  'housegains.preview.bounty_hint': 'Disponível · bônus de +5',
  'housegains.preview.claim': 'Assumir',
  'housegains.preview.grab_it': 'Quero fazer',
  'housegains.preview.greeting': 'Boa noite,',
  'housegains.preview.you': 'Você',
  'housegains.preview.member_rafa': 'Rafa',
  'housegains.preview.member_bia': 'Bia',
  'housegains.preview.member_thiago': 'Thiago',
  ...houseGainsScreensPtBR,
};

export default ptBR;
export { ptBR };
