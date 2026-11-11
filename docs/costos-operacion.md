# Costos de operación — NearbyIG

> **Alcance:** infraestructura y servicios cloud para operar NearbyIG. **No incluye** desarrollo, QA, diseño, soporte, moderación humana, marketing, impuestos ni comisiones de tiendas.
> **Moneda:** USD. **Precios:** públicos de lista, sin impuestos, verificados el **2026-11-06**. Los proveedores pueden cambiarlos.
> **Arquitectura de referencia:** app móvil (Flutter o Expo/React Native), API NestJS en contenedor, PostgreSQL/PostGIS, almacenamiento S3-compatible, push FCM y mapas.
> **Estado:** estimación ROM para planificación y conversación con el cliente. No es una cotización ni un compromiso de proveedor.

---

## 0. Cómo leer los números

Cada escenario tiene dos columnas:

- **Configuración mínima:** alcanza para el volumen indicado, sin holgura para picos ni alta disponibilidad.
- **Configuración con holgura:** agrega CPU, backups más frecuentes, monitoreo pago o una segunda instancia. Es la que recomiendo presupuestar.

A los subtotales se les suma una **contingencia del 10%** para overages, logs, egreso, cambios de precio o tráfico inesperado. No es un margen comercial: es una reserva operativa.

**Tres reglas que explican casi todo el costo:**

1. **Se paga por capacidad, no por usuario.** No hay un precio por cada ubicación enviada. Se paga la instancia de API y la base que soportan un nivel de uso. Por eso el costo por DAU baja al escalar.
2. **El mapa es la variable más peligrosa.** El SDK móvil figura como “Unlimited” en la lista pública de Google; Dynamic Maps web tiene 10.000 eventos gratis y luego US$ 7 por cada 1.000. Una app en tiendas debe usar el SDK móvil.
3. **Los usuarios registrados casi no cuestan.** 1.000 perfiles con 3 fotos de 300 KB ocupan ~0,9 GB. En R2 eso ronda **US$ 0,01/mes**. El costo lo genera el uso activo.

---

## 1. Resumen ejecutivo

| Escenario | MAU | DAU | Base técnica/mes | Presupuesto recomendado/mes | Costo por DAU/mes |
|---|---:|---:|---:|---:|---:|
| Piloto / beta cerrada | 500 | 50 | **US$ 30–55** | **US$ 30–60** | US$ 0,60–1,20 |
| Crecimiento | 10.000 | 1.000 | **US$ 71–196** | **US$ 75–200** | US$ 0,075–0,20 |
| Escala | 50.000 | 5.000 | **US$ 325–523** | **US$ 350–550** | US$ 0,07–0,11 |
| Escala con alta disponibilidad | 50.000 | 5.000 | — | **US$ 600–1.200** | US$ 0,12–0,24 |

**Costo adicional si el mapa es web/PWA en lugar de SDK móvil:**

| Escenario | Cargas de mapa/mes | Costo adicional aproximado |
|---|---:|---:|
| Piloto | 6.000 | US$ 0 (dentro del free tier) |
| Crecimiento | 120.000 | **+US$ 770** |
| Escala | 600.000 | **+US$ 4.130** |

---

## 2. Supuestos de carga

| Variable | Supuesto | Impacto |
|---|---|---|
| Relación DAU/MAU | 10% | Separa registrados de activos. |
| Uso del radar | 30 min/día en foreground | Define escrituras de ubicación y sesiones. |
| Frecuencia de ubicación | Cada 30 s | 60 actualizaciones/día = **1.800/mes por DAU**. |
| Fotos por perfil | 3, comprimidas a ~300 KB | ~0,9 MB por usuario registrado. |
| Sesiones de mapa | 4/día por DAU | 120 cargas/mes por DAU si el mapa se factura por carga. |
| Mensajes de chat | 50/día por DAU | 1,5 M mensajes/mes por cada 1.000 DAU. Solo texto. |
| Backups | 20% semanal o 30% diario del Droplet | La base administrada ya incluye backups diarios. |
| Alta disponibilidad | No incluida en la base | Réplicas, segunda zona y soporte se presupuestan aparte. |

```text
actualizaciones/mes = DAU × 60 actualizaciones/día × 30 días
                    = DAU × 1.800
```

---

## 3. Piloto / beta cerrada — 500 MAU, 50 DAU

