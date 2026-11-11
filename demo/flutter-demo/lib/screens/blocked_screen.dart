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

/// Lista de perfiles bloqueados con opción de desbloquear. Desbloquear no
/// restaura pings, match ni chat (F-10).
class BlockedScreen extends StatelessWidget {
  const BlockedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DemoScope.of(context);
    final state = store.state;
    final profiles = <Profile>[
      for (final id in state.blocked)
        if (profileById(id) != null) profileById(id)!,
    ];

    if (profiles.isEmpty) {
      return EmptyState(message: fmt('safety.blockedEmpty'), icon: Icons.block);
    }

    return Column(
      children: <Widget>[
        Expanded(
          child: ListView.separated(
            padding: EdgeInsets.only(bottom: Tokens.space[2]),
            itemCount: profiles.length,
            separatorBuilder: (context, index) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final profile = profiles[index];
              return Padding(
                padding: EdgeInsets.symmetric(vertical: Tokens.space[1]),
                child: Row(
                  children: <Widget>[
                    Avatar(photoId: profile.photoId, size: 40),
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
                              fontSize: Tokens.fontSizes[1],
                              fontWeight: FontWeight.w600,
                              color: Tokens.colorText,
                            ),
                          ),
                          Text(
                            formatDistance(profile.distanceM),
                            style: TextStyle(
                              fontSize: Tokens.fontSizes[0],
                              color: Tokens.colorMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () =>
                          store.dispatch(DemoAction.unblockProfile(profile.id)),
                      child: Text(fmt('safety.unblock')),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        Text(
          fmt('safety.blockedHint'),
          style: TextStyle(
            fontSize: Tokens.fontSizes[0],
            height: Tokens.lineHeights[2],
            color: Tokens.colorMuted,
          ),
        ),
      ],
    );
  }
}
