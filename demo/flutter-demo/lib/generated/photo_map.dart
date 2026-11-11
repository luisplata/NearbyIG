// GENERATED FILE - do not edit by hand.
// Source: demo/shared/photos.json
// Regenerate with: node scripts/sync-demo-assets.mjs


class PhotoSpec {
  const PhotoSpec({
    required this.initials,
    required this.gradientStart,
    required this.gradientEnd,
    required this.shape,
    required this.seed,
  });

  final String initials;
  final String gradientStart;
  final String gradientEnd;
  final String shape; // 'circle' | 'squircle'
  final int seed;
}

const Map<String, PhotoSpec> kPhotoMap = <String, PhotoSpec>{
  'ph00': PhotoSpec(initials: 'LU', gradientStart: '#FF0069', gradientEnd: '#7638FA', shape: 'squircle', seed: 7),
  'ph01': PhotoSpec(initials: 'VA', gradientStart: '#3858FA', gradientEnd: '#22C55E', shape: 'circle', seed: 12),
  'ph02': PhotoSpec(initials: 'NI', gradientStart: '#FFD600', gradientEnd: '#FF6B00', shape: 'squircle', seed: 19),
  'ph03': PhotoSpec(initials: 'SO', gradientStart: '#D300C5', gradientEnd: '#3858FA', shape: 'circle', seed: 23),
  'ph04': PhotoSpec(initials: 'TO', gradientStart: '#22C55E', gradientEnd: '#3858FA', shape: 'squircle', seed: 31),
  'ph05': PhotoSpec(initials: 'JU', gradientStart: '#FF0069', gradientEnd: '#FFD600', shape: 'circle', seed: 37),
  'ph06': PhotoSpec(initials: 'FR', gradientStart: '#7638FA', gradientEnd: '#FF0069', shape: 'squircle', seed: 41),
  'ph07': PhotoSpec(initials: 'CA', gradientStart: '#FF6B00', gradientEnd: '#D300C5', shape: 'circle', seed: 47),
  'ph08': PhotoSpec(initials: 'LE', gradientStart: '#3858FA', gradientEnd: '#FF0069', shape: 'squircle', seed: 53),
  'ph09': PhotoSpec(initials: 'MI', gradientStart: '#22C55E', gradientEnd: '#FFD600', shape: 'circle', seed: 59),
  'ph10': PhotoSpec(initials: 'DE', gradientStart: '#D300C5', gradientEnd: '#22C55E', shape: 'squircle', seed: 67),
};

/// Fallback determinista si un `photoId` no existe (la validación lo impide).
const PhotoSpec kFallbackPhoto = PhotoSpec(
  initials: '?',
  gradientStart: '#2A2A33',
  gradientEnd: '#1B1B21',
  shape: 'squircle',
  seed: 0,
);
