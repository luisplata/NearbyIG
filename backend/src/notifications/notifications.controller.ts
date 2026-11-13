import { Body, Controller, Get, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentSession } from '../auth/current-session.decorator';
import { DemoSessionGuard } from '../auth/demo-session.guard';
import type { AuthContext } from '../auth/session.types';
import { NotificationsService } from './notifications.service';
import type { NotificationList, NotificationReadResult } from './notifications.types';

/**
 * `contract/paths/notifications.yaml` — la campana de S5 (delta v0.5).
 *
 *   GET  /notifications       → 200 NotificationList (items + unreadCount)
 *   POST /notifications/read  → 200 NotificationReadResult (todas o por id)
 *
 * Todo hereda `demoSession`; `cache-control: no-store` porque la campana es
 * estado de lectura de un perfil. El body del `read` llega como `unknown` y se
 * valida en el service.
 */
@Controller('notifications')
@UseGuards(DemoSessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header('cache-control', 'no-store')
  list(@CurrentSession() session: AuthContext): Promise<NotificationList> {
    return this.notifications.list(session);
  }

  @Post('read')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  read(@Body() body: unknown, @CurrentSession() session: AuthContext): Promise<NotificationReadResult> {
    return this.notifications.markRead(session, body);
  }
}
