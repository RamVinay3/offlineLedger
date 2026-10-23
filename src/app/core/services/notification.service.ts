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

  /**
   * Schedule notification for a standalone reminder (interview, bill, etc.)
   */
  async scheduleStandaloneReminder(reminder: {
    id: string;
    title: string;
    category?: string;
    reminderDate: string;
    notes?: string;
  }): Promise<void> {
    const scheduledDate = new Date(reminder.reminderDate);
    const now = new Date();
    if (scheduledDate <= now) return;

    const notifId = this.generateNotificationId(reminder.id, 9);
    const categoryPrefix = reminder.category ? `[${reminder.category}] ` : '';

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: `LOOP Reminder: ${categoryPrefix}${reminder.title}`,
            body: reminder.notes || `Reminder: ${reminder.title}`,
            schedule: { at: scheduledDate },
            sound: 'beep.wav',
            smallIcon: 'ic_stat_icon_config_sample',
            channelId: 'loop-due-reminders',
          },
        ],
      });
    } catch {
      console.log('Standalone notification scheduled (Capacitor native bypassed on web):', reminder);
    }
  }

  async cancelStandaloneReminder(reminderId: string): Promise<void> {
    try {
      const notifId = this.generateNotificationId(reminderId, 9);
      await LocalNotifications.cancel({
        notifications: [{ id: notifId }],
      });
    } catch {
      // Ignore if on web or not scheduled
    }
  }

  /**
   * Schedule local reminder for a recurring payment (e.g. 1 day before due date at specified time)
   */
  async scheduleRecurringPaymentReminder(payment: {
    id: string;
    title: string;
    amount: number;
    currency: string;
    direction: string;
    frequency: string;
    nextDueDate: string;
    reminderDaysBefore?: number;
    reminderTime?: string;
    personName?: string;
  }): Promise<void> {
    const parts = payment.nextDueDate.split('-').map(Number);
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];

    const targetDate = new Date(year, month - 1, day);
    const daysBefore = payment.reminderDaysBefore ?? 1;
    targetDate.setDate(targetDate.getDate() - daysBefore);

    const timeParts = (payment.reminderTime || '09:00').split(':').map(Number);
    targetDate.setHours(timeParts[0] || 9, timeParts[1] || 0, 0, 0);

    const now = new Date();
    if (targetDate <= now) return;

    const notifId = this.generateNotificationId(payment.id, 8);
    const verb = payment.direction === 'PAY' ? 'to pay' : 'to receive';
    const relativeTime = daysBefore === 0 ? 'due today' : daysBefore === 1 ? 'due tomorrow' : `due in ${daysBefore} days`;
    const personSuffix = payment.personName ? ` (${payment.personName})` : '';

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: `LOOP: Recurring ${payment.title} ${relativeTime}`,
            body: `${payment.currency}${payment.amount.toLocaleString()} ${verb}${personSuffix}. Frequency: ${payment.frequency.toLowerCase()}`,
            schedule: { at: targetDate },
            sound: 'beep.wav',
            smallIcon: 'ic_stat_icon_config_sample',
            channelId: 'loop-due-reminders',
          },
        ],
      });
    } catch {
      console.log('Recurring notification scheduled (Capacitor native bypassed on web):', payment);
    }
  }

  async cancelRecurringPaymentReminder(paymentId: string): Promise<void> {
    try {
      const notifId = this.generateNotificationId(paymentId, 8);
      await LocalNotifications.cancel({
        notifications: [{ id: notifId }],
      });
    } catch {
      // Ignore if on web or not scheduled
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
