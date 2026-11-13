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
