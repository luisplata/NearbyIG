/// Distancia según el contrato: `< 1000` → `"N m"`; si no → `"X,Y km"` con una
/// decimal y coma decimal, sin `intl` (state-machine.md §6).
String formatDistance(int distanceM) {
  if (distanceM < 1000) {
    return '$distanceM m';
  }
  final tenths = (distanceM * 10 / 1000).round();
  final whole = tenths ~/ 10;
  final decimal = tenths % 10;
  return '$whole,$decimal km';
}

/// Formato de un radio del contrato (mismos valores que `formatDistance`).
String formatRadius(int radiusM) => formatDistance(radiusM);
