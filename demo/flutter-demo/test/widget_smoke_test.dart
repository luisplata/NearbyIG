import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nearbyig_demo/app.dart';
import 'package:nearbyig_demo/generated/copy.dart';
import 'package:nearbyig_demo/generated/dataset.dart';
import 'package:nearbyig_demo/generated/fixtures.dart';
import 'package:nearbyig_demo/state/demo_action.dart';
import 'package:nearbyig_demo/state/demo_effect.dart';
import 'package:nearbyig_demo/state/demo_store.dart';
import 'package:nearbyig_demo/state/demo_state.dart';
import 'package:nearbyig_demo/state/selectors.dart';
import 'package:nearbyig_demo/widgets/radar_view.dart';

Future<DemoStore> _pumpApp(WidgetTester tester) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final store = DemoStore();
  addTearDown(store.dispose);
  await tester.pumpWidget(NearbyDemoApp(store: store));
  await tester.pump();
  return store;
}

void main() {
  testWidgets('la lista es la vista inicial y ordena por distancia', (
    tester,
  ) async {
    final store = await _pumpApp(tester);
    expect(store.state.view, DemoView.list);

    expect(find.text('Vale'), findsOneWidget);
    expect(find.text('Nico'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Vale')).dy,
      lessThan(tester.getTopLeft(find.text('Nico')).dy),
    );
    expect(find.text('240 m'), findsOneWidget);
  });

  testWidgets('la barra inferior ordena Lista, Radar, Mapa, Pings y Perfil', (
    tester,
  ) async {
    await _pumpApp(tester);
    final labels = <String>[
      fmt('nav.list'),
      fmt('nav.radar'),
      fmt('nav.map'),
      fmt('nav.pings'),
      fmt('nav.profile'),
    ];
    final xs = labels
        .map((label) => tester.getCenter(find.text(label)).dx)
        .toList();
    for (var index = 1; index < xs.length; index += 1) {
      expect(
        xs[index],
        greaterThan(xs[index - 1]),
        reason: '${labels[index]} debe estar a la derecha de ${labels[index - 1]}',
      );
    }
  });

  testWidgets('el radar sigue exponiendo 10 puntos con nombre y distancia', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final store = await _pumpApp(tester);
    store.dispatch(const DemoAction.setView(DemoView.radar));
    await tester.pump();

    expect(find.bySemanticsLabel(RegExp(r', a \d')), findsNWidgets(10));
    expect(find.bySemanticsLabel(fmt('a11y.radar')), findsOneWidget);
    handle.dispose();
  });

  testWidgets('reiniciar vuelve a la lista aunque la vista sea radar', (
    tester,
  ) async {
    final store = await _pumpApp(tester);
    store.dispatch(const DemoAction.setView(DemoView.radar));
    await tester.pump();
    expect(store.state.view, DemoView.radar);

    store.dispatch(const DemoAction.reset());
    await tester.pump();
    expect(store.state.view, DemoView.list);
    expect(find.text('Vale'), findsOneWidget);
  });

  testWidgets('el chip DEMO abre la hoja con los 8 ítems de simulación', (
    tester,
  ) async {
    await _pumpApp(tester);
    await tester.tap(find.text(fmt('common.demoChip')));
    await tester.pump();

    expect(find.text(fmt('common.simTitle')), findsOneWidget);
    expect(find.byIcon(Icons.remove_circle_outline), findsNWidgets(8));
    expect(find.text(fmt('common.simItems.1')), findsOneWidget);
  });

  testWidgets('a 360×640 ninguna vista ni ajustes desborda', (tester) async {
    await _pumpApp(tester);
    for (final icon in <IconData>[
      Icons.map_outlined,
      Icons.view_list_outlined,
      Icons.radar,
      Icons.person_outline,
    ]) {
      await tester.tap(find.byIcon(icon));
      await tester.pump();
      expect(tester.takeException(), isNull, reason: 'icono $icon');
    }
  });

  testWidgets('reiniciar demo restaura el estado inicial', (tester) async {
    final store = await _pumpApp(tester);
    store.dispatch(const DemoAction.sendPing('p01'));
    await tester.pump();
    expect(store.state.pingsSent, <String>['p01']);

    store.dispatch(const DemoAction.reset());
    await tester.pump();
    expect(store.state.pingsSent, isEmpty);
    expect(store.pendingTimers, 0);
  });

  testWidgets('el ping muestra toast y deshabilita el segundo envío', (
    tester,
  ) async {
    final store = await _pumpApp(tester);
    await tester.tap(find.text('Vale'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, fmt('profile.ping')));
    await tester.pump();

    expect(store.state.pingsSent, <String>['p01']);
    expect(find.text(fmt('ping.sent')), findsOneWidget);
    expect(
      find.widgetWithText(FilledButton, fmt('profile.pingSent')),
      findsOneWidget,
    );
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, fmt('profile.pingSent')),
          )
          .onPressed,
      isNull,
    );

    // Cierra los timers abiertos para no dejar pendientes al terminar el test.
    store.dispatch(const DemoAction.reset());
    await tester.pump();
  });

  testWidgets('acerca de muestra datasetId, esquema y versión', (tester) async {
    await _pumpApp(tester);
    await tester.tap(find.byIcon(Icons.person_outline));
    await tester.pump();
    await tester.ensureVisible(find.text(fmt('settings.about')));
    await tester.pump();
    await tester.tap(find.text(fmt('settings.about')));
    await tester.pump();

    expect(find.text(kDatasetId), findsOneWidget);
    expect(find.text('$kDatasetSchemaVersion'), findsOneWidget);
    expect(find.text(fmt('about.version')), findsOneWidget);
    expect(find.text(kDemoVersion), findsOneWidget);
  });

  testWidgets(
    'la tarjeta anuncia verificado y en línea con copy del catálogo',
    (tester) async {
      final handle = tester.ensureSemantics();
      await _pumpApp(tester);

      expect(find.bySemanticsLabel(RegExp(fmt('a11y.verified'))), findsWidgets);
      expect(find.bySemanticsLabel(RegExp(fmt('a11y.online'))), findsWidgets);
      handle.dispose();
    },
  );

  testWidgets('con movimiento reducido el radar no anima', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(
            disableAnimations: true,
            size: Size(360, 360),
          ),
          child: Scaffold(
            body: RadarView(profiles: kProfiles, radiusM: 5000, onOpen: (_) {}),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(RadarView), findsOneWidget);
  });

  testWidgets('la bandeja lista el ping enviado con estado pendiente', (
    tester,
  ) async {
    final store = await _pumpApp(tester);
    await tester.tap(find.text('Vale'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, fmt('profile.ping')));
    await tester.pump();

    // El toast del envío tapa la barra inferior: se descarta antes de navegar.
    store.dispatch(const DemoAction.dismissToast());
    await tester.pump();
    // Cierra el perfil y abre la bandeja desde la barra inferior.
    await tester.tap(find.byTooltip(fmt('common.close')));
    await tester.pump();
    await tester.tap(find.byIcon(Icons.wifi_tethering));
    await tester.pump();

    expect(store.state.pingsSent, <String>['p01']);
    expect(find.text(fmt('ping.sentTitle')), findsOneWidget);
    expect(find.text(fmt('ping.sentStatus')), findsOneWidget);
    expect(find.text(fmt('ping.inboxEmpty')), findsNothing);
    // Un ping ya enviado no ofrece una segunda acción de envío.
    expect(find.widgetWithText(FilledButton, fmt('ping.accept')), findsNothing);

    store.dispatch(const DemoAction.reset());
    await tester.pump();
  });

  testWidgets('abrir el centro de notificaciones limpia el badge', (
    tester,
  ) async {
    final store = await _pumpApp(tester);
    store.dispatch(
      const DemoAction.timerFired(DemoEffectKind.incomingPing, 'p07'),
    );
    await tester.pump();

    expect(store.state.notifications, isNotEmpty);
    expect(store.state.notifications.every((n) => n.read), isFalse);
    expect(store.state.overlay, isNull);

    await tester.tap(find.byIcon(Icons.notifications_none));
    await tester.pump();

    expect(store.state.overlay, DemoOverlay.notifications);
    expect(store.state.notifications.every((n) => n.read), isTrue);
    expect(unreadCount(store.state), 0);

    store.dispatch(const DemoAction.reset());
    await tester.pump();
  });
}
