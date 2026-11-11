import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';
import '../state/demo_state.dart';

/// Toast del contrato: 4 s (timer del store), liveRegion para lectores de
/// pantalla y tap para descartarlo.
class ToastHost extends StatelessWidget {
  const ToastHost({super.key, required this.toast, required this.onDismiss});

  final DemoToast toast;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final text = fmt(toast.textKey);
    return Semantics(
      liveRegion: true,
      container: true,
      label: text,
      child: ExcludeSemantics(
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onDismiss,
            borderRadius: const BorderRadius.all(Radius.circular(12)),
            child: Container(
              constraints: const BoxConstraints(minHeight: 44),
              padding: EdgeInsets.symmetric(
                horizontal: Tokens.space[2],
                vertical: Tokens.space[1],
              ),
              decoration: const BoxDecoration(
                color: Tokens.colorSurfaceAlt,
                borderRadius: BorderRadius.all(Radius.circular(12)),
                border: Border.fromBorderSide(
                  BorderSide(color: Tokens.colorBorder),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  const Icon(
                    Icons.check_circle_outline,
                    size: 16,
                    color: Tokens.colorAccent,
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      text,
                      style: TextStyle(
                        fontSize: Tokens.fontSizes[1],
                        color: Tokens.colorText,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
