import 'package:flutter/widgets.dart';

import 'demo_store.dart';

/// Expone el store al árbol sin `provider`: `DemoScope.of(context)` se
/// reconstruye cuando el store notifica.
class DemoScope extends InheritedNotifier<DemoStore> {
  const DemoScope({super.key, required DemoStore store, required super.child})
    : super(notifier: store);

  static DemoStore of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<DemoScope>();
    assert(scope != null, 'DemoScope no encontrado en el árbol');
    return scope!.notifier!;
  }
}
