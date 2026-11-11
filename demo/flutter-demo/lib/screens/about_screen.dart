import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/dataset.dart';
import '../generated/tokens.dart';
import '../widgets/ui_scope.dart';

/// Acerca de: marca, datasetId + schemaVersion (SC-8) y acceso a la hoja de
/// simulación (F-15).
class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: EdgeInsets.only(bottom: Tokens.space[3]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Image.asset(
                'assets/brand/icon-192.png',
                width: 44,
                height: 44,
                filterQuality: FilterQuality.medium,
                semanticLabel: fmt('about.brand'),
              ),
              SizedBox(width: Tokens.space[2]),
              Expanded(
                child: Text(
                  fmt('about.brand'),
                  style: TextStyle(
                    fontSize: Tokens.fontSizes[3],
                    fontWeight: FontWeight.w600,
                    color: Tokens.colorText,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: Tokens.space[2]),
          Text(
            fmt('about.disclaimer'),
            style: TextStyle(
              fontSize: Tokens.fontSizes[1],
              height: Tokens.lineHeights[2],
              color: Tokens.colorMuted,
            ),
          ),
          Divider(height: Tokens.space[4]),
          _DataRow(label: fmt('about.dataset'), value: kDatasetId),
          _DataRow(
            label: fmt('common.schemaVersion'),
            value: '$kDatasetSchemaVersion',
          ),
          _DataRow(label: fmt('about.version'), value: kDemoVersion),
          SizedBox(height: Tokens.space[2]),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => DemoUiScope.openSim(context),
              child: Text(fmt('common.simTitle')),
            ),
          ),
        ],
      ),
    );
  }
}

class _DataRow extends StatelessWidget {
  const _DataRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: Tokens.fontSizes[1],
                color: Tokens.colorMuted,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: Tokens.fontSizes[1],
              fontWeight: FontWeight.w600,
              color: Tokens.colorText,
            ),
          ),
        ],
      ),
    );
  }
}
