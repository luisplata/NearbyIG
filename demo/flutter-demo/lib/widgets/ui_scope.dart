import 'package:flutter/widgets.dart';

/// Acciones de chrome que no son estado del reducer (la hoja "Qué es simulado"
/// es transitoria y no forma parte de la proyección del golden).
class DemoUiScope extends InheritedWidget {
  const DemoUiScope({
    super.key,
    required this.openSimSheet,
    required super.child,
  });

  final VoidCallback openSimSheet;

  static DemoUiScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<DemoUiScope>();

  static void openSim(BuildContext context) => maybeOf(context)?.openSimSheet();

  @override
  bool updateShouldNotify(DemoUiScope oldWidget) =>
      oldWidget.openSimSheet != openSimSheet;
}
