# SPEC — «El barrio a 240 m» (NearbyIG)

GOAL:    que quien lo vea entienda en 3 segundos que las distancias son de gente real conectada ahora, y quiera abrir nearbyig.tech.
OUTPUT:  HyperFrames · 1920 × 1080 · 30 fps
TIME:    27 s = 810 frames · música 100 BPM → 1 beat = 18 frames · 1 compás = 72 frames

LOOK:    ground #0B0F14 plano, 0% gradiente, 0% grain (es la superficie de la app, no un vacío: la UI ocupa el frame)
         ink #E6EDF3 · bordes #21262D
         accent #F5E600 racionado: sólo distancias, estado del ping, cono del radar y subrayado del CTA. Máximo una zona de acento por plano.
         display Inter 700 · 96 px · tracking −2% · línea máx. 6 palabras
         body Inter 400/500 · 32 px · línea máx. 10 palabras
         medium: UI real de la app a escala real (pantalla 576×1024). Punch-in a 2.2× sobre la fila. Sin vidrio, sin sombras inventadas, sin 3D.
         light: ninguna luz añadida; sólo los bordes propios de la app.

OBJECTS: la pantalla de la app (lista), la fila de Vale, los chips de radio, la barra de navegación, el mapa con el cono del radar.

MOTION:  enter  cubic-bezier(0.22, 1, 0.36, 1) · 24 f
         camera cubic-bezier(0.40, 0, 0.20, 1) · 60 f
         exit   cubic-bezier(0.40, 0, 1, 1) · 12 f
         Sin springs. Una sola hero move por plano; las secundarias viajan 60% y arrancan 6 f después.

SHOTS:
  F000–F135 (0.0–4.5 s)  HOOK · Vale a 240 m
         hero: push-in 1.0× → 2.2× sobre la fila, centrada, 60% del ancho
         lee: "Vale · 240 m" (0.0–4.5 s) · el punto verde de "en línea" aparece en F030
         acción real: el cursor (5% del frame) entra desde la derecha en F060 y hace click en el ping en F084; la fila se enciende en #F5E600 en el mismo frame
         sonido: click seco en F084 · el pulso de bajo entra en F000
         handoff: la fila encendida es el objeto que abre el plano 2

  F135–F330 (4.5–11.0 s)  PROOF 1 · el barrio entero
         hero: pull-back 2.2× → 1.0× en 60 f, la fila vuelve a su lugar en la lista real
         lee: "5 personas en 5,0 km" · cada fila aparece al pasar la cámara (F150, F174, F198, F222)
         acción real: los chips de radio se recorren 500 m → 1,0 km → 2,0 km → 5,0 km (F240–F312), el contador sube 1 → 5
         sonido: tick por chip (4) · el bajo sube una quinta en F240
         handoff: el chip "5,0 km" encendido lleva al plano 3

  F330–F495 (11.0–16.5 s)  PROOF 2 · el radar prueba la distancia
         hero: corte con causa — el dedo toca "Radar" en la nav en F330 y el plano cambia en ese frame (no hay morph: la app hace ese cambio, no lo inventamos)
         lee: el mapa de CDMX con "vos" al centro y el cono barriendo; un punto rosa a 240 m
         acción real: el cono barre 40° en 72 f; el punto de Vale se enciende en F420
         sonido: barrido de radar por vuelta · silencio de 9 f antes de F420
         handoff: el punto encendido es el mismo Vale del plano 1

  F495–F585 (16.5–19.5 s)  PAYOFF · la distancia se vuelve nombre
         hero: el punto rosa se expande y se convierte en la fila de Vale (match cut: círculo → avatar)
         lee: "240 m" grande, 96 px, en #F5E600
         acción real: la fila vuelve a la lista, ahora segunda (la lista se reordena)
         sonido: impacto suave en F495 · el bajo cae a la tónica
         handoff: el listado completo queda en frame

  F585–F675 (19.5–22.5 s)  CLAIM
         hero: la lista se desplaza 120 px a la izquierda y entra el titular por la derecha, sin fundido
         lee: "Distancias reales, no perfiles de catálogo" (2 líneas, 6 + 5 palabras)
         sonido: silencio de música, sólo el pulso · 1 nota sostenida
         handoff: la última palabra queda y el ground se cierra

  F675–F810 (22.5–27.0 s)  END CARD
         hero: la marca entra llevada por el cursor: click en el centro, un relleno #F5E600 sube por el ícono, el wordmark "Nearby Social Club" se escribe a la derecha
         lee: marca 20% del ancho · wordmark · "nearbyig.tech" · sostén 3.0 s
         sonido: click + acorde final
         handoff: fin

BANNED:  vacío oscuro con UI chica flotando · glow/neón/partículas · gradientes púrpura · tarjetas de vidrio
         · tres tarjetas en fila · título sobre captura oscurecida · logo en la esquina · todo centrado y apareciendo con fade
         · UI de competidor inventada · estado "pendiente" inventado · movimiento de cámara sobre una captura sin cambio de estado
         · cualquier pantalla que no sea una captura real de la app

QA:      F000 (frame 0 = Vale + 240 m, nada de negro ni logo solo) · F084 (el ping enciende la fila en el mismo frame del click)
         · F150 (la lista ya se lee, no hay hueco) · F312 (contador en 5, chip 5,0 km encendido)
         · F330 (cambio a radar en el frame del tap) · F420 (punto de Vale encendido, cono visible)
         · F495 (el círculo se vuelve avatar sin salto) · F600 (el claim entra sin fundido)
         · F810 (end card legible a 3 s del final, CTA presente)