**Qué compra este escenario:** una API y una base administrada para 50 usuarios activos, 90.000 actualizaciones de ubicación/mes y ~450 MB de fotos. No hay alta disponibilidad; si el servidor se cae, el servicio se restablece desde backup.

| Componente | Configuración mínima | Precio unitario | Cant. | Mínimo | Config. con holgura | Máximo | Para qué sirve |
|---|---|---|---:|---:|---|---:|---|
| API en contenedor | Droplet 2 GB / 1 vCPU / 50 GB SSD | US$ 12/mes | 1 | 12,00 | Droplet 2 GB / 2 vCPU | 18,00 | Ejecuta NestJS, WebSocket y tareas de presencia. |
| PostgreSQL/PostGIS administrado | 1 GiB RAM / 1 vCPU / 10 GiB | US$ 15/mes | 1 | 15,00 | Igual, con backups diarios incluidos | 15,00 | Perfiles, ubicación vigente, pings, matches y chat. PostGIS para radios. |
| Backups del Droplet | 20% semanal del Droplet | 20% de US$ 12 | 1 | 2,40 | 30% diario de US$ 18 | 5,40 | Recuperar configuración y sistema si se pierde la instancia. |
| Dominio + DNS | .com ~US$ 12–20/año | US$ 1,00–1,67/mes | 1 | 1,00 | TLD más caro | 1,67 | Dirección de la API y del sitio. DNS gratis en Cloudflare. |
| Fotos | R2 free tier: 10 GB, 1 M Class A, 10 M Class B | US$ 0 | 1 | 0,00 | Igual | 0,00 | 450 MB de fotos; sobra capacidad. Egreso gratis. |
| Monitoreo | Better Stack free (10 monitores) + Sentry Developer free | US$ 0 | 1 | 0,00 | Igual | 0,00 | Uptime, errores y alertas básicas. |
| Push | Firebase Cloud Messaging | US$ 0 | 1 | 0,00 | Igual | 0,00 | Notificaciones de pings y mensajes. |
| Mapas | SDK móvil (iOS/Android) | US$ 0 | 1 | 0,00 | Igual | 0,00 | Radar y mapa en la app; no se factura por carga como Dynamic Maps web. |
| Email transaccional / logs | Proveedor con free tier o logs en el Droplet | US$ 0–10/mes | 1 | 0,00 | Plan básico | 10,00 | Verificación de cuenta, alertas y diagnóstico. |
| **Subtotal** | | | | **30,40** | | **50,07** | |
| **Contingencia 10%** | Overages, FX, imprevistos | | | **3,04** | | **5,01** | |
| **Total** | | | | **33,44** | | **55,08** | |
| **Redondeo de planificación** | | | | **US$ 30–35** | | **US$ 50–60** | |

### Justificación para el cliente

- **US$ 12–18 de API:** es el servidor que atiende a los 50 usuarios activos. No se puede reemplazar por un servicio gratuito sin perder WebSocket, lógica de pings/matches y control de privacidad.
- **US$ 15 de base administrada:** evita operar PostgreSQL/PostGIS a mano. Incluye backups diarios y mantenimiento del proveedor. Es el componente que no conviene autogestionar en un piloto.
- **US$ 2,40–5,40 de backups:** permite recuperar el servidor si falla. Sin esto, un error de despliegue puede borrar configuración y logs.
- **US$ 1–1,67 de dominio:** costo fijo de presencia. El DNS y el TLS son gratuitos.
- **US$ 0 de fotos, push, mapas y monitoreo:** el volumen del piloto entra en los free tiers. 450 MB de fotos están muy por debajo de los 10 GB de R2; 6.000 cargas de mapa están por debajo de las 10.000 gratuitas de Dynamic Maps, y con SDK móvil directamente no se facturan.
- **US$ 0–10 de email/logs:** cubre verificación de cuenta y diagnóstico. Si no se usa un proveedor pago, queda en cero.
- **US$ 3–5 de contingencia:** no es un costo inventado; cubre overages de egreso, diferencias de tipo de cambio y algún mes con más tráfico.

**Lectura:** el piloto no cuesta US$ 60 por “usar la nube”. Cuesta ~US$ 33–55, y el rango alto existe por backups diarios, más CPU y una reserva del 10%.

---

