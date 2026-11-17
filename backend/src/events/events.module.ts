import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/**
 * Eventos.
 *
 *   EventsService    → log, cursor, retención y la **única** proyección
 *   EventsController → `GET /events` (SSE) y `GET /events/poll`
 *
 * `EventsService` se exporta porque `PresenceModule` emite `profile.presence`
 * desde el PUT y el DELETE de presencia: el dueño del log es uno, y nadie más
 * escribe `events` por su cuenta.
 */
@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
