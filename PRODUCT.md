# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Profesionales que trabajan desde cafés de coworking. Están en el lugar, con la laptop abierta, y quieren conocer a otras personas que están a metros — sin pasar por una app de citas ni por un feed de perfiles remotos. Uso en sesiones cortas, de pie o entre reuniones. Mayoría de edad (18+): la app conecta desconocidos en el mundo físico.

## Product Purpose

Nearby Social Club muestra quién está cerca **ahora** y a qué distancia real, para convertir la proximidad física en una conversación concreta: ping → match → chat → encuentro en el lugar.

El éxito es que dos personas que ya comparten un espacio se hablen. No es descubrimiento de contenido ni scrolleo infinito: se resuelve en una sesión de minutos o no se resuelve.

## Positioning

**Distancias reales de gente conectada en este momento.** El listado se ordena por distancia y cada presencia caduca a los 12 segundos: no es un catálogo de perfiles que existen aunque nadie esté ahí. Un competidor puede copiar el chat y los filtros; no puede copiar la promesa de "esta persona está a 240 m mientras leés esto" sin el mismo modelo de presencia efímera.

## Operating Context

- Uso típico: en un café de coworking, teléfono en mano, sesiones de pocos minutos.
- Zonas: Ciudad de México y Bogotá (las dos únicas zonas activas hoy, con perfiles de demostración).
- El radar es la vista de contexto: ubica al usuario en el mapa y muestra a los demás a su alrededor.
- La app se distribuye como APK/AAB de Android; la web es una demo funcional del mismo diseño, usada para mostrar el producto a clientes y para la ficha de Play.

## Capabilities and Constraints

Verificado en el producto:

- Listado "Cerca tuyo" ordenado por distancia, con intención declarada (networking / amistad / actividades), badges de perfil verificado y estado en línea.
- Radio ajustable: 500 m, 1 km, 2 km, 5 km.
- Filtros: intención, género, sólo verificados, sólo en línea.
- Radar con mapa y cono de proximidad.
- Ping → match → chat con conversaciones, recibidos y enviados.
- Modo fantasma: deja de publicar la presencia sin cortar el uso.
- Notificaciones internas de ping, match y mensaje.
- Bloquear y reportar desde cada fila.

Restricciones y hechos abiertos:

- **No hay cuentas ni contraseñas todavía.** Cada apertura crea una sesión de demo con un perfil de prueba; la sesión dura 2 horas y la presencia 12 segundos.
- **La verificación de Instagram es simulada.** Es una demostración de interfaz, no una verificación real: no debe presentarse como tal en ningún material.
- **El ícono actual no es publicable.** Reutiliza el degradado y el glifo de Instagram; hay dos propuestas originales en `store/icon/` a la espera de decisión.
- Backend NestJS + PostgreSQL 16 + PostGIS, servido en `api.nearbyig.tech`; landing y páginas legales en `nearbyig.tech`.
- El basemap viene de `tiles.openfreemap.org`; a anchos grandes renderiza un mapa esquemático ("mapa simulado") en vez del real — comportamiento conocido, sin resolver.
- Distribución actual: track interno de Play, versionCode 1001.

## Brand Commitments

- Nombre visible: **Nearby Social Club**. Repositorio, dominio y package: `nearbyig`.
- Paleta propia: fondo `#0B0F14`, texto `#E6EDF3`, acento amarillo `#F5E600`, bordes `#21262D`.
- Tipografía: Inter (400/500/700).
- Tono de la copy existente: rioplatense, directo, sin superlativo ("gente real a metros", "sin perfiles de catálogo").

## Evidence on Hand

- `store/screenshots/` — 6 capturas 1080×1920 de la app real contra el API de producción.
- `store/foldable/` — 3 capturas para la sección de plegables de Play (1:1, 4:3, 10:16).
- `videos/nearbyig-promo/renders/` — video promocional de 27 s con música CC0.
- `store/icon/` — dos propuestas de ícono 512×512 sin alfa.
- App viva: `https://nearbyig.tech/expo/` y `https://api.nearbyig.tech/health/ready`.
- **No hay** testimonios, casos de éxito, métricas de usuarios ni prensa. Cualquier material futuro no debe inventarlos.

## Product Principles

1. **La proximidad es el dato, no el adorno.** Si una pantalla o un texto no ayuda a entender quién está cerca y a qué distancia, sobra.
2. **Efímero por diseño.** La presencia caduca; el producto promete el ahora y no acumula historial de ubicaciones.
3. **Privacidad visible.** Modo fantasma, distancias redondeadas y bloqueo a un toque son parte de la propuesta, no una sección de ajustes.
4. **La honestidad de demo se declara.** Lo que es simulado se dice (mapa, verificación de Instagram, perfiles de prueba). Preferimos perder impacto antes que prometer algo falso.

## Accessibility & Inclusion

Sin requisitos específicos establecidos por el usuario. Pendiente: contraste y tamaño de objetivo táctil en la app móvil, y foco de teclado en la web.
