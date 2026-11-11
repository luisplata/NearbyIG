import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';
import '../state/demo_action.dart';
import '../state/demo_scope.dart';
import '../state/selectors.dart';
import '../widgets/report_sheet.dart';

/// Seguridad: reporte simulado con motivos del dataset. No bloquea ni envía
/// nada a ningún servicio (F-10).
class SafetyScreen extends StatelessWidget {
  const SafetyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DemoScope.of(context);
    final state = store.state;
    final profile = profileById(state.profileId);
    if (profile == null) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          profile.nickname,
          style: TextStyle(
            fontSize: Tokens.fontSizes[2],
            fontWeight: FontWeight.w600,
            color: Tokens.colorText,
          ),
        ),
        SizedBox(height: Tokens.space[1]),
        Text(
          fmt(profile.statusKey),
          style: TextStyle(
            fontSize: Tokens.fontSizes[0],
            color: Tokens.colorMuted,
          ),
        ),
        Divider(height: Tokens.space[3]),
        Expanded(
          child: ReportSheet(
            onSubmit: (reason) {
              store.dispatch(DemoAction.reportProfile(profile.id, reason));
              store.dispatch(const DemoAction.closeOverlay());
            },
          ),
        ),
      ],
    );
  }
}
