import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:nearbyig_demo/generated/fixtures.dart';
import 'package:nearbyig_demo/state/demo_action.dart';
import 'package:nearbyig_demo/state/demo_reducer.dart';
import 'package:nearbyig_demo/state/demo_state.dart';
import 'package:nearbyig_demo/state/selectors.dart';

DemoState _state({
  int? radiusM,
  Intention? selfIntention,
  List<Intention>? intentions,
  Gender? gender,
  bool verifiedOnly = false,
  bool onlineOnly = false,
  List<String> blocked = const <String>[],
  List<String> pingsSent = const <String>[],
  List<String> matches = const <String>[],
  List<String> revealedByMe = const <String>[],
  List<String> revealedByPeer = const <String>[],
  String? chatId,
  bool ghost = false,
}) {
  final base = initialState();
  return DemoState(
    view: base.view,
    overlay: base.overlay,
    profileId: base.profileId,
    chatId: chatId,
    selfIntention: selfIntention ?? base.selfIntention,
    ghost: ghost,
    filters: DiscoveryFilters(
      intentions: intentions,
      gender: gender,
      verifiedOnly: verifiedOnly,
      onlineOnly: onlineOnly,
      radiusM: radiusM ?? base.filters.radiusM,
    ),
    pingsSent: List<String>.of(pingsSent),
    incomingPings: <String>[],
    matches: List<String>.of(matches),
    revealedByMe: List<String>.of(revealedByMe),
    revealedByPeer: List<String>.of(revealedByPeer),
    messages: <String, List<ChatMessage>>{},
    typing: null,
    notifications: <DemoNotification>[],
    blocked: List<String>.of(blocked),
    verification: base.verification,
    matchCelebration: null,
    toast: null,
    notifSeq: 0,
    toastSeq: 0,
    replyCursor: <String, int>{},
  );
}

List<String> _ids(DemoState state) =>
    visibleProfiles(state).map((profile) => profile.id).toList();

