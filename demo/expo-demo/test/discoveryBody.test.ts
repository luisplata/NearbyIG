import { describe, expect, it } from 'vitest';

import { bodyFor, discoveryLayout, isReservedMapView } from '../src/screens/discoveryBody';

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

describe('cuerpo con 0 perfiles', () => {
  it('el radar se sigue viendo aunque no haya nadie', () => {
    expect(discoveryLayout('radar', 0, false)).toBe('radarMap');
    expect(discoveryLayout('map', 0, true)).toBe('radarMap');
    // El orden importa: el estado vacío no puede ganarle al radar.
    expect(discoveryLayout('radar', 0, true)).not.toBe('emptyList');
  });

  it('la lista sin perfiles y con filtros muestra el vacío de filtros', () => {
    expect(discoveryLayout('list', 0, true)).toBe('emptyList');
  });

  it('la lista sin perfiles y sin filtros muestra el vacío de densidad', () => {
    // Nadie en el radio no es un filtro mal puesto: no hay CTA que ofrecer.
    expect(discoveryLayout('list', 0, false)).toBe('emptyDensity');
    expect(discoveryLayout('list', 0, false)).not.toBe('emptyList');
  });

  it('con perfiles, la lista los muestra y el radar no cambia', () => {
    expect(discoveryLayout('list', 3, false)).toBe('list');
    expect(discoveryLayout('list', 3, true)).toBe('list');
    expect(discoveryLayout('radar', 3, true)).toBe('radarMap');
  });
});
