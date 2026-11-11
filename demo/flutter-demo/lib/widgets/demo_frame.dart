import 'package:flutter/material.dart';

import '../generated/tokens.dart';

/// Marco de la demo: mobile-first de 320 a 1440 px con ancho máximo de 480 px,
/// centrado y con borde redondeado en desktop (F-13).
class DemoFrame extends StatelessWidget {
  const DemoFrame({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= Tokens.breakpointWide;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: Tokens.breakpointFrameMax),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Tokens.colorBg,
            borderRadius: wide
                ? const BorderRadius.all(Radius.circular(28))
                : BorderRadius.zero,
            border: wide ? Border.all(color: Tokens.colorBorder) : null,
          ),
          child: ClipRRect(
            borderRadius: wide
                ? const BorderRadius.all(Radius.circular(28))
                : BorderRadius.zero,
            child: child,
          ),
        ),
      ),
    );
  }
}
