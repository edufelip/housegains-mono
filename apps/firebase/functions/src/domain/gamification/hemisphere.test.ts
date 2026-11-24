import { describe, expect, it } from 'vitest';
import { isSouthernHemisphere, isSpring, springSeasonKey } from './hemisphere';

describe('isSouthernHemisphere', () => {
  it('recognizes the named southern zones', () => {
    for (const zone of [
      'Australia/Sydney',
      'Australia/Perth',
      'Pacific/Auckland',
      'Pacific/Chatham',
      'America/Sao_Paulo',
      'America/Bahia',
      'America/Recife',
      'America/Manaus',
      'America/Argentina/Buenos_Aires',
      'America/Argentina/Cordoba',
      'America/Santiago',
      'America/Montevideo',
      'America/Asuncion',
      'America/La_Paz',
      'America/Lima',
      'Africa/Johannesburg',
      'Africa/Maputo',
      'Africa/Windhoek',
      'Indian/Mauritius',
      'Pacific/Fiji',
      'Pacific/Port_Moresby',
    ]) {
      expect(isSouthernHemisphere(zone), zone).toBe(true);
    }
  });

  it('rejects northern zones, including Brazilian Boa Vista (north of the equator)', () => {
    for (const zone of [
      'UTC',
      'Europe/Berlin',
      'America/New_York',
      'Asia/Tokyo',
      'America/Boa_Vista',
      'America/Bogota',
      'Africa/Cairo',
      'Asia/Jayapura',
    ]) {
      expect(isSouthernHemisphere(zone), zone).toBe(false);
    }
  });

  it('also covers the curated extra southern zones', () => {
    for (const zone of ['Asia/Jakarta', 'Asia/Makassar', 'Africa/Harare', 'Africa/Kinshasa', 'Indian/Antananarivo']) {
      expect(isSouthernHemisphere(zone), zone).toBe(true);
    }
  });
});

describe('isSpring', () => {
  it('treats September to November as spring in the southern hemisphere', () => {
    expect(isSpring('2026-09-01', 'America/Sao_Paulo')).toBe(true);
    expect(isSpring('2026-10-15', 'America/Sao_Paulo')).toBe(true);
    expect(isSpring('2026-11-30', 'America/Sao_Paulo')).toBe(true);
    expect(isSpring('2026-08-31', 'America/Sao_Paulo')).toBe(false);
    expect(isSpring('2026-12-01', 'America/Sao_Paulo')).toBe(false);
    expect(isSpring('2026-04-15', 'America/Sao_Paulo')).toBe(false);
  });

  it('treats March to May as spring in the northern hemisphere', () => {
    expect(isSpring('2026-03-01', 'Europe/Berlin')).toBe(true);
    expect(isSpring('2026-05-31', 'Europe/Berlin')).toBe(true);
    expect(isSpring('2026-10-15', 'Europe/Berlin')).toBe(false);
    expect(isSpring('2026-02-28', 'Europe/Berlin')).toBe(false);
    expect(isSpring('2026-06-01', 'Europe/Berlin')).toBe(false);
  });
});

describe('springSeasonKey', () => {
  it('separates years and returns a non-spring key outside the season', () => {
    expect(springSeasonKey('2026-10-05', 'America/Sao_Paulo')).toBe('south:2026');
    expect(springSeasonKey('2027-09-07', 'America/Sao_Paulo')).toBe('south:2027');
    expect(springSeasonKey('2026-04-05', 'Europe/Berlin')).toBe('north:2026');
    expect(springSeasonKey('2026-07-05', 'Europe/Berlin')).toBe('none');
  });
});
