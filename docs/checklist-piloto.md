# Checklist de compras y cuentas — Piloto NearbyIG

> **Objetivo:** que el cliente sepa exactamente qué crear, qué pagar y qué datos entregar para arrancar el piloto.
> **Precios:** lista pública en USD, sin impuestos, verificados el **2026-11-06**.
> **Regla de titularidad:** las cuentas y la facturación deben quedar a nombre del cliente. Nosotros trabajamos con acceso delegado, no con la tarjeta del equipo.

---

## 1. Resumen de caja

### Si el cliente no tiene nada creado

| Concepto | Cuándo se paga | Costo |
|---|---|---:|
| Dominio | Anual | US$ 10–20 |
| DigitalOcean (API + base + backup) | Mensual | US$ 29,40/mes |
| Apple Developer Program | Anual | US$ 99 |
| Google Play Console | Único | US$ 25 |
| Cloudflare R2 | Free tier | US$ 0 |
| Firebase / FCM | Free tier | US$ 0 |
| Google Maps Platform | Free tier con facturación | US$ 0 |
| Monitoreo (Better Stack + Sentry) | Free tier | US$ 0 |
| GitHub | Free | US$ 0 |
| **Desembolso inicial** | | **US$ 163–173** |
| **Recurrente** | | **US$ 29,40/mes + renovaciones anuales** |

### Si el cliente ya tiene Apple y Google

| Concepto | Costo |
|---|---:|
| Dominio | US$ 10–20 |
| DigitalOcean primer mes | US$ 29,40 |
| **Desembolso inicial** | **US$ 39–49** |
| **Recurrente** | **US$ 29,40/mes** |

**No incluye:** desarrollo, QA, moderación, soporte, marketing, impuestos ni comisiones de tiendas.

---

## 2. Comprar ahora

> Si el cliente ya tiene Apple Developer y Google Play Console, **no comprar 2.4 ni 2.5**. Verificar titularidad, verificación y acceso delegado. El desembolso inicial baja a **US$ 39–49**.

### 2.1 Dominio

| Dato | Definición |
|---|---|
| Qué comprar | Dominio `.com` o `.app` a nombre del cliente. |
| Dónde | Cloudflare Registrar (precio de costo) o Namecheap. |
| Costo | US$ 10–20/año según TLD. |
| Datos que necesitamos | Dominio exacto, titular, email de administración. |
| Por qué | API, sitio de privacidad y correo `support@`. Sin dominio no hay TLS ni cuentas de tienda. |

**Acción:** verificar disponibilidad del nombre elegido antes de pagar. Si `nearbyig.com` no está libre, definir alternativa.

---

### 2.2 DigitalOcean — API

| Dato | Definición |
|---|---|
| Producto | Droplet |
| Plan exacto | Basic, Regular SSD, **2 GB RAM / 1 vCPU / 50 GB SSD / 2 TB transfer** |
| Precio | **US$ 12/mes** |
| Sistema operativo | Ubuntu 24.04 LTS |
| Región | **NYC3** (o TOR1 si la latencia desde Cancún es mejor) |
| Backup | Activar **weekly backups**: +20% = **US$ 2,40/mes** |
| Firewall | 22 solo desde IP administrativa; 80/443 público; 5432 solo desde el Droplet |
| Por qué | Ejecuta NestJS, WebSocket y tareas de presencia para 50 DAU. |

**Alternativa con holgura:** 2 GB / 2 vCPU por **US$ 18/mes**. Backups diarios: 30% = US$ 5,40/mes.

**Datos que necesitamos:** acceso delegado al proyecto, región, nombre del Droplet, llave SSH pública.

---

### 2.3 DigitalOcean — PostgreSQL/PostGIS

