import { houseGainsScreensFrFR } from './screens/fr-FR';
import type { enUS } from './en-US';

const frFR: Record<keyof typeof enUS, string> = {
  'housegains.appearance.title': 'Choisis ton style',
  'housegains.appearance.subtitle':
    'Choisis l’ambiance de ton foyer. Tu pourras la modifier à tout moment dans les paramètres.',
  'housegains.appearance.preview_hint': 'Aperçu d’un foyer exemple',
  'housegains.appearance.continue': 'Continuer',
  'housegains.appearance.retry_load': 'Réessayer le chargement',
  'housegains.appearance.retry_save': 'Réessayer l’enregistrement',
  'housegains.appearance.saving': 'Enregistrement du style…',
  'housegains.appearance.selected': 'Sélectionné',
  'housegains.appearance.select': 'Sélectionner {theme}',
  'housegains.appearance.error.load':
    'Impossible de charger ton style enregistré. Choisis un style ou réessaie.',
  'housegains.appearance.error.save':
    'Ton style s’affiche dans l’aperçu, mais il n’a pas été enregistré. Réessaie pour continuer.',
  'housegains.appearance.choose': 'Choisir {theme}',
  'housegains.appearance.swipe_hint': 'Fais glisser pour comparer les {count} styles',
  'housegains.appearance.previous': 'Style précédent',
  'housegains.appearance.next': 'Style suivant',
  'housegains.appearance.page_position': '{index} sur {total}',
  'housegains.appearance.language_button': 'Langue : {language}. Modifier',
  'housegains.appearance.language_done': 'Terminé',
  'housegains.theme.arcade.name': 'Arcade',
  'housegains.theme.arcade.description':
    'Des missions sur fond noir, du vert citron électrique et une progression pleine d’énergie.',
  'housegains.theme.sticker.name': 'Sticker Pop',
  'housegains.theme.sticker.description':
    'Jaune beurre, bleu vif, contours épais et ombres marquées.',
  'housegains.theme.soft.name': 'Soft Home',
  'housegains.theme.soft.description':
    'Lavande pâle, progression sereine et titres élégants à empattements.',
  'housegains.preview.home_name': 'Appartement 302',
  'housegains.preview.member_name': 'Edu',
  'housegains.preview.member_initials': 'ED',
  'housegains.preview.sticker_greeting': 'Salut {name} !',
  'housegains.preview.level': 'NIV. 7 · TITAN DU RANGEMENT',
  'housegains.preview.streak': 'Série de 12 jours',
  'housegains.preview.week': 'Cette semaine',
  'housegains.preview.points': 'Points cette semaine',
  'housegains.preview.points_unit': 'PTS',
  'housegains.preview.points_fraction': 'sur {goal} pts',
  'housegains.preview.rank': 'rang',
  'housegains.preview.arcade_delta':
    '{member} a {lead} pts d’avance. Encore {pointsToPass} points pour le dépasser.',
  'housegains.preview.sticker_delta': 'Encore {pointsToPass} points pour passer devant {member}.',
  'housegains.preview.goal': 'Objectif hebdomadaire',
  'housegains.preview.goal_progress': 'À {percent} %',
  'housegains.preview.arcade_tasks': 'Missions du jour',
  'housegains.preview.sticker_tasks': 'À faire aujourd’hui',
  'housegains.preview.soft_tasks': 'À ton tour aujourd’hui',
  'housegains.preview.done_count': '{done} sur {total} terminées',
  'housegains.preview.task_recycling': 'Sortir le tri sélectif',
  'housegains.preview.task_dishes': 'Laver la vaisselle du dîner',
  'housegains.preview.task_vacuum': 'Passer l’aspirateur dans le salon',
  'housegains.preview.task_plants': 'Arroser les plantes',
  'housegains.preview.task_done_time': 'Terminée à 18 h 40',
  'housegains.preview.task_dishes_hint': 'À toi · après le dîner',
  'housegains.preview.task_vacuum_hint': 'Bia · à faire aujourd’hui',
  'housegains.preview.bounty_hint': 'À prendre · bonus de +5',
  'housegains.preview.claim': 'Prendre',
  'housegains.preview.grab_it': 'Je m’en charge',
  'housegains.preview.greeting': 'Bonsoir,',
  'housegains.preview.you': 'Toi',
  'housegains.preview.member_rafa': 'Rafa',
  'housegains.preview.member_bia': 'Bia',
  'housegains.preview.member_thiago': 'Thiago',
  'housegains.preview.clock': '9:41',
  ...houseGainsScreensFrFR,
};

export default frFR;
export { frFR };