## 4. Crecimiento — 10.000 MAU, 1.000 DAU

**Qué compra este escenario:** 1,8 M actualizaciones de ubicación/mes, ~9 GB de fotos, 1.000 usuarios activos y concurrencia moderada de chat. La base de 2 GiB soporta 47 conexiones; se recomienda pooling.

| Componente | Configuración mínima | Precio unitario | Cant. | Mínimo | Config. con holgura | Máximo | Para qué sirve |
|---|---|---|---:|---:|---|---:|---|
| API en contenedor | 1 × 4 GB / 2 vCPU | US$ 24/mes | 1 | 24,00 | 2 × 2 GB / 2 vCPU | 36,00 | Sostener API y WebSocket; la segunda instancia permite rolling deploy. |
| Balanceador | No incluido en mínimo | US$ 12/mes | 0–1 | 0,00 | 1 balanceador | 12,00 | Distribuir tráfico entre dos instancias. |
| PostgreSQL/PostGIS administrado | 2 GiB RAM / 1 vCPU / 30 GiB | US$ 30/mes | 1 | 30,00 | 4 GiB RAM / 2 vCPU / 60 GiB | 60,00 | 1,8 M escrituras/mes, perfiles, chat y consultas geoespaciales. |
| Redis / Valkey | No incluido en mínimo | US$ 15/mes | 0–1 | 0,00 | 1 instancia | 15,00 | Fan-out de WebSocket entre instancias y rate limits. |
| Backups del Droplet | 20% semanal | 20% de US$ 24 | 1 | 4,80 | 30% diario de US$ 36 | 10,80 | Recuperación de la capa de aplicación. |
| Dominio + DNS | ~US$ 12–20/año | US$ 1,00–1,67/mes | 1 | 1,00 | TLD más caro | 1,67 | API y sitio. |
| Fotos | R2: 9 GB dentro de 10 GB gratis | US$ 0 | 1 | 0,00 | Igual, más operaciones | 2,00 | 9 GB de fotos; egreso gratis. |
| Monitoreo y errores | Free tiers | US$ 0 | 1 | 0,00 | Sentry Team | 26,00 | Uptime, errores, alertas y diagnóstico. |
| Email / logs | Free tier o básico | US$ 5–15/mes | 1 | 5,00 | Plan con más retención | 15,00 | Verificación, alertas y logs. |
| Mapas | SDK móvil | US$ 0 | 1 | 0,00 | Igual | 0,00 | Mapa nativo; sin costo por carga. |
| **Subtotal** | | | | **64,80** | | **178,47** | |
| **Contingencia 10%** | | | | **6,48** | | **17,85** | |
| **Total** | | | | **71,28** | | **196,32** | |
| **Redondeo de planificación** | | | | **US$ 75** | | **US$ 200** | |

### Justificación para el cliente

- **US$ 24–36 de API:** 1.000 DAU generan 1,8 M actualizaciones de ubicación al mes. Una instancia de 4 GB alcanza; la segunda instancia no es por vanidad: permite desplegar sin cortar el servicio y cubre picos.
- **US$ 30–60 de base:** 2 GiB con 47 conexiones es el mínimo razonable para 1.000 DAU con pooling. 4 GiB es la opción con holgura para chat, índices y backups sin degradar consultas.
- **US$ 0–12 de balanceador:** solo aparece si se usan dos instancias de API. Sin él, no hay distribución de tráfico.
- **US$ 0–15 de Redis:** no es obligatorio con una sola instancia. Se vuelve necesario cuando hay varias instancias y los eventos de WebSocket deben llegar a todos los clientes.
- **US$ 4,80–10,80 de backups:** protege la aplicación. La base ya trae backups diarios administrados.
- **US$ 0–2 de fotos:** 9 GB entran en el free tier de R2. El egreso sigue siendo gratis.
- **US$ 0–26 de monitoreo:** los free tiers alcanzan para empezar; el plan pago se justifica cuando hay más errores, más retención o varias personas consultando.
- **US$ 5–15 de email/logs:** los logs sin retención se vuelven caros o inútiles. Este ítem paga diagnóstico, no “extras”.
- **US$ 6–18 de contingencia:** absorbe el mes con más tráfico y las diferencias de precio.

