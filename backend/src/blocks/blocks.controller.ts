import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentSession } from '../auth/current-session.decorator';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import type { AuthContext } from '../auth/session.types';
import { BlocksService } from './blocks.service';
import type { Block, BlockList } from './blocks.types';

/**
 * `contract/paths/blocks.yaml` — el bloqueo de S5 (delta v0.5).
 *
 *   GET    /blocks              → 200 BlockList
 *   POST   /blocks              → 201 Block (idempotente)
 *   DELETE /blocks/{profileId}  → 204 (idempotente)
 *
 * El body y el `profileId` del path se reciben como `unknown`: la validación vive
 * en el service, al lado del SQL que la necesita, igual que en pings y presence.
 * Todo hereda `demoSession`; `cache-control: no-store` porque la lista es estado
 * privado de un perfil.
 */
@Controller('blocks')
@UseGuards(DemoSessionGuard)
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  @Header('cache-control', 'no-store')
  list(@CurrentSession() session: AuthContext): Promise<BlockList> {
    return this.blocks.list(session);
  }

  @Post()
  @Header('cache-control', 'no-store')
  create(@Body() body: unknown, @CurrentSession() session: AuthContext): Promise<Block> {
    return this.blocks.create(session, body);
  }

  @Delete(':profileId')
  @HttpCode(204)
  @Header('cache-control', 'no-store')
  async remove(
    @Param('profileId') profileId: string,
    @CurrentSession() session: AuthContext,
  ): Promise<void> {
    await this.blocks.remove(session, profileId);
  }
}
