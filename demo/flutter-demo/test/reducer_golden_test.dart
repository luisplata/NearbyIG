import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nearbyig_demo/generated/dataset.dart';
import 'package:nearbyig_demo/state/demo_action.dart';
import 'package:nearbyig_demo/state/demo_effect.dart';
import 'package:nearbyig_demo/state/demo_reducer.dart';
import 'package:nearbyig_demo/state/demo_state.dart';
import 'package:nearbyig_demo/state/projection.dart';
import 'package:nearbyig_demo/state/selectors.dart';

Map<String, Object?> _readJson(String path) =>
    jsonDecode(File(path).readAsStringSync()) as Map<String, Object?>;

List<Map<String, Object?>> _steps(Map<String, Object?> document) =>
    (document['steps']! as List<Object?>).cast<Map<String, Object?>>();

void main() {
  group('sha256', () {
    test('vectores conocidos', () {
      expect(
        sha256Hex(<int>[]),
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
      expect(
        sha256Hex(utf8.encode('abc')),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
      expect(
        sha256Hex(
          utf8.encode(
            'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
          ),
        ),
        '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
      );
    });
  });

  group('golden', () {
    test('expected.json pertenece al dataset sincronizado', () {
      final expected = _readJson('test/golden/expected.json');
      expect(expected['datasetId'], kDatasetId);
      expect(expected['schemaVersion'], kDatasetSchemaVersion);
      expect(expected['digestLength'], kDigestLength);
    });

    test('la secuencia ejercita las 27 acciones y los 5 timers', () {
      final steps = _steps(_readJson('test/golden/steps.json'));
      final actionTypes = <DemoActionType>{
        for (final step in steps)
          DemoAction.fromJson((step['action']! as Map<String, Object?>)).type,
      };
      expect(actionTypes, DemoActionType.values.toSet());

      final timerKinds = <DemoEffectKind>{
        for (final step in steps)
          if (DemoAction.fromJson(
                (step['action']! as Map<String, Object?>),
              ).type ==
              DemoActionType.timerFired)
            DemoAction.fromJson(
              (step['action']! as Map<String, Object?>),
            ).effectKind!,
      };
      expect(timerKinds, <DemoEffectKind>{
        DemoEffectKind.incomingPing,
        DemoEffectKind.match,
        DemoEffectKind.typing,
        DemoEffectKind.reveal,
      });
      // El timer `toast` se descarta por acción explícita (DISMISS_TOAST), no por
      // un TIMER_FIRED del guion.
      expect(actionTypes.contains(DemoActionType.dismissToast), isTrue);
    });

    test('el digest de cada paso coincide con expected.json', () {
      final steps = _steps(_readJson('test/golden/steps.json'));
      final expected = _steps(_readJson('test/golden/expected.json'));
      expect(expected.length, steps.length);

      var state = initialState();
      for (var index = 0; index < steps.length; index += 1) {
        final step = steps[index];
        final action = DemoAction.fromJson(
          (step['action']! as Map<String, Object?>),
        );
        state = reduce(state, action).state;
        expect(
          digestOf(state),
          expected[index]['digest'],
          reason: 'paso ${step['n']}: ${step['note']}',
        );
      }

      // El último paso es RESET: el estado final es el inicial.
      expect(projectState(state), projectState(initialState()));
    });

    test('los guards dejan no-op el paso repetido', () {
      final steps = _steps(_readJson('test/golden/steps.json'));
      final expected = _steps(_readJson('test/golden/expected.json'));
      Map<String, Object?> stepByNumber(int number) =>
          steps.firstWhere((step) => step['n'] == number);
      Map<String, Object?> expectedByNumber(int number) =>
          expected.firstWhere((step) => step['n'] == number);

      var state = initialState();
      for (final step in steps) {
        final action = DemoAction.fromJson(
          (step['action']! as Map<String, Object?>),
        );
        state = reduce(state, action).state;
        if (step['n'] == 17) {
          expect(
            digestOf(state),
            expectedByNumber(16)['digest'],
            reason: 'el segundo ping al mismo perfil debe ser no-op',
          );
          expect(stepByNumber(17)['action'], isNotNull);
        }
        if (step['n'] == 29) {
          expect(
            digestOf(state),
            expectedByNumber(28)['digest'],
            reason: 'un mensaje con typing activo debe ser no-op',
          );
        }
        if (step['n'] == 39) {
          expect(
            digestOf(state),
            expectedByNumber(38)['digest'],
            reason: 'ping en modo fantasma debe ser no-op',
          );
        }
      }
    });

    test('reset vuelve al estado inicial y no deja efectos pendientes', () {
      final result = reduce(initialState(), const DemoAction.reset());
      expect(result.effects, isEmpty);
      expect(projectState(result.state), projectState(initialState()));
    });

    test('MARK_NOTIFICATIONS_READ marca todo leído y es idempotente', () {
      var state = reduce(
        initialState(),
        const DemoAction.timerFired(DemoEffectKind.incomingPing, 'p07'),
      ).state;
      state = reduce(
        state,
        const DemoAction.openOverlay(DemoOverlay.notifications),
      ).state;
      expect(
        state.notifications.every((notification) => !notification.read),
        isTrue,
        reason: 'abrir el overlay no marca nada por sí solo: lo hace la acción',
      );

      state = reduce(state, const DemoAction.markNotificationsRead()).state;
      expect(state.notifications, isNotEmpty);
      expect(
        state.notifications.every((notification) => notification.read),
        isTrue,
      );
      expect(unreadCount(state), 0);

      final again = reduce(state, const DemoAction.markNotificationsRead());
      expect(again.effects, isEmpty);
      expect(projectState(again.state), projectState(state));
    });
  });
}
