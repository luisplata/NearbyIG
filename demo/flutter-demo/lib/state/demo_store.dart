import 'dart:async';

import 'package:flutter/foundation.dart';

import 'demo_action.dart';
import 'demo_effect.dart';
import 'demo_reducer.dart';
import 'demo_state.dart';

/// Dueño de los timers: el reducer es puro y sólo emite efectos como datos.
///
/// Los timers viven en un `Map<String, Timer>` con clave `kind:id`; un efecto
/// nuevo con la misma clave reprograma el anterior. `RESET`, `dispose` y el
/// desmontaje cancelan todo (state-machine.md §4).
class DemoStore extends ChangeNotifier {
  DemoStore([DemoState? initial]) : _state = initial ?? initialState();

  DemoState _state;
  final Map<String, Timer> _timers = <String, Timer>{};
  bool _disposed = false;

  DemoState get state => _state;

  /// Cantidad de timers vivos. La usa la suite para verificar que reset y
  /// dispose no dejan timers huérfanos.
  int get pendingTimers => _timers.length;

  void dispatch(DemoAction action) {
    if (_disposed) {
      return;
    }
    if (action.type == DemoActionType.reset) {
      cancelTimers();
    }
    final result = reduce(_state, action);
    _state = result.state;
    for (final effect in result.effects) {
      _schedule(effect);
    }
    notifyListeners();
  }

  void _schedule(DemoEffect effect) {
    final key = effect.timerKey;
    _timers.remove(key)?.cancel();
    _timers[key] = Timer(Duration(milliseconds: effect.delayMs), () {
      _timers.remove(key);
      dispatch(DemoAction.timerFired(effect.kind, effect.id));
    });
  }

  void cancelTimers() {
    for (final timer in _timers.values) {
      timer.cancel();
    }
    _timers.clear();
  }

  @override
  void dispose() {
    _disposed = true;
    cancelTimers();
    super.dispose();
  }
}