**Si el mapa es web/PWA:** 120.000 cargas − 10.000 gratis = 110.000 facturables × US$ 7/1.000 = **US$ 770**. El total sube a ~US$ 840–970. Es el argumento más fuerte para usar SDK móvil.

---

## 5. Escala — 50.000 MAU, 5.000 DAU

**Qué compra este escenario:** 9 M actualizaciones de ubicación/mes, ~45 GB de fotos, 5.000 activos y concurrencia de chat. Ya no alcanza una sola instancia; se necesita distribuir tráfico y desacoplar eventos.

| Componente | Configuración mínima | Precio unitario | Cant. | Mínimo | Config. con holgura | Máximo | Para qué sirve |
|---|---|---|---:|---:|---|---:|---|
| API en contenedor | 3 × 4 GB / 2 vCPU | US$ 24/mes | 3 | 72,00 | 2 × 8 GB / 4 vCPU | 96,00 | Sostener 5.000 DAU y picos de chat. |
| Balanceador | 1 balanceador | US$ 12/mes | 1–2 | 12,00 | 2 para redundancia | 24,00 | Distribuir tráfico y tolerar fallas. |
| PostgreSQL/PostGIS administrado | 8 GiB / 4 vCPU / 140 GiB | US$ 120/mes | 1 | 120,00 | Igual, con réplica de lectura | 120,00 | 9 M escrituras/mes, índices geoespaciales y chat. |
| Redis / Valkey | 1 instancia | US$ 15/mes | 1–2 | 15,00 | 2 instancias | 30,00 | Fan-out de WebSocket, presencia y rate limits. |
| Backups del Droplet | 20% semanal | 20% de US$ 72 | 1 | 14,40 | 30% diario de US$ 96 | 28,80 | Recuperación de la capa de aplicación. |
| Dominio + DNS | ~US$ 12–20/año | US$ 1,00–1,67/mes | 1 | 1,00 | TLD más caro | 1,67 | API y sitio. |
| Fotos | R2: 45 GB × US$ 0,015/GB | US$ 0,015/GB-mes | 45 GB | 0,68 | Más operaciones | 5,00 | 45 GB de fotos; egreso gratis. |
| Monitoreo, logs y trazas | Retención básica | US$ 50–150/mes | 1 | 50,00 | Más retención y alertas | 150,00 | Diagnóstico, capacidad y respuesta a incidentes. |
| Email / logs | Plan básico | US$ 10–20/mes | 1 | 10,00 | Plan con más volumen | 20,00 | Verificación y alertas. |
| Mapas | SDK móvil | US$ 0 | 1 | 0,00 | Igual | 0,00 | Mapa nativo; sin costo por carga. |
| **Subtotal** | | | | **295,08** | | **475,47** | |
| **Contingencia 10%** | | | | **29,51** | | **47,55** | |
| **Total** | | | | **324,59** | | **523,02** | |
| **Redondeo de planificación** | | | | **US$ 325** | | **US$ 525** | |

### Justificación para el cliente

- **US$ 72–96 de API:** 5.000 DAU y 9 M ubicaciones/mes requieren varias instancias. No es “más servidores por las dudas”: es capacidad para que un despliegue o un pico de chat no tire la app.
- **US$ 12–24 de balanceador:** con varias instancias, alguien tiene que repartir el tráfico. Dos balanceadores es la opción con redundancia.
- **US$ 120 de base:** 8 GiB / 4 vCPU es el salto necesario para índices PostGIS, chat y backups sin degradar. Una base más chica ahorra US$ 60–90, pero arriesga latencia y conexiones.
- **US$ 15–30 de Redis:** a esta escala, los eventos de WebSocket deben distribuirse entre instancias. Sin Redis, cada usuario solo recibe eventos de la instancia a la que está conectado.
- **US$ 14,40–28,80 de backups:** el costo de no tenerlos es perder datos de usuarios y conversaciones.
- **US$ 0,68–5 de fotos:** 45 GB siguen siendo baratos en R2; el egreso gratis evita el costo que sí tendría Spaces o S3.
- **US$ 50–150 de monitoreo/logs:** a esta escala, no se puede diagnosticar con `console.log`. Este ítem paga ver qué se rompió, cuándo y para cuántos usuarios.
- **US$ 29–48 de contingencia:** cubre el crecimiento real, que nunca es exactamente el proyectado.