void main() {
  group('visibleProfiles', () {
    test('sin filtros devuelve los 10 perfiles ordenados por distancia', () {
      final state = _state();
      expect(_ids(state), <String>[
        'p01',
        'p02',
        'p03',
        'p04',
        'p05',
        'p06',
        'p07',
        'p08',
        'p09',
        'p10',
      ]);
      expect(
        visibleProfiles(state).map((profile) => profile.distanceM).toList(),
        <int>[240, 480, 760, 1150, 1480, 1950, 2600, 3200, 3900, 4800],
      );
    });

    test('radio de 500 m deja sólo los perfiles a 500 m o menos', () {
      expect(_ids(_state(radiusM: 500)), <String>['p01', 'p02']);
    });

    test('el filtro de intención acota el conjunto', () {
      expect(
        _ids(_state(intentions: <Intention>[Intention.activities])),
        <String>['p04', 'p08'],
      );
      expect(_ids(_state(intentions: <Intention>[Intention.dating])), <String>[
        'p03',
        'p06',
        'p10',
      ]);
    });

    test('elegir la intención propia la aplica como filtro por defecto', () {
      final state = reduce(
        initialState(),
        const DemoAction.setSelfIntention(Intention.activities),
      ).state;
      expect(state.selfIntention, Intention.activities);
      expect(state.filters.intentions, <Intention>[Intention.activities]);
      expect(_ids(state), <String>['p04', 'p08']);

      final cleared = reduce(state, const DemoAction.clearFilters()).state;
      expect(cleared.filters.intentions, isNull);
      expect(_ids(cleared).length, 10);
    });

    test('filtros de género, verificados y en línea', () {
      expect(_ids(_state(gender: Gender.female)), <String>[
        'p01',
        'p03',
        'p05',
        'p09',
      ]);
      expect(_ids(_state(verifiedOnly: true)), <String>[
        'p01',
        'p03',
        'p05',
        'p07',
        'p09',
      ]);
      expect(_ids(_state(onlineOnly: true)), <String>[
        'p01',
        'p02',
        'p04',
        'p05',
        'p07',
        'p09',
        'p10',
      ]);
    });

    test('un bloqueado desaparece y una combinación imposible queda vacía', () {
      expect(_ids(_state(blocked: <String>['p01'])).first, 'p02');
      expect(
        _ids(_state(intentions: <Intention>[Intention.dating], radiusM: 500)),
        isEmpty,
      );
    });
  });

  group('guards de ping y chat', () {
    test('canPing respeta fantasma, enviados, matches y bloqueos', () {
      expect(canPing(_state(), 'p01'), isTrue);
      expect(canPing(_state(pingsSent: <String>['p01']), 'p01'), isFalse);
      expect(canPing(_state(matches: <String>['p01']), 'p01'), isFalse);
      expect(canPing(_state(blocked: <String>['p01']), 'p01'), isFalse);
      expect(canPing(_state(ghost: true), 'p01'), isFalse);
      expect(canPing(_state(radiusM: 500), 'p05'), isFalse);
    });

    test('pingBlockedReason explica el motivo con claves del catálogo', () {
      expect(pingBlockedReason(_state(), 'p01'), isNull);
      expect(
        pingBlockedReason(_state(ghost: true), 'p01'),
        'ping.blocked.paused',
      );
      expect(
        pingBlockedReason(_state(pingsSent: <String>['p01']), 'p01'),
        'ping.blocked.sent',
      );
      expect(
        pingBlockedReason(_state(matches: <String>['p01']), 'p01'),
        'ping.blocked.matched',
      );
    });

    test('canSendInChat exige match, sin typing y sin bloqueo', () {
      expect(
        canSendInChat(_state(matches: <String>['p07'], chatId: 'p07')),
        isTrue,
      );
      expect(canSendInChat(_state(matches: <String>['p07'])), isFalse);
      expect(canSendInChat(_state(chatId: 'p07')), isFalse);
      expect(
        canSendInChat(
          _state(
            blocked: <String>['p07'],
            matches: <String>['p07'],
            chatId: 'p07',
          ),
        ),
        isFalse,
      );
    });
  });

  group('revelación', () {
    test('sólo es clear cuando revelaron los dos lados', () {
      expect(isRevealed(_state(revealedByMe: <String>['p07']), 'p07'), isFalse);
      expect(
        avatarState(_state(revealedByMe: <String>['p07']), 'p07'),
        AvatarRenderState.blurred,
      );
      final mutual = _state(
        revealedByMe: <String>['p07'],
        revealedByPeer: <String>['p07'],
      );
      expect(isRevealed(mutual, 'p07'), isTrue);
      expect(avatarState(mutual, 'p07'), AvatarRenderState.clear);
    });
  });

  group('proyección de posición', () {
    test('el centro es 0.5 y el radio crece con la distancia', () {
      final nearest = profileById('p01')!;
      final farthest = profileById('p10')!;
      final near = projectProfile(nearest, 5000);
      final far = projectProfile(farthest, 5000);
      final centerDistance = _distance(near, 0.5, 0.5);
      final farDistance = _distance(far, 0.5, 0.5);
      expect(centerDistance, closeTo(0.42 * 240 / 5000, 1e-9));
      expect(farDistance, greaterThan(centerDistance));
      expect(farDistance, lessThanOrEqualTo(0.42));
    });

    test('se respeta la fórmula del contrato', () {
      final profile = profileById('p01')!;
      final position = projectProfile(profile, 5000);
      final r = 0.42 * profile.distanceM / 5000;
      final radians = profile.bearingDeg * 3.141592653589793 / 180;
      expect(position.x, closeTo(0.5 + math.sin(radians) * r, 1e-9));
      expect(position.y, closeTo(0.5 - math.cos(radians) * r, 1e-9));
    });

    test('con radio 0 no se divide por cero', () {
      final position = projectProfile(profileById('p03')!, 0);
      expect(position.x.isFinite, isTrue);
      expect(position.y.isFinite, isTrue);
    });
  });
}

double _distance(DotPosition position, double x, double y) {
  final dx = position.x - x;
  final dy = position.y - y;
  return math.sqrt(dx * dx + dy * dy);
}
