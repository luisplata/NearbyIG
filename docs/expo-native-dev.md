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

Para probar chrome (safe area, barra de estado, back) y el permiso de ubicación **sin** el
basemap alcanzaba Expo Go; con el módulo nativo ya no: Expo Go trae un conjunto fijo de
módulos y el del mapa no está (sección 4). Hace falta un dev client, que es exactamente lo
que compila `run:android`. El APK de release y el manifest tampoco se prueban así: eso es
`assembleRelease` con la toolchain de las secciones 1 y 2, o el APK que baja el workflow
`android`.

```bash
npx expo run:android        # compila, instala y abre (JDK 17 + SDK 37)
```

## 4. Basemap nativo (MapLibre)

El basemap del radar es un **módulo nativo**: `@maplibre/maplibre-react-native` compila el
SDK de MapLibre dentro del binario. El renderer se elige por **extensión de archivo**
(`MapBasemap.tsx` en web, `MapBasemap.native.tsx` en el teléfono), no por un `if`: en el APK
el mapa ya no es una ilustración, es un mapa real con el mismo `src/map/style.ts` y la misma
cámara (`nativeCamera` delega en `centerLngLat`/`zoomForRadius`, cero fórmula propia).

| Pieza | Dónde vive | Por qué |
|---|---|---|
| Dependencia | `demo/expo-demo/package.json` (`11.5.1`, exacta) | Fija la versión del SDK de MapLibre: un minor puede mover el `.so` |
| Registro del módulo | `app.config.ts`, `'@maplibre/maplibre-react-native'` como string | Sin props: los defaults (minSdk 24, SDK 13.6.1, variante opengl) coinciden con la toolchain del SDK 58 |
| Keep de R8 | `demo/expo-demo/plugins/withMapLibreProguard.js` | El release tiene `minify` on y el AAR viaja **sin** consumer rules |
| Autolinking | `android/` generado por `prebuild` | No hay archivo propio que versionar: el módulo entra por Gradle |

**Expo Go no sirve para esto.** Expo Go trae un conjunto fijo de módulos y este no está: al
abrir Radar el componente nativo no existe y la app falla con
`requireNativeComponent: MLRNMapView was not found`. Necesitás un **dev client** —un build
propio con el módulo adentro—:

```bash
npx expo run:android            # compila un dev client y lo instala (JDK 17 + SDK 37, §1 y §2)
npx expo start --dev-client     # Metro contra ese binario
```

Para el piloto se instala el APK de release del workflow (`assembleRelease`, firmado con el
keystore de debug): no necesita Metro ni dev client.

### Tamaño: +≈11 MB con un ABI, +≈41 MB con cuatro

El AAR trae los `.so` ya compilados (≈41 MB, sin NDK: el módulo **no** tiene
`externalNativeBuild`), así que el crecimiento del APK depende de cuántas ABIs se
empaqueten:

| ABIs | Delta aproximado del APK | Cuándo |
|---|---|---|
| `arm64-v8a` | **+≈11 MB** | Default del piloto: teléfonos actuales |
| `armeabi-v7a,arm64-v8a,x86,x86_64` | **+≈41 MB** (los cuatro `.so` juntos) | Sólo si necesitás emulador o un teléfono viejo |

Es una estimación de orden de magnitud: el número real lo publica el Summary del run (fila
`ABIs`) junto al tamaño del APK. Si el APK no entra en el piloto, no toques Gradle: cambiá
el input del workflow.

### Keep de R8: por plugin, nunca en `android/`

`android/` es salida de CNG (gitignored, `prebuild --clean` lo borra). Un `-keep` escrito a
mano ahí **no existe** en CI ni en otra máquina, y el fallo aparece recién en runtime —una
clase JNI que R8 recortó, sin stack útil—.

Por eso el keep vive en `plugins/withMapLibreProguard.js`: un `withDangerousMod('android')`
que escribe `android/app/proguard-rules.pro` —el archivo que `app/build.gradle` ya declara
en `proguardFiles`— con un marcador de idempotencia.

```proguard
// @nearbyig/maplibre-r8
-keep class org.maplibre.reactnative.** { *; }
-keep class org.maplibre.android.** { *; }
```

