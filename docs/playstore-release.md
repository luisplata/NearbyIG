# Publicar en Play: internal testing

Runbook del `.aab` firmado. El workflow `.github/workflows/android-release.yml` compila,
verifica y publica el artefacto; **el upload a Play Console es manual** y lo hace el
dueño de la cuenta, porque todavía no hay Play Developer API.

## En una corrida

| # | Dónde | Qué pasa |
|---|---|---|
| 1 | Actions → `android-release` → Run workflow | `dry_run=true` la primera vez: compila y verifica sin tag ni Release |
| 2 | Actions → run verde | El `.aab` queda como artifact `nearbyig-android-aab` (90 días) |
| 3 | Repo → Releases | Fuera de dry run: `vX.Y.Z` con el `.aab` adjunto |
| 4 | Play Console → Internal testing | Subís el `.aab`, agregás testers, compartís el link |

Si el paso `Read the release version` falla, no se compiló nada: mirá la tabla de
códigos de salida más abajo antes de tocar el workflow.

## 1. Prerequisitos

| Requisito | Detalle |
|---|---|
| Cuenta de Play Console | US$ 25, pago único. Verificación de identidad con documento. |
| Cuenta de organización | Google exige número D-U-N-S. Si la cuenta es personal, no aplica. |
| Package | `com.nearbyig.app`, fijado en `demo/expo-demo/app.config.ts`. **No se puede cambiar después del primer upload**: cambiar el package es una app nueva. |
| Keystore | Se genera una vez (abajo) y se guarda fuera del repo. |

## 2. Generar la upload key

Una sola vez, en la máquina del dueño de la cuenta. El alias lo elegís vos; el keystore de este equipo usa `nearbyig-upload`. Tiene que coincidir exacto con el secret `ANDROID_KEY_ALIAS`, y no se puede cambiar después del primer upload
porque es lo que espera el secret `ANDROID_KEY_ALIAS`.

```bash
keytool -genkeypair -v \
  -keystore upload-keystore.jks \
  -storetype JKS \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -alias nearbyig-upload \
  -dname "CN=Nearby Social Club, O=NearbyIG, L=Buenos Aires, ST=Buenos Aires, C=AR"
```

- `-validity 10000` son ~27 años: Play rechaza un `.aab` firmado con un certificado
  que vence antes de 2033. No hay forma de renovar la upload key sin un trámite.
- Te pide dos passwords: el del keystore (`-storepass`) y el de la clave (`-keypass`).
  Pueden ser el mismo; anotá cuál usaste.
- JDK 17 avisa que JKS es un formato propietario. Es el que documenta Play y funciona.
  Si preferís PKCS12 (`-storetype PKCS12`), lo único que importa es el alias.
- **Backup offline, dos copias, una fuera de esta máquina.** Si se pierde el keystore
  se puede pedir un *upload key reset* en Play Console, pero es un trámite con
  aprobación: mientras tanto no se puede publicar ninguna actualización.

## 3. Los 4 secretos del repo

Settings → Secrets and variables → Actions → New repository secret.

| Secret | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | El keystore entero, en base64 (abajo). |
| `ANDROID_KEYSTORE_PASSWORD` | El `-storepass` del paso 2. |
| `ANDROID_KEY_ALIAS` | `nearbyig-upload` (el alias real del keystore de este equipo; tiene que coincidir exacto) |
| `ANDROID_KEY_PASSWORD` | El `-keypass` del paso 2. |

`ANDROID_KEYSTORE_PATH` **no es un secret y no se carga**: el workflow decodifica el
base64 en `$RUNNER_TEMP/upload-keystore.jks` y publica esa ruta para los pasos que la
consumen (prebuild, Gradle, verificación).

Base64 de una sola línea (es lo que espera `base64 -d` del runner):

```bash
# Linux
base64 -w0 upload-keystore.jks > upload-keystore.b64

# macOS
base64 -i upload-keystore.jks -o upload-keystore.b64

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload-keystore.jks")) > upload-keystore.b64
```

Pegá el contenido de `upload-keystore.b64` en el secret. El archivo `.b64` y el
`.jks` se borran de la máquina después de cargarlos (y nunca van al repo: `.gitignore`
ya excluye el directorio local del keystore).

## 4. Correr el workflow

```bash
# 1) dry run: compila, verifica y sube el artifact. No crea tag ni Release.
gh workflow run android-release.yml -f dry_run=true

# 2) release real: tag + Release con el .aab adjunto
gh workflow run android-release.yml
```

| Input | Default | Para qué |
|---|---|---|
| `release_type` | `auto` | `auto` deriva el bump de los conventional commits desde el último tag. `patch`/`minor`/`major` lo fuerzan, incluso hacia abajo. |
| `dry_run` | `false` | `true` = todo menos `gh release create`. |

Por qué el dry run primero: la primera corrida es donde fallan el base64, el alias y
el fingerprint. Con `dry_run=true` el job tarda lo mismo pero no quema un tag ni un
Release que después hay que borrar.

## 5. Qué imprime el script de versión

`node scripts/version.mjs` escribe cinco líneas `key=value` (también en
`$GITHUB_OUTPUT`, que es de donde las lee el resto del job):

```
version=0.1.0
version_code=1000
release=true
last_tag=
reason=sin tag: primera publicación en el baseline 0.1.0
```

