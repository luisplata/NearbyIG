import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { liveText } from '../live/liveCopy';
import { colors, fontFamily, fontSize, space } from '../theme/theme';

/**
 * Pull-to-refresh propio, sin `RefreshControl`.
 *
 * **Por qué no `RefreshControl`.** `react-native-web` lo acepta y no hace nada:
 * en el export web no hay gesto nativo ni spinner, así que el pull-to-refresh
 * que el usuario ya espera en móvil no existía. Acá el gesto se construye con el
 * *responder* de React Native, que funciona igual con touch en el celular y con
 * arrastre de mouse en el navegador de escritorio.
 *
 * **No rompe el scroll.** El gesto sólo se arma cuando el contenido está arriba
 * de todo (`atTop`) y el arrastre es hacia abajo y más vertical que horizontal.
 * Para arriba, o con la lista scrolleada, el responder sigue siendo del
 * `ScrollView` y el scroll es el de siempre.
 *
 * **Umbral.** Se muestran dos textos: "Tirá para actualizar" mientras el
 * arrastre no llega, "Soltá para actualizar" cuando cruza los 70 px. Al soltar
 * ahí, se dispara el refresh completo y el indicador queda visible hasta que la
 * promesa termina ("Actualizando…"). Soltar antes no dispara nada: el gesto
 * vuelve solo a su lugar.
 *
 * **El botón no es un adorno.** Si el responder no llega (un navegador raro, un
 * contenedor que se queda con el gesto), el botón de refrescar del header
 * ejecuta exactamente el mismo `onRefresh`.
 */

/** Distancia (px) que hay que arrastrar para que soltar dispare el refresh. */
export const PULL_THRESHOLD = 70;

/** Tope visual del arrastre: más que esto no aporta y despega el contenido. */
const MAX_PULL = 110;

/** Alto del indicador; es también cuánto se esconde arriba del todo. */
const INDICATOR_HEIGHT = 56;

export function PullToRefresh({
  onRefresh,
  atTop,
  children,
  style,
}: {
  /** Refresh completo. Devuelve una promesa: el indicador la espera. */
  onRefresh: () => Promise<void> | void;
  /** El contenido está arriba de todo: único caso en que el gesto se arma. */
  atTop: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const pull = useRef(new Animated.Value(0)).current;
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Los handlers los crea `PanResponder` una sola vez; las props vigentes van
  // por ref para que el gesto no se rearme en cada render.
  const atTopRef = useRef(atTop);
  atTopRef.current = atTop;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  /** Vuelve el indicador a su lugar escondido (cancelado o ya terminado). */
  const settle = useCallback(() => {
    Animated.timing(pull, { toValue: 0, duration: 160, useNativeDriver: false }).start();
  }, [pull]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !busyRef.current &&
          atTopRef.current &&
          gesture.dy > 6 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          const next = Math.max(0, Math.min(gesture.dy, MAX_PULL));
          pull.setValue(next);
          const nextArmed = next >= PULL_THRESHOLD;
          setArmed((current) => (current === nextArmed ? current : nextArmed));
        },
        onPanResponderRelease: (_event, gesture) => {
          setArmed(false);
          if (gesture.dy < PULL_THRESHOLD) {
            settle();
            return;
          }
          // El indicador queda a la vista mientras el refresh está en vuelo.
          setBusy(true);
          pull.setValue(INDICATOR_HEIGHT);
          void Promise.resolve(onRefreshRef.current())
            .catch(() => undefined)
            .finally(() => {
              setBusy(false);
              settle();
            });
        },
        onPanResponderTerminate: () => {
          setArmed(false);
          settle();
        },
      }),
    [pull, settle],
  );

  const label = busy ? liveText('pullBusy') : armed ? liveText('pullRelease') : liveText('pull');

  return (
    <View style={[styles.wrap, style]} {...responder.panHandlers}>
      <Animated.View
        pointerEvents="none"
        style={[styles.indicator, { transform: [{ translateY: Animated.add(pull, -INDICATOR_HEIGHT) }] }]}
      >
        <Text style={styles.label}>{label}</Text>
      </Animated.View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    // El indicador vive arriba del borde: sin recorte se dibujaría sobre el
    // header en reposo.
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: INDICATOR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: space[1],
    zIndex: 2,
  },
  label: {
    color: colors.muted,
    fontFamily: fontFamily.regular,
    fontSize: fontSize[0],
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space[2],
    paddingVertical: 2,
  },
});
