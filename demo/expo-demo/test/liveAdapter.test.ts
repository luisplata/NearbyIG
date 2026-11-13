import { describe, expect, it } from 'vitest';

import { fixtures } from '../src/generated/fixtures';
import { toUiProfile, toUiProfiles } from '../src/live/adapter';
import type { LiveProfileRow } from '../src/live/types';

const row = (overrides: Partial<LiveProfileRow> = {}): LiveProfileRow => ({
  profileId: 'mx-p01',
  regionKey: 'mx',
  demoSlot: 1,
  sourceType: 'human',
  nickname: 'Vale',
  initials: 'VA',
  intention: 'networking',
  gender: 'female',
  verified: true,
  online: true,
  inUse: false,
  distanceM: 240,
  bearingDeg: 32,
  photoId: 'ph01',
  instagramHandle: 'vale.works',
  statusKey: 'status.p01',
  bioKey: 'bio.p01',
  ...overrides,
});

describe('adapter de descubrimiento', () => {
  it('mapea los 13 campos del dataset 1:1, sin dejar ninguno vacío', () => {
    const profile = toUiProfile(row())!;
    expect(profile).toEqual({
      id: 'mx-p01',
      nickname: 'Vale',
      initials: 'VA',
      gender: 'female',
      intention: 'networking',
      verified: true,
      online: true,
      distanceM: 240,
      bearingDeg: 32,
      photoId: 'ph01',
      instagramHandle: 'vale.works',
      statusKey: 'status.p01',
      bioKey: 'bio.p01',
    });
    for (const [field, value] of Object.entries(profile)) {
      expect(value, field).not.toBe('');
      expect(value, field).not.toBeUndefined();
    }
  });

  it('las claves de copy del backend resuelven en el catálogo local', () => {
    // El catálogo se siembra desde el mismo dataset, así que `fmt()` no puede
    // quedarse sin texto: `status.*` y `bio.*` existen en el copy del bundle.
    const profile = toUiProfile(row())!;
    expect(Object.keys(fixtures.profiles[0])).toContain('statusKey');
    expect(profile.statusKey).toBe(fixtures.profiles[0].statusKey);
    expect(profile.bioKey).toBe(fixtures.profiles[0].bioKey);
  });

  it('descarta la identidad de slot: la tarjeta y el radar no la dibujan', () => {
    const profile = toUiProfile(row({ demoSlot: 7, inUse: true, sourceType: 'bot' }))!;
    expect(profile).not.toHaveProperty('demoSlot');
    expect(profile).not.toHaveProperty('inUse');
    expect(profile).not.toHaveProperty('sourceType');
    expect(profile).not.toHaveProperty('regionKey');
  });

  it('un perfil bot entra como cualquier perfil', () => {
    const profile = toUiProfile(row({ profileId: 'mx-p01-b2', sourceType: 'bot', distanceM: 1060 }))!;
    expect(profile.id).toBe('mx-p01-b2');
    expect(profile.distanceM).toBe(1060);
  });

  it('redondea las medidas y normaliza el rumbo al rango del contrato', () => {
    const profile = toUiProfile(row({ distanceM: 1060.6, bearingDeg: 361 }))!;
    expect(profile.distanceM).toBe(1061);
    expect(profile.bearingDeg).toBe(1);
    expect(toUiProfile(row({ bearingDeg: -1 }))!.bearingDeg).toBe(359);
  });

  it('rechaza filas que la UI no puede dibujar', () => {
    expect(toUiProfile(row({ profileId: '' }))).toBeNull();
    expect(toUiProfile(row({ nickname: '' }))).toBeNull();
    expect(toUiProfile(row({ intention: 'networking ' }))).toBeNull();
    expect(toUiProfile(row({ gender: 'otro' }))).toBeNull();
    expect(toUiProfile(row({ distanceM: Number.NaN }))).toBeNull();
    expect(toUiProfile(row({ bearingDeg: Number.POSITIVE_INFINITY }))).toBeNull();
  });

  it('preserva el orden que entrega el server', () => {
    const profiles = toUiProfiles([
      row({ profileId: 'a', distanceM: 200 }),
      row({ profileId: 'b', distanceM: 900 }),
      row({ profileId: 'c', distanceM: 4000 }),
    ]);
    expect(profiles.map((profile) => profile.id)).toEqual(['a', 'b', 'c']);
  });
});
