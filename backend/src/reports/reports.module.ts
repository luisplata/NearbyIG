import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * `ReportsModule` sólo necesita `AuthModule` por `DemoSessionGuard`. No emite
 * eventos ni notificaciones: reportar es un registro privado, no un hecho del
 * mundo.
 */
@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
