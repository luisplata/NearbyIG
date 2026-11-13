import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentSession } from '../auth/current-session.decorator';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import type { AuthContext } from '../auth/session.types';
import { AppProblemError } from '../common/problem';
import { parseRegionKey } from '../common/validation';
import { ProfilesService, type ProfileSummary } from './profiles.service';

export interface ProfileList {
  readonly profiles: ProfileSummary[];
}

/**
 * `GET /demo/profiles?regionKey=` — `listDemoProfiles` del contrato.
 *
 * La región es obligatoria y tiene que coincidir con la de la sesión: pedir otra
 * es 403 `REGION_MISMATCH`, no un catálogo vacío. El catálogo son siempre los
 * perfiles de una región; los invitados no están acá.
 */
@Controller('demo')
@UseGuards(DemoSessionGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('profiles')
  async list(
    @Query('regionKey') rawRegionKey: unknown,
    @CurrentSession() session: AuthContext,
  ): Promise<ProfileList> {
    const regionKey = parseRegionKey(rawRegionKey, { required: true });
    if (regionKey === undefined) {
      // `parseRegionKey` con `required: true` ya lanzó; esto deja el tipo cerrado.
      throw new AppProblemError('VALIDATION_FAILED', 'regionKey es obligatorio.');
    }
    if (regionKey !== session.regionKey) {
      throw new AppProblemError(
        'REGION_MISMATCH',
        `La sesión está en la región ${session.regionKey} y pidió perfiles de ${regionKey}.`,
      );
    }
    return { profiles: await this.profiles.listByRegion(regionKey) };
  }
}
