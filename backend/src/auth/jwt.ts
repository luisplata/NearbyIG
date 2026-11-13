import jwt from 'jsonwebtoken';
import { AppProblemError } from '../common/problem';
import type { AuthContext, SourceType } from './session.types';

/**
 * JWT de sesión demo: HS256, corto, sin refresh.
 *
 * El token no guarda estado por sí solo (`sub`/`sid` apuntan a `sessions`), así
 * que un logout sólo necesita marcar la fila: el token sigue siendo
 * criptográficamente válido pero el guard lo rechaza.
 *
 * `Authorization` es el único lugar donde viaja. No se acepta en query, cookie
 * ni body: el ticket efímero de S2 es la única excepción y existe porque
 * `EventSource` no puede mandar headers.
 */
export const JWT_ISSUER = 'nearbyig-api';
export const JWT_AUDIENCE = 'nearbyig-demo';

interface SessionClaims {
  sid: string;
  regionKey: string;
  profileId: string;
  demoSlot: number | null;
  sourceType: SourceType;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

const SOURCE_TYPES: readonly SourceType[] = ['human', 'bot', 'guest'];

export interface IssueSessionInput {
  readonly sessionId: string;
  readonly regionKey: string;
  readonly profileId: string;
  readonly demoSlot: number | null;
  readonly sourceType: SourceType;
  readonly tokenId: string;
  readonly ttlSeconds: number;
}

export function issueSessionToken(input: IssueSessionInput, secret: string): string {
  return jwt.sign(
    {
      sid: input.sessionId,
      regionKey: input.regionKey,
      profileId: input.profileId,
      demoSlot: input.demoSlot,
      sourceType: input.sourceType,
    },
    secret,
    {
      algorithm: 'HS256',
      expiresIn: input.ttlSeconds,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: input.tokenId,
    },
  );
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function verifySessionToken(token: string, secret: string): AuthContext {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch {
    // Firmas vencidas, alteradas o de otro issuer: mismo 401, sin detalle útil
    // para quien intenta adivinar.
    throw new AppProblemError('UNAUTHENTICATED', 'El token de sesión no es válido o venció.');
  }
  if (typeof payload === 'string') {
    throw new AppProblemError('UNAUTHENTICATED', 'El token de sesión no es válido.');
  }
  const { sid, regionKey, profileId, demoSlot, sourceType } = payload as Partial<SessionClaims>;
  if (!isString(sid) || !isString(regionKey) || !isString(profileId) || !isString(sourceType)) {
    throw new AppProblemError('UNAUTHENTICATED', 'El token de sesión no tiene los claims esperados.');
  }
  if (!SOURCE_TYPES.includes(sourceType as SourceType)) {
    throw new AppProblemError('UNAUTHENTICATED', 'El token de sesión declara un origen desconocido.');
  }
  const slot = demoSlot ?? null;
  if (slot !== null && (!Number.isInteger(slot) || slot < 1 || slot > 10)) {
    throw new AppProblemError('UNAUTHENTICATED', 'El token de sesión declara un slot inválido.');
  }
  if (sourceType === 'guest' ? slot !== null : slot === null) {
    throw new AppProblemError('UNAUTHENTICATED', 'El token de sesión rompe el invariante guest/slot.');
  }
  return {
    sessionId: sid,
    regionKey,
    profileId,
    demoSlot: slot,
    sourceType: sourceType as SourceType,
  };
}
