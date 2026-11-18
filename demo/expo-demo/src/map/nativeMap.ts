/**
 * Vocabulario del basemap nativo: cámara y máquina de señales, sin renderer.
 *
 * Sin React, sin React Native y sin el SDK: la cámara y la fase se verifican en
 * Node, y `MapBasemap.native.tsx` queda reducido a montar el `Map` y traducir
 * callbacks a señales.
 *
 * **La cámara se delega, no se recalcula.** `nativeCamera` llama literalmente a
 * `centerLngLat` y `zoomForRadius` de `./basemap`: hay una sola fórmula en el
 * repo, así que el drift web/nativo es imposible por construcción. Un nivel de
 * zoom de diferencia duplica la escala; copiar la matemática "para no acoplar"
 * sería justamente el acoplamiento caro.
 */

import { centerLngLat, zoomForRadius, type LngLat } from './basemap';
import type { MapCopyKey } from './mapCopy';
import { reduceMapStatus, type MapPhase } from './mapStatus';

/** `[lng, lat]`, norte arriba y vista cenital: lo que asumen los puntos. */
export type NativeCamera = {
  readonly center: [number, number];
  readonly zoom: number;
  readonly bearing: 0;
  readonly pitch: 0;
};

export type NativeCameraInput = {
  readonly side: number;
  readonly radiusM: number;
  readonly center: LngLat;
};

/**
 * Los mismos números que la web, por delegación: acá no hay fórmula propia.
 * `bearing`/`pitch` fijos en 0 porque un gesto que los mueva desalinearía los
 * anillos que se dibujan en SVG con norte arriba.
 */
export function nativeCamera(input: NativeCameraInput): NativeCamera {
  const { side, radiusM, center } = input;
  return {
    center: centerLngLat(center),
    zoom: zoomForRadius(radiusM, side, center),
    bearing: 0,
    pitch: 0,
  };
}

/**
 * Los dos motivos que un teléfono puede decir sin mentir: `failWebgl` y
 * `failContext` describen un contexto WebGL de JS que en el binario no existe.
 */
export type NativeFailure = Extract<MapCopyKey, 'failStyle' | 'failTimeout'>;

/** Lista runtime del vocabulario cerrado, tipada contra el copy existente. */
export const NATIVE_FAILURES: readonly NativeFailure[] = ['failStyle', 'failTimeout'];

export type NativeSignal =
  | 'load' //          onWillStartLoadingMap
  | 'loaded' //        onDidFinishLoadingMap        → hito
  | 'rendered' //      onDidFinishRenderingMapFully → hito
  | 'fail-style' //    onDidFailLoadingMap
  | 'fail-timeout'; // MAP_TIMEOUT_MS

/** Los hitos que, juntos, significan "hay tiles en pantalla". */
export type NativeMilestone = Extract<NativeSignal, 'loaded' | 'rendered'>;

/**
 * `ready` = los DOS hitos. `loaded` solo llega antes de que exista un tile
 * pintado: con ese único evento el badge de atribución taparía una pantalla
 * vacía, que es la mentira que este change elimina.
 */
export function nativeIsReady(seen: ReadonlySet<NativeMilestone>): boolean {
  return seen.has('loaded') && seen.has('rendered');
}

/**
 * Tabla nombre-de-callback → señal. Los callbacks llegan como strings desde otra
 * capa: lo desconocido es un no-op (`null`), no una excepción en el puente.
 */
const SIGNALS: Readonly<Record<string, NativeSignal | null>> = {
  onWillStartLoadingMap: 'load',
  onDidFinishLoadingMap: 'loaded',
  onDidFinishRenderingMapFully: 'rendered',
  onDidFailLoadingMap: 'fail-style',
  onDidFinishLoadingStyle: null, // el estilo no es un tile
};

/** `hasOwn` y no `in`: `toString` es una clave que ninguna tabla declaró. */
export function nativeSignal(name: string): NativeSignal | null {
  return Object.hasOwn(SIGNALS, name) ? SIGNALS[name] : null;
}

export type NativeState = {
  readonly phase: MapPhase;
  readonly failure: NativeFailure | null;
  readonly seen: ReadonlySet<NativeMilestone>;
};

export const NATIVE_INITIAL: NativeState = {
  phase: 'idle',
  failure: null,
  seen: new Set<NativeMilestone>(),
};

/**
 * Composición con `reduceMapStatus`, sin modificarlo (la tabla de fases es de
 * los dos renderers): un hito implica que el intento arrancó, `ready` sólo con
 * `nativeIsReady`, `failed` es terminal (un hito tardío no revive ni pisa el
 * motivo) y después de `ready` un fallo es decorativo, como en web. Las señales
 * repetidas o nulas devuelven **la misma** referencia para no re-renderizar.
 */
export function nativeStep(state: NativeState, signal: NativeSignal | null): NativeState {
  if (signal === null) return state;

  if (signal === 'fail-style' || signal === 'fail-timeout') {
    if (state.phase === 'ready' || state.phase === 'failed') return state;
    return {
      phase: reduceMapStatus(state.phase, 'FAIL'),
      failure: signal === 'fail-timeout' ? 'failTimeout' : 'failStyle',
      seen: NATIVE_INITIAL.seen,
    };
  }

  if (signal === 'load') {
    if (state.phase !== 'idle') return state;
    return { phase: reduceMapStatus('idle', 'LOAD'), failure: state.failure, seen: state.seen };
  }

  if (state.seen.has(signal)) return state;

  const seen: ReadonlySet<NativeMilestone> = new Set([...state.seen, signal]);
  const started: MapPhase = state.phase === 'idle' ? reduceMapStatus('idle', 'LOAD') : state.phase;
  const phase: MapPhase = nativeIsReady(seen) ? reduceMapStatus(started, 'READY') : started;
  return { phase, failure: phase === 'ready' ? null : state.failure, seen };
}

/** RETRY del usuario: vuelve a idle con el `Set` limpio, como un montaje nuevo. */
export function nativeRetry(state: NativeState): NativeState {
  return { phase: reduceMapStatus(state.phase, 'RETRY'), failure: null, seen: NATIVE_INITIAL.seen };
}
