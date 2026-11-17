import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  assertStackUp,
  clearPresence,
  deleteSessionsCreatedSince,
  extendPresence,
  listDiscovery,
  logout,
  openSession,
  PROFILE_FIELDS,
  sessionIdOf,
  snapshotSessionIds,
  updatePresence,
} from '../helpers.mjs';

/**
 * `GET /discovery` con densidad real — recalibrado en `remove-bots`.
 *
 * Lo que fija este archivo:
 *
 *  - **dos humanos vivos en la misma región se ven mutuamente**: cada uno ve
 *    exactamente una fila, la del otro. El propio perfil sigue excluido;
 *  - **un humano solo ve `results: []`**: sin bots de relleno, la densidad es la
 *    que hay, y el vacío es una respuesta válida (el caso 0 ↔ 200 ya tiene su
 *    propio archivo en `discovery-density.test.mjs`, acá se mide el salto de 1
 *    a 2 personas);
 *  - `distanceM`/`bearingDeg` se miden **desde el observador** (no desde el ancla
 *    de la zona) y salen redondeados, enteros y dentro del rango del contrato;
 *  - filtros: radio, intención, género, verificado y online, uno por uno y
 *    combinados, más los 422 de validación;
 *  - exclusiones: ghost (sin presencia viva no se ve y no ve), otra región y el
 *    propio perfil;
 *  - densidad completa de una región: 5 humanos vivos ⇒ cada uno ve 4 filas.
 *    Con 10 slots por región el tope de página (`maxItems: 10`) no es alcanzable
 *    por humanos, así que lo que se fija es la paridad N−1, no un corte;
 *  - ninguna coordenada en la respuesta.
 *
 * Geometría de los escenarios: puntos reales dentro del polígono `cdmx`
 * (`contract/catalog/zones.json`), no `demoZoneKey`. Con zona demo los dos
 * humanos caen en el ancla y la distancia sería 0: el test de orden y el de
 * "frame del observador" necesitan puntos distintos.
 */

/** Ancla de `cdmx` (`ST_PointOnSurface`) y dos puntos dentro del polígono. */
const ANCHOR = { lat: 19.44, lng: -99.127297 };
const NEAR = { lat: 19.435, lng: -99.12 };
const FAR = { lat: 19.45, lng: -99.095 };
const CO_ANCHOR = { lat: 4.71, lng: -74.0721 };
const CO_NEAR = { lat: 4.69, lng: -74.09 };

const at = (point) => ({ point });

/** `GET /discovery` con status 200 obligatorio: las filas o el fallo del test. */
async function rows(token, filters = {}) {
  const response = await listDiscovery(token, filters);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(Object.keys(response.body), ['results'], 'DiscoveryResult es un objeto con array adentro');
  return response.body.results;
}

/**
 * Repone la presencia del escenario: el TTL de 12 s no espera al suite. Cada
 * entrada lleva su punto porque el escenario tiene dos humanos en dos lugares
 * distintos (y medir desde el mismo punto no mediría nada).
 */
async function renew(entries) {
  for (const { token, point = ANCHOR } of entries) {
    const response = await updatePresence(token, at(point));
    assert.equal(response.status, 200, JSON.stringify(response.body));
  }
}

/** Cursor de eventos propio del escenario, para no mirar el log compartido. */
const ids = (page) => page.map((row) => row.profileId);

