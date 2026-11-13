import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PingsController } from './pings.controller';
import { PingsService } from './pings.service';

/**
 * Pings y matches (Sprint 4).
 *
 * Importa `AuthModule` por `DemoSessionGuard`. No importa `BotsModule`: la
 * existencia de un bot y su dueño vivo se resuelve en SQL contra `bots` y
 * `presence`, con el mismo predicado que usa el ticker (`OWNER_VISIBLE`). Pedirle
 * el dato a `BotsService` obligaría a exportar "este bot existe y está vivo", que
 * hoy no existe como método y no hace falta para no duplicar una consulta que es
 * de una sola fila.
 *
 * Dos tablas (`pings`, `matches`) y ninguna dependencia de geometría: un ping no
 * guarda ni proyecta coordenadas.
 */
@Module({
  imports: [AuthModule],
  controllers: [PingsController],
  providers: [PingsService],
})
export class PingsModule {}
