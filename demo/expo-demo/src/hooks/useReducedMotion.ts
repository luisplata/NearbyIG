import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * `prefers-reduced-motion` (web) / reduce motion (nativo). En web se consulta
 * `matchMedia` —el mismo media query que respeta la app Flutter— y se escucha
 * el cambio en vivo.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
    ) {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(media.matches);
      const listener = (event: MediaQueryListEvent): void => setReduced(event.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }

    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) {
          setReduced(value);
        }
      })
      .catch(() => {
        /* Sin API de accesibilidad: se asume movimiento permitido. */
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
