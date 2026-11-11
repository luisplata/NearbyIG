import 'package:flutter/material.dart';

import '../generated/tokens.dart';

/// Tema oscuro único de la demo. Todos los colores salen de los tokens
/// generados: ninguna pantalla escribe literales (CONTRACT.md §3).
ThemeData buildAppTheme() {
  const scheme = ColorScheme.dark(
    primary: Tokens.colorGradientStart,
    onPrimary: Tokens.colorText,
    secondary: Tokens.colorAccent,
    onSecondary: Tokens.colorBg,
    surface: Tokens.colorSurface,
    onSurface: Tokens.colorText,
    error: Tokens.colorDanger,
    onError: Tokens.colorText,
    outline: Tokens.colorBorder,
  );

  final textTheme = TextTheme(
    bodySmall: TextStyle(
      fontSize: Tokens.fontSizes[0],
      height: Tokens.lineHeights[2],
      color: Tokens.colorMuted,
    ),
    bodyMedium: TextStyle(
      fontSize: Tokens.fontSizes[1],
      height: Tokens.lineHeights[2],
      color: Tokens.colorText,
    ),
    bodyLarge: TextStyle(
      fontSize: Tokens.fontSizes[2],
      height: Tokens.lineHeights[1],
      color: Tokens.colorText,
    ),
    titleMedium: TextStyle(
      fontSize: Tokens.fontSizes[3],
      height: Tokens.lineHeights[0],
      fontWeight: FontWeight.w600,
      color: Tokens.colorText,
    ),
    titleLarge: TextStyle(
      fontSize: Tokens.fontSizes[4],
      height: Tokens.lineHeights[0],
      fontWeight: FontWeight.w600,
      color: Tokens.colorText,
    ),
    headlineSmall: TextStyle(
      fontSize: Tokens.fontSizes[5],
      height: Tokens.lineHeights[0],
      fontWeight: FontWeight.w600,
      color: Tokens.colorText,
    ),
  );

  const buttonShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.all(Radius.circular(12)),
  );
  final buttonPadding = EdgeInsets.symmetric(
    horizontal: Tokens.space[3],
    vertical: Tokens.space[1],
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    fontFamily: Tokens.fontFamily,
    colorScheme: scheme,
    scaffoldBackgroundColor: Tokens.colorBg,
    canvasColor: Tokens.colorBg,
    dividerColor: Tokens.colorBorder,
    textTheme: textTheme,
    iconTheme: const IconThemeData(color: Tokens.colorMuted, size: 20),
    splashColor: Tokens.colorAccent.withValues(alpha: 0.08),
    highlightColor: Tokens.colorAccent.withValues(alpha: 0.05),
    dividerTheme: const DividerThemeData(color: Tokens.colorBorder, space: 1),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(44, 48),
        padding: buttonPadding,
        shape: buttonShape,
        backgroundColor: Tokens.colorGradientStart,
        foregroundColor: Tokens.colorText,
        textStyle: TextStyle(
          fontSize: Tokens.fontSizes[1],
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(44, 48),
        padding: buttonPadding,
        shape: buttonShape,
        foregroundColor: Tokens.colorText,
        side: const BorderSide(color: Tokens.colorBorder),
        textStyle: TextStyle(
          fontSize: Tokens.fontSizes[1],
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(44, 44),
        foregroundColor: Tokens.colorText,
        textStyle: TextStyle(fontSize: Tokens.fontSizes[1]),
      ),
    ),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: Tokens.colorAccent,
      selectionColor: Tokens.colorBorder,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? Tokens.colorAccent
            : Tokens.colorMuted,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? Tokens.colorAccent.withValues(alpha: 0.35)
            : Tokens.colorSurfaceAlt,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Tokens.colorSurfaceAlt,
      contentPadding: EdgeInsets.symmetric(
        horizontal: Tokens.space[2],
        vertical: Tokens.space[2],
      ),
      border: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: Tokens.colorBorder),
      ),
      enabledBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: Tokens.colorBorder),
      ),
      focusedBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: Tokens.colorAccent),
      ),
    ),
  );
}
