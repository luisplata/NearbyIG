import { describe, expect, it } from 'vitest';

import {
  DEMO_CENTER,
  MAP_TIMEOUT_MS,
  ZONE_CENTERS,
  centerLngLat,
  zoomForRadius,
  type LngLat,
} from '../src/map/basemap';
import { mapCopy } from '../src/map/mapCopy';
import { MAP_PHASES } from '../src/map/mapStatus';
import {
  NATIVE_FAILURES,
  NATIVE_INITIAL,
  nativeCamera,
  nativeIsReady,
  nativeRetry,
  nativeSignal,
  nativeStep,
  type NativeMilestone,
  type NativeSignal,
  type NativeState,
} from '../src/map/nativeMap';

/**
 * Cámara y señales del basemap nativo, sin renderer.
 *
 * El invariante es el anti-drift: el nativo **no** tiene fórmula propia, así que
 * los 27 casos comparan con `toEqual` contra `centerLngLat`/`zoomForRadius` y no
 * con `toBeCloseTo`. Si alguien "optimiza" la fórmula en un solo lado, esto se
 * rompe acá en vez de mostrar puntos desalineados en device.
 */
const CENTERS: ReadonlyArray<readonly [string, LngLat]> = [
  ['demo', DEMO_CENTER],
  ['cdmx', ZONE_CENTERS['cdmx']],
  ['bogota', ZONE_CENTERS['bogota']],
];
const SIDES = [320, 400, 480] as const;
const RADII = [500, 2000, 5000] as const;

const CAMERA_CASES = CENTERS.flatMap(([zone, center]) =>
  SIDES.flatMap((side) =>
    RADII.map((radiusM) => ({
      label: `${zone} · ${side} px · ${radiusM} m`,
      side,
      radiusM,
      center,
    })),
  ),
);

const ALL_SIGNALS: ReadonlyArray<NativeSignal | null> = [
  'load',
  'loaded',
  'rendered',
  'fail-style',
  'fail-timeout',
  null,
];

function run(signals: ReadonlyArray<NativeSignal | null>, start = NATIVE_INITIAL): NativeState {
  return signals.reduce<NativeState>((state, signal) => nativeStep(state, signal), start);
}

describe('nativeCamera', () => {
  it.each(CAMERA_CASES)('$label: mismos números que la web', ({ side, radiusM, center }) => {
    const camera = nativeCamera({ side, radiusM, center });
    expect(camera).toEqual({
      center: centerLngLat(center),
      zoom: zoomForRadius(radiusM, side, center),
      bearing: 0,
      pitch: 0,
    });
    expect(camera.bearing).toBe(0);
    expect(camera.pitch).toBe(0);
  });

  it('son 27 combinaciones y la cámara no agrega claves', () => {
    expect(CAMERA_CASES).toHaveLength(27);
    const camera = nativeCamera({ side: 400, radiusM: 2000, center: DEMO_CENTER });
    expect(Object.keys(camera)).toEqual(['center', 'zoom', 'bearing', 'pitch']);
    // El centro va en el orden de MapLibre, no en el del objeto `LngLat`.
    expect(camera.center).toEqual([DEMO_CENTER.lon, DEMO_CENTER.lat]);
  });
});

describe('nativeSignal', () => {
  it.each([
    ['onWillStartLoadingMap', 'load'],
    ['onDidFinishLoadingMap', 'loaded'],
    ['onDidFinishRenderingMapFully', 'rendered'],
    ['onDidFailLoadingMap', 'fail-style'],
  ] as const)('%s ⇒ %s', (name, signal) => {
    expect(nativeSignal(name)).toBe(signal);
  });

  it('el estilo y lo desconocido son no-ops, no excepciones', () => {
    // `onDidFinishLoadingStyle` llega antes de que exista un tile: no es un hito.
    expect(nativeSignal('onDidFinishLoadingStyle')).toBeNull();
    expect(nativeSignal('onRegionDidChange')).toBeNull();
    expect(nativeSignal('')).toBeNull();
    // Claves heredadas: `in` matchearía, `hasOwn` no.
    expect(nativeSignal('toString')).toBeNull();
    expect(nativeSignal('constructor')).toBeNull();
  });
});

