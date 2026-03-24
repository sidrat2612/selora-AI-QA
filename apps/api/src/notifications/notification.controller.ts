import { Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { success } from '../common/response';
import type { AppRequest } from '../common/types';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  async list(
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    const [items, unreadCount] = await Promise.all([
      this.notificationService.listForUser(auth.user.id),
      this.notificationService.unreadCount(auth.user.id),
    ]);
    return success({ items, unreadCount }, { requestId: request.requestId });
  }

  @Patch(':notificationId/read')
  @UseGuards(SessionAuthGuard)
  async markRead(
    @Param('notificationId') notificationId: string,
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    await this.notificationService.markRead(auth.user.id, notificationId);
    return success({ marked: true }, { requestId: request.requestId });
  }

  @Patch('read-all')
  @UseGuards(SessionAuthGuard)
  async markAllRead(
    @CurrentAuth() auth: NonNullable<AppRequest['auth']>,
    @Req() request: AppRequest,
  ) {
    await this.notificationService.markAllRead(auth.user.id);
    return success({ marked: true }, { requestId: request.requestId });
  }
}
