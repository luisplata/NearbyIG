import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';
import '../state/format.dart';
import '../state/selectors.dart';
import 'avatar.dart';
import 'online_dot.dart';
import 'verified_badge.dart';

/// Tarjeta de perfil de la lista. El label accesible expone nombre y distancia
/// (F-13) y todo el resto queda fuera del árbol semántico.
class ProfileCard extends StatelessWidget {
  const ProfileCard({
    super.key,
    required this.profile,
    required this.renderState,
    required this.onTap,
  });

  final Profile profile;
  final AvatarRenderState renderState;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final label = <String>[
      fmt('a11y.profileDot', <String, String>{
        'name': profile.nickname,
        'distance': formatDistance(profile.distanceM),
      }),
      if (profile.verified) fmt('a11y.verified'),
      if (profile.online) fmt('a11y.online'),
    ].join('. ');
    return Semantics(
      button: true,
      label: label,
      child: ExcludeSemantics(
        child: InkWell(
          onTap: onTap,
          borderRadius: const BorderRadius.all(Radius.circular(12)),
          child: Container(
            constraints: const BoxConstraints(minHeight: 76),
            padding: EdgeInsets.all(Tokens.space[2]),
            decoration: const BoxDecoration(
              color: Tokens.colorSurface,
              borderRadius: BorderRadius.all(Radius.circular(12)),
            ),
            child: Row(
              children: <Widget>[
                Avatar(
                  photoId: profile.photoId,
                  size: 52,
                  renderState: renderState,
                ),
                SizedBox(width: Tokens.space[2]),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          Flexible(
                            child: Text(
                              profile.nickname,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: Tokens.fontSizes[2],
                                fontWeight: FontWeight.w600,
                                color: Tokens.colorText,
                              ),
                            ),
                          ),
                          if (profile.verified) ...<Widget>[
                            const SizedBox(width: 4),
                            const VerifiedBadge(),
                          ],
                          if (profile.online) ...<Widget>[
                            const SizedBox(width: 6),
                            const OnlineDot(),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        fmt(profile.statusKey),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: Tokens.fontSizes[0],
                          color: Tokens.colorMuted,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: Tokens.space[1],
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: <Widget>[
                          Text(
                            fmt('intention.${profile.intention.name}'),
                            style: TextStyle(
                              fontSize: Tokens.fontSizes[0],
                              color: Tokens.colorMuted,
                            ),
                          ),
                          Text(
                            formatDistance(profile.distanceM),
                            style: TextStyle(
                              fontSize: Tokens.fontSizes[0],
                              fontWeight: FontWeight.w600,
                              color: Tokens.colorText,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.chevron_right,
                  size: 20,
                  color: Tokens.colorMuted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Estado vacío reutilizable: mensaje + acción opcional (F-3).
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.message,
    this.actionLabel,
    this.onAction,
    this.icon = Icons.search_off,
  });

  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(Tokens.space[3]),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 28, color: Tokens.colorMuted),
            SizedBox(height: Tokens.space[2]),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: Tokens.fontSizes[1],
                color: Tokens.colorMuted,
              ),
            ),
            if (actionLabel != null && onAction != null) ...<Widget>[
              SizedBox(height: Tokens.space[2]),
              OutlinedButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}
