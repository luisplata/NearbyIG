/// Efectos que el store agenda como timers. El reducer nunca agenda nada: los
/// efectos son datos puros (state-machine.md §4).
enum DemoEffectKind { incomingPing, match, typing, reveal, toast }

class DemoEffect {
  const DemoEffect({
    required this.kind,
    required this.id,
    required this.delayMs,
  });

  final DemoEffectKind kind;
  final String id;
  final int delayMs;

  /// Clave del timer en el store: `kind:id`. Un efecto nuevo con la misma clave
  /// reemplaza al anterior.
  String get timerKey => '${kind.name}:$id';
}
