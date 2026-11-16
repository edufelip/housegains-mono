import { houseGainsScreensDeDE } from './screens/de-DE';
import type { enUS } from './en-US';

const deDE: Record<keyof typeof enUS, string> = {
  'housegains.appearance.title': 'Wähle deinen Stil',
  'housegains.appearance.subtitle':
    'Wähle einen Look für dein Zuhause. Du kannst ihn jederzeit in den Einstellungen ändern.',
  'housegains.appearance.preview_hint': 'Vorschau eines Beispielhaushalts',
  'housegains.appearance.continue': 'Weiter',
  'housegains.appearance.retry_load': 'Erneut laden',
  'housegains.appearance.retry_save': 'Erneut speichern',
  'housegains.appearance.saving': 'Stil wird gespeichert…',
  'housegains.appearance.selected': 'Ausgewählt',
  'housegains.appearance.select': '{theme} auswählen',
  'housegains.appearance.error.load':
    'Dein gespeicherter Stil konnte nicht geladen werden. Wähle einen Stil aus oder versuche es erneut.',
  'housegains.appearance.error.save':
    'Dein Stil wird in der Vorschau angezeigt, wurde aber nicht gespeichert. Versuche es erneut, um fortzufahren.',
  'housegains.appearance.choose': '{theme} wählen',
  'housegains.appearance.swipe_hint': 'Wische, um alle {count} Stile zu vergleichen',
  'housegains.appearance.previous': 'Vorheriger Stil',
  'housegains.appearance.next': 'Nächster Stil',
  'housegains.appearance.page_position': '{index} von {total}',
  'housegains.appearance.language_button': 'Sprache: {language}. Ändern',
  'housegains.appearance.language_done': 'Fertig',
  'housegains.theme.arcade.name': 'Arcade',
  'housegains.theme.arcade.description':
    'Dunkle Missionen, leuchtendes Limettengrün und Fortschritt voller Energie.',
  'housegains.theme.sticker.name': 'Sticker Pop',
  'housegains.theme.sticker.description':
    'Buttergelb, kräftiges Blau, dicke Konturen und markante Schatten.',
  'housegains.theme.soft.name': 'Soft Home',
  'housegains.theme.soft.description':
    'Helles Lavendel, entspannter Fortschritt und elegante Überschriften mit Serifen.',
  'housegains.preview.home_name': 'Apto 302',
  'housegains.preview.member_name': 'Edu',
  'housegains.preview.member_initials': 'ED',
  'housegains.preview.sticker_greeting': 'Hallo, {name}!',
  'housegains.preview.level': 'LEVEL 7 · ORDNUNGS-TITAN',
  'housegains.preview.streak': '12 Tage in Folge',
  'housegains.preview.week': 'Diese Woche',
  'housegains.preview.points': 'Punkte diese Woche',
  'housegains.preview.points_unit': 'PKT.',
  'housegains.preview.points_fraction': 'von {goal} Pkt.',
  'housegains.preview.rank': 'Rang',
  'housegains.preview.arcade_delta':
    '{member} liegt mit {lead} Pkt. vorn. Noch {pointsToPass} Punkte bis zum Überholen.',
  'housegains.preview.sticker_delta': 'Noch {pointsToPass} Punkte, um {member} zu überholen.',
  'housegains.preview.goal': 'Wochenziel',
  'housegains.preview.goal_progress': 'Zu {percent} % erreicht',
  'housegains.preview.arcade_tasks': 'Heutige Missionen',
  'housegains.preview.sticker_tasks': 'Heutige Aufgaben',
  'housegains.preview.soft_tasks': 'Du bist heute dran',
  'housegains.preview.done_count': '{done} von {total} erledigt',
  'housegains.preview.task_recycling': 'Recycling rausbringen',
  'housegains.preview.task_dishes': 'Abendgeschirr spülen',
  'housegains.preview.task_vacuum': 'Wohnzimmer staubsaugen',
  'housegains.preview.task_plants': 'Pflanzen gießen',
  'housegains.preview.task_done_time': 'Um 18:40 Uhr erledigt',
  'housegains.preview.task_dishes_hint': 'Deine Aufgabe · nach dem Abendessen',
  'housegains.preview.task_vacuum_hint': 'Bia · heute fällig',
  'housegains.preview.bounty_hint': 'Für alle verfügbar · +5 Bonus',
  'housegains.preview.claim': 'Übernehmen',
  'housegains.preview.grab_it': 'Ich mach’s',
  'housegains.preview.greeting': 'Guten Abend,',
  'housegains.preview.you': 'Du',
  'housegains.preview.member_rafa': 'Rafa',
  'housegains.preview.member_bia': 'Bia',
  'housegains.preview.member_thiago': 'Thiago',
  'housegains.preview.clock': '9:41',
  ...houseGainsScreensDeDE,
};

export default deDE;
export { deDE };
