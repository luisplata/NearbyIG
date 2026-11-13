import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

/**
 * `PresenceModule` importa `AuthModule` sólo por `DemoSessionGuard`: la
 * presencia no abre una capacidad de lectura de perfiles.
 */
@Module({
  imports: [AuthModule],
  controllers: [PresenceController],
  providers: [PresenceService],
})
export class PresenceModule {}
