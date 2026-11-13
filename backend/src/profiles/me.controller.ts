import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { CurrentSession } from '../auth/current-session.decorator';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import type { AuthContext } from '../auth/session.types';
import { AppProblemError } from '../common/problem';
import { ProfilesService, type SelfProfile } from './profiles.service';

/**
 * `GET /me` — `getSelfProfile` del contrato (delta v0.4).
 *
 * El tab Perfil mostraba el `self` del dataset, que es el perfil equivocado en
 * cuanto alguien entra con otro slot. Esta operation devuelve la fila del
 * catálogo que la sesión reclamó.
 *
 * **Un invitado no tiene perfil.** Cuando los 10 slots están ocupados la sesión
 * es de relleno y no hay fila de catálogo: `404 PROFILE_NOT_FOUND`, el mismo
 * código que un perfil borrado por un seed nuevo. La credencial sirve; el
 * recurso no está.
 *
 * `cache-control: no-store` porque "quién soy" depende del token: cachearlo en
 * un intermediario devolvería el perfil de otra sesión.
 */
@Controller('me')
@UseGuards(DemoSessionGuard)
export class MeController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @Header('cache-control', 'no-store')
  async me(@CurrentSession() session: AuthContext): Promise<SelfProfile> {
    const profile = await this.profiles.findSelf(session.regionKey, session.profileId);
    if (profile === undefined) {
      throw new AppProblemError(
        'PROFILE_NOT_FOUND',
        'La sesión actual no tiene perfil de catálogo (invitado o perfil borrado por un seed nuevo).',
      );
    }
    return profile;
  }
}