describe('hitos y fase', () => {
  it('sólo `loaded` no es ready: `rendered` tampoco', () => {
    expect(nativeIsReady(new Set<NativeMilestone>())).toBe(false);
    expect(nativeIsReady(new Set<NativeMilestone>(['loaded']))).toBe(false);
    expect(nativeIsReady(new Set<NativeMilestone>(['rendered']))).toBe(false);
  });

  it('`loaded` + `rendered` en cualquier orden es ready', () => {
    expect(nativeIsReady(new Set<NativeMilestone>(['loaded', 'rendered']))).toBe(true);
    expect(nativeIsReady(new Set<NativeMilestone>(['rendered', 'loaded']))).toBe(true);

    for (const [first, second] of [
      ['loaded', 'rendered'],
      ['rendered', 'loaded'],
    ] as const) {
      const loading = nativeStep(nativeStep(NATIVE_INITIAL, 'load'), first);
      expect(loading.phase).toBe('loading');
      const ready = nativeStep(loading, second);
      expect(ready.phase).toBe('ready');
      expect(ready.failure).toBeNull();
    }
  });

  it('idle → loading → ready, y un intento nuevo vuelve a empezar', () => {
    const loading = nativeStep(NATIVE_INITIAL, 'load');
    expect(loading.phase).toBe('loading');
    expect(loading.seen.size).toBe(0);
    // Un hito implica que el intento arrancó aunque el componente no haya visto LOAD.
    expect(nativeStep(NATIVE_INITIAL, 'loaded').phase).toBe('loading');
    expect(run(['load', 'loaded', 'rendered']).phase).toBe('ready');
  });

  it('una señal nula devuelve la misma referencia', () => {
    const states = [
      NATIVE_INITIAL,
      run(['load']),
      run(['load', 'loaded', 'rendered']),
      run(['fail-style']),
    ];
    for (const state of states) expect(nativeStep(state, null)).toBe(state);
  });

  it('un hito repetido también devuelve la misma referencia', () => {
    const loading = run(['load', 'loaded']);
    expect(nativeStep(loading, 'loaded')).toBe(loading);
  });
});

describe('motivos de falla', () => {
  it.each([
    ['fail-style', 'failStyle'],
    ['fail-timeout', 'failTimeout'],
  ] as const)('%s ⇒ failed con %s', (signal, reason) => {
    const failed = nativeStep(run(['load', 'loaded']), signal);
    expect(failed.phase).toBe('failed');
    expect(failed.failure).toBe(reason);
    expect(failed.seen.size).toBe(0);
    // FAIL también desde idle: el timeout puede vencer antes del primer LOAD.
    expect(nativeStep(NATIVE_INITIAL, signal).phase).toBe('failed');
  });

  it('el vocabulario es exactamente los dos motivos nativos', () => {
    expect(NATIVE_FAILURES).toEqual(['failStyle', 'failTimeout']);
    for (const reason of NATIVE_FAILURES) {
      expect(Object.hasOwn(mapCopy, reason), reason).toBe(true);
    }
  });

  it('ninguna ruta nativa produce failWebgl ni failContext', () => {
    const reached = new Set<string>();
    for (const phase of MAP_PHASES) {
      for (const signal of ALL_SIGNALS) {
        const next = nativeStep({ phase, failure: null, seen: NATIVE_INITIAL.seen }, signal);
        if (next.failure !== null) reached.add(next.failure);
      }
    }
    expect([...reached].sort()).toEqual(['failStyle', 'failTimeout']);
    expect(reached.has('failWebgl')).toBe(false);
    expect(reached.has('failContext')).toBe(false);
  });

  it('después de ready un fallo no cambia la fase', () => {
    const ready = run(['load', 'loaded', 'rendered']);
    for (const signal of ['fail-style', 'fail-timeout'] as const) {
      const after = nativeStep(ready, signal);
      expect(after.phase).toBe('ready');
      expect(after.failure).toBeNull();
    }
  });

  it('failed no revive con un hito tardío y conserva el motivo', () => {
    const failed = run(['load', 'fail-timeout']);
    expect(failed.failure).toBe('failTimeout');
    for (const signal of ['load', 'loaded', 'rendered'] as const) {
      const after = nativeStep(failed, signal);
      expect(after.phase, signal).toBe('failed');
      expect(after.failure, signal).toBe('failTimeout');
    }
  });

  it('nativeRetry vuelve a idle, sin motivo y con el Set limpio', () => {
    const retried = nativeRetry(run(['load', 'fail-style']));
    expect(retried.phase).toBe('idle');
    expect(retried.failure).toBeNull();
    expect(retried.seen.size).toBe(0);
    expect(retried.seen).toEqual(new Set<NativeMilestone>());
  });

  it('el timeout del intento sigue siendo 8 s', () => {
    expect(MAP_TIMEOUT_MS).toBe(8000);
    // La señal que dispara ese timeout es la única fuente del motivo.
    const timedOut = nativeStep(nativeStep(NATIVE_INITIAL, 'load'), 'fail-timeout');
    expect(timedOut.failure).toBe('failTimeout');
  });
});