| Dato | Definición |
|---|---|
| Producto | Managed PostgreSQL |
| Plan exacto | **1 GiB RAM / 1 vCPU / 10 GiB disco** |
| Precio | **US$ 15/mes** |
| Versión | PostgreSQL 16 o 17 |
| Edición | **Standard Edition** (Advanced Edition tiene un conjunto limitado de extensiones; confirmar PostGIS antes de contratar) |
| Extensión | **PostGIS** habilitada |
| Backups | Diarios incluidos por el proveedor |
| Red | Trusted sources: solo el Droplet de la API |
| Por qué | Perfiles, ubicación vigente, pings, matches y chat. PostGIS para búsquedas por radio. |

**Datos que necesitamos:** nombre del clúster, región, usuario administrador, acceso delegado.

**Nota:** 1 GiB permite 22 conexiones. Para 50 DAU alcanza con pooling; no crear una conexión por request.

---

### 2.4 Apple Developer Program

> **Si el cliente ya tiene la cuenta:** no pagar de nuevo. Verificar que sea cuenta de **organización**, que la membresía esté activa, que tenga acceso a App Store Connect y que el bundle ID `com.nearbyig.app` esté disponible. Pedir acceso delegado como Admin/App Manager, nunca la contraseña.

| Dato | Definición |
|---|---|
| Producto | Apple Developer Program |
| Costo | **US$ 99/año** |
| Tipo de cuenta | **Organización** (recomendado) o individual. |
| Requisito | Entidad legal y **número D-U-N-S** para organización. |
| Tiempo | La verificación puede tardar días o semanas. **Empezar ya.** |
| Datos que necesitamos | Apple ID del cliente, entidad legal, D-U-N-S, dirección, teléfono, sitio web, email de soporte. |
| Por qué | TestFlight, distribución en App Store, Sign in with Apple, APNs para push. |

**Bloqueador:** sin Apple Developer no se puede instalar una build firmada en dispositivos iOS ni usar push nativo.

---

### 2.5 Google Play Console

> **Si el cliente ya tiene la cuenta:** no pagar de nuevo. Verificar que sea cuenta de **organización**, que esté verificada, que tenga acceso de Admin a Play Console y que el package name `com.nearbyig.app` no esté ocupado. Pedir acceso delegado, nunca la contraseña.

| Dato | Definición |
|---|---|
| Producto | Google Play Console |
| Costo | **US$ 25 único** |
| Tipo de cuenta | **Organización** (recomendado). |
| Requisito | Verificación de identidad; D-U-N-S para organización. |
| Tiempo | Verificación de días. **Empezar ya.** |
| Datos que necesitamos | Cuenta Google del cliente, entidad legal, D-U-N-S, dirección, teléfono, email de soporte. |
| Por qué | Internal testing, producción en Google Play, Play App Signing, FCM. |

**Atención:** las cuentas personales nuevas tienen requisitos de testers y días de prueba antes de producción. Una cuenta de organización evita esa fricción, pero requiere verificación.

---

### 2.6 ¿Por qué API y base separadas?

Son dos productos distintos de DigitalOcean:

- **Droplet:** una máquina virtual. Ejecuta la API NestJS, WebSocket y el proxy.
- **Managed PostgreSQL:** un servicio de base de datos administrado. Ejecuta PostgreSQL/PostGIS, backups, parches y monitoreo.

| Opción | Costo/mes | Ventaja | Riesgo |
|---|---:|---|---|
| Droplet + Managed PostgreSQL | **US$ 27** | Aislamiento, backups diarios, menos operación, escalan por separado. | Cuesta US$ 15 más. |
| PostgreSQL dentro del mismo Droplet | US$ 18–24 | Ahorra US$ 9–15. | Un solo punto de falla; vos administrás backups, seguridad, upgrades y tuning. |

**Recomendación para el piloto:** mantenerlos separados. Los US$ 15 de la base administrada compran backups diarios, parches y recuperación; el tiempo de operar PostgreSQL a mano vale más que eso. Si el presupuesto es crítico, se puede self-hostear Postgres en el Droplet, pero entonces el backup deja de ser opcional.

---

### 2.7 ¿El backup es opcional?

