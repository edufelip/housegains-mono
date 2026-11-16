import { houseGainsScreensEsES } from './screens/es-ES';
import type { enUS } from './en-US';

const esES: Record<keyof typeof enUS, string> = {
  'housegains.appearance.title': 'Elige tu estilo',
  'housegains.appearance.subtitle':
    'Elige el aspecto de tu hogar. Puedes cambiarlo cuando quieras en Ajustes.',
  'housegains.appearance.preview_hint': 'Vista previa de un hogar de ejemplo',
  'housegains.appearance.continue': 'Continuar',
  'housegains.appearance.retry_load': 'Intentar cargar de nuevo',
  'housegains.appearance.retry_save': 'Intentar guardar de nuevo',
  'housegains.appearance.saving': 'Guardando estilo…',
  'housegains.appearance.selected': 'Seleccionado',
  'housegains.appearance.select': 'Elegir {theme}',
  'housegains.appearance.error.load':
    'No se pudo cargar tu estilo guardado. Elige un estilo o inténtalo de nuevo.',
  'housegains.appearance.error.save':
    'El estilo se muestra en la vista previa, pero no se guardó. Inténtalo de nuevo para continuar.',
  'housegains.appearance.choose': 'Elegir {theme}',
  'housegains.appearance.swipe_hint': 'Desliza para comparar los {count} estilos',
  'housegains.appearance.previous': 'Estilo anterior',
  'housegains.appearance.next': 'Estilo siguiente',
  'housegains.appearance.page_position': '{index} de {total}',
  'housegains.appearance.language_button': 'Idioma: {language}. Cambiar',
  'housegains.appearance.language_done': 'Listo',
  'housegains.theme.arcade.name': 'Arcade',
  'housegains.theme.arcade.description':
    'Misiones oscuras, verde lima eléctrico y progreso lleno de energía.',
  'housegains.theme.sticker.name': 'Sticker Pop',
  'housegains.theme.sticker.description':
    'Amarillo mantequilla, azul intenso, bordes gruesos y sombras marcadas.',
  'housegains.theme.soft.name': 'Soft Home',
  'housegains.theme.soft.description':
    'Lavanda suave, progreso tranquilo y elegantes títulos serif.',
  'housegains.preview.home_name': 'Apto 302',
  'housegains.preview.member_name': 'Edu',
  'housegains.preview.member_initials': 'ED',
  'housegains.preview.sticker_greeting': '¡Hola, {name}!',
  'housegains.preview.level': 'NIV 7 · TITÁN DEL HOGAR',
  'housegains.preview.streak': '12 días seguidos',
  'housegains.preview.week': 'Esta semana',
  'housegains.preview.points': 'Puntos de esta semana',
  'housegains.preview.points_unit': 'PTS',
  'housegains.preview.points_fraction': 'de {goal} pts',
  'housegains.preview.rank': 'puesto',
  'housegains.preview.arcade_delta':
    '{member} va delante por {lead} pts. Faltan {pointsToPass} puntos para superar su marca.',
  'housegains.preview.sticker_delta': 'Te faltan {pointsToPass} puntos para superar a {member}.',
  'housegains.preview.goal': 'Meta semanal',
  'housegains.preview.goal_progress': 'Llevas el {percent}%',
  'housegains.preview.arcade_tasks': 'Misiones de hoy',
  'housegains.preview.sticker_tasks': 'Tareas de hoy',
  'housegains.preview.soft_tasks': 'Te toca hoy',
  'housegains.preview.done_count': '{done} de {total} completadas',
  'housegains.preview.task_recycling': 'Sacar el reciclaje',
  'housegains.preview.task_dishes': 'Lavar los platos de la cena',
  'housegains.preview.task_vacuum': 'Aspirar el salón',
  'housegains.preview.task_plants': 'Regar las plantas',
  'housegains.preview.task_done_time': 'Terminada a las 18:40',
  'housegains.preview.task_dishes_hint': 'Tu tarea · después de cenar',
  'housegains.preview.task_vacuum_hint': 'Bia · para hoy',
  'housegains.preview.bounty_hint': 'Disponible · +5 extra',
  'housegains.preview.claim': 'Reclamar',
  'housegains.preview.grab_it': 'Me apunto',
  'housegains.preview.greeting': 'Buenas tardes,',
  'housegains.preview.you': 'Tú',
  'housegains.preview.member_rafa': 'Rafa',
  'housegains.preview.member_bia': 'Bia',
  'housegains.preview.member_thiago': 'Thiago',
  'housegains.preview.clock': '9:41',
  ...houseGainsScreensEsES,
};

export default esES;
export { esES };
