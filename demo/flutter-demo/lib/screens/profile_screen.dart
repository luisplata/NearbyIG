import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/tokens.dart';
import '../state/demo_action.dart';
import '../state/demo_scope.dart';
import '../state/demo_state.dart';
import '../state/format.dart';
import '../state/selectors.dart';
import '../widgets/avatar.dart';
import '../widgets/demo_chip.dart';
import '../widgets/online_dot.dart';
import '../widgets/verified_badge.dart';

/// Detalle de un perfil: foto (blur/clear), intención, distancia, ping,
/// entrada a seguridad y bloqueo (F-1, F-4, F-10).
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DemoScope.of(context);
    final state = store.state;
    final profile = profileById(state.profileId);
    if (profile == null) {
      return const SizedBox.shrink();
    }
    final blockedReason = pingBlockedReason(state, profile.id);
    final alreadySent = state.pingsSent.contains(profile.id);
    final matched = state.matches.contains(profile.id);

    return SingleChildScrollView(
      padding: EdgeInsets.only(bottom: Tokens.space[3]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Center(
            child: Avatar(
              photoId: profile.photoId,
              size: 120,
              renderState: avatarState(state, profile.id),
              semanticLabel: profile.nickname,
            ),
          ),
          SizedBox(height: Tokens.space[2]),
          Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Flexible(
                  child: Text(
                    profile.nickname,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: Tokens.fontSizes[4],
                      fontWeight: FontWeight.w600,
                      color: Tokens.colorText,
                    ),
                  ),
                ),
                if (profile.verified) ...<Widget>[
                  const SizedBox(width: 6),
                  const VerifiedBadge(size: 18),
                ],
                if (profile.online) ...<Widget>[
                  const SizedBox(width: 8),
                  const OnlineDot(size: 10),
                ],
              ],
            ),
          ),
          SizedBox(height: Tokens.space[1]),
          Center(
            child: Text(
              fmt(profile.statusKey),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: Tokens.fontSizes[1],
                color: Tokens.colorMuted,
              ),
            ),
          ),
          SizedBox(height: Tokens.space[2]),
          Center(
            child: Wrap(
              spacing: Tokens.space[1],
              runSpacing: Tokens.space[1],
              alignment: WrapAlignment.center,
              children: <Widget>[
                DemoChip(
                  label: fmt('intention.${profile.intention.name}'),
                  icon: Icons.local_offer_outlined,
                ),
                DemoChip(
                  label: fmt('profile.distance', <String, String>{
                    'distance': formatDistance(profile.distanceM),
                  }),
                  icon: Icons.near_me_outlined,
                ),
              ],
            ),
          ),
          SizedBox(height: Tokens.space[3]),
          Text(
            fmt(profile.bioKey),
            style: TextStyle(
              fontSize: Tokens.fontSizes[1],
              height: Tokens.lineHeights[2],
              color: Tokens.colorText,
            ),
          ),
          SizedBox(height: Tokens.space[1]),
          Text(
            fmt('profile.revealHint'),
            style: TextStyle(
              fontSize: Tokens.fontSizes[0],
              color: Tokens.colorMuted,
            ),
          ),
          SizedBox(height: Tokens.space[3]),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: canPing(state, profile.id)
                  ? () => store.dispatch(DemoAction.sendPing(profile.id))
                  : null,
              child: Text(
                alreadySent ? fmt('profile.pingSent') : fmt('profile.ping'),
              ),
            ),
          ),
          if (blockedReason != null) ...<Widget>[
            SizedBox(height: Tokens.space[1]),
            Text(
              fmt(blockedReason),
              style: TextStyle(
                fontSize: Tokens.fontSizes[0],
                color: Tokens.colorMuted,
              ),
            ),
          ],
          if (alreadySent) ...<Widget>[
            SizedBox(height: Tokens.space[1]),
            Text(
              fmt('profile.pingSentHint', <String, String>{
                'name': profile.nickname,
              }),
              style: TextStyle(
                fontSize: Tokens.fontSizes[0],
                color: Tokens.colorMuted,
              ),
            ),
          ],
          if (matched) ...<Widget>[
            SizedBox(height: Tokens.space[2]),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () =>
                    store.dispatch(DemoAction.openChat(profile.id)),
                child: Text(fmt('profile.viewChat')),
              ),
            ),
          ],
          SizedBox(height: Tokens.space[2]),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton(
                  onPressed: () => store.dispatch(
                    DemoAction.openOverlay(
                      DemoOverlay.safety,
                      profileId: profile.id,
                    ),
                  ),
                  child: Text(fmt('profile.report')),
                ),
              ),
              SizedBox(width: Tokens.space[1]),
              Expanded(
                child: TextButton(
                  style: TextButton.styleFrom(
                    foregroundColor: Tokens.colorDanger,
                  ),
                  onPressed: () =>
                      store.dispatch(DemoAction.blockProfile(profile.id)),
                  child: Text(fmt('profile.block')),
                ),
              ),
            ],
          ),
          SizedBox(height: Tokens.space[1]),
          Text(
            fmt('safety.blockedHint'),
            style: TextStyle(
              fontSize: Tokens.fontSizes[0],
              color: Tokens.colorMuted,
              height: Tokens.lineHeights[2],
            ),
          ),
        ],
      ),
    );
  }
}
