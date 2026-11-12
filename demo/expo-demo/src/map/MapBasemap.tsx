import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { Map as MapLibreMap } from 'maplibre-gl';

import { centerLngLat, MAP_TIMEOUT_MS, zoomForRadius } from './basemap';
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
 * - un solo intento por montaje, con timeout de 8 s; error o pérdida de
 *   contexto vuelven al mapa ilustrado sin tirar nada;
 * - el canvas queda invisible hasta `load`: nunca hay un cuadrado blanco.
 */

type Props = {
  /** Lado del cuadrado en px; 0 mientras el layout no está medido. */
  side: number;
  radiusM: number;
  /** Se avisa al padre para alternar leyenda ilustrada / atribución. */
  onPhaseChange?: (phase: MapPhase) => void;
};

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

export function MapBasemap({ side, radiusM, onPhaseChange }: Props) {
  const hostRef = useRef<ComponentRef<typeof View>>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const phaseRef = useRef<MapPhase>('idle');
  const startedRef = useRef(false);
  // Valores vigentes para el handler de `load`: el efecto de montaje corre una
  // sola vez, así que el closure vería el radio/lado iniciales si llega tarde.
  const latestRef = useRef({ radiusM, side });
  latestRef.current = { radiusM, side };
  const [phase, setPhase] = useState<MapPhase>('idle');
  const armed = side > 0;

  const dispatch = (event: MapEvent): void => {
    const next = reduceMapStatus(phaseRef.current, event);
    if (next === phaseRef.current) return;
    phaseRef.current = next;
    setPhase(next);
  };

  // Montaje: exactamente una vez por vida del componente.
  useEffect(() => {
    if (!armed || startedRef.current) return;
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;

    startedRef.current = true;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

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

    let warned = false;
    const fail = (reason?: unknown): void => {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      release();
      if (!warned) {
        warned = true;
        console.warn('[map] basemap no disponible: se mantiene el mapa ilustrado.', reason);
      }
      dispatch('FAIL');
    };

    if (!supportsWebGL()) {
      // Único warning permitido: sin WebGL no se intenta y no se rompe nada.
      console.warn('[map] WebGL no disponible: se mantiene el mapa ilustrado.');
      fail();
      return () => {
        disposed = true;
      };
    }

    dispatch('LOAD');
    timer = setTimeout(fail, MAP_TIMEOUT_MS);

    void import('maplibre-gl')
      .then(({ Map, setWorkerUrl }) => {
        if (disposed) return;
        // Metro no emite el worker de MapLibre en el export: se copia a `public/`
        // (script `copy-maplibre-worker.mjs`) y se resuelve contra el base path.
        setWorkerUrl(new URL('maplibre-gl-worker.js', document.baseURI).href);
        const map = new Map({
          container: inner,
          style: mapStyle(),
          center: centerLngLat(),
          zoom: zoomForRadius(radiusM, side),
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

        map.on('error', (event) => fail(event?.error ?? 'map error'));

        map.once('load', () => {
          if (disposed) return;
          if (timer !== undefined) clearTimeout(timer);
          map.resize();
          // El radio o el lado pudieron cambiar durante la carga: re-aplicamos el
          // zoom vigente para que el mapa no quede a la escala vieja.
          const current = latestRef.current;
          map.jumpTo({ center: centerLngLat(), zoom: zoomForRadius(current.radiusM, current.side) });
          dispatch('READY');
        });

        map.on('webglcontextlost', () => fail());
      })
      .catch(() => fail());

    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      release();
    };
    // Una sola vez: `armed` sólo destraba el primer montaje con layout medido.
  }, [armed]);

  // Redimensionar no remonta: `resize()` re-lee el contenedor y re-fit el canvas.
  useEffect(() => {
    if (!armed) return;
    mapRef.current?.resize();
  }, [armed, side]);

  // Cambio de radio: `jumpTo` sin animación (reduced-motion friendly).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || phaseRef.current !== 'ready') return;
    map.jumpTo({ center: centerLngLat(), zoom: zoomForRadius(radiusM, side) });
  }, [radiusM, side]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  return (
    <View
      ref={hostRef}
      style={[StyleSheet.absoluteFill, styles.host, { opacity: phase === 'ready' ? 1 : 0 }]}
      pointerEvents="none"
      aria-hidden
    />
  );
}

const styles = StyleSheet.create({
  host: {
    overflow: 'hidden',
  },
});
