import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/**
 * Chat de Sprint 4 (delta v0.4).
 *
 *   ChatController → `GET /matches`, mensajes y `read`
 *   ChatService    → participación, idempotencia y unread
 *
 * Importa `AuthModule` por `DemoSessionGuard` y `EventsModule` porque el chat no
 * escribe el log de eventos por su cuenta: `message.created` sale por
 * `EventsService.append`, que es el único dueño de `events` (el mismo
 * camino que usa presencia). Así el envelope, el `seq` por región y la
 * retención no se duplican en un segundo lugar.
 *
 * La existencia del otro lado se resuelve en SQL contra `profiles`, igual que en
 * la bandeja de pings: un match cuyo peer no tiene fila de catálogo se lee pero
 * no se escribe.
 */
@Module({
  imports: [AuthModule, EventsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
