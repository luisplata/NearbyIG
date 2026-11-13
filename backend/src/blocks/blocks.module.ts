import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

/**
 * `BlocksModule` sólo necesita `AuthModule` por `DemoSessionGuard` y el pool
 * global de `DatabaseModule`. No emite eventos: bloquear no es un hecho del
 * mundo que los demás vean (el bloqueado no se entera).
 */
@Module({
  imports: [AuthModule],
  controllers: [BlocksController],
  providers: [BlocksService],
})
export class BlocksModule {}
