import { fixtures } from '../generated/fixtures';
import type { Gender, Intention } from '../generated/fixtures';
import type { UiProfile } from '../state/types';

import type { LiveProfileRow } from './types';

/**
 * Adapter explícito entre `ProfileSummary` (contrato) y `UiProfile` (lo que
 * dibuja la UI). Un solo lugar, testeado: el mapeo no se reparte por pantallas.
 *
 * **Qué es 1:1.** Los 13 campos del dataset viajan con el mismo nombre y el
 * mismo significado: `nickname`, `initials`, `intention`, `gender`, `verified`,
 * `online`, `distanceM`, `bearingDeg`, `photoId`, `instagramHandle`, `statusKey`
 * y `bioKey`. Con el catálogo sembrado desde `contract/` los `*Key` resuelven en
 * el mismo `copy.json` que usa el mock, así que no queda texto vacío.
 *
 * **Qué se descarta (y por qué no se pierde nada).** `regionKey`, `demoSlot`,
 * `sourceType` e `inUse` son identidad de slot y estado de ocupación: la lista y
 * el radar no los muestran. Viven en el selector de perfiles
 * (`ProfilePickerSheet`), que trabaja con la fila cruda.
 *
 * **Qué queda vacío.** Nada por falta de datos del backend: el contrato es
 * `additionalProperties: false` sobre los 17 campos que sí salen. Lo que el
 * backend **no** da es la posición absoluta (`lat`/`lng`), y por eso el radar se
 * dibuja con `distanceM`/`bearingDeg`, igual que el mock.
 *
 * **Por qué valida.** Una fila sin `profileId`, con un `gender`/`intention`
 * fuera del vocabulario o con medidas no finitas se descarta: es preferible una
 * lista más corta que un `NaN` en el radar o un `fmt()` de una clave
 * inexistente.
 */
export function toUiProfile(row: LiveProfileRow): UiProfile | null {
  if (row.profileId === '' || row.nickname === '') {
    return null;
  }
  if (!Number.isFinite(row.distanceM) || !Number.isFinite(row.bearingDeg)) {
    return null;
  }
  if (!isIntention(row.intention) || !isGender(row.gender)) {
    return null;
  }
  return {
    id: row.profileId,
    nickname: row.nickname,
    initials: row.initials,
    gender: row.gender,
    intention: row.intention,
    verified: row.verified,
    online: row.online,
    // El contrato acota `distanceM` a 200–5000 y el server ya redondea; el
    // clamp es sólo una red de seguridad para un response inválido.
    distanceM: Math.round(row.distanceM),
    bearingDeg: ((Math.round(row.bearingDeg) % 360) + 360) % 360,
    photoId: row.photoId,
    instagramHandle: row.instagramHandle,
    statusKey: row.statusKey,
    bioKey: row.bioKey,
  };
}

export function toUiProfiles(rows: readonly LiveProfileRow[]): UiProfile[] {
  const profiles: UiProfile[] = [];
  for (const row of rows) {
    const profile = toUiProfile(row);
    if (profile !== null) {
      profiles.push(profile);
    }
  }
  return profiles;
}

function isIntention(value: string): value is Intention {
  return fixtures.filters.intentions.includes(value as Intention);
}

function isGender(value: string): value is Gender {
  return fixtures.filters.genders.includes(value as Gender);
}
