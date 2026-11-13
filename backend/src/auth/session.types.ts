/** Tipos de la sesión demo, alineados con `contract/schemas/auth.yaml`. */

export type SourceType = 'human' | 'bot' | 'guest';

/** Lo que devuelve `POST /auth/demo-session` (`DemoSession`). */
export interface DemoSession {
  readonly token: string;
  readonly expiresAt: string;
  readonly regionKey: string;
  readonly profileId: string;
  readonly demoSlot: number | null;
  readonly sourceType: SourceType;
}

/**
 * Lo que devuelve `POST /auth/stream-ticket` (`StreamTicket`): valor opaco y
 * vencimiento absoluto. El valor no se persiste (sólo su hash) y no se loguea.
 */
export interface StreamTicket {
  readonly ticket: string;
  readonly expiresAt: string;
}

/** Contexto que el guard deja en la request ya autenticada. */
export interface AuthContext {
  readonly sessionId: string;
  readonly regionKey: string;
  readonly profileId: string;
  readonly demoSlot: number | null;
  readonly sourceType: SourceType;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  session?: AuthContext;
}
