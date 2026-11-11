import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';
import '../state/demo_action.dart';
import '../state/demo_scope.dart';
import '../state/demo_state.dart';
import '../state/selectors.dart';
import '../widgets/profile_card.dart';

/// Centro de notificaciones guionadas: badge de no leídos, marcar leído y
/// marcar todo leído. No hay push real (F-6).
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DemoScope.of(context);
    final state = store.state;
    final unread = unreadCount(state);
    final notifications = state.notifications;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          children: <Widget>[
            Expanded(
              child: Text(
                fmt('notif.unread', <String, String>{'count': '$unread'}),
                style: TextStyle(
                  fontSize: Tokens.fontSizes[1],
                  color: Tokens.colorMuted,
                ),
              ),
            ),
            TextButton(
              onPressed: unread == 0
                  ? null
                  : () => store.dispatch(const DemoAction.markAllRead()),
              child: Text(fmt('notif.markAllRead')),
            ),
          ],
        ),
        Expanded(
          child: notifications.isEmpty
              ? EmptyState(
                  message: fmt('notif.empty'),
                  icon: Icons.notifications_none,
                )
              : ListView.separated(
                  padding: EdgeInsets.only(bottom: Tokens.space[2]),
                  itemCount: notifications.length,
                  separatorBuilder: (context, index) =>
                      const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final notification = notifications[index];
                    final profile = profileById(notification.profileId);
                    return Semantics(
                      label:
                          '${fmt('notif.${notification.kind.name}')}, '
                          '${profile?.nickname ?? ''}',
                      child: Padding(
                        padding: EdgeInsets.symmetric(
                          vertical: Tokens.space[1],
                        ),
                        child: Row(
                          children: <Widget>[
                            Icon(
                              _iconFor(notification.kind),
                              size: 18,
                              color: notification.read
                                  ? Tokens.colorMuted
                                  : Tokens.colorAccent,
                            ),
                            SizedBox(width: Tokens.space[1]),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text(
                                    fmt('notif.${notification.kind.name}'),
                                    style: TextStyle(
                                      fontSize: Tokens.fontSizes[1],
                                      fontWeight: notification.read
                                          ? FontWeight.w400
                                          : FontWeight.w600,
                                      color: Tokens.colorText,
                                    ),
                                  ),
                                  if (profile != null)
                                    Text(
                                      profile.nickname,
                                      style: TextStyle(
                                        fontSize: Tokens.fontSizes[0],
                                        color: Tokens.colorMuted,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            if (!notification.read)
                              TextButton(
                                onPressed: () => store.dispatch(
                                  DemoAction.markRead(notification.id),
                                ),
                                child: Text(fmt('notif.markRead')),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
        Text(
          fmt('notif.pushNote'),
          style: TextStyle(
            fontSize: Tokens.fontSizes[0],
            color: Tokens.colorMuted,
          ),
        ),
      ],
    );
  }

  static IconData _iconFor(NotificationKind kind) {
    switch (kind) {
      case NotificationKind.ping:
        return Icons.wifi_tethering;
      case NotificationKind.match:
        return Icons.favorite_border;
      case NotificationKind.reveal:
        return Icons.visibility_outlined;
    }
  }
}
