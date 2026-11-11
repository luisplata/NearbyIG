// GENERATED FILE - do not edit by hand.
// Source: demo/shared/fixtures.json
// Regenerate with: node scripts/sync-demo-assets.mjs


enum Intention { networking, friendship, dating, activities }

enum Gender { female, male, nonbinary }

const int kSchemaVersion = 1;

class DemoTimers {
  const DemoTimers({
    required this.incomingPingMs,
    required this.matchMs,
    required this.revealMs,
    required this.toastMs,
    required this.typingMs,
  });

  final int incomingPingMs;
  final int matchMs;
  final int revealMs;
  final int toastMs;
  final int typingMs;
}

const DemoTimers kTimers = DemoTimers(
  incomingPingMs: 3000,
  matchMs: 2500,
  revealMs: 1500,
  toastMs: 4000,
  typingMs: 1200,
);

class SelfProfile {
  const SelfProfile({
    required this.id,
    required this.nickname,
    required this.initials,
    required this.intention,
    required this.photoId,
    required this.instagramHandle,
    required this.statusKey,
  });

  final String id;
  final String nickname;
  final String initials;
  final Intention intention;
  final String photoId;
  final String instagramHandle;
  final String statusKey;
}

const SelfProfile kSelf = SelfProfile(
  id: 'me',
  nickname: 'Lucho',
  initials: 'LU',
  intention: Intention.networking,
  photoId: 'ph00',
  instagramHandle: 'lucho.demo',
  statusKey: 'status.self',
);

class Profile {
  const Profile({
    required this.id,
    required this.nickname,
    required this.initials,
    required this.intention,
    required this.gender,
    required this.verified,
    required this.online,
    required this.distanceM,
    required this.bearingDeg,
    required this.photoId,
    required this.instagramHandle,
    required this.statusKey,
    required this.bioKey,
  });

  final String id;
  final String nickname;
  final String initials;
  final Intention intention;
  final Gender gender;
  final bool verified;
  final bool online;
  final int distanceM;
  final int bearingDeg;
  final String photoId;
  final String instagramHandle;
  final String statusKey;
  final String bioKey;
}

const List<Profile> kProfiles = <Profile>[
  Profile(id: 'p01', nickname: 'Vale', initials: 'VA', intention: Intention.networking, gender: Gender.female, verified: true, online: true, distanceM: 240, bearingDeg: 32, photoId: 'ph01', instagramHandle: 'vale.works', statusKey: 'status.p01', bioKey: 'bio.p01'),
  Profile(id: 'p02', nickname: 'Nico', initials: 'NI', intention: Intention.friendship, gender: Gender.male, verified: false, online: true, distanceM: 480, bearingDeg: 118, photoId: 'ph02', instagramHandle: 'nico.andando', statusKey: 'status.p02', bioKey: 'bio.p02'),
  Profile(id: 'p03', nickname: 'Sofi', initials: 'SO', intention: Intention.dating, gender: Gender.female, verified: true, online: false, distanceM: 760, bearingDeg: 205, photoId: 'ph03', instagramHandle: 'sofi.ciudad', statusKey: 'status.p03', bioKey: 'bio.p03'),
  Profile(id: 'p04', nickname: 'Tomi', initials: 'TO', intention: Intention.activities, gender: Gender.nonbinary, verified: false, online: true, distanceM: 1150, bearingDeg: 292, photoId: 'ph04', instagramHandle: 'tomi.recorre', statusKey: 'status.p04', bioKey: 'bio.p04'),
  Profile(id: 'p05', nickname: 'Juli', initials: 'JU', intention: Intention.networking, gender: Gender.female, verified: true, online: true, distanceM: 1480, bearingDeg: 12, photoId: 'ph05', instagramHandle: 'juli.encuentros', statusKey: 'status.p05', bioKey: 'bio.p05'),
  Profile(id: 'p06', nickname: 'Fran', initials: 'FR', intention: Intention.dating, gender: Gender.male, verified: false, online: false, distanceM: 1950, bearingDeg: 88, photoId: 'ph06', instagramHandle: 'fran.vecino', statusKey: 'status.p06', bioKey: 'bio.p06'),
  Profile(id: 'p07', nickname: 'Cami', initials: 'CA', intention: Intention.friendship, gender: Gender.nonbinary, verified: true, online: true, distanceM: 2600, bearingDeg: 165, photoId: 'ph07', instagramHandle: 'cami.paseo', statusKey: 'status.p07', bioKey: 'bio.p07'),
  Profile(id: 'p08', nickname: 'Lean', initials: 'LE', intention: Intention.activities, gender: Gender.male, verified: false, online: false, distanceM: 3200, bearingDeg: 240, photoId: 'ph08', instagramHandle: 'lean.afuera', statusKey: 'status.p08', bioKey: 'bio.p08'),
  Profile(id: 'p09', nickname: 'Mica', initials: 'MI', intention: Intention.networking, gender: Gender.female, verified: true, online: true, distanceM: 3900, bearingDeg: 310, photoId: 'ph09', instagramHandle: 'mica.ronda', statusKey: 'status.p09', bioKey: 'bio.p09'),
  Profile(id: 'p10', nickname: 'Delf', initials: 'DE', intention: Intention.dating, gender: Gender.nonbinary, verified: false, online: true, distanceM: 4800, bearingDeg: 45, photoId: 'ph10', instagramHandle: 'delf.esquina', statusKey: 'status.p10', bioKey: 'bio.p10'),
];

