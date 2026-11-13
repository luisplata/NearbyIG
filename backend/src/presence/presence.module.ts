import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BotsModule } from '../bots/bots.module';
import { EventsModule } from '../events/events.module';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

/**
 * `PresenceModule` importa `AuthModule` por `DemoSessionGuard`, `BotsModule`
 * porque el ghost retira los bots propios, y `EventsModule` porque la transición
 * de presencia emite `profile.presence`. La presencia no abre una capacidad de
 * lectura de perfiles: sólo escribe su estado y dos eventos.
 */
@Module({
  imports: [AuthModule, BotsModule, EventsModule],
  controllers: [PresenceController],
  providers: [PresenceService],
})
export class PresenceModule {}