**Si el mapa es web/PWA:** 600.000 cargas − 10.000 gratis = 590.000 × US$ 7/1.000 = **US$ 4.130**. El total sube a ~US$ 4.450–4.650. A ese volumen conviene evaluar MapLibre con teselas propias, MapTiler o Stadia Maps.

**Con alta disponibilidad real** (varias zonas, réplica de base, backups verificados y soporte del proveedor): **US$ 600–1.200/mes**.

---

## 6. Costos fijos anuales

| Concepto | Costo | Equivalente mensual | Nota |
|---|---:|---:|---|
| Apple Developer Program | **US$ 99/año** | US$ 8,25 | Renovación anual. |
| Google Play Console | **US$ 25 único** | US$ 2,08 el primer año | Registro. |
| Dominio | US$ 12–20/año | US$ 1,00–1,67 | Según TLD y registrador. |
| TLS | US$ 0 | US$ 0 | Let's Encrypt o incluido. |
| **Primer año** | **~US$ 136–144** | **~US$ 11–12** | Sin impuestos. |

No incluye comisiones por ventas dentro de las tiendas. Para monetización, modelar por separado el porcentaje que retiene cada tienda según territorio y tipo de producto.

---

## 7. Costo marginal: qué pasa al sumar usuarios

| Incremento | Impacto mensual aproximado | Explicación |
|---|---:|---|
| **+1.000 MAU registrados** | **US$ 0,01–0,05** | 0,9 GB de fotos en R2; filas y metadatos despreciables. |
| **+1.000 DAU con mapa móvil** | **US$ 10–30** | 1,8 M actualizaciones/mes; se cubre con holgura de API/base, por escalones. |
| **+1.000 DAU con mapa web** | **+US$ 770** | 120.000 cargas de Dynamic Maps; el driver dominante. |
| **+1.000 DAU usando chat** | **US$ 5–20** | 1,5 M mensajes/mes de texto y fan-out en tiempo real. |
| **+10.000 fotos** | **US$ 0,05** | 3 GB adicionales en R2. |
| **+1 TB de egreso de fotos** | **US$ 0 en R2** | R2 no cobra egreso; Spaces incluye 1 TiB y luego cobra por GiB. |

**Importante:** son escalones. Si el uso crece pero entra en la instancia actual, el costo marginal es casi cero. Cuando se cruza el límite de conexiones, CPU o disco, se sube de plan y el salto es discreto.

### Costo por DAU según escala

| Escenario | Costo mensual | DAU | US$/DAU/mes |
|---|---:|---:|---:|
| Piloto | 30–60 | 50 | 0,60–1,20 |
| Crecimiento | 75–200 | 1.000 | 0,075–0,20 |
| Escala | 350–550 | 5.000 | 0,07–0,11 |
| Escala con HA | 600–1.200 | 5.000 | 0,12–0,24 |

La economía mejora con densidad. El problema no es el costo unitario: es llegar a la densidad local suficiente para que el radar tenga valor.

---

## 8. Comparación de proveedores

### Cómputo y base

| Opción | Referencia pública | Cuándo conviene |
|---|---|---|
| DigitalOcean Droplets | Desde US$ 4/mes (512 MB); 2 GB/1 vCPU US$ 12; 2 GB/2 vCPU US$ 18; 4 GB/2 vCPU US$ 24; 8 GB/4 vCPU US$ 48 | Simple, predecible, buena documentación. |
| DigitalOcean Managed PostgreSQL | Desde US$ 15/mes (1 GiB); 2 GiB US$ 30; 4 GiB US$ 60; 8 GiB US$ 120 | Menos operación; backups administrados. El failover depende de la configuración del clúster. Soporta PostGIS. |
| Hetzner Cloud | CX23 desde € 5,99/mes (2 vCPU/4 GB) | Mejor precio por recurso en EU; sumar costo operativo de administrar la base. |
| PostgreSQL en el mismo Droplet | US$ 6–24/mes de cómputo | Solo piloto o presupuesto muy ajustado; sin HA ni backups gestionados. |

Verificar la edición del clúster de DigitalOcean (Standard vs Advanced) y las extensiones disponibles antes de decidir.

### Almacenamiento