class DemoScript {
  const DemoScript({
    required this.firstPingTargetId,
    required this.incomingPingFromId,
    required this.matchProfileId,
    required this.chatReplies,
    required this.fallbackReplyKey,
  });

  final String firstPingTargetId;
  final String incomingPingFromId;
  final String matchProfileId;
  final Map<String, List<String>> chatReplies;
  final String fallbackReplyKey;
}

const DemoScript kScript = DemoScript(
  firstPingTargetId: 'p01',
  incomingPingFromId: 'p07',
  matchProfileId: 'p07',
  chatReplies: <String, List<String>>{
    'p07': <String>['chat.p07.r1', 'chat.p07.r2', 'chat.p07.r3'],
  },
  fallbackReplyKey: 'chat.fallback',
);

class DemoFilters {
  const DemoFilters({
    required this.radiiM,
    required this.defaultRadiusM,
    required this.intentions,
    required this.genders,
  });

  final List<int> radiiM;
  final int defaultRadiusM;
  final List<Intention> intentions;
  final List<Gender> genders;
}

const DemoFilters kFilters = DemoFilters(
  radiiM: <int>[500, 1000, 2000, 5000],
  defaultRadiusM: 5000,
  intentions: <Intention>[Intention.networking, Intention.friendship, Intention.dating, Intention.activities],
  genders: <Gender>[Gender.female, Gender.male, Gender.nonbinary],
);

const List<String> kReportReasons = <String>['harassment', 'spam', 'fake', 'inappropriate', 'other'];

class MapStreet {
  const MapStreet({
    required this.x1,
    required this.y1,
    required this.x2,
    required this.y2,
    required this.weight,
  });

  final double x1;
  final double y1;
  final double x2;
  final double y2;
  final double weight;
}

class MapBlock {
  const MapBlock({
    required this.x,
    required this.y,
    required this.w,
    required this.h,
    required this.radius,
  });

  final double x;
  final double y;
  final double w;
  final double h;
  final double radius;
}

class MapLabel {
  const MapLabel({required this.x, required this.y, required this.copyKey});

  final double x;
  final double y;
  final String copyKey;
}

class MapDecor {
  const MapDecor({required this.streets, required this.blocks, required this.labels});

  final List<MapStreet> streets;
  final List<MapBlock> blocks;
  final List<MapLabel> labels;
}

const MapDecor kMapDecor = MapDecor(
  streets: <MapStreet>[
    MapStreet(x1: 0.1, y1: 0.0, x2: 0.1, y2: 1.0, weight: 2.0),
    MapStreet(x1: 0.62, y1: 0.0, x2: 0.62, y2: 1.0, weight: 1.0),
    MapStreet(x1: 0.0, y1: 0.34, x2: 1.0, y2: 0.34, weight: 1.0),
    MapStreet(x1: 0.0, y1: 0.72, x2: 1.0, y2: 0.72, weight: 2.0),
    MapStreet(x1: 0.1, y1: 0.72, x2: 0.62, y2: 0.34, weight: 1.0),
  ],
  blocks: <MapBlock>[
    MapBlock(x: 0.15, y: 0.2, w: 0.2, h: 0.12, radius: 6.0),
    MapBlock(x: 0.4, y: 0.4, w: 0.16, h: 0.14, radius: 6.0),
    MapBlock(x: 0.68, y: 0.46, w: 0.2, h: 0.16, radius: 6.0),
    MapBlock(x: 0.2, y: 0.78, w: 0.24, h: 0.1, radius: 6.0),
  ],
  labels: <MapLabel>[
    MapLabel(x: 0.5, y: 0.4, copyKey: 'map.label.plaza'),
    MapLabel(x: 0.22, y: 0.86, copyKey: 'map.label.mercado'),
    MapLabel(x: 0.74, y: 0.24, copyKey: 'map.label.biblioteca'),
  ],
);
