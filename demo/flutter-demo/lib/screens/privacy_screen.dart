import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';

/// Privacidad: copy explícito de "sin historial de rutas", sin ubicación real y
/// sin persistencia (F-11).
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: EdgeInsets.only(bottom: Tokens.space[3]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Paragraph(text: fmt('privacy.noHistory'), highlighted: true),
          _Paragraph(text: fmt('privacy.noLocation')),
          _Paragraph(text: fmt('privacy.dataNote')),
          _Paragraph(text: fmt('privacy.demoNote')),
        ],
      ),
    );
  }
}

class _Paragraph extends StatelessWidget {
  const _Paragraph({required this.text, this.highlighted = false});

  final String text;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: Tokens.space[2]),
      child: Container(
        width: double.infinity,
        padding: EdgeInsets.all(Tokens.space[2]),
        decoration: BoxDecoration(
          color: Tokens.colorSurface,
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          border: Border.all(
            color: highlighted ? Tokens.colorAccent : Tokens.colorBorder,
          ),
        ),
        child: Text(
          text,
          style: TextStyle(
            fontSize: Tokens.fontSizes[1],
            height: Tokens.lineHeights[2],
            color: Tokens.colorText,
          ),
        ),
      ),
    );
  }
}