| Backup | ¿Opcional? | Por qué |
|---|---|---|
| PostgreSQL administrado (diario) | **No** | Está incluido y protege los datos de usuarios, pings y chats. |
| Droplet semanal (US$ 2,40/mes) | **Sí** | La API debería ser reconstruible desde Git/Docker. Si se omite, tomar un snapshot manual antes de cambios grandes y guardar secretos fuera del servidor. |
| Dump adicional de PostgreSQL a R2 | Recomendado | Copia fuera del proveedor; permite restaurar ante un error humano o pérdida del clúster. |

Si se self-hostea PostgreSQL en el Droplet, el backup del Droplet y los dumps a R2 **no son opcionales**.

---

## 3. Crear gratis ahora

| Servicio | Plan | Para qué | Datos que necesitamos |
|---|---|---|---|
| Cloudflare | Free | DNS, TLS, R2, Email Routing | Acceso delegado al dominio. |
| Cloudflare R2 | Free tier: 10 GB, 1 M Class A, 10 M Class B, egreso gratis | Fotos de perfil | Bucket `nearbyig-media`, token limitado al bucket. |
| Firebase | Spark (sin Blaze) | FCM para push | Proyecto, `google-services.json`, APNs key. |
| Google Cloud | Proyecto con facturación | Maps SDK Android/iOS, OAuth | Cuenta de facturación, presupuesto con alerta, API key restringida. |
| Better Stack | Free: 10 monitores | Uptime y alertas | Monitores de API y sitio. |
| Sentry | Developer free: 1 usuario | Errores | DSN del proyecto. |
| GitHub | Free (repo actual) | Código, Actions, Pages | Acceso al repo. |
| Expo/EAS | Free: 15 builds Android + 15 iOS/mes | Si se elige Expo | Cuenta Expo del cliente o del equipo. |
| Resend o similar | Free tier | Email transaccional | Dominio verificado, SPF/DKIM/DMARC. |

**Costo esperado de estos servicios en el piloto: US$ 0.** El único que puede generar cargos es Google Maps si se excede el free tier; para el piloto no debería.

---

## 4. Datos que debe entregar el cliente

### Legales y de tienda

- [ ] Entidad legal exacta (razón social).
- [ ] Número D-U-N-S (Apple y Google lo piden para organización).
- [ ] Dirección fiscal y teléfono.
- [ ] Email de soporte (`support@dominio`).
- [ ] URL de política de privacidad.
- [ ] URL de términos y condiciones.
- [ ] URL de eliminación de cuenta.
- [ ] Persona responsable de moderación y contacto de seguridad.
- [ ] Confirmación de que la app es **18+** si incluye intención de citas.
- [ ] Cuenta bancaria y datos fiscales para payouts de tiendas (si habrá cobros).

### Producto

- [ ] Nombre exacto de la app.
- [ ] Bundle ID / package name: **`com.nearbyig.app`** (o el que el cliente controle).
- [ ] Icono 1024×1024 y assets de tienda.
- [ ] Textos de ficha: descripción corta y larga.
- [ ] Capturas de pantalla.
- [ ] Categoría: Social Networking.
- [ ] Clasificación por edad.

### Cuentas

- [ ] Titularidad de Apple Developer y Google Play.
- [ ] Acceso delegado a DigitalOcean, Cloudflare, Firebase y Google Cloud.
- [ ] Dominio a nombre del cliente.
- [ ] Método de pago del cliente para las cuentas.

---

## 5. Datos técnicos que definimos nosotros

- Región de DigitalOcean y prueba de latencia desde Cancún.
- Versión de PostgreSQL y PostGIS.
- Bucket y política de retención de fotos.
- API keys de Maps con restricción por package/bundle.
- SHA-1 y SHA-256 del Android app.
- APNs key y certificados iOS.
- Variables de entorno y secretos.
- Firewall, backups y restore probado.
- Monitores de uptime y alertas de presupuesto.

---

