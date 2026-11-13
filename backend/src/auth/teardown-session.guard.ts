import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { AppProblemError } from '../common/problem';
import { readBearerToken } from './demo-session.guard';
import { verifySessionToken } from './jwt';
import type { AuthContext, AuthenticatedRequest } from './session.types';

/**
 * Guard de las operations de **desarme** (`POST /auth/logout`,
 * `POST /demo/reset/self`).
 *
 * Verifica la firma del JWT y nada más: no consulta `sessions`. Es la
 * diferencia con `DemoSessionGuard`, y es deliberada.
 *
 * El contrato pide que `logout` sea idempotente ("cerrar una sesión ya cerrada
 * no rompe nada"). Con el guard estricto, el segundo logout de la misma sesión
 * recibiría 401 antes de llegar al handler, y la única forma de que el cliente
 * cierre dos veces sin error sería inventar estado del lado del cliente. Acá la
 * credencial se autentica por firma y el handler hace un no-op si la fila ya
 * está revocada o no existe.
 *
 * Por qué no es un agujero: estas dos operations no leen ni emiten nada. El
 * único efecto posible sobre una sesión ya revocada es volver a revocarla o
 * borrar lo que ya no está. El sigue siendo 401 para leer perfiles o pedir un
 * ticket (`DemoSessionGuard`), y un JWT vencido no pasa ni acá:
 * `verifySessionToken` valida `exp`.
 */
@Injectable()
export class TeardownSessionGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearerToken(request.headers['authorization']);
    if (token === undefined) {
      throw new AppProblemError(
        'UNAUTHENTICATED',
        'Falta el header Authorization con un bearer token de sesión demo.',
      );
    }

    const claims = verifySessionToken(token, this.config.jwtSecret);
    const session: AuthContext = {
      sessionId: claims.sessionId,
      regionKey: claims.regionKey,
      profileId: claims.profileId,
      demoSlot: claims.demoSlot,
      sourceType: claims.sourceType,
    };
    request.session = session;
    return true;
  }
}
