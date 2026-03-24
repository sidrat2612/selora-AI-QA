import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, limit = 30) {
    return this.prisma.appNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async unreadCount(userId: string) {
    return this.prisma.appNotification.count({
      where: { userId, read: false },
    });
  }

  async markRead(userId: string, notificationId: string) {
    return this.prisma.appNotification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.appNotification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async create(params: {
    userId: string;
    type: string;
    title: string;
    message?: string;
    entityType?: string;
    entityId?: string;
  }) {
    return this.prisma.appNotification.create({ data: params });
  }
}
