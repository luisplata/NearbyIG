import * as Location from 'expo-location';

import type { GeoRequestOptions, GeoResult } from './geolocation';
import { NATIVE_TIMEOUT_MS, requestNativePoint } from './geolocation';

/**
 * Adaptador de `expo-location`: **el único módulo del repo que nombra el paquete**.
 *
 * Metro resuelve `'./requestPoint'` a este archivo en android/ios y a
 * `requestPoint.ts` en web (design A2), así que el bundle publicado no puede
 * alcanzar `expo-location` ni por accidente: no hay un `if` que se pueda
 * equivocar. `test/privacy.test.ts` lo verifica estáticamente.
 *
 * Una lectura por gesto y precisión balanceada: el radar muestra distancias y el
 * GPS fino calienta la radio del teléfono sin cambiar la experiencia. Si el
 * controlador pide alta precisión (el seguimiento de 15 s usa el mismo port), se
 * respeta.
 */
export function requestPoint(options?: GeoRequestOptions): Promise<GeoResult> {
  return requestNativePoint(Location, {
    timeoutMs: options?.timeout ?? NATIVE_TIMEOUT_MS,
    accuracy:
      options?.enableHighAccuracy === true ? Location.Accuracy.High : Location.Accuracy.Balanced,
  });
}