| Regla | Detalle |
|---|---|
| Idempotencia | Si el marcador ya está, el mod devuelve sin escribir: `prebuild` ×2 ⇒ el bloque aparece **una** vez |
| Orden en `app.config.ts` | El plugin del SDK **antes** del local: el dangerous mod corre sobre el `android/` ya generado |
| Qué conserva | El keep propio del template (`react-native-reanimated`) queda intacto |
| Cómo se verifica | `grep -c '@nearbyig/maplibre-r8' android/app/proguard-rules.pro` ⇒ `1` |

El keep cubre dos namespaces a propósito (`org.maplibre.reactnative.**` y
`org.maplibre.android.**`): los entrypoints JNI no se pueden inferir desde el JS. Infla el
APK un poco; angostarlo es una optimización posterior, no un requisito del piloto.

### Un ABI por run (workflow `android`)

| Dónde | Qué |
|---|---|
| `Actions → android → Run workflow` | Input `abis` (texto), default `arm64-v8a`; acepta lista separada por comas |
| Gradle | `./gradlew assembleRelease -PreactNativeArchitectures="<abis>"` |
| Summary del run | Fila `ABIs` con el valor que se compiló de verdad |

El default se resuelve en el shell (`${ABIS:-arm64-v8a}`) y se publica en `$GITHUB_ENV`, así
Gradle y el Summary leen el mismo valor y no hay dos defaults que puedan divergir. Para
repetirlo en local: `./gradlew assembleRelease -PreactNativeArchitectures="arm64-v8a"`.

## 5. iOS: qué falta

En Windows no hay forma de compilar: no hay Xcode ni simulador. La config ya está declarada
(`ios.bundleIdentifier`, `buildNumber`, `supportsTablet: false`), así que el día que exista una Mac
o una cuenta de EAS el binario sale del mismo `app.config.ts`.

```bash
eas build -p ios --profile preview     # requiere cuenta Expo + credenciales Apple
```

Queda pendiente para cuando eso pase: las capturas de la ficha, el `PrivacyInfo.xcprivacy` del
paquete y el texto de `NSLocationWhenInUseUsageDescription` (sale del plugin `expo-location`, el
mismo string es-AR que Android). Nada de eso bloquea el piloto en Android.

## 6. Cuando algo no cierra

| Síntoma | Causa más probable | Qué hacer |
|---|---|---|
| La app falla al abrir Radar con `requireNativeComponent: MLRNMapView was not found` | estás en Expo Go: no compila módulos nativos propios | dev client: `npx expo run:android` (sección 4) |
| El APK del CI pesa o tarda de más | se compilaron las 4 ABIs | re-disparar el workflow con `abis: arm64-v8a` (sección 4) |
| `No matching toolchains found ... languageVersion=17` | falta JDK 17 o la ruta | sección 1, paso 3 |
| `Failed to find target with hash string 'android-37'` | plataforma 37 ausente o con otro nombre | sección 2, después el escape hatch |
| La app abre pero `/presence` falla | `EXPO_PUBLIC_API_URL` no llegó al bundle | reiniciar Metro con la variable puesta |
| Cambios de `app.config.ts` no aparecen | `android/` es generado | `prebuild --clean` |
| Warning `Install expo-system-ui in your project` | falta la dependencia | `npx expo install expo-system-ui` |
| `ninja: error: Filename longer than 260 characters` | ruta absoluta de CMake duplicada | sección 7 |

## 7. Compilar en Windows: MAX_PATH

| Punto | Detalle |
|---|---|
| **Síntoma** | `ninja: error: Filename longer than 260 characters` en objetos CMake de `react-native-safe-area-context` y `react-native-svg`. |
| **Causa** | CMake escribe la ruta absoluta del fuente dentro de `.cxx` (la duplica); ninja no respeta long paths ni con `LongPathsEnabled`. |
| **No lo arregla** | Un junction/symlink a un directorio más corto: Gradle canonicaliza la ruta real. |
| **Camino recomendado** | Compilar en CI con `.github/workflows/android.yml` (Linux, `workflow_dispatch`) y bajar el APK del artefacto. |
| **Alternativa local** | WSL, con el SDK de Android instalado **dentro** de WSL: no se reusa el de Windows. |