| Exit | Significado | Qué hace el job |
|---|---|---|
| 0 | Hay versión para publicar | Sigue: prebuild → Gradle → verificar → publicar |
| 1 | Error de uso o del entorno (git, origin) | Falla. No es una guarda de versión. |
| 2 | Nada que publicar (no hay commits publicables) | Corta **antes** de compilar |
| 3 | Guarda: el tag ya existe, o un componente se desborda | Corta **antes** de compilar |

**Por qué re-correr con el mismo estado sale 3**: el script consulta
`git ls-remote --exit-code --tags origin refs/tags/v<version>` antes de devolver 0. Si
ese tag ya se publicó, subir otra vez el mismo `versionCode` no aporta nada y el
Release quedaría duplicado, así que corta con exit 3. Para volver a publicar hace falta
un commit nuevo (`fix:`, `feat:` o `feat!:`) o un `release_type` que suba la versión.

`version_code` = `major * 1000000 + minor * 1000 + patch` (`0.1.0` → `1000`). Play
exige que sea estrictamente mayor al último subido, y no se puede reusar nunca.

## 6. Play App Signing (paso irreversible)

Al subir el primer `.aab`, Console ofrece enrolar **Play App Signing**. Esto tiene que
decidirlo el dueño de la cuenta, no quien ejecuta el runbook, porque cambia **quién firma
lo que instala el tester** y no se puede deshacer.

| Campo en Console | Qué es | Qué hacés |
|---|---|---|
| `App signing key` | La clave con la que Google firma los APK que bajan los testers. Vive en Google. | Elegís "let Google generate it" (recomendado) o subís una. |
| `Upload key` | La clave con la que se firma el `.aab` que subís. Es la de este repo. | Es el certificado del keystore del paso 2. Google lo registra y lo compara en cada upload. |
| `App signing certificate SHA-256` | Fingerprint del certificado de `App signing key`. | Lo copiás a la documentación del proyecto. Es distinto del SHA-256 de la upload key que imprime el workflow. |

- Con Play App Signing, **el SHA-256 que verifica el workflow es el de la upload key**,
  no el que ven los testers. Los dos números son válidos y no tienen que coincidir.
- Si se pierde la upload key, se puede pedir un reset **porque** la app signing key está
  en Google. Sin Play App Signing, perder el keystore es perder la app.
- Es irreversible: la app signing key no se cambia después del enrolamiento.

## 7. Primer upload (manual)

1. Play Console → **Create app**.
2. Campos obligatorios:

   | Campo | Valor |
   |---|---|
   | `App name` | `Nearby Social Club` |
   | `Default language` | Spanish (Latin America) |
   | `App or game` | App |
   | `Free or paid` | **Free** (no se puede volver a paid después) |
   | `Package name` | `com.nearbyig.app` (tiene que coincidir con el `applicationId` del `.aab`) |
   | `Category` | Social (o Estilo de vida) |
   | `Contact email` | El del dueño de la cuenta: Play lo publica en la ficha |

3. **App content**: declaraciones obligatorias (público objetivo, anuncios, acceso a
   funciones). No bloquean el track interno salvo las de contenido.
4. **Testing → Internal testing → Create new release** → subir el `.aab` descargado del
   Release de GitHub (o del artifact si fue dry run).
5. Antes de subir el primero, Console muestra el diálogo de **Play App Signing** del
   paso 6.

## 8. Testers del track interno

1. Internal testing → pestaña **Testers** → `Create email list`.
2. Hasta **100** direcciones; se pueden cargar a mano o por CSV. Las cuentas de Google
   tienen que existir (no hace falta que sean del dominio del proyecto).
3. Guardar la lista y asignarla al release del track interno.
4. Copiar el **opt-in URL** y mandarlo a los testers: sin ese link no ven la app.
5. El track interno publica **sin revisión** de Google, en minutos. Un `.aab` nuevo con
   `versionCode` mayor se sube encima del anterior.

## 9. Rollback

| Qué pasó | Cómo se revierte |
|---|---|
| Release de GitHub equivocado | `gh release delete vX.Y.Z` (el tag queda; borralo con `git push --delete origin vX.Y.Z`) |
| `.aab` malo en el track interno | En Console, despublicar el release del track. El `versionCode` **queda quemado**: se avanza con un bump, no se reusa. |
| Job falló después de compilar | No hay nada que revertir en Play: sin upload no hay release. El versionCode del `.aab` descartado tampoco se reusa. |

## 10. Lo que este release NO hace

- **Hornea una sola API: el origen canónico.** `EXPO_PUBLIC_API_URL` vale
  `https://api.nearbyig.tech` a nivel workflow y no se puede pisar por paso; el
  workflow falla si el valor es otro y verifica el bundle empaquetado para que no
  quede adentro ningún host de túnel (`*.trycloudflare.com`). El `.aab` conecta al
  backend real desde el primer arranque.
- **No sube nada a Play.** El upload es manual: no hay Play Developer API ni service
  account en este repo.
- **No requiere Data Safety.** El formulario de seguridad de datos no es requisito para
  el track interno; sí lo es antes de pasar a producción, igual que la política de
  privacidad y la clasificación de contenido.
- **No actualiza la ficha de la tienda.** Ícono, capturas y descripción se cargan en
  Console, a mano.
