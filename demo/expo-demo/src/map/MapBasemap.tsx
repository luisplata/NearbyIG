import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { Map as MapLibreMap } from 'maplibre-gl';

import { Chip } from '../components/Chip';
import { centerLngLat, MAP_TIMEOUT_MS, zoomForRadius, type LngLat } from './basemap';
import { mapText, type MapCopyKey } from './mapCopy';
import { reduceMapStatus, type MapEvent, type MapPhase } from './mapStatus';
import { mapStyle } from './style';

/**
 * Basemap real (OpenFreeMap + MapLibre GL JS) montado **sólo en web** y **sólo**
 * en un `useEffect`: el import es dinámico, así que MapLibre no se evalúa en el
 * bundle inicial ni mientras la lista está activa.
 *
 * Reglas que no se negocian:
 * - el contenedor es un `div` hijo imperativo: MapLibre le agrega clases y
 *   `react-native-web` reaplica `className`/`style` en cada render;
 * - no es interactivo y no agrega controles (ni atribución): los puntos siguen
 *   siendo el único blanco de toque;
 * - el canvas queda invisible hasta `load`: nunca hay un cuadrado blanco.
 *
 * **Centro.** El `center` que llega puede ser el punto del GPS (memoria del
 * cliente, nunca persistido) o el centroide de la zona demo. El zoom se calcula
 * con el `cos(lat)` **de ese** centro: a 4° (Bogotá) y a 19° (CDMX) el mismo
 * radio ocupa distinto zoom, y usar otra latitud desalinearía anillos y cuadras.
 *
 * **Errores.** Antes cualquier evento `error` mataba el basemap (`failed` era
 * terminal) y un tile lento dejaba el radar sin mapa hasta recargar. Ahora:
 * - antes de `load`, un error o el timeout de 8 s ⇒ `failed` (el estilo no cargó);
 * - después de `load`, los errores de tiles/símbolos/fuentes se **ignoran**: el
 *   mapa ya está sirviendo y sólo perdería capas decorativas;
 * - `webglcontextlost` sí es fatal (el canvas ya no dibuja);
 * - con `failed` se muestra el motivo y un chip "Reintentar mapa", que remonta
 *   MapLibre una vez más.
 */

type Props = {
  /** Lado del cuadrado en px; 0 mientras el layout no está medido. */
  side: number;
  radiusM: number;
  /**
   * Centro del basemap: el punto del GPS si lo hay, si no la zona de la región.
   * Cambiarlo mueve el mapa con un `jumpTo` (sin remontar MapLibre ni perder los
   * tiles ya cargados).
   */
  center: LngLat;
  /** Se avisa al padre para alternar leyenda ilustrada / atribución. */
  onPhaseChange?: (phase: MapPhase) => void;
};

/** Motivos cortos: entran en el chip junto al botón, a 360 px. */
type FailureKey = Extract<MapCopyKey, 'failWebgl' | 'failTimeout' | 'failStyle' | 'failContext'>;

function supportsWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return context !== null;
  } catch {
    return false;
  }
}

