import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MeController } from './me.controller';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

/**
 * Catálogo de perfiles.
 *
 *   ProfilesController → `GET /demo/profiles` (S1)
 *   MeController       → `GET /me` (delta v0.4): el perfil de la propia sesión
 *
 * Los dos leen la misma tabla y la misma lista blanca de campos; el service es
 * uno. `GET /me` no es "el perfil del catálogo" sino el que la sesión encarna:
 * por eso vive en un controller aparte y no como query de `/demo/profiles`.
 */
@Module({
  imports: [AuthModule],
  controllers: [ProfilesController, MeController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
