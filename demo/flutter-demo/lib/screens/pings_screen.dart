import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';
import '../state/demo_action.dart';
import '../state/demo_scope.dart';
import '../state/format.dart';
import '../state/selectors.dart';
import '../widgets/avatar.dart';
import '../widgets/profile_card.dart';

/// Bandeja de pings: recibidos (aceptar → match a 2.5 s, o rechazar) y enviados
/// con su estado pendiente (F-4, F-5). Los enviados no ofrecen acciones: el
/// segundo envío al mismo perfil queda bloqueado por el reducer.
class PingsScreen extends StatelessWidget {
  const PingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DemoScope.of(context);
    final state = store.state;
    final incoming = <Profile>[
      for (final id in state.incomingPings)
        if (profileById(id) != null) profileById(id)!,
    ];
    // Un ping enviado sigue "esperando respuesta" hasta que hay match (ahí la
    // conversación vive en el chat) o el perfil se bloquea.
    final sent = <Profile>[
      for (final id in state.pingsSent)
        if (profileById(id) != null &&
            !state.matches.contains(id) &&
            !state.blocked.contains(id))
          profileById(id)!,
    ];

    if (incoming.isEmpty && sent.isEmpty) {
      return EmptyState(
        message: fmt('ping.inboxEmpty'),
        icon: Icons.wifi_tethering,
      );
    }

    final children = <Widget>[];
    if (incoming.isNotEmpty) {
      children.add(_SectionTitle(title: fmt('ping.inboxTitle')));
      for (final profile in incoming) {
        children.add(
          _PingCard(
            profile: profile,
            subtitle:
                '${fmt('notif.ping')} · ${formatDistance(profile.distanceM)}',
            actions: Row(
              children: <Widget>[
                Expanded(
                  child: FilledButton(
                    onPressed: () =>
                        store.dispatch(DemoAction.acceptPing(profile.id)),
                    child: Text(fmt('ping.accept')),
                  ),
                ),
                SizedBox(width: Tokens.space[1]),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () =>
                        store.dispatch(DemoAction.rejectPing(profile.id)),
                    child: Text(fmt('ping.reject')),
                  ),
                ),
              ],
            ),
          ),
        );
      }
    }
    if (sent.isNotEmpty) {
      children.add(_SectionTitle(title: fmt('ping.sentTitle')));
      for (final profile in sent) {
        children.add(
          _PingCard(
            profile: profile,
            subtitle: formatDistance(profile.distanceM),
            status: fmt('ping.sentStatus'),
          ),
        );
      }
    }

    return ListView.separated(
      padding: EdgeInsets.only(bottom: Tokens.space[3]),
      itemCount: children.length,
      separatorBuilder: (context, index) => SizedBox(height: Tokens.space[1]),
      itemBuilder: (context, index) => children[index],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(top: Tokens.space[1]),
      child: Text(
        title,
        style: TextStyle(
          fontSize: Tokens.fontSizes[0],
          fontWeight: FontWeight.w600,
          color: Tokens.colorMuted,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _PingCard extends StatelessWidget {
  const _PingCard({
    required this.profile,
    required this.subtitle,
    this.status,
    this.actions,
  });

  final Profile profile;
  final String subtitle;
  final String? status;
  final Widget? actions;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(Tokens.space[2]),
      decoration: const BoxDecoration(
        color: Tokens.colorSurface,
        borderRadius: BorderRadius.all(Radius.circular(12)),
      ),
      child: Column(
        children: <Widget>[
          Row(
            children: <Widget>[
              Avatar(photoId: profile.photoId, size: 44),
              SizedBox(width: Tokens.space[2]),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      profile.nickname,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: Tokens.fontSizes[2],
                        fontWeight: FontWeight.w600,
                        color: Tokens.colorText,
                      ),
                    ),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: Tokens.fontSizes[0],
                        color: Tokens.colorMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (status != null) ...<Widget>[
            SizedBox(height: Tokens.space[1]),
            Semantics(
              label: status,
              child: Row(
                children: <Widget>[
                  const Icon(
                    Icons.schedule,
                    size: 16,
                    color: Tokens.colorAccent,
                  ),
                  SizedBox(width: Tokens.space[1]),
                  Expanded(
                    child: Text(
                      status!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: Tokens.fontSizes[0],
                        color: Tokens.colorAccent,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (actions != null) ...<Widget>[
            SizedBox(height: Tokens.space[1]),
            actions!,
          ],
        ],
      ),
    );
  }
}
