/**
 * Seguimiento de la posición propia: la cuenta de "¿se movió lo suficiente?".
 *
 * **Para qué.** El `PUT /presence` es lo único que lleva coordenadas y cada PUT
 * vive en el rate limit del backend. Cuando la presencia es GPS, el controlador
 * relee el punto cada 10 s, pero **no** lo manda si la persona sigue en la misma
 * silla: por debajo del umbral el pedido no aporta nada (las distancias del
 * radar cambian menos que la precisión del propio GPS) y sí gasta cuota.
 *
 * **Qué NO hace.** No pide posiciones, no decide cuándo leer, no guarda nada y
 * no conoce el controlador. Es una función de dos puntos y un número.
 *
 * **Por qué haversine y no la diferencia de grados.** A la latitud de CDMX un
 * grado de longitud mide ~105 km y en Bogotá ~111 km: comparar `dLat + dLng`
 * daría un umbral distinto en cada ciudad. La distancia esférica es la misma
 * cuenta para las dos zonas del catálogo y no necesita dependencias.
 */

import type { GeoPoint } from './geolocation';

/**
 * Umbral de movimiento: 10 m. Es el mismo orden que la precisión típica de un
 * `enableHighAccuracy: false` en ciudad, así que por debajo no hay señal de
 * movimiento, hay ruido.
 */
export const MOVED_MIN_M = 10;

/** Radio medio terrestre (IUGG), en metros. */
const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Distancia esférica entre dos puntos, en metros.
 *
 * `NaN`/`Infinity` devuelven `Infinity`: un punto inválido nunca es "el mismo
 * lugar", y el controlador ya descarta esos puntos antes de llegar acá.
 */
export function distanceM(from: GeoPoint, to: GeoPoint): number {
  if (
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  // `atan2` en vez de `asin`: estable con valores que se van de 1 por redondeo.
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * `true` si vale la pena mandar `next` como presencia nueva.
 *
 * Sin punto previo (la primera lectura del seguimiento tras el gesto) siempre
 * es `true`: es la referencia contra la que se mide todo lo demás.
 */
export function movedEnough(
  next: GeoPoint,
  previous: GeoPoint | null,
  minM: number = MOVED_MIN_M,
): boolean {
  if (previous === null) {
    return true;
  }
  return distanceM(previous, next) >= minM;
}