| Opción | Costo | Egreso | Cuándo conviene |
|---|---|---|---|
| Cloudflare R2 | US$ 0,015/GB-mes; free tier 10 GB, 1 M Class A, 10 M Class B | **US$ 0** | Fotos y medios; evita sorpresas por tráfico. |
| DigitalOcean Spaces | US$ 5/mes; 250 GiB y 1 TiB de salida incluidos | US$ 0,01/GiB adicional | Si ya se usa DigitalOcean y el volumen entra en el plan. |
| S3/otro compatible | Variable | Variable | Si hay requisitos de región o compliance. |

### Mapas

| Opción | Modelo | Riesgo |
|---|---|---|
| Google Maps SDK móvil | Listado como “Unlimited” | Verificar SKU y términos; Places/Geocoding se cobran aparte. |
| Google Dynamic Maps web | 10.000 gratis; luego US$ 7/1.000 | Muy caro a escala si la web es un producto real. |
| MapTiler | Free: 5.000 sesiones y 100.000 requests/mes | Revisar plan Flex y límites de sesiones. |
| Stadia Maps | Free: 200.000 créditos/mes | Cada tesela consume créditos; estimar por sesión real. |
| MapLibre + teselas propias | Costo de cómputo, storage y CDN | Más control; más operación y posible costo de datos. |

### Push y monitoreo

| Servicio | Costo | Nota |
|---|---|---|
| Firebase Cloud Messaging | Sin costo por el servicio | El backend que origina los envíos sí consume infraestructura. |
| Better Stack | Free: 10 monitores | Suficiente para piloto. |
| Sentry | Developer free: 1 usuario | Team desde US$ 26/mes si se necesita más. |

### Firebase vs. DigitalOcean

Firebase no es “más caro” de entrada. En el piloto puede ser más barato porque no requiere Droplet ni base administrada. La diferencia aparece en el patrón de uso y en el encaje técnico.

| Criterio | DigitalOcean + PostgreSQL/PostGIS | Firebase (Firestore + Functions) |
|---|---|---|
| Modelo de costo | Fijo por instancia | Variable por lectura, escritura, función y egress |
| Piloto 50 DAU | US$ 30–60/mes | **US$ 0–20/mes** (free tier suele alcanzar) |
| 1.000 DAU | US$ 75–200/mes | **US$ 20–150/mes** según lecturas y fan-out |
| 5.000 DAU | US$ 350–550/mes | **US$ 150–500/mes**; puede superar si hay mucho realtime |
| Consultas geoespaciales | PostGIS nativo (`ST_DWithin`, índice GiST) | Geohash + varias consultas + filtrado; no hay consulta geográfica nativa |
| Datos relacionales | SQL, transacciones, joins | Documentos; transacciones y consultas más limitadas |
| Chat y presencia | WebSocket propio + Redis | Listeners de Firestore; cada snapshot cuenta lecturas |
| Portabilidad | Docker + Postgres + S3: cualquier nube | Firestore/Functions/Rules: atado a Google Cloud |
| Operación | Servidor, base, backups | Reglas, índices, funciones, cuotas y facturación variable |

**Lectura:** si el objetivo fuera solo “piloto rápido y barato”, Firebase es una opción razonable. No la elegimos como núcleo porque:
1. El cliente pidió poder dockerizar y desplegar donde quiera; Firestore no es portable.
2. La búsqueda por radio es el corazón del producto y PostGIS la resuelve de forma nativa.
3. Pings, matches, bloqueos, reportes y moderación son datos relacionales; SQL simplifica integridad y consultas.
4. El costo de Firebase es variable y depende de cuántas lecturas genere el radar en tiempo real; el de DigitalOcean es predecible.

**Híbrido recomendado:** usar **Firebase Auth** para login social y **FCM** para push, manteniendo **DigitalOcean + PostgreSQL/PostGIS** para el dominio. Así se aprovecha lo gratis de Firebase sin entregarle la base de datos ni la portabilidad.

---

## 9. Palancas para bajar el costo

