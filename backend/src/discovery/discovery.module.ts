import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BotsModule } from '../bots/bots.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';

/**
 * `GET /discovery` (Sprint 3).
 *
 * Importa `AuthModule` por `DemoSessionGuard` y `BotsModule` porque el conjunto
 * de bots visibles —propios incluidos, cap 6, ghost del dueño— lo define
 * `BotsService` una sola vez: discovery y el stream de eventos tienen que ver
 * los mismos bots, y la forma de garantizarlo es no tener dos consultas.
 *
 * No hay migración ni tabla nueva: discovery es una **proyección de lectura**
 * sobre `profiles`, `presence`, `sessions` y `bots`.
 */
@Module({
  imports: [AuthModule, BotsModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
})
export class DiscoveryModule {}
