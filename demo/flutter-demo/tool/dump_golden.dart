// Productor único de `demo/shared/golden/expected.json`.
//
// Uso (desde demo/flutter-demo, después de `node scripts/sync-demo-assets.mjs`):
//
//   dart run tool/dump_golden.dart
//   dart run tool/dump_golden.dart test/golden/steps.json ../shared/golden/expected.json
//
// Reproduce la secuencia canónica con el reducer de Dart y guarda el digest de
// paridad de cada paso. La demo Expo compara contra este archivo, así que es la
// única fuente de verdad de la paridad ejecutable (state-machine.md §8).
import 'dart:convert';
import 'dart:io';

import 'package:nearbyig_demo/generated/dataset.dart';
import 'package:nearbyig_demo/state/demo_action.dart';
import 'package:nearbyig_demo/state/demo_reducer.dart';
import 'package:nearbyig_demo/state/demo_state.dart';
import 'package:nearbyig_demo/state/projection.dart';

void main(List<String> args) {
  final stepsPath = args.isNotEmpty ? args[0] : 'test/golden/steps.json';
  final outputPath = args.length > 1
      ? args[1]
      : '../shared/golden/expected.json';

  final stepsFile = File(stepsPath);
  if (!stepsFile.existsSync()) {
    stderr.writeln(
      'ERROR: falta $stepsPath. Corré `node scripts/sync-demo-assets.mjs` '
      'desde la raíz del repo.',
    );
    exitCode = 1;
    return;
  }

  final raw = jsonDecode(stepsFile.readAsStringSync()) as Map<String, Object?>;
  final steps = (raw['steps']! as List<Object?>).cast<Map<String, Object?>>();

  var state = initialState();
  final digests = <Map<String, Object?>>[];
  for (final step in steps) {
    final actionJson = (step['action']! as Map<Object?, Object?>)
        .cast<String, Object?>();
    final result = reduce(state, DemoAction.fromJson(actionJson));
    state = result.state;
    digests.add(<String, Object?>{'n': step['n'], 'digest': digestOf(state)});
  }

  final output = <String, Object?>{
    'datasetId': kDatasetId,
    'digestLength': kDigestLength,
    'projectionVersion': raw['projectionVersion'],
    'schemaVersion': kDatasetSchemaVersion,
    'steps': digests,
  };

  final file = File(outputPath);
  file.parent.createSync(recursive: true);
  file.writeAsStringSync(
    '${const JsonEncoder.withIndent('  ').convert(output)}\n',
  );

  stdout.writeln('OK: ${digests.length} pasos → $outputPath');
}
