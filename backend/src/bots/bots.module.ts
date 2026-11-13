import { Module } from '@nestjs/common';
import { BotsService } from './bots.service';

/**
 * Bots derivados. No tiene controllers: en S2 los bots no se piden, se ven a
 * través del stream de eventos (`EventsModule`). El módulo existe para que
 * `BotsService` sea el único dueño de la geometría y de la visibilidad, y para
 * que S3 (`GET /discovery`) lo inyecte sin copiar el cap ni el filtro de ghost.
 */
@Module({
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