export function MapBasemap({ side, radiusM, center, onPhaseChange }: Props) {
  const hostRef = useRef<ComponentRef<typeof View>>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const phaseRef = useRef<MapPhase>('idle');
  // Valores vigentes para el handler de `load`: el efecto de montaje corre una
  // sola vez por intento, así que el closure vería el radio/lado/centro iniciales
  // si llega tarde (o si el usuario cambió de región mientras cargaban los tiles).
  const latestRef = useRef({ radiusM, side, center });
  latestRef.current = { radiusM, side, center };
  const [phase, setPhase] = useState<MapPhase>('idle');
  const [failure, setFailure] = useState<FailureKey | null>(null);
  /** Cada reintento es un montaje nuevo de MapLibre. */
  const [attempt, setAttempt] = useState(0);
  const armed = side > 0;

  const dispatch = (event: MapEvent): void => {
    const next = reduceMapStatus(phaseRef.current, event);
    if (next === phaseRef.current) return;
    phaseRef.current = next;
    setPhase(next);
  };

  // Montaje: uno por intento (el reintento incrementa `attempt`).
  useEffect(() => {
    if (!armed) return;
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** Un solo aviso de "error ignorado": no hay que inundar la consola. */
    let ignored = false;

    const inner = document.createElement('div');
    inner.setAttribute('aria-hidden', 'true');
    inner.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:0';
    host.appendChild(inner);

    const release = (): void => {
      const map = mapRef.current;
      mapRef.current = null;
      if (map) map.remove();
      inner.remove();
    };

    const fail = (reason: FailureKey, detail?: unknown): void => {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      release();
      setFailure(reason);
      console.warn(
        `[map] basemap no disponible (${mapText(reason)}): se mantiene el mapa ilustrado.`,
        detail,
      );
      dispatch('FAIL');
    };

    if (!supportsWebGL()) {
      fail('failWebgl', 'WebGL no disponible');
      return () => {
        disposed = true;
      };
    }

    dispatch('LOAD');
    timer = setTimeout(() => fail('failTimeout', 'timeout de 8 s'), MAP_TIMEOUT_MS);

    void import('maplibre-gl')
      .then(({ Map, setWorkerUrl }) => {
        if (disposed) return;
        // Metro no emite el worker de MapLibre en el export: se copia a `public/`
        // (script `copy-maplibre-worker.mjs`) y se resuelve contra el base path.
        setWorkerUrl(new URL('maplibre-gl-worker.js', document.baseURI).href);
        const map = new Map({
          container: inner,
          style: mapStyle(),
          center: centerLngLat(center),
          zoom: zoomForRadius(radiusM, side, center),
          interactive: false,
          attributionControl: false,
          maplibreLogo: false,
          fadeDuration: 0,
        });
        mapRef.current = map;

        // Lo mínimo que aportaría `maplibre-gl.css`; sin importar el CSS.
        map.getCanvasContainer().style.cssText += 'position:absolute;inset:0;';
        const canvas = map.getCanvas();
        canvas.style.display = 'block';
        canvas.style.position = 'absolute';
        canvas.style.left = '0';
        canvas.style.top = '0';

        // Antes de `load` el estilo es lo único que importa. Después, un tile o un
        // símbolo roto es decorativo: el mapa sigue sirviendo y apagarlo sería
        // peor que mostrarlo incompleto.
        map.on('error', (event) => {
          if (phaseRef.current === 'ready') {
            if (!ignored) {
              ignored = true;
              console.info('[map] error de tiles/símbolos ignorado tras load:', event?.error);
            }
            return;
          }
          fail('failStyle', event?.error ?? 'map error');
        });

        map.once('load', () => {
          if (disposed) return;
          if (timer !== undefined) clearTimeout(timer);
          map.resize();
          // El radio, el lado o el centro pudieron cambiar durante la carga:
          // re-aplicamos centro y zoom vigentes para que el mapa no quede en la
          // escala ni en la ciudad viejas.
          const current = latestRef.current;
          map.jumpTo({
            center: centerLngLat(current.center),
            zoom: zoomForRadius(current.radiusM, current.side, current.center),
          });
          dispatch('READY');
        });

        // El contexto perdido es fatal: sin canvas no hay nada que mostrar.
        map.on('webglcontextlost', () => fail('failContext'));
      })
      .catch((error) => fail('failStyle', error));

    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      release();
    };
    // Sólo `armed` y el número de intento: radio, lado y centro se aplican por
    // `jumpTo` sin remontar.
  }, [armed, attempt]);

  // Redimensionar no remonta: `resize()` re-lee el contenedor y re-fit el canvas.
  useEffect(() => {
    if (!armed) return;
    mapRef.current?.resize();
  }, [armed, side]);

  // Cambio de radio, de lado o de centro (región o punto del GPS): `jumpTo` sin
  // animación (reduced-motion friendly). El cos(lat) entra en el zoom: el centro
  // viaja con la escala, no como adorno.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || phaseRef.current !== 'ready') return;
    map.jumpTo({ center: centerLngLat(center), zoom: zoomForRadius(radiusM, side, center) });
  }, [radiusM, side, center.lon, center.lat]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  const retry = (): void => {
    setFailure(null);
    dispatch('RETRY');
    setAttempt((value) => value + 1);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        ref={hostRef}
        style={[StyleSheet.absoluteFill, styles.host, { opacity: phase === 'ready' ? 1 : 0 }]}
        pointerEvents="none"
        aria-hidden
      />

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
