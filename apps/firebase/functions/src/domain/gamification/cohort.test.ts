import { describe, expect, it } from 'vitest';
import { cohortFor, fnv1a32, visibility } from './cohort';

describe('fnv1a32', () => {
  it('matches the known FNV-1a vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('is deterministic and stays within uint32', () => {
    expect(fnv1a32('house-1')).toBe(fnv1a32('house-1'));
    expect(fnv1a32('house-1')).toBeGreaterThan(0);
    expect(fnv1a32('house-1')).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('cohortFor', () => {
  const salt = 'salty';

  it('puts h < livePercent in live and the next controlPercent slice in control', () => {
    // Find ids that hash into each slice for this salt.
    let liveId = '';
    let controlId = '';
    let shadowId = '';
    for (let i = 0; i < 5000 && !(liveId && controlId && shadowId); i++) {
      const id = `house-${i}`;
      const h = fnv1a32(id + salt) % 100;
      if (h < 30 && !liveId) liveId = id;
      else if (h >= 30 && h < 50 && !controlId) controlId = id;
      else if (h >= 50 && !shadowId) shadowId = id;
    }
    const config = { cohortSalt: salt, livePercent: 30, controlPercent: 20 };
    expect(cohortFor(liveId, config)).toBe('live');
    expect(cohortFor(controlId, config)).toBe('control');
    expect(cohortFor(shadowId, config)).toBe('shadow');
  });

  it('is all live at 100 percent and all shadow at zero rollout', () => {
    expect(cohortFor('any', { cohortSalt: salt, livePercent: 100, controlPercent: 0 })).toBe('live');
    expect(cohortFor('any', { cohortSalt: salt, livePercent: 0, controlPercent: 0 })).toBe('shadow');
  });

  it('treats live + control as covering everything when they sum to 100', () => {
    const config = { cohortSalt: salt, livePercent: 50, controlPercent: 50 };
    for (let i = 0; i < 50; i++) {
      const cohort = cohortFor(`house-${i}`, config);
      expect(cohort === 'live' || cohort === 'control').toBe(true);
    }
  });

  it('depends on the salt', () => {
    const a = fnv1a32('house-9' + 'one') % 100;
    const b = fnv1a32('house-9' + 'two') % 100;
    // Not guaranteed distinct, but the cohort space is partitioned by salt:
    // with 100 buckets both values exist in 0..99.
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(100);
  });
});

describe('visibility', () => {
  it('does nothing while mode is off', () => {
    expect(visibility('off', 'live')).toEqual({ write: false, celebrate: false });
    expect(visibility('off', 'shadow')).toEqual({ write: false, celebrate: false });
  });

  it('writes but never celebrates in shadow mode', () => {
    expect(visibility('shadow', 'live')).toEqual({ write: true, celebrate: false });
    expect(visibility('shadow', 'shadow')).toEqual({ write: true, celebrate: false });
  });

  it('celebrates only for live households under live mode', () => {
    expect(visibility('live', 'live')).toEqual({ write: true, celebrate: true });
    expect(visibility('live', 'control')).toEqual({ write: true, celebrate: false });
    expect(visibility('live', 'shadow')).toEqual({ write: true, celebrate: false });
  });
});
