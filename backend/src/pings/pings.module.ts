import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PingsController } from './pings.controller';
import { PingsService } from './pings.service';

/**
 * Pings y matches (Sprint 4).
 *
 * Importa `AuthModule` por `DemoSessionGuard`. La existencia del destinatario
 * se resuelve en SQL contra `profiles`, con el mismo criterio que la bandeja:
 * un perfil sin fila de catálogo no existe y el ping es 404.
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
