import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppProblemError } from '../common/problem';
import type { AuthContext } from './session.types';

/** La sesión que dejó `DemoSessionGuard`. Si falta, es un error de wiring, no del cliente. */
export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => {
  const request = context.switchToHttp().getRequest<{ session?: AuthContext }>();
  if (request.session === undefined) {
    throw new AppProblemError('UNAUTHENTICATED', 'La request no pasó por el guard de sesión demo.');
  }
  return request.session;
});
