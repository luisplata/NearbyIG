import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * `NotificationsModule` sólo lee y marca la tabla: los inserts los hacen
 * `PingsModule` y `ChatModule` en su propia transacción, para que el aviso no
 * pueda faltar cuando el hecho existe. No emite eventos: la campana se refresca
 * con `GET /notifications`, no con un tipo nuevo en el stream.
 */
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
