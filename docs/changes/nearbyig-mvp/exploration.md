# Exploration: arquitectura ideal para NearbyIG

**Recomendación preliminar:** como el cliente prioriza publicar una app en Google Play y App Store, recomiendo React Native con Expo para Android/iOS. Es una app con componentes nativos, no un sitio metido en un WebView; Expo aporta APIs de ubicación/notificaciones y compilación local o cloud. Capacitor queda como alternativa si también se requiere compartir una web/PWA como interfaz principal. El ZIP no condiciona la selección.

## Current State

- El repo tiene solo la estructura inicial (`frontend/`, `backend/`, `docs/`); no hay arquitectura de producto aprobada.
- El alcance acordado es completo: perfiles e intenciones, ubicación en vivo, radar/mapa/lista, filtros, pings, chat efímero, notificaciones, conexión social, privacidad y seguridad.
- El cliente prioriza una app distribuida desde las tiendas Android/iOS; no indicó que web/PWA deba tener paridad.
- Restricciones expresadas: poder levantar el entorno de desarrollo con Docker y desplegar el backend en nube o infraestructura Docker propia, sin atarse a un proveedor.
- El ZIP se conserva como referencia de interacción, no como base técnica. No infiero stack ni calidad arquitectónica a partir de él.
- Docker aplica al backend, base de datos y servicios de desarrollo. No convierte una app iOS/Android en un contenedor: la compilación local de iOS requiere macOS/Xcode; Expo también ofrece compilación cloud.

## Affected Areas

- `frontend/` — app móvil, permisos de ubicación, radar/mapa/lista, chat, pings y UX de privacidad.
- `backend/` — identidad, perfiles, presencia efímera, búsqueda geoespacial, matches, chat, notificaciones, medios y moderación.
- `docs/` — decisiones de arquitectura, políticas de datos y documentación publicable.
- Infraestructura — Docker Compose de desarrollo, imágenes OCI, migraciones, secretos, observabilidad, backups y estrategia de despliegue.

## Approaches

1. **React Native/Expo + backend propio NestJS/PostgreSQL/PostGIS** — app nativa iOS/Android con una base de código compartida; Expo usa componentes nativos, no HTML/CSS.
   - Pros: controles nativos; TypeScript puede compartirse en contratos con un backend NestJS; Expo ofrece ubicación, notificaciones y builds cloud. Un radar simple puede componerse con Views y animaciones.
   - Contras: la UI no comparte HTML/CSS; un radar canvas avanzado suele sumar Skia/Reanimated; Expo Go no sirve para validar cualquier módulo nativo, por lo que el desarrollo real usa development builds.
   - Esfuerzo: Medio.

2. **React Native/Expo + Supabase Cloud o self-hosted** — Postgres, PostGIS, Auth, Storage y Realtime integrados; Supabase puede ejecutarse con Docker Compose o consumirse como servicio gestionado.
   - Pros: acelera autenticación, persistencia y realtime; Postgres/PostGIS son adecuados para proximidad; existe camino self-hosted.
   - Contras: el self-hosting implica operar un conjunto de servicios, no solo el backend NearbyIG; algunas tareas y Edge Functions requieren configuración distinta fuera de Supabase Cloud. RLS debe diseñarse para que las coordenadas privadas nunca se filtren por consultas del cliente.
   - Esfuerzo: Medio, con carga operativa media-alta si se autohospeda.

3. **Flutter + backend propio** — alternativa para priorizar una UI nativa uniforme en iOS/Android.
   - Pros: app multiplataforma nativa, control visual consistente y CustomPainter/Canvas integrados para dibujar y animar anillos, barrido y puntos en una sola superficie.
   - Contras: Dart aparte de un backend TypeScript, si se elige NestJS; APIs especiales requieren plugins o integración nativa, igual que en React Native.
   - Esfuerzo: Medio-alto.

