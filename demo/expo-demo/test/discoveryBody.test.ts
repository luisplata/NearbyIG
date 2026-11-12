import { describe, expect, it } from 'vitest';

import { bodyFor, isReservedMapView } from '../src/screens/discoveryBody';

describe('vista → cuerpo de descubrimiento', () => {
  it('lista tiene su propio cuerpo', () => {
    expect(bodyFor('list')).toBe('list');
  });

  it('radar y el reservado map comparten la misma composición', () => {
    expect(bodyFor('radar')).toBe('radarMap');
    expect(bodyFor('map')).toBe('radarMap');
    expect(bodyFor('map')).toBe(bodyFor('radar'));
  });

  it('map sigue siendo un valor interno reservado', () => {
    expect(isReservedMapView('map')).toBe(true);
    expect(isReservedMapView('radar')).toBe(false);
    expect(isReservedMapView('list')).toBe(false);
  });
});
