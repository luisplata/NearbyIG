import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/**
 * Chat de Sprint 4 (delta v0.4).
 *
 *   ChatController → `GET /matches`, mensajes y `read`
 *   ChatService    → participación, idempotencia, unread y el bot que responde
 *
 * Importa `AuthModule` por `DemoSessionGuard` y `EventsModule` porque el chat no
 * escribe el log de eventos por su cuenta: `message.created` y `typing.started`
 * salen por `EventsService.append`, que es el único dueño de `events` (el mismo
 * camino que usa presencia). Así el envelope, el `seq` por región y la
 * retención no se duplican en un segundo lugar.
 *
 * No importa `BotsModule`: la existencia y la identidad del bot se resuelven en
 * SQL contra `bots`/`profiles`, igual que en la bandeja de pings. Pedirle ese
 * dato al servicio de bots obligaría a exportar un "este bot existe" que ese
 * módulo no necesita para moverse.
 */
@Module({
  imports: [AuthModule, EventsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