describe('discovery: dos humanos, medidas, filtros, región y ghost', () => {
  let snapshot = [];
  let observer;
  let neighbour;

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const observerSession = await openSession({ regionKey: 'mx', demoSlot: 1 });
    const neighbourSession = await openSession({ regionKey: 'mx', demoSlot: 2 });
    assert.equal(observerSession.status, 201, JSON.stringify(observerSession.body));
    assert.equal(neighbourSession.status, 201, JSON.stringify(neighbourSession.body));
    observer = { ...observerSession.body, sessionId: sessionIdOf(observerSession.body.token) };
    neighbour = { ...neighbourSession.body, sessionId: sessionIdOf(neighbourSession.body.token) };
    assert.equal((await updatePresence(observer.token, at(ANCHOR))).status, 200);
    assert.equal((await updatePresence(neighbour.token, at(NEAR))).status, 200);
    // El TTL del contrato es de 12 s: se estira para que la suite no dependa de
    // la duración de sus propios tests (la semántica de lectura no cambia).
    await extendPresence([observer.sessionId, neighbour.sessionId], 600);
  });

  /** El escenario base: el observador en el ancla y el vecino en `NEAR`. */
  const renewScene = () =>
    renew([{ token: observer.token }, { token: neighbour.token, point: NEAR }]);

  after(async () => {
    for (const session of [observer, neighbour]) await logout(session.token);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('dos humanos en la misma región: cada uno ve una fila, la del otro', async () => {
    const page = await rows(observer.token);
    assert.equal(page.length, 1, `se esperaba una sola contraparte: ${ids(page).join(' ')}`);

    const [other] = page;
    assert.equal(other.profileId, neighbour.profileId, 'el único humano visible no es el vecino');
    assert.equal(other.sourceType, 'human');
    assert.equal(other.regionKey, 'mx');
    assert.ok(!ids(page).includes(observer.profileId), 'el observador aparece en su propio descubrimiento');

    // La fila es `ProfileSummary`: 17 campos, ni uno más ni uno menos.
    assert.deepEqual(Object.keys(other).sort(), PROFILE_FIELDS, 'campos de ProfileSummary');
    assert.equal(other.online, true, 'lo visible está online por construcción');
    assert.ok(other.demoSlot !== null, 'un humano visible ocupa slot');
    assert.equal(other.inUse, true, 'la fila existe porque hay una sesión viva en ese slot');
    assert.ok(Number.isInteger(other.distanceM) && other.distanceM >= 200 && other.distanceM <= 5000);
    assert.ok(Number.isInteger(other.bearingDeg) && other.bearingDeg >= 0 && other.bearingDeg <= 359);

    // Ni una coordenada en la respuesta.
    assert.doesNotMatch(
      JSON.stringify(page),
      /"(?:lat|lng|lon|latitude|longitude|point|center|position)"/i,
      'la respuesta lleva geometría',
    );

    // El otro humano ve exactamente lo simétrico.
    const mirror = await rows(neighbour.token);
    assert.equal(mirror.length, 1, `el vecino ve ${mirror.length} filas`);
    assert.equal(mirror[0].profileId, observer.profileId, 'el vecino no ve al observador');
    assert.ok(!ids(mirror).includes(neighbour.profileId), 'el vecino se ve a sí mismo');
  });

  test('distanceM/bearingDeg son relativos al observador, no al ancla de la zona', async () => {
    await renewScene();
    const page = await rows(observer.token);
    const other = page.find((row) => row.profileId === neighbour.profileId);
    assert.ok(other, 'el otro humano no está en la página');

    // ANCHOR→NEAR son ~945 m al sudeste. Contra el ancla daría 0 (los dos
    // humanos están en el mismo polígono), que es exactamente la deuda que S3-B
    // dejó abierta: el número tiene que medirse desde el observador.
    assert.ok(
      other.distanceM > 900 && other.distanceM < 1_000,
      `distanceM=${other.distanceM}: no se midió desde el observador`,
    );
    assert.ok(
      other.bearingDeg > 110 && other.bearingDeg < 140,
      `bearingDeg=${other.bearingDeg}: el rumbo no apunta al sudeste`,
    );

    // Y es simétrico: el vecino mide el mismo par de puntos desde su lado.
    await renewScene();
    const mirror = await rows(neighbour.token);
    const back = mirror.find((row) => row.profileId === observer.profileId);
    assert.ok(back);
    assert.ok(Math.abs(back.distanceM - other.distanceM) <= 1, 'ida y vuelta no miden lo mismo');
  });

  test('radio: filtra por distancia real y no clampa fuera de rango', async () => {
    await renewScene();
    // El vecino está a 945 m del observador: un radio de 900 lo deja afuera y
    // uno de 1000 lo incluye, así que el filtro es la distancia medida.
    const tight = await rows(observer.token, { radiusM: 900 });
    assert.deepEqual(tight, [], 'radiusM=900 no filtró al vecino de 945 m');

    const wide = await rows(observer.token, { radiusM: 1000 });
    const other = wide.find((row) => row.profileId === neighbour.profileId);
    assert.ok(other, 'el vecino de 945 m no entró en el radio de 1000 m');
    assert.equal(other.distanceM, 945, 'la distancia proyectada no es la medida');
    assert.ok(wide.every((row) => row.distanceM <= 1000), 'el radio devolvió una fila más lejana');

    // El default cubre la región entera.
    assert.equal((await rows(observer.token)).length, 1);
  });

  test('zona demo sin GPS: el radar conserva el vector autorado del catálogo', async () => {
    // Sin GPS, la presencia es una zona: el observador es el origen (el ancla) y
    // el sujeto se ubica donde el catálogo lo dibuja. Si los dos cayeran en el
    // ancla, toda la región aparecería a 200 m y el radar sería un punto.
    assert.equal((await updatePresence(observer.token, { demoZoneKey: 'cdmx' })).status, 200);
    assert.equal((await updatePresence(neighbour.token, { demoZoneKey: 'cdmx' })).status, 200);
    const page = await rows(observer.token);

    const other = page.find((row) => row.profileId === neighbour.profileId);
    assert.ok(other, 'el otro humano no está en la página');
    // mx-p02 está en el catálogo a 480 m y 118° del ancla de cdmx.
    assert.equal(other.distanceM, 480, `distanceM=${other.distanceM}: no es el vector del catálogo`);
    assert.ok(
      Math.abs(other.bearingDeg - 118) <= 2,
      `bearingDeg=${other.bearingDeg}: no apunta al vector del catálogo`,
    );

    // El frame sigue siendo el observador: si el observador se mueve, la medida
    // del mismo perfil cambia (con un frame de ancla no cambiaría).
    assert.equal((await updatePresence(observer.token, at(FAR))).status, 200);
    const moved = (await rows(observer.token)).find((row) => row.profileId === neighbour.profileId);
    assert.ok(moved, 'el vecino desapareció al mover al observador');
    assert.ok(moved.distanceM > 2_000, `distanceM=${moved.distanceM}: no se midió desde el punto nuevo`);

    await renewScene();
  });

  test('filtros: intención, género, verificado y online, uno por uno y combinados', async () => {
    await renewScene();
    const all = await rows(observer.token);
    assert.equal(all.length, 1, 'el escenario necesita exactamente una contraparte');
    const [other] = all;
    assert.equal(other.profileId, neighbour.profileId);

    // La expectativa de cada filtro se deriva de la fila proyectada, no de una
    // tabla de atributos escrita a mano: el filtro es la intersección con el
    // atributo que el server proyecta.
    const keeps = async (filters) => ids(await rows(observer.token, filters));

    assert.deepEqual(
      await keeps({ intention: other.intention }),
      [other.profileId],
      `intention=${other.intention} no trajo al vecino`,
    );
    const otherIntention = ['networking', 'friendship', 'activities'].find(
      (intention) => intention !== other.intention,
    );
    assert.deepEqual(
      await keeps({ intention: otherIntention }),
      [],
      `intention=${otherIntention} no filtró`,
    );

    assert.deepEqual(
      await keeps({ gender: other.gender }),
      [other.profileId],
      `gender=${other.gender} no trajo al vecino`,
    );
    const otherGender = ['female', 'male', 'nonbinary'].find((gender) => gender !== other.gender);
    assert.deepEqual(await keeps({ gender: otherGender }), [], `gender=${otherGender} no filtró`);

    // `verified` filtra sólo cuando es `true`: el caso contrario es "sin filtro".
    assert.deepEqual(
      await keeps({ verified: true }),
      other.verified ? [other.profileId] : [],
      'verified=true no coincide con el atributo proyectado',
    );
    assert.deepEqual(await keeps({ verified: false }), [other.profileId], 'verified=false filtró');
    assert.deepEqual(await keeps({ online: true }), [other.profileId], 'online=true filtró de más');
    assert.deepEqual(await keeps({ online: false }), [other.profileId], 'online=false filtró');

    // Combinado: los filtros que el vecino cumple lo dejan, los que no, lo sacan.
    assert.deepEqual(
      await keeps({
        intention: other.intention,
        gender: other.gender,
        verified: other.verified,
        online: true,
      }),
      [other.profileId],
      'la combinación que el vecino cumple no lo trajo',
    );
    assert.deepEqual(
      await keeps({ intention: otherIntention, gender: other.gender }),
      [],
      'la combinación imposible no devuelve página vacía',
    );
    // Con radio de 200 m nadie está: la intersección incluye la distancia.
    assert.deepEqual(
      await keeps({ radiusM: 200, intention: other.intention }),
      [],
      'el radio no entró en la intersección',
    );
  });

  test('validación: radio, enums, flags y parámetros repetidos son 422', async () => {
    for (const [filters, label] of [
      [{ radiusM: 199 }, 'radio por debajo'],
      [{ radiusM: 5001 }, 'radio por encima'],
      [{ radiusM: 'abc' }, 'radio no numérico'],
      [{ radiusM: 1.5 }, 'radio con decimales'],
      [{ radiusM: '1e3' }, 'radio en notación científica'],
      [{ intention: 'nope' }, 'intención fuera del enum'],
      [{ gender: 'other' }, 'género fuera del enum'],
      [{ verified: 'maybe' }, 'flag de verificado inválido'],
      [{ online: 'si' }, 'flag de online inválido'],
      [{ radiusM: [1000, 2000] }, 'parámetro repetido'],
    ]) {
      const response = await listDiscovery(observer.token, filters);
      assert.equal(response.status, 422, `${label}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.code, 'VALIDATION_FAILED', label);
    }

    // Sin token no hay descubrimiento (ni siquiera vacío).
    const anonymous = await listDiscovery('', {});
    assert.equal(anonymous.status, 401, JSON.stringify(anonymous.body));
    assert.equal(anonymous.body.code, 'UNAUTHENTICATED');

    // El filtro vacío (`?radiusM=`) es el default, no 422.
    const blank = await listDiscovery(observer.token, { radiusM: '' });
    assert.equal(blank.status, 200, JSON.stringify(blank.body));
    assert.equal(blank.body.results.length, 1, 'un parámetro vacío dejó la página sin filas');
  });

  test('aislamiento por región: mx y co no se ven ni se cruzan', async () => {
    const coObserverSession = await openSession({ regionKey: 'co', demoSlot: 4 });
    const coSubjectSession = await openSession({ regionKey: 'co', demoSlot: 5 });
    assert.equal(coObserverSession.status, 201, JSON.stringify(coObserverSession.body));
    assert.equal(coSubjectSession.status, 201, JSON.stringify(coSubjectSession.body));
    const coObserver = coObserverSession.body;
    const coSubject = coSubjectSession.body;
    await renew([
      { token: coObserver.token, point: CO_ANCHOR },
      { token: coSubject.token, point: CO_NEAR },
    ]);
    await extendPresence([sessionIdOf(coObserver.token), sessionIdOf(coSubject.token)], 600);

    await renewScene();
    const mxPage = await rows(observer.token);
    const coPage = await rows(coObserver.token);

    assert.ok(mxPage.every((row) => row.regionKey === 'mx'), 'mx ve perfiles de otra región');
    assert.ok(coPage.every((row) => row.regionKey === 'co'), 'co ve perfiles de otra región');
    assert.ok(!ids(mxPage).some((id) => id.startsWith('co-')), 'mx ve co');
    assert.ok(!ids(coPage).some((id) => id.startsWith('mx-')), 'co ve mx');
    // La misma regla de negocio en co: 1 contraparte, la del sujeto de co.
    assert.deepEqual(ids(coPage), [coSubject.profileId], 'co no ve a su par');

    await logout(coObserver.token);
    await logout(coSubject.token);
  });

  test('ghost: sin presencia viva el perfil desaparece en el acto y no ve a nadie', async () => {
    await renewScene();
    const before = await rows(observer.token);
    assert.deepEqual(ids(before), [neighbour.profileId]);

    assert.equal((await clearPresence(neighbour.token)).status, 204);

    // Sin relleno sintético no queda nada: una persona sola es una página vacía,
    // no un error ni una lista de perfiles propios.
    assert.deepEqual(await rows(observer.token), [], 'el ghost del vecino dejó filas a la vista');

    // Y el que entró en ghost no descubre a nadie: invisible ⇒ ciego.
    assert.deepEqual(await rows(neighbour.token), [], 'un ghost ve a los demás');

    // La sesión sigue viva (ghost es pausa de presencia, no logout).
    assert.equal((await listDiscovery(neighbour.token)).status, 200);

    // Al volver, vuelve la fila.
    assert.equal((await updatePresence(neighbour.token, at(NEAR))).status, 200);
    const back = await rows(observer.token);
    assert.deepEqual(ids(back), [neighbour.profileId], 'el perfil no volvió al reaparecer');
  });
});

describe('discovery: densidad de una región completa', () => {
  let snapshot = [];
  /** 5 humanos vivos en mx: el observador y 4 más. */
  let humans = [];

  before(async () => {
    await assertStackUp();
    snapshot = await snapshotSessionIds();
    const spots = [
      { lat: 19.44, lng: -99.127297 }, // el observador, en el ancla
      { lat: 19.422, lng: -99.13 },
      { lat: 19.426, lng: -99.14 },
      { lat: 19.43, lng: -99.11 },
      { lat: 19.434, lng: -99.15 },
    ];
    for (const [index, demoSlot] of [6, 7, 8, 9, 10].entries()) {
      const session = await openSession({ regionKey: 'mx', demoSlot });
      assert.equal(session.status, 201, JSON.stringify(session.body));
      const human = { ...session.body, sessionId: sessionIdOf(session.body.token), spot: spots[index] };
      assert.equal((await updatePresence(human.token, at(human.spot))).status, 200);
      humans.push(human);
    }
    await extendPresence(
      humans.map((human) => human.sessionId),
      600,
    );
  });

  after(async () => {
    for (const human of humans) await logout(human.token);
    await deleteSessionsCreatedSince(snapshot);
  });

  test('5 humanos vivos: cada uno ve las otras 4 personas y nada más', async () => {
    const observer = humans[0];
    const others = humans.slice(1);

    const page = await rows(observer.token);
    assert.equal(page.length, 4, `se esperaban 4 contrapartes (${page.length})`);
    assert.deepEqual(
      ids(page).sort(),
      others.map((human) => human.profileId).sort(),
      'la página no es el resto de la región',
    );
    assert.ok(page.every((row) => row.sourceType === 'human'), 'hay filas que no son humanos');
    assert.ok(!ids(page).includes(observer.profileId), 'el observador se ve a sí mismo');

    // Sin tope de página alcanzado: 10 slots por región dejan 9 contrapartes
    // como máximo, así que lo que se fija es la paridad N−1 y el orden por
    // distancia, no un corte.
    const sorted = [...page].sort(
      (left, right) => left.distanceM - right.distanceM || left.profileId.localeCompare(right.profileId),
    );
    assert.deepEqual(ids(page), ids(sorted), 'la página no está ordenada por distancia');

    // Dos lecturas seguidas del mismo instante devuelven el mismo conjunto.
    const again = await rows(observer.token);
    assert.deepEqual(ids(again), ids(page), 'dos lecturas del mismo instante difieren');

    // Y el espejo: cada uno de los otros ve exactamente 4, con el observador.
    for (const other of others) {
      const mirror = await rows(other.token);
      assert.equal(mirror.length, 4, `${other.profileId} ve ${mirror.length} filas`);
      assert.ok(ids(mirror).includes(observer.profileId), `${other.profileId} no ve al observador`);
    }
  });
});
