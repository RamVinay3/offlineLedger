import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ReminderRepository } from '../repositories/reminder.repository';
import { ReminderType } from '../models';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  constructor(private reminderRepo: ReminderRepository) {
    this.createNotificationChannel();
  }

  async createNotificationChannel(): Promise<void> {
    try {
      await LocalNotifications.createChannel({
        id: 'loop-due-reminders',
        name: 'LOOP Due Date Reminders',
        description: 'Notifications for upcoming and overdue loans, items, and commitments',
        importance: 4,
        visibility: 1,
        vibration: true,
      });
    } catch {
      // Web or non-Android platform
    }
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const status = await LocalNotifications.requestPermissions();
      return status.display === 'granted';
    } catch {
      // Web notification fallback
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const perm = await Notification.requestPermission();
        return perm === 'granted';
      }
      return false;
    }
  }

  /**
   * Schedule local reminders for an obligation
   */
  async scheduleObligationReminders(data: {
    obligationId: string;
    personId: string;
    personName: string;
    title: string;
    type: string;
    direction: string;
    dueDate: string;
  }): Promise<void> {
    const due = new Date(data.dueDate);
    const now = new Date();

    // 1. One day before at 9:00 AM
    const oneDayBefore = new Date(due);
    oneDayBefore.setDate(oneDayBefore.getDate() - 1);
    oneDayBefore.setHours(9, 0, 0, 0);

    // 2. On due date at 9:00 AM
    const onDueDate = new Date(due);
    onDueDate.setHours(9, 0, 0, 0);

    const verb = data.direction === 'LENT' ? 'is due from' : 'is due to';

    // Schedule One Day Before if in the future
    if (oneDayBefore > now) {
      await this.scheduleSingleNotification({
        id: this.generateNotificationId(data.obligationId, 1),
        obligationId: data.obligationId,
        personId: data.personId,
        title: `LOOP: Due Tomorrow`,
        body: `"${data.title}" ${verb} ${data.personName} tomorrow.`,
        scheduleAt: oneDayBefore,
        reminderType: 'ONE_DAY_BEFORE',
      });
    }

    // Schedule On Due Date if in the future
    if (onDueDate > now) {
      await this.scheduleSingleNotification({
        id: this.generateNotificationId(data.obligationId, 2),
        obligationId: data.obligationId,
        personId: data.personId,
        title: `LOOP: Due Today`,
        body: `"${data.title}" ${verb} ${data.personName} is due today!`,
        scheduleAt: onDueDate,
        reminderType: 'ON_DUE_DATE',
      });
    }
  }

  private async scheduleSingleNotification(params: {
    id: number;
    obligationId: string;
    personId: string;
    title: string;
    body: string;
    scheduleAt: Date;
    reminderType: ReminderType;
  }): Promise<void> {
    try {
      // Record reminder in SQLite
      await this.reminderRepo.createReminder({
        obligationId: params.obligationId,
        personId: params.personId,
        reminderType: params.reminderType,
        reminderDate: params.scheduleAt.toISOString(),
      });

      // Schedule with Capacitor LocalNotifications
      await LocalNotifications.schedule({
        notifications: [
          {
            id: params.id,
            title: params.title,
            body: params.body,
            schedule: { at: params.scheduleAt },
            sound: 'beep.wav',
            smallIcon: 'ic_stat_icon_config_sample',
            channelId: 'loop-due-reminders',
          },
        ],
      });
    } catch (e) {
      console.log('Local notification scheduled in local DB (Capacitor native bypassed on web):', params);
    }
  }

  /**
   * Cancel reminders for a completed or cancelled obligation
   */
  async cancelRemindersForObligation(obligationId: string): Promise<void> {
    try {
      const id1 = this.generateNotificationId(obligationId, 1);
      const id2 = this.generateNotificationId(obligationId, 2);
      await LocalNotifications.cancel({
        notifications: [{ id: id1 }, { id: id2 }],
      });
    } catch {
      // Ignore if not scheduled or on web
    }
  }

  private generateNotificationId(obligationId: string, suffix: number): number {
    let hash = 0;
    for (let i = 0; i < obligationId.length; i++) {
      hash = (hash << 5) - hash + obligationId.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash * 10 + suffix) % 2147483647;
  }
}