4. **Web responsive/PWA + Capacitor** — alternativa si más adelante se decide compartir una web como interfaz entre navegador y apps de tienda.
   - Pros: maximiza reutilización entre web y wrapper de tienda; acceso a capacidades nativas mediante plugins.
   - Contras: interfaz móvil ejecutada en WebView; menos adecuada si se busca UX nativa prioritaria o uso intensivo de ubicación en segundo plano.
   - Esfuerzo: Bajo-medio para una web existente, medio para preparar integraciones móviles y publicación.

## Recommendation

React Native no es técnicamente superior a Flutter para este producto: ambos pueden cubrir mapas, ubicación, notificaciones y tiendas. **Flutter tiene una pequeña ventaja para dibujar un radar 2D muy personalizado**, porque CustomPainter/Canvas vienen integrados; en React Native, un canvas avanzado suele sumar Skia/Reanimated. Si el radar son anillos, puntos y pulsos simples, ambas opciones son directas y eso no debería decidir por sí solo el stack. Calcular posición relativa geográfica (distancia/rumbo) es lógica independiente del framework; usar orientación real además requiere brújula/sensores en cualquiera de las dos. Expo/React Native gana si el equipo prefiere TypeScript/React o si el backend termina siendo NestJS; Flutter puede ganar si el equipo domina Dart o el radar visual es la prioridad. Como la experiencia del equipo aún no está definida, Expo queda como baseline provisional, no decisión final. El backend es independiente: **NestJS modular monolítico + Postgres/PostGIS** sigue siendo candidato. PostGIS `geography` con índice espacial permite buscar por radio y calcular distancia en metros; guardaría solo la ubicación vigente por usuario, sobrescrita y con vencimiento, nunca una ruta. Redis puede agregarse si las pruebas justifican fan-out/rate limits; MinIO local y almacenamiento S3-compatible en producción cubren fotos.

Antes de fijar el frontend, una prueba técnica breve en ambos debería validar los mismos cuatro puntos: permiso de ubicación foreground, radar animado/mapa, recepción de push y build instalable de Android/iOS. Ubicación background requiere permisos adicionales en ambas plataformas y debe confirmarse aparte.

Las apps de tienda se compilan como paquetes nativos, no como imágenes Docker. Un build local de iOS requiere macOS/Xcode; Expo también ofrece EAS Build en la nube. Para desarrollo, Docker Compose puede levantar API, PostGIS, Redis opcional y MinIO. En producción se publica la imagen del backend en cualquier runtime de contenedores; la base y los archivos pueden ser servicios administrados o autohospedados. Compose sirve para desarrollo y despliegues simples; no reemplaza un orquestador cuando se necesita alta disponibilidad o escalado horizontal.

No recomendaría microservicios al inicio. Separaría módulos de cuentas, perfil, presencia, descubrimiento, conexiones/chat, medios y confianza/seguridad dentro de un solo backend. Mantendría contratos con proveedores detrás de adaptadores para reducir lock-in.

### Decisiones que faltan para cerrar diseño

- **Plataformas:** ambos frameworks pueden generar una versión web estática, pero no garantizan paridad funcional. Expo exporta web con React Native Web; Expo Notifications no soporta web, así que Web Push es otra integración. Flutter compila a web y dibuja la UI con Canvas/WebGL/WASM, adecuado para una app autenticada pero menos orientado a SEO. Confirmar si la web/PWA es requisito además de las tiendas.
- **Ubicación:** foreground o background. El acceso en segundo plano exige permisos explícitos y tiene restricciones por sistema operativo y revisión de tiendas.
- **Privacidad geográfica:** la app puede calcular y mostrar distancia exacta sin enviar las coordenadas ajenas al cliente, pero distancia/bearing consultados repetidamente todavía pueden facilitar triangulación. El mapa no debería asumir pines exactos.
- **Instagram:** enlace manual y verificación de control de cuenta son requisitos distintos. La API oficial de Meta está orientada a cuentas profesionales Business/Creator; no garantiza OAuth para cuentas personales.
- **Retención:** definir duración de chats, pings, fotos/reportes y encuentros. La expiración debe validarse en acceso; una tarea de limpieza posterior no sustituye autorización.
- **Identidad y operación:** proveedor OIDC (Apple/Google), regiones/privacidad legal, volumen objetivo, presupuesto y experiencia del equipo.

