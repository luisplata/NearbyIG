import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';

/// Hoja "Qué es simulado" (F-15): los 8 ítems numerados del catálogo.
class SimSheet extends StatelessWidget {
  const SimSheet({super.key, required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: fmt('common.simTitle'),
      child: Material(
        color: Tokens.colorSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            Tokens.space[3],
            Tokens.space[2],
            Tokens.space[3],
            Tokens.space[3],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      fmt('common.simTitle'),
                      style: TextStyle(
                        fontSize: Tokens.fontSizes[3],
                        fontWeight: FontWeight.w600,
                        color: Tokens.colorText,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: onClose,
                    tooltip: fmt('common.close'),
                    icon: const Icon(Icons.close),
                    constraints: const BoxConstraints(
                      minWidth: 44,
                      minHeight: 44,
                    ),
                  ),
                ],
              ),
              SizedBox(height: Tokens.space[1]),
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      for (var index = 1; index <= 8; index += 1)
                        Padding(
                          padding: EdgeInsets.only(bottom: Tokens.space[1]),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              const Icon(
                                Icons.remove_circle_outline,
                                size: 14,
                                color: Tokens.colorMuted,
                              ),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  fmt('common.simItems.$index'),
                                  style: TextStyle(
                                    fontSize: Tokens.fontSizes[1],
                                    color: Tokens.colorText,
                                    height: Tokens.lineHeights[2],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
