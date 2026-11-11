import { describe, expect, it } from 'vitest';

import { formatDistance, formatRadius } from '../src/state/format';

describe('formatDistance', () => {
  it('bajo 1000 m usa metros sin decimales', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(200)).toBe('200 m');
    expect(formatDistance(240)).toBe('240 m');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('desde 1000 m usa km con una decimal y coma', () => {
    expect(formatDistance(1000)).toBe('1,0 km');
    expect(formatDistance(1150)).toBe('1,2 km');
    expect(formatDistance(1480)).toBe('1,5 km');
    expect(formatDistance(1950)).toBe('2,0 km');
    expect(formatDistance(2600)).toBe('2,6 km');
    expect(formatDistance(3200)).toBe('3,2 km');
    expect(formatDistance(4800)).toBe('4,8 km');
    expect(formatDistance(5000)).toBe('5,0 km');
  });

  it('formatRadius usa el mismo formato que formatDistance', () => {
    for (const radius of [500, 1000, 2000, 5000]) {
      expect(formatRadius(radius)).toBe(formatDistance(radius));
    }
  });
});
