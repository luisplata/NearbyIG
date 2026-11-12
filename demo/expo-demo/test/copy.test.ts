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
  });
});