## 6. Bloqueadores y tiempos

| Bloqueador | Impacto | Acción |
|---|---|---|
| Apple Developer sin verificar | No hay TestFlight ni push iOS | Iniciar inscripción ahora; D-U-N-S puede tardar. |
| Google Play sin verificar | No hay internal testing | Iniciar ahora; verificación de organización puede tardar. |
| Dominio no definido | No hay TLS, email ni privacy URL | Elegir y registrar esta semana. |
| Sin política de privacidad | Rechazo en App Store/Google Play | Redactarla antes de la submission. |
| Sin eliminación de cuenta | Requisito de ambas tiendas | Implementar flujo y URL. |
| Sin bloqueo/reporte | Requisito para apps sociales/UGC | Implementar antes de producción. |
| Keystore del prototipo | Clave comprometida en el ZIP | **No reutilizar.** Generar upload key nuevo y no versionarlo. |
| ZIP con keystore en repo público | Riesgo de seguridad | Sacar el ZIP del historial antes de publicar el repo. |

---

## 7. Lo que NO hay que comprar todavía

- Kubernetes.
- Redis administrado (se agrega si hay varias instancias).
- Base de 2 GiB o más (recién al crecer).
- Plan pago de Sentry o Better Stack.
- Plan pago de MapTiler/Stadia.
- Firebase Blaze.
- SMS/OTP.
- Mac hardware si se usa EAS o CI macOS.
- CDN pago: Cloudflare free + R2 alcanzan.
- Soporte empresarial de proveedores.

---

## 8. Orden de ejecución

1. **Día 0:** definir dominio; iniciar Apple Developer y Google Play (son los que más tardan).
2. **Día 1:** crear DigitalOcean, Droplet, PostgreSQL/PostGIS y backups.
3. **Día 1:** crear Cloudflare, DNS, R2 y Email Routing.
4. **Día 2:** crear Firebase, Google Cloud, Maps y restringir API keys.
5. **Día 2:** sanear el repo (sacar ZIP con keystore) y configurar GitHub Actions/Pages.
6. **Día 3:** desplegar API, TLS, health checks y monitoreo.
7. **Día 4–5:** builds de prueba, TestFlight/internal testing y medición de latencia.
8. **Antes de usuarios reales:** privacidad, términos, eliminación de cuenta, bloqueo y reporte.

---

## 9. Decisiones que cambian la compra

| Decisión | Efecto |
|---|---|
| Expo vs. Flutter | Expo usa EAS; Flutter necesita Mac o CI macOS para iOS. |
| Google Maps vs. MapTiler/MapLibre | Google requiere cuenta de facturación; MapTiler free evita tarjeta pero tiene límites de sesiones. |
| Firebase Auth vs. auth propia | Firebase Auth simplifica; auth propia requiere más backend y proveedores de email. |
| Región en México | DigitalOcean no tiene región en México; si la residencia de datos es obligatoria, evaluar otro proveedor antes de comprar. |
| Repo público vs. privado | Público mantiene Actions/Pages gratis; privado puede requerir plan pago para Pages. |

---

## 10. Links de compra y creación

- [DigitalOcean — Droplets](https://www.digitalocean.com/pricing/droplets)
- [DigitalOcean — Managed PostgreSQL](https://www.digitalocean.com/pricing/managed-databases)
- [Cloudflare — R2](https://developers.cloudflare.com/r2/)
- [Cloudflare — Email Routing](https://developers.cloudflare.com/email-routing/)
- [Apple Developer Program](https://developer.apple.com/programs/enroll/)
- [Google Play Console](https://play.google.com/console/about/)
- [Firebase Console](https://console.firebase.google.com/)
- [Google Maps Platform](https://console.cloud.google.com/google/maps-apis)
- [Better Stack](https://betterstack.com/)
- [Sentry](https://sentry.io/signup/)
- [Expo — Pricing](https://expo.dev/pricing)
- [Resend](https://resend.com/pricing)
