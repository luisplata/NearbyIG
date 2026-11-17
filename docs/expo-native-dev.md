# Entorno nativo: Android e iOS

**Respuesta corta.** El código ya está listo para el teléfono (`app.config.ts` declara
`platforms`, package, versionCode, icono adaptativo y splash; `npx expo prebuild -p android`
genera un `android/` correcto **sin JDK**). Lo que falta es toolchain de máquina: **JDK 17** y
**SDK de Android 37**. iOS no se compila en Windows: va por EAS Build o por una Mac.

| Necesitás | Para qué | Estado hoy (17-nov-2026) |
|---|---|---|
| `npx expo prebuild -p android` | generar `android/` desde `app.config.ts` | ✅ funciona (no necesita JDK) |
| JDK 17 | compilar módulos nativos (`jvmToolchain(17)` de RN 0.88) | ❌ sólo hay JDK 21 |
| `platforms;android-37.x` + `build-tools;37.0.0` | `compileSdk` / build tools del SDK 58 | ❌ sólo hay 35 y 36 |
| `npx expo run:android` | compilar, instalar y abrir el APK | ❌ bloqueado por las dos filas de arriba |
| Xcode | compilar iOS | ❌ no existe en Windows |

`android/` e `ios/` son salida de **CNG** (Continuous Native Generation): están gitignored y
`prebuild --clean` los borra. Nunca edites archivos ahí; todo cambio va en `app.config.ts` o en
un config plugin. Por eso la configuración de máquina de este documento **nunca** vive en
`android/gradle.properties`.

---

## 1. JDK 17

1. Instalá **Temurin 17** (MSI) desde Adoptium, o el que prefieras, con instalador.
2. Verificá que quedó al lado del 21:

```bash
ls "/c/Program Files/Eclipse Adoptium"      # jdk-17... y jdk-21...
```

3. Decile a Gradle dónde está, en el **Gradle user home** (`%USERPROFILE%\.gradle\gradle.properties`),
   no en el proyecto:

```properties
org.gradle.java.installations.paths=C:/Program Files/Eclipse Adoptium/jdk-17.0.13.11-hotspot
org.gradle.java.installations.auto-detect=true
```

- La ruta exacta del `jdk-17...` sale del paso 2; cambiá la versión por la tuya.
- En `.properties` la barra invertida es carácter de escape: usá `/` o duplicá (`C:\\Program Files\\...`).
  Con `/` es copy-paste y no hay forma de equivocarse.
- Varios JDKs: separalos con coma en la misma línea.
- **El daemon puede seguir corriendo en 21.** Lo que arregla esta línea es la *toolchain* de
  compilación, no la JVM que ejecuta Gradle. Por eso no hace falta tocar `JAVA_HOME`.

**Por qué acá y no en `android/gradle.properties`:** ese archivo lo genera `prebuild` y está
gitignored. Cualquier cosa que escribas ahí desaparece en el próximo `prebuild --clean` y nadie
la ve en el diff. La ruta de un JDK es de la máquina, no del repo.

Si el build falla con `No matching toolchains found for requested specification: {languageVersion=17}`,
la ruta del paso 3 está mal escrita o apunta a un JDK que no existe.

## 2. SDK de Android: mirar antes de instalar

Los nombres de paquete cambian entre versiones y adivinar cuesta caro. **Primero mirá**:

```bash
sdkmanager --list | grep -i "android-37"        # Git Bash
sdkmanager --list | findstr /i "android-37"     # cmd
```

En este repo (verificado el 17-nov-2026) el SDK ofrece `platforms;android-37.0`,
`platforms;android-37.1` y `platforms;android-37.2`. **No existe** `platforms;android-37` a secas:
AGP 9 numera las plataformas con minor. `build-tools;37.0.0` sí existe.

```bash
sdkmanager "platforms;android-37.0" "build-tools;37.0.0"
ls "$ANDROID_HOME/platforms"                    # tiene que aparecer android-37.0
```

### Si Gradle no encuentra el target

El build puede buscar el directorio con el nombre viejo (`android-37`) y fallar aunque el paquete
esté instalado. Antes de tocar nada, leé el error: dice qué ruta esperaba. La salida de emergencia
es fijar los números desde el config, con `expo-build-properties` (hay que instalarlo primero):
`npx expo install expo-build-properties`, y en `plugins`:

```ts
['expo-build-properties', {
  android: { compileSdkVersion: 37, buildToolsVersion: '37.0.0' },
}],
```

Es un **escape hatch**, no la configuración por defecto: si lo agregás, queda como deuda visible y
hay que sacarlo cuando el SDK se alinee solo.

Después de cualquier cambio en `app.config.ts` que toque lo nativo:

```bash
npx expo prebuild -p android --clean
```

## 3. Correr en un teléfono

La app habla con el backend por `EXPO_PUBLIC_API_URL`. Se **inlinea en el bundle** cuando corre
Metro, no se lee en runtime: cambiarla exige reiniciar Metro (y a veces `--clear`).

`localhost` en el teléfono es el teléfono. Por eso, o la IP de la LAN, o túnel:

```bash
# mismo Wi-Fi que la notebook
EXPO_PUBLIC_API_URL=http://192.168.0.42:3000 npx expo start

# otra red (datos móviles): túnel
EXPO_PUBLIC_API_URL=http://192.168.0.42:3000 npx expo start --tunnel
```

- Emulador Android: la notebook es `10.0.2.2` → `http://10.0.2.2:3000`.
- Backend con TLS propio: usá la URL `https://` y no hace falta ningún permiso extra.
- HTTP plano a la LAN funciona en **debug**. En release, Android bloquea cleartext salvo que se
  declare; no lo declares: para el piloto alcanza con debug y con TLS.

Para probar chrome (safe area, barra de estado, back) y el permiso de ubicación sin compilar nada,
Expo Go alcanza mientras el SDK coincida. Lo que **no** prueba es el APK ni el manifest: eso es
`run:android` con la toolchain de las secciones 1 y 2.

```bash
npx expo run:android        # compila, instala y abre (JDK 17 + SDK 37)
```

## 4. iOS: qué falta

En Windows no hay forma de compilar: no hay Xcode ni simulador. La config ya está declarada
(`ios.bundleIdentifier`, `buildNumber`, `supportsTablet: false`), así que el día que exista una Mac
o una cuenta de EAS el binario sale del mismo `app.config.ts`.

```bash
eas build -p ios --profile preview     # requiere cuenta Expo + credenciales Apple
```

Queda pendiente para cuando eso pase: las capturas de la ficha, el `PrivacyInfo.xcprivacy` del
paquete y el texto de `NSLocationWhenInUseUsageDescription` (sale del plugin `expo-location`, el
mismo string es-AR que Android). Nada de eso bloquea el piloto en Android.

## 5. Cuando algo no cierra

| Síntoma | Causa más probable | Qué hacer |
|---|---|---|
| `No matching toolchains found ... languageVersion=17` | falta JDK 17 o la ruta | sección 1, paso 3 |
| `Failed to find target with hash string 'android-37'` | plataforma 37 ausente o con otro nombre | sección 2, después el escape hatch |
| La app abre pero `/presence` falla | `EXPO_PUBLIC_API_URL` no llegó al bundle | reiniciar Metro con la variable puesta |
| Cambios de `app.config.ts` no aparecen | `android/` es generado | `prebuild --clean` |
| Warning `Install expo-system-ui in your project` | falta la dependencia | `npx expo install expo-system-ui` |
