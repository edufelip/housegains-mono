// Hemisphere and local-season helpers (C7: seasonal achievements).
// The household timeZone decides which side of the equator counts.

const SOUTHERN_PREFIXES = ['Australia/', 'America/Argentina/'];

const SOUTHERN_ZONES = new Set([
  // Oceania
  'Pacific/Auckland',
  'Pacific/Chatham',
  'Pacific/Fiji',
  'Pacific/Port_Moresby',
  // Brazil: every IANA zone south of the equator (Boa Vista is north and excluded)
  'America/Sao_Paulo',
  'America/Bahia',
  'America/Recife',
  'America/Fortaleza',
  'America/Maceio',
  'America/Araguaina',
  'America/Belem',
  'America/Santarem',
  'America/Manaus',
  'America/Porto_Velho',
  'America/Rio_Branco',
  'America/Eirunepe',
  'America/Campo_Grande',
  'America/Cuiaba',
  'America/Noronha',
  // Rest of South America
  'America/Santiago',
  'America/Montevideo',
  'America/Asuncion',
  'America/La_Paz',
  'America/Lima',
  // Africa and Indian Ocean
  'Africa/Johannesburg',
  'Africa/Maputo',
  'Africa/Windhoek',
  'Africa/Harare',
  'Africa/Lusaka',
  'Africa/Gaborone',
  'Africa/Kinshasa',
  'Africa/Luanda',
  'Africa/Dar_es_Salaam',
  'Africa/Nairobi',
  'Africa/Kigali',
  'Africa/Lubumbashi',
  'Africa/Blantyre',
  'Indian/Antananarivo',
  'Indian/Mauritius',
  // Maritime Southeast Asia (south of the equator)
  'Asia/Jakarta',
  'Asia/Makassar',
]);

export function isSouthernHemisphere(timeZone: string): boolean {
  if (SOUTHERN_ZONES.has(timeZone)) return true;
  return SOUTHERN_PREFIXES.some((prefix) => timeZone.startsWith(prefix));
}

/** Spring is Sep-Nov in the south, Mar-May in the north (C7). */
export function isSpring(dateKey: string, timeZone: string): boolean {
  const month = Number(dateKey.slice(5, 7));
  return isSouthernHemisphere(timeZone) ? month >= 9 && month <= 11 : month >= 3 && month <= 5;
}

/**
 * Identifies one local spring season so seasonal stats reset between seasons
 * (and outside the season).
 */
export function springSeasonKey(dateKey: string, timeZone: string): string {
  if (!isSpring(dateKey, timeZone)) return 'none';
  const year = Number(dateKey.slice(0, 4));
  return isSouthernHemisphere(timeZone) ? `south:${year}` : `north:${year}`;
}
