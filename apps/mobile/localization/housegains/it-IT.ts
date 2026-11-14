import { houseGainsScreensItIT } from './screens/it-IT';
import type { enUS } from './en-US';

const itIT: Record<keyof typeof enUS, string> = {
  'housegains.appearance.title': 'Scegli il tuo stile',
  'housegains.appearance.subtitle':
    'Scegli l’aspetto della tua casa. Puoi cambiarlo quando vuoi nelle Impostazioni.',
  'housegains.appearance.preview_hint': 'Anteprima di una casa di esempio',
  'housegains.appearance.continue': 'Continua',
  'housegains.appearance.retry_load': 'Riprova a caricare',
  'housegains.appearance.retry_save': 'Riprova a salvare',
  'housegains.appearance.saving': 'Salvataggio dello stile…',
  'housegains.appearance.selected': 'Selezionato',
  'housegains.appearance.select': 'Seleziona {theme}',
  'housegains.appearance.error.load':
    'Impossibile caricare lo stile salvato. Scegline uno o riprova.',
  'housegains.appearance.error.save':
    'Lo stile è visualizzato in anteprima, ma non è stato salvato. Riprova per continuare.',
  'housegains.theme.arcade.name': 'Arcade',
  'housegains.theme.arcade.description':
    'Missioni scure, verde lime elettrico e progressi pieni di energia.',
  'housegains.theme.sticker.name': 'Sticker Pop',
  'housegains.theme.sticker.description':
    'Giallo burro, blu acceso, contorni marcati e ombre nette.',
  'housegains.theme.soft.name': 'Soft Home',
  'housegains.theme.soft.description':
    'Lavanda tenue, progressi sereni e raffinati titoli con grazie.',
  'housegains.preview.home_name': 'Apto 302',
  'housegains.preview.member_name': 'Edu',
  'housegains.preview.member_initials': 'ED',
  'housegains.preview.sticker_greeting': 'Ciao, {name}!',
  'housegains.preview.level': 'LIV. 7 · TITANO DELL’ORDINE',
  'housegains.preview.streak': '12 giorni consecutivi',
  'housegains.preview.week': 'Questa settimana',
  'housegains.preview.points': 'Punti questa settimana',
  'housegains.preview.points_unit': 'PT',
  'housegains.preview.points_fraction': 'su {goal} pt',
  'housegains.preview.rank': 'posizione',
  'housegains.preview.arcade_delta':
    '{member} è in testa di {lead} pt. Ti mancano {pointsToPass} punti per superarlo.',
  'housegains.preview.sticker_delta':
    'Ti servono altri {pointsToPass} punti per superare {member}.',
  'housegains.preview.goal': 'Obiettivo settimanale',
  'housegains.preview.goal_progress': 'Al {percent}%',
  'housegains.preview.arcade_tasks': 'Missioni di oggi',
  'housegains.preview.sticker_tasks': 'Faccende di oggi',
  'housegains.preview.soft_tasks': 'Oggi tocca a te',
  'housegains.preview.done_count': '{done} completate su {total}',
  'housegains.preview.task_recycling': 'Portare fuori la raccolta differenziata',
  'housegains.preview.task_dishes': 'Lavare i piatti della cena',
  'housegains.preview.task_vacuum': 'Passare l’aspirapolvere in soggiorno',
  'housegains.preview.task_plants': 'Annaffiare le piante',
  'housegains.preview.task_done_time': 'Completata alle 18:40',
  'housegains.preview.task_dishes_hint': 'Tocca a te · dopo cena',
  'housegains.preview.task_vacuum_hint': 'Bia · entro oggi',
  'housegains.preview.bounty_hint': 'Disponibile · +5 bonus',
  'housegains.preview.claim': 'Assegna a te',
  'housegains.preview.grab_it': 'Ci penso io',
  'housegains.preview.greeting': 'Buonasera,',
  'housegains.preview.you': 'Tu',
  'housegains.preview.member_rafa': 'Rafa',
  'housegains.preview.member_bia': 'Bia',
  'housegains.preview.member_thiago': 'Thiago',
  ...houseGainsScreensItIT,
};

export default itIT;
export { itIT };
