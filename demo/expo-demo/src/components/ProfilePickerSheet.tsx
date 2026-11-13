import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { liveText } from '../live/liveCopy';
import { useLive } from '../live/LiveProvider';
import type { LiveProfileRow } from '../live/types';
import { colors, fontFamily, fontSize, radii, space, text } from '../theme/theme';

import { Chip } from './Chip';
import { IconButton } from './IconButton';

/**
 * Selector de perfil demo: el smoke test de S1.7, integrado.
 *
 * Lista `GET /demo/profiles?regionKey=` con `inUse` — el contrato lo agregó
 * justamente para no comerse un 409 a ciegas — y permite reclamar un slot libre.
 * El desalojo es **explícito y confirmado**: `inUse` primero muestra "en uso" y
 * recién al pedir "desalojar" aparece la confirmación que nombra el slot.
 */
export function ProfilePickerSheet({ onClose }: { onClose: () => void }) {
  const live = useLive();
  const [confirmSlot, setConfirmSlot] = useState<number | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mine = live.state.session?.profileId ?? null;
  const rows = live.state.rows;

  const run = async (slot: number, mode: 'claim' | 'takeover'): Promise<void> => {
    setBusySlot(slot);
    setError(null);
    const result = mode === 'claim' ? await live.claim(slot) : await live.takeover(slot);
    setBusySlot(null);
    setConfirmSlot(null);
    if (result.ok) {
      onClose();
      return;
    }
    setError(liveText('claimFailed', { code: result.code ?? 'NETWORK' }));
  };

  return (
    <View style={styles.sheet} accessibilityViewIsModal accessibilityLabel={liveText('pickerTitle')}>
      <View style={styles.header}>
        <Text style={[text.title, styles.title]}>{liveText('pickerTitle')}</Text>
        <IconButton icon="close" label={liveText('cancel')} onPress={onClose} />
      </View>

      <Text style={[text.small, styles.help]}>{liveText('pickerHelp')}</Text>

      {error === null ? null : <Text style={[text.small, styles.error]}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.list}>
        {rows.length === 0 ? (
          <Text style={[text.small, styles.empty]}>{liveText('pickerEmpty')}</Text>
        ) : null}
        {rows.map((row) => (
          <Row
            key={row.profileId}
            row={row}
            mine={mine}
            busy={busySlot === row.demoSlot}
            confirming={confirmSlot !== null && confirmSlot === row.demoSlot}
            onClaim={() => {
              if (row.demoSlot !== null) {
                void run(row.demoSlot, 'claim');
              }
            }}
            onAskTakeover={() => {
              setError(null);
              setConfirmSlot(row.demoSlot);
            }}
            onConfirmTakeover={() => {
              if (row.demoSlot !== null) {
                void run(row.demoSlot, 'takeover');
              }
            }}
            onCancel={() => setConfirmSlot(null)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Chip label={liveText('refresh')} icon="schedule" onPress={() => void live.refreshRows()} />
      </View>
    </View>
  );
}

function Row({
  row,
  mine,
  busy,
  confirming,
  onClaim,
  onAskTakeover,
  onConfirmTakeover,
  onCancel,
}: {
  row: LiveProfileRow;
  mine: string | null;
  busy: boolean;
  confirming: boolean;
  onClaim: () => void;
  onAskTakeover: () => void;
  onConfirmTakeover: () => void;
  onCancel: () => void;
}) {
  const isMine = mine !== null && row.profileId === mine;
  const state = isMine ? liveText('mine') : row.inUse ? liveText('inUse') : liveText('free');

  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.name}>
          {row.nickname}
        </Text>
        <Text style={[text.small, styles.slot]}>
          {liveText('slot', { slot: String(row.demoSlot ?? '—') })} · {state}
        </Text>
      </View>

      {isMine || row.demoSlot === null ? null : confirming ? (
        <View style={styles.confirm}>
          <Text style={[text.small, styles.confirmText]}>
            {liveText('takeoverConfirm', { slot: String(row.demoSlot) })}
          </Text>
          <View style={styles.confirmActions}>
            <Chip label={liveText('confirm')} emphasis onPress={onConfirmTakeover} />
            <Chip label={liveText('cancel')} onPress={onCancel} />
          </View>
        </View>
      ) : row.inUse ? (
        <Chip label={liveText('takeover')} onPress={onAskTakeover} />
      ) : (
        <Chip label={liveText('use')} icon="checkCircle" onPress={onClaim} />
      )}

      {busy ? <Pressable accessible={false} style={styles.busy}><Text style={styles.busyText}>…</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: space[3],
    paddingTop: space[2],
    paddingBottom: space[2],
    maxHeight: 460,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[1],
  },
  title: {
    flex: 1,
  },
  help: {
    paddingTop: 2,
  },
  error: {
    color: colors.danger,
    paddingTop: 2,
  },
  list: {
    gap: space[1],
    paddingTop: space[1],
  },
  empty: {
    paddingVertical: space[2],
  },
  row: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii[1],
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    gap: space[1],
    minHeight: 56,
    justifyContent: 'center',
  },
  rowBody: {
    gap: 1,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize[1],
    color: colors.text,
  },
  slot: {
    fontSize: fontSize[0],
  },
  confirm: {
    gap: 4,
  },
  confirmText: {
    color: colors.accent,
  },
  confirmActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  footer: {
    paddingTop: space[1],
    alignItems: 'flex-start',
  },
  busy: {
    position: 'absolute',
    right: space[2],
    top: space[1],
  },
  busyText: {
    color: colors.muted,
    fontSize: fontSize[0],
  },
});
