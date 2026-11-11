import { View } from 'react-native';

import { fmt } from '../generated/copy';
import { colors } from '../theme/theme';

import { Icon } from './Icon';

/**
 * Insignia de verificado: forma propia y etiqueta del catálogo (`a11y.verified`).
 * En la lista, la tarjeta incluye la etiqueta en su label compuesto y este nodo
 * queda fuera por `accessibilityElementsHidden` del contenedor.
 */
export function VerifiedBadge({ size = 15 }: { size?: number }) {
  return (
    <View accessible accessibilityLabel={fmt('a11y.verified')}>
      <Icon name="verified" size={size} color={colors.verified} />
    </View>
  );
}

/** Punto de "en línea": la presencia es la señal de forma, el color la refuerza. */
export function OnlineDot({ size = 8 }: { size?: number }) {
  return (
    <View
      accessible
      accessibilityLabel={fmt('a11y.online')}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.online }}
    />
  );
}
