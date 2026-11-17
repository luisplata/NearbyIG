import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';

/**
 * `GET /discovery` (Sprint 3).
 *
 * Importa `AuthModule` por `DemoSessionGuard`. No hay migración ni tabla nueva:
 * discovery es una **proyección de lectura** sobre `profiles`, `presence`,
 * `sessions` y `blocks`.
 */
@Module({
  imports: [AuthModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
})
export class DiscoveryModule {}