1. **Mapa nativo móvil, no web.** Es la diferencia entre US$ 0 y cientos o miles de dólares.
2. **Presencia efímera, no historial.** Una fila vigente por usuario; sin recorridos. Menos storage y menos riesgo.
3. **Comprimir fotos en el cliente.** 300 KB en lugar de 3 MB reduce storage y tiempos de carga.
4. **R2 para medios.** Egreso gratuito; ideal para perfiles y chat con imágenes.
5. **Retención y TTL.** Chats, pings y reportes con vencimiento; no acumular datos “por si acaso”.
6. **Caché y límites de mapa.** No recargar el mapa en cada actualización de ubicación; agrupar y limitar sesiones.
7. **Connection pooling.** PostgreSQL administrado limita conexiones por plan; usar PgBouncer o el pooler del proveedor.
8. **Logs con sampling.** Los logs sin retención pueden costar más que la API.
9. **Alertas de presupuesto.** Configurar límites y avisos desde el día uno.
10. **Un solo backend modular.** No microservicios ni Kubernetes hasta que el uso lo justifique.

---

## 10. Fase de comparación Flutter vs. Expo

La comparación de frontends puede tener costo de infraestructura cercano a cero:

| Concepto | Costo | Nota |
|---|---:|---|
| GitHub Pages | US$ 0 | Sitio estático; repo público. |
| GitHub Actions | US$ 0 | Runners estándar gratis e ilimitados en repos públicos. |
| Dominio | US$ 1–2/mes | Opcional si se usa el dominio de Pages. |
| Backend | US$ 0 | Datos simulados; sin API. |
| EAS Build | US$ 0–45/mes | Free: hasta 15 builds Android y 15 iOS; luego crédito/uso. |
| **Total** | **US$ 0–50/mes** | Sin contar dispositivos de prueba. |

**Límite importante:** Pages sirve para comparar radar, navegación y rendimiento visual, pero **no valida push nativo, permisos reales ni comportamiento en segundo plano**. Para eso hacen falta builds instalables en dispositivos. Una demo web sin backend tampoco prueba el flujo completo de ping/chat.

---

## 11. Qué NO incluye este documento

- Desarrollo, QA, diseño, product management ni horas de equipo.
- Moderación humana, soporte al usuario, trust & safety.
- Legal, privacidad, términos, DSA/GDPR/LFPDPPP y auditorías.
- Marketing, adquisición, influencers y contenido.
- Impuestos, retenciones y comisiones de App Store/Google Play.
- SMS/OTP: si se usa verificación por teléfono, el costo por mensaje varía por país y puede crecer rápido.
- Costos de dispositivos, cuentas de prueba, soporte de mapas empresarial ni acuerdos con proveedores.

---

## 12. Fuentes

- [DigitalOcean — Droplets](https://www.digitalocean.com/pricing/droplets)
- [DigitalOcean — Managed Databases](https://www.digitalocean.com/pricing/managed-databases)
- [DigitalOcean — Spaces](https://www.digitalocean.com/pricing/spaces-object-storage)
- [DigitalOcean — PostgreSQL extensions (PostGIS)](https://docs.digitalocean.com/products/databases/postgresql/details/supported-extensions)
- [Hetzner — Cloud](https://www.hetzner.com/cloud)
- [Cloudflare R2 — Pricing](https://developers.cloudflare.com/r2/pricing)
- [Google Maps Platform — Pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [MapTiler — Pricing](https://www.maptiler.com/cloud/pricing)
- [Stadia Maps — Pricing](https://stadiamaps.com/pricing)
- [Firebase — Pricing / Cloud Messaging](https://firebase.google.com/pricing)
- [Apple Developer Program](https://developer.apple.com/programs/whats-included)
- [Google Play Console — Registro](https://support.google.com/googleplay/android-developer/answer/6112435)
- [Better Stack — Pricing](https://betterstack.com/pricing)
- [Sentry — Pricing](https://sentry.io/pricing)
- [GitHub Actions — Runners](https://docs.github.com/actions/using-jobs/choosing-the-runner-for-a-job)
- [Expo — Pricing](https://expo.dev/pricing)

---

## 13. Próximos pasos para convertir esto en presupuesto

1. Confirmar **DAU/MAU esperado** y minutos de radar por sesión.
2. Decidir **mapa**: SDK móvil, MapLibre/teselas propias o web Dynamic Maps.
3. Decidir **región** y requisito de alta disponibilidad.
4. Elegir **proveedor de base**: administrada vs. contenedor propio.
5. Definir **retención** de chats, fotos y reportes.
6. Medir durante el piloto: actualizaciones/DAU, sesiones de mapa, GB de fotos, conexiones concurrentes y costo real por DAU.
7. Recalcular este documento con datos medidos, no con supuestos.
