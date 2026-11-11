import 'package:flutter/material.dart';

import '../generated/copy.dart';
import '../generated/fixtures.dart';
import '../generated/tokens.dart';
import '../state/demo_action.dart';
import '../state/demo_scope.dart';
import '../state/demo_state.dart';
import '../state/selectors.dart';
import '../widgets/avatar.dart';
import '../widgets/demo_chip.dart';
import '../widgets/intention_chips.dart';

/// Ajustes del perfil propio: intención, Instagram simulado (3 estados),
/// fantasma/pausa, entradas a privacidad/bloqueados/acerca de y reset (F-1,
/// F-7, F-8, F-12).
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = DemoScope.of(context);
    final state = store.state;

    return SingleChildScrollView(
      padding: EdgeInsets.only(bottom: Tokens.space[3]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              const Avatar(
                photoId: 'ph00',
                size: 64,
                renderState: AvatarRenderState.clear,
              ),
              SizedBox(width: Tokens.space[2]),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      kSelf.nickname,
                      style: TextStyle(
                        fontSize: Tokens.fontSizes[3],
                        fontWeight: FontWeight.w600,
                        color: Tokens.colorText,
                      ),
                    ),
                    Text(
                      fmt(kSelf.statusKey),
                      style: TextStyle(
                        fontSize: Tokens.fontSizes[0],
                        color: Tokens.colorMuted,
                      ),
                    ),
                    const SizedBox(height: 4),
                    DemoChip(
                      label: fmt('intention.${state.selfIntention.name}'),
                      icon: Icons.local_offer_outlined,
                    ),
                  ],
                ),
              ),
            ],
          ),
          SizedBox(height: Tokens.space[3]),
          Text(
            fmt('profile.intentions'),
            style: TextStyle(
              fontSize: Tokens.fontSizes[0],
              color: Tokens.colorMuted,
            ),
          ),
          const SizedBox(height: 6),
          IntentionChips(
            selected: <Intention>{state.selfIntention},
            onTap: (intention) =>
                store.dispatch(DemoAction.setSelfIntention(intention)),
          ),
          Divider(height: Tokens.space[4]),
          Text(
            fmt('settings.instagram'),
            style: TextStyle(
              fontSize: Tokens.fontSizes[2],
              fontWeight: FontWeight.w600,
              color: Tokens.colorText,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: <Widget>[
              const Icon(
                Icons.alternate_email,
                size: 16,
                color: Tokens.colorMuted,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  kSelf.instagramHandle,
                  style: TextStyle(
                    fontSize: Tokens.fontSizes[1],
                    color: Tokens.colorText,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: Tokens.space[1]),
          Text(
            fmt('settings.verification'),
            style: TextStyle(
              fontSize: Tokens.fontSizes[0],
              color: Tokens.colorMuted,
            ),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: Tokens.space[1],
            children: <Widget>[
              DemoChip(
                label: fmt('ig.state.${state.verification.name}'),
                icon: state.verification == IgVerification.verified
                    ? Icons.verified
                    : Icons.help_outline,
              ),
              OutlinedButton(
                onPressed: () =>
                    store.dispatch(const DemoAction.setVerification()),
                child: Text(fmt('ig.cycleHint')),
              ),
            ],
          ),
          SizedBox(height: Tokens.space[2]),
          Text(
            fmt('ig.simDisclaimer'),
            style: TextStyle(
              fontSize: Tokens.fontSizes[0],
              color: Tokens.colorAccent,
              height: Tokens.lineHeights[2],
            ),
          ),
          Divider(height: Tokens.space[4]),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: state.ghost,
            onChanged: (_) => store.dispatch(const DemoAction.toggleGhost()),
            title: Text(
              fmt('settings.ghost'),
              style: TextStyle(
                fontSize: Tokens.fontSizes[1],
                color: Tokens.colorText,
              ),
            ),
            subtitle: state.ghost
                ? Text(
                    fmt('settings.ghostOn'),
                    style: TextStyle(
                      fontSize: Tokens.fontSizes[0],
                      color: Tokens.colorMuted,
                    ),
                  )
                : null,
          ),
          const Divider(height: 1),
          _EntryTile(
            icon: Icons.lock_outline,
            label: fmt('settings.privacy'),
            onTap: () => store.dispatch(
              const DemoAction.openOverlay(DemoOverlay.privacy),
            ),
          ),
          _EntryTile(
            icon: Icons.block,
            label: fmt('settings.blocked'),
            onTap: () => store.dispatch(
              const DemoAction.openOverlay(DemoOverlay.blocked),
            ),
          ),
          _EntryTile(
            icon: Icons.info_outline,
            label: fmt('settings.about'),
            onTap: () =>
                store.dispatch(const DemoAction.openOverlay(DemoOverlay.about)),
          ),
          SizedBox(height: Tokens.space[2]),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => store.dispatch(const DemoAction.reset()),
              child: Text(fmt('settings.reset')),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            fmt('settings.resetHint'),
            style: TextStyle(
              fontSize: Tokens.fontSizes[0],
              color: Tokens.colorMuted,
            ),
          ),
        ],
      ),
    );
  }
}

class _EntryTile extends StatelessWidget {
  const _EntryTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: EdgeInsets.symmetric(vertical: Tokens.space[1]),
          child: Row(
            children: <Widget>[
              Icon(icon, size: 18, color: Tokens.colorMuted),
              SizedBox(width: Tokens.space[1]),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: Tokens.fontSizes[1],
                    color: Tokens.colorText,
                  ),
                ),
              ),
              const Icon(
                Icons.chevron_right,
                size: 18,
                color: Tokens.colorMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
