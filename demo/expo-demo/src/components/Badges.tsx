import { View } from 'react-native';

import { colors } from '../theme/theme';

import { Icon } from './Icon';

/** Insignia de verificado: forma propia, decorativa (la etiqueta la da el padre). */
export function VerifiedBadge({ size = 15 }: { size?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon name="verified" size={size} color={colors.verified} />
    </View>
  );
}

/** Punto de "en línea": la presencia es la señal de forma, el color la refuerza. */
export function OnlineDot({ size = 8 }: { size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.online }}
    />
  );
}
