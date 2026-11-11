import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';

/// Hoja de reporte simulado (F-10). Los motivos salen del dataset; enviar sólo
/// produce un toast, no bloquea ni toca el dataset.
class ReportSheet extends StatefulWidget {
  const ReportSheet({super.key, required this.onSubmit, this.initialReason});

  final ValueChanged<String> onSubmit;
  final String? initialReason;

  @override
  State<ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<ReportSheet> {
  String? _reason;

  @override
  void initState() {
    super.initState();
    _reason = widget.initialReason;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          fmt('safety.reasons.title'),
          style: TextStyle(
            fontSize: Tokens.fontSizes[1],
            fontWeight: FontWeight.w600,
            color: Tokens.colorText,
          ),
        ),
        SizedBox(height: Tokens.space[1]),
        Flexible(
          child: SingleChildScrollView(
            child: RadioGroup<String>(
              groupValue: _reason,
              onChanged: (value) => setState(() => _reason = value),
              child: Column(
                children: <Widget>[
                  for (final reason in kReportReasons)
                    Semantics(
                      inMutuallyExclusiveGroup: true,
                      selected: _reason == reason,
                      label: fmt('safety.reasons.$reason'),
                      child: RadioListTile<String>(
                        value: reason,
                        contentPadding: EdgeInsets.zero,
                        activeColor: Tokens.colorAccent,
                        dense: true,
                        title: Text(
                          fmt('safety.reasons.$reason'),
                          style: TextStyle(
                            fontSize: Tokens.fontSizes[1],
                            color: Tokens.colorText,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        SizedBox(height: Tokens.space[1]),
        Text(
          fmt('safety.reportNote'),
          style: TextStyle(
            fontSize: Tokens.fontSizes[0],
            color: Tokens.colorMuted,
            height: Tokens.lineHeights[2],
          ),
        ),
        SizedBox(height: Tokens.space[2]),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _reason == null ? null : () => widget.onSubmit(_reason!),
            child: Text(fmt('common.confirm')),
          ),
        ),
      ],
    );
  }
}
