import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Camera,
  Map,
  type CameraRef,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';

import { Chip } from '../components/Chip';
import { MAP_TIMEOUT_MS, type LngLat } from './basemap';
import { mapText } from './mapCopy';
import type { MapPhase } from './mapStatus';
import {
  NATIVE_INITIAL,
  nativeCamera,
  nativeRetry,
  nativeSignal,
  nativeStep,
  type NativeState,
} from './nativeMap';
import { mapStyle } from './style';

/**
 * Basemap real (OpenFreeMap + MapLibre Native) montado **sólo en el binario**:
 * Metro resuelve este archivo por la extensión `.native.tsx` y la web nunca lo
 * alcanza. Este es el único módulo del repo que nombra el paquete del SDK.
 *
 * Reglas que no se negocian:
 * - **`androidView="texture"`**. Un `SurfaceView` (`"surface"`, el default) es
 *   una superficie fuera del árbol de vistas: ignora el `opacity` del padre y
 *   perfora el z-order, así que durante la carga se vería un agujero sobre los
 *   anillos y los puntos. La textura participa del árbol y respeta el alpha.
 * - no es interactivo: los seis gestos van en `false` y el host no recibe
 *   toques; los puntos siguen siendo el único blanco de toque;
 * - no agrega ornamentos del SDK: la atribución la dibuja el radar, no el mapa;
 * - el mapa queda **invisible** hasta `ready`. Acá no alcanza con `opacity`:
 *   la decisión de montar/desmontar es la que lo esconde de verdad.
 *
 * **Cámara.** Los números salen de `nativeCamera` (`./nativeMap`), que delega en
 * `centerLngLat`/`zoomForRadius`: la misma fórmula que la web, sin copia propia.
 *
 * **Estado.** `nativeStep` es el reducer puro de la fase: este archivo sólo
 * traduce callbacks del SDK a señales. `ready` exige los dos hitos (estilo
 * cargado **y** primer render completo); uno solo todavía no es un tile.
 *
 * **Errores.** Un teléfono sólo puede fallar por estilo o por timeout de 8 s;
 * `failWebgl`/`failContext` describen un contexto WebGL de JS que acá no existe.
 * `failed` desmonta el mapa (paridad con el `release()` web: no queda un
 * renderer vivo gastando texturas) y el reintento es un montaje nuevo.
 */

type Props = {
  /** Lado del cuadrado en px; 0 mientras el layout no está medido. */
  side: number;
  radiusM: number;
  /** Centro del basemap: el punto del GPS si lo hay, si no la zona de la región. */
  center: LngLat;
  /** Se avisa al padre para alternar leyenda ilustrada / atribución. */
  onPhaseChange?: (phase: MapPhase) => void;
};

export function MapBasemap({ side, radiusM, center, onPhaseChange }: Props) {
  const cameraRef = useRef<CameraRef | null>(null);
  const [state, setState] = useState<NativeState>(NATIVE_INITIAL);
  /** Cada reintento es un montaje nuevo del SDK, como el `attempt` web. */
  const [attempt, setAttempt] = useState(0);
  const armed = side > 0;
  const { phase, failure } = state;

  /**
   * Identidad estable: `Map` serializa el estilo en cada render, así que un
   * objeto nuevo acá se traduce en un reload visible del mapa.
   */
  const nativeStyle = useMemo(() => mapStyle() as unknown as StyleSpecification, []);
  const camera = useMemo(
    () => nativeCamera({ side, radiusM, center }),
    [side, radiusM, center.lon, center.lat],
  );

  const dispatch = useCallback((name: string) => {
    setState((current) => nativeStep(current, nativeSignal(name)));
  }, []);

  /**
   * Handlers con identidad estable: el SDK compara props para decidir si
   * re-suscribe el puente nativo, y un arrow nuevo por render no aporta nada.
   */
  const events = useMemo(
    () => ({
      onWillStartLoadingMap: () => dispatch('onWillStartLoadingMap'),
      onDidFinishLoadingMap: () => dispatch('onDidFinishLoadingMap'),
      onDidFinishRenderingMapFully: () => dispatch('onDidFinishRenderingMapFully'),
      onDidFailLoadingMap: () => dispatch('onDidFailLoadingMap'),
      onDidFinishLoadingStyle: () => dispatch('onDidFinishLoadingStyle'),
    }),
    [dispatch],
  );

  // 8 s por intento: se desarma con el intento, no con la fase. No hace falta
  // cancelarlo al llegar a `ready` porque `nativeStep` ignora el timeout ahí.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => {
      setState((current) => nativeStep(current, 'fail-timeout'));
    }, MAP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armed, attempt]);

  // Recentrado sin remontar. `jumpTo` del SDK tira si el nodo nativo todavía no
  // existe, y la `Camera` sólo está montada y usable cuando el render terminó:
  // por eso el guard es `phase === 'ready'`.
  useEffect(() => {
    if (phase !== 'ready') return;
    cameraRef.current?.jumpTo({
      center: camera.center,
      zoom: camera.zoom,
      bearing: 0,
      pitch: 0,
    });
  }, [phase, camera]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  const retry = useCallback(() => {
    setState(nativeRetry);
    setAttempt((value) => value + 1);
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {armed && phase !== 'failed' ? (
        <View
          style={[StyleSheet.absoluteFill, styles.host, { opacity: phase === 'ready' ? 1 : 0 }]}
          pointerEvents="none"
        >
          <Map
            key={attempt}
            style={StyleSheet.absoluteFill}
            mapStyle={nativeStyle}
            androidView="texture"
            pointerEvents="none"
            attribution={false}
            logo={false}
            compass={false}
            scaleBar={false}
            dragPan={false}
            touchZoom={false}
            touchRotate={false}
            touchPitch={false}
            doubleTapZoom={false}
            doubleTapHoldZoom={false}
            {...events}
          >
            <Camera
              ref={cameraRef}
              center={camera.center}
              zoom={camera.zoom}
              bearing={0}
              pitch={0}
              duration={0}
            />
          </Map>
        </View>
      ) : null}

      {armed && phase === 'failed' ? (
        <View style={styles.failure} pointerEvents="auto">
          <Chip label={mapText('failed', { reason: mapText(failure ?? 'failStyle') })} />
          <Chip label={mapText('retry')} icon="radar" onPress={retry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    overflow: 'hidden',
  },
  failure: {
    position: 'absolute',
    left: 8,
    top: 8,
    maxWidth: '92%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
});
