import { describe, expect, it } from 'vitest';

import { copy } from '../src/generated/copy';

describe('copy de marca y slogan', () => {
  it('la marca visible es Nearby Social Club con slogan Cowork Café', () => {
    expect(copy['about.brand']).toBe('Nearby Social Club');
    expect(copy['about.club']).toBe('Cowork Café');
    expect(copy['landing.eyebrow']).toBe(copy['about.club']);
  });

  it('el label DEMO sigue siendo exactamente DEMO', () => {
    expect(copy['common.demoChip']).toBe('DEMO');
  });

  it('el header y About no muestran texto de demo o mock', () => {
    for (const key of ['about.brand', 'about.club', 'settings.ghost'] as const) {
      expect(copy[key].toLowerCase()).not.toMatch(/demo|mock/);
    }
    expect(copy['landing.documentTitle']).toContain(copy['about.brand']);
    expect(copy['landing.documentTitle']).toContain(copy['about.club']);
  });

  it('los textos accesibles del radar conservan nombre y distancia', () => {
    expect(copy['a11y.radar']).toBeTruthy();
    expect(copy['a11y.profileDot']).toContain('{name}');
    expect(copy['a11y.profileDot']).toContain('{distance}');
    expect(copy['a11y.map']).toMatch(/mapa de referencia/i);
  });
});

describe('copy del basemap real', () => {
  it('la atribución nombra servicio, esquema y datos, sin URL', () => {
    const attribution = copy['discovery.mapAttribution'];
    expect(attribution).toContain('OpenFreeMap');
    expect(attribution).toContain('OpenMapTiles');
    expect(attribution).toContain('OpenStreetMap');
    expect(attribution).not.toMatch(/https?:\/\//i);
  });

  it('la nota del mapa aclara el centro fijo y las posiciones de guion', () => {
    const note = copy['discovery.mapNote'];
    expect(note).toMatch(/centro fijo/i);
    expect(note).toMatch(/guion|simulad/i);
  });

  it('la leyenda ilustrada sigue diciendo "mapa simulado" (Flutter la usa)', () => {
    expect(copy['discovery.mapLegend']).toMatch(/simulado/i);
  });

  it('la hoja de simulación conserva 8 ítems y ninguno niega los tiles', () => {
    for (let index = 1; index <= 8; index += 1) {
      expect(copy[`common.simItems.${index}` as keyof typeof copy]).toBeTruthy();
    }
    const simItems = Object.entries(copy).filter(([key]) => key.startsWith('common.simItems.'));
    expect(simItems).toHaveLength(8);
    for (const [key, value] of simItems) {
      expect(value, key).not.toMatch(/sin tiles|cero requests? externos?|ningún dato sale del navegador/i);
    }
  });

  it('ninguna clave de red promete cero pedidos externos', () => {
    for (const [key, value] of Object.entries(copy)) {
      expect(value, key).not.toMatch(/cero requests? externos?|sin red(?! de datos)/i);
    }
  });
});