### Calidad y operación

- Probar reglas de negocio y API con pruebas unitarias/integración; levantar PostGIS en integración; sumar E2E móvil y web según plataformas elegidas.
- Añadir migraciones versionadas, variables/secretos fuera de imágenes, health checks, backups probados y logs/métricas/trazas.
- Para documentación estática, evaluar VitePress + GitHub Pages; no necesita formar parte del backend Docker.

## Risks

- **Privacidad/seguridad alta:** coordenadas exactas, audiencia, bloqueo y aceptación mutua requieren autorización backend; no confiar en filtros de interfaz.
- **Portabilidad parcial:** contenedores hacen portable el backend, no eliminan dependencias de App Store, APNs/FCM, mapas, OAuth/Meta, DNS ni almacenamiento.
- **Ubicación en segundo plano:** aumenta consumo, complejidad de permisos y riesgo de rechazo; debe confirmarse como requisito antes de implementarla.
- **Autohospedaje:** Docker no aporta por sí solo redundancia, escalado, monitoreo, seguridad de red ni recuperación de datos.
- **Publicación del repositorio:** el snapshot local contiene una clave de firma y contraseña; resolverlo antes de publicar el commit en el remoto público.

## Sources

- [Expo location](https://docs.expo.dev/versions/latest/sdk/location/) — permisos foreground/background y restricciones de plataforma.
- [Expo notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) — soporte móvil; Web requiere otra solución.
- [Expo build workflows](https://docs.expo.dev/workflow/overview/) — compilación local o cloud; iOS local requiere Mac/Xcode.
- [Expo web deployment](https://docs.expo.dev/deploy/web/) y [Expo notifications services](https://docs.expo.dev/guides/using-push-notifications-services/) — export estático; Expo Notifications no cubre web.
- [Flutter web](https://docs.flutter.dev/platform-integration/web) y [Flutter web FAQ](https://docs.flutter.dev/platform-integration/web/faq) — despliegue web y orientación a experiencias de aplicación más que SEO.
- [React Native platform code](https://reactnative.dev/docs/platform-specific-code) y [Flutter architecture](https://docs.flutter.dev/resources/architectural-overview) — modelos de UI y código compartido.
- [Flutter CustomPaint](https://api.flutter.dev/flutter/widgets/CustomPaint-class.html) y [React Native Skia](https://shopify.github.io/react-native-skia/) — drawing 2D y animación.
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) — acceso a módulos nativos fuera de Expo Go.
- [Capacitor workflow](https://capacitorjs.com/docs/basics/workflow) y [plugins](https://capacitorjs.com/docs/plugins) — alternativa para empaquetar un cliente web cuando se priorice reutilización.
- [PostGIS ST_DWithin](https://postgis.net/docs/ST_DWithin.html) — distancia geográfica en metros y uso de índice espacial.
- [NestJS WebSocket gateways](https://docs.nestjs.com/websockets/gateways) y [Redis adapter](https://docs.nestjs.com/websockets/adapter) — eventos y escalado entre instancias.
- [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting/docker) y [PostGIS](https://supabase.com/docs/guides/database/extensions/postgis) — opción BaaS portable con Docker y búsqueda geo.
- [Docker Compose](https://docs.docker.com/compose/) — entorno multi-contenedor.
- [Meta Instagram Platform](https://developers.facebook.com/documentation/instagram-platform) — integraciones con cuentas profesionales.

## Ready for Proposal

Sí. Ambos frameworks son viables. El siguiente paso es decidir entre Expo/React Native y Flutter según experiencia del equipo y una prueba técnica breve; confirmar ubicación background y proveedores, sin excluir capacidades del MVP.
