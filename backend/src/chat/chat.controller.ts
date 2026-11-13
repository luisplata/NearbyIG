import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentSession } from '../auth/current-session.decorator';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import type { AuthContext } from '../auth/session.types';
import { ChatService } from './chat.service';
import type { MatchList, Message, MessagePage } from './chat.types';

/**
 * `contract/paths/matches.yaml` — el chat de S4 (delta v0.4).
 *
 *   GET  /matches/{matchId}/messages   → 200 MessagePage
 *   POST /matches/{matchId}/messages   → 201 Message
 *   POST /matches/{matchId}/read       → 204
 *   GET  /matches                      → 200 MatchList
 *
 * El body y el cursor se reciben como `unknown` a propósito: el shape que sale
 * por HTTP vive en `contract/schemas/chat.yaml` y validarlo con decoradores sería
 * una segunda copia que ningún gate compara. La validación está en el service,
 * al lado del SQL que la necesita.
 *
 * Todo hereda `demoSession`: sin token es 401 `UNAUTHENTICATED`. Las responses
 * llevan `cache-control: no-store` porque una conversación es estado de dos
 * perfiles y no se cachea en ningún intermediario.
 */
@Controller('matches')
@UseGuards(DemoSessionGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @Header('cache-control', 'no-store')
  list(@CurrentSession() session: AuthContext): Promise<MatchList> {
    return this.chat.listMatches(session);
  }

  @Get(':matchId/messages')
  @Header('cache-control', 'no-store')
  messages(
    @Param('matchId') matchId: string,
    @Query('cursor') cursor: unknown,
    @CurrentSession() session: AuthContext,
  ): Promise<MessagePage> {
    return this.chat.listMessages(session, matchId, cursor);
  }

  @Post(':matchId/messages')
  @Header('cache-control', 'no-store')
  send(
    @Param('matchId') matchId: string,
    @Body() body: unknown,
    @CurrentSession() session: AuthContext,
  ): Promise<Message> {
    return this.chat.send(session, matchId, body);
  }

  @Post(':matchId/read')
  @HttpCode(204)
  @Header('cache-control', 'no-store')
  async read(@Param('matchId') matchId: string, @CurrentSession() session: AuthContext): Promise<void> {
    await this.chat.markRead(session, matchId);
  }
}
