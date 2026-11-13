import { Platform, type ViewStyle } from 'react-native';

import { colors } from './theme';

/**
 * Anillo de foco único de la demo.
 *
 * **El problema que resuelve.** Cada componente dibujaba su foco con
 * `borderWidth: 2 + borderColor: accent`. Eso tiene tres defectos: el borde
 * **ocupa lugar** (la caja crece 4 px y el contenido se corre al tabular), el
 * rectángulo del borde no siempre coincide con la píldora del `borderRadius`, y
 * el navegador suma su propio `outline` de foco encima. El resultado era el
 * "borde amarillo que no coincide con la forma del botón".
 *
 * **La solución.** Un `box-shadow` de 0 blur y 0 offset: dibuja un anillo de
 * `FOCUS_RING_WIDTH` px por fuera de la forma, **respeta el `border-radius`** y
 * no entra en el layout (no hay corrimiento). El `outline` nativo se apaga acá y
 * también en la plantilla web, para que no queden dos indicadores.
 *
 * **Nativo.** No hay foco por teclado en la demo móvil: devolver `{}` evita
 * arrastrar una sombra que no corresponde.
 *
 * **Contenedores recortados.** `DemoFrame` y las hojas usan `overflow: hidden`;
 * un anillo externo pegado al borde se recorta. Para esos casos está
 * `focusRingInset`, que dibuja el anillo hacia adentro (`inset`) y sigue
 * respetando el radio.
 */

/** Grosor del anillo. 2 px se ve sin empujar el contenido. */
export const FOCUS_RING_WIDTH = 2;

const WEB = Platform.OS === 'web';

/**
 * `outlineStyle: 'none'` no está en la unión tipada de React Native (sólo
 * `solid | dotted | dashed`), pero es CSS válido y es lo único que apaga el
 * outline del navegador en React Native Web. El cast es a `ViewStyle`, sin `any`.
 */
const NO_OUTLINE = { outlineStyle: 'none' } as unknown as ViewStyle;

function ring(focused: boolean, shadow: string): ViewStyle {
  if (!focused || !WEB) {
    return {};
  }
  return { boxShadow: shadow, ...NO_OUTLINE };
}

/** Anillo exterior: para elementos con padding alrededor. */
export function focusRing(focused: boolean): ViewStyle {
  return ring(focused, `0 0 0 ${FOCUS_RING_WIDTH}px ${colors.accent}`);
}

/**
 * Anillo interior: para elementos que tocan el borde de un contenedor con
 * `overflow: hidden` (la barra inferior, por ejemplo), donde el anillo externo
 * se vería recortado.
 */
export function focusRingInset(focused: boolean): ViewStyle {
  return ring(focused, `inset 0 0 0 ${FOCUS_RING_WIDTH}px ${colors.accent}`);
}
