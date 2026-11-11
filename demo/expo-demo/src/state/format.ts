/**
 * Distancia según el contrato: `< 1000` → `"N m"`; si no → `"X,Y km"` con una
 * decimal y coma decimal (sin `Intl`, igual que la app Flutter).
 */
export function formatDistance(distanceM: number): string {
  if (distanceM < 1000) {
    return `${distanceM} m`;
  }
  const tenths = Math.round((distanceM * 10) / 1000);
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return `${whole},${decimal} km`;
}

/** Formato de un radio del contrato (mismos valores que `formatDistance`). */
export function formatRadius(radiusM: number): string {
  return formatDistance(radiusM);
}
