import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nearbyig_demo/state/demo_action.dart';
import 'package:nearbyig_demo/state/demo_state.dart';
import 'package:nearbyig_demo/state/demo_store.dart';
import 'package:nearbyig_demo/state/projection.dart';

void main() {
  test('el ping entrante guionado llega a los 3.0 s', () {
    fakeAsync((async) {
      final store = DemoStore();
      store.dispatch(const DemoAction.sendPing('p01'));
      expect(store.state.incomingPings, isEmpty);
      expect(store.state.toast, isNotNull);

      async.elapse(const Duration(milliseconds: 2999));
      expect(store.state.incomingPings, isEmpty);

      async.elapse(const Duration(milliseconds: 1));
      expect(store.state.incomingPings, <String>['p07']);
      expect(store.state.notifications.length, 1);
      store.dispose();
    });
  });

  test('el toast se descarta a los 4.0 s', () {
    fakeAsync((async) {
      final store = DemoStore();
      store.dispatch(const DemoAction.blockProfile('p09'));
      expect(store.state.toast?.id, 't1');
      async.elapse(const Duration(milliseconds: 3999));
      expect(store.state.toast, isNotNull);
      async.elapse(const Duration(milliseconds: 1));
      expect(store.state.toast, isNull);
      store.dispose();
    });
  });

  test('el match aparece a los 2.5 s y el typing responde a los 1.2 s', () {
    fakeAsync((async) {
      final store = DemoStore();
      store.dispatch(const DemoAction.sendPing('p01'));
      async.elapse(const Duration(milliseconds: 3000));
      store.dispatch(const DemoAction.acceptPing('p07'));
      async.elapse(const Duration(milliseconds: 2499));
      expect(store.state.matchCelebration, isNull);
      async.elapse(const Duration(milliseconds: 1));
      expect(store.state.matchCelebration, 'p07');

      store.dispatch(const DemoAction.openChat('p07'));
      store.dispatch(const DemoAction.sendMessage('p07', 'chat.self.1'));
      expect(store.state.typing, 'p07');
      async.elapse(const Duration(milliseconds: 1200));
      expect(store.state.typing, isNull);
      expect(store.state.messages['p07']?.length, 2);
      store.dispose();
    });
  });

  test('reset cancela todos los timers y vuelve al estado inicial', () {
    fakeAsync((async) {
      final store = DemoStore();
      store.dispatch(const DemoAction.sendPing('p01'));
      expect(store.pendingTimers, 2);
      store.dispatch(const DemoAction.reset());
      expect(store.pendingTimers, 0);
      expect(projectState(store.state), projectState(initialState()));

      async.elapse(const Duration(seconds: 10));
      expect(store.state.incomingPings, isEmpty);
      store.dispose();
    });
  });

  test('dispose cancela los timers pendientes', () {
    fakeAsync((async) {
      final store = DemoStore();
      store.dispatch(const DemoAction.sendPing('p01'));
      expect(store.pendingTimers, greaterThan(0));
      store.dispose();
      expect(store.pendingTimers, 0);
      async.elapse(const Duration(seconds: 10));
    });
  });
}
