import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

/**
 * `PresenceModule` importa `AuthModule` por `DemoSessionGuard` y `EventsModule`
 * porque la transición de presencia emite `profile.presence`. La presencia no
 * abre una capacidad de lectura de perfiles: sólo escribe su estado y dos
 * eventos.
 */
@Module({
  imports: [AuthModule, EventsModule],
  controllers: [PresenceController],
  providers: [PresenceService],
})
export class PresenceModule {}
