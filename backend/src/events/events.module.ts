import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BotsModule } from '../bots/bots.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { WorldTickerService } from './world-ticker.service';

/**
 * Eventos y mundo vivo.
 *
 *   EventsService      → log, cursor, retención y la **única** proyección
 *   WorldTickerService → ticker que mueve los bots y escribe `profile.moved`
 *   EventsController   → `GET /events` (SSE) y `GET /events/poll`
 *
 * `EventsService` se exporta porque `PresenceModule` emite `profile.presence`
 * desde el PUT y el DELETE de presencia: el dueño del log es uno, y nadie más
 * escribe `events` por su cuenta.
 */
@Module({
  imports: [AuthModule, BotsModule],
  controllers: [EventsController],
  providers: [EventsService, WorldTickerService],
  exports: [EventsService],
})
export class EventsModule {}
