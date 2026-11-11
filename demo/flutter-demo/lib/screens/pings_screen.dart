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

/// Bandeja de pings recibidos: aceptar (match a 2.5 s) o rechazar (F-4, F-5).
class PingsScreen extends StatelessWidget {
  const PingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DemoScope.of(context);
    final state = store.state;
    final pings = <Profile>[
      for (final id in state.incomingPings)
        if (profileById(id) != null) profileById(id)!,
    ];

    if (pings.isEmpty) {
      return EmptyState(
        message: fmt('ping.inboxEmpty'),
        icon: Icons.wifi_tethering,
      );
    }

    return ListView.separated(
      padding: EdgeInsets.only(bottom: Tokens.space[3]),
      itemCount: pings.length,
      separatorBuilder: (context, index) => SizedBox(height: Tokens.space[1]),
      itemBuilder: (context, index) {
        final profile = pings[index];
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
                          '${fmt('notif.ping')} · ${formatDistance(profile.distanceM)}',
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
              SizedBox(height: Tokens.space[1]),
              Row(
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
            ],
          ),
        );
      },
    );
  }
}
