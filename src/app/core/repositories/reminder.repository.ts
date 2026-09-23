import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { Reminder, ReminderType } from '../models';

@Injectable({
  providedIn: 'root',
})
export class ReminderRepository {
  constructor(private db: DatabaseService) {}

  async createReminder(data: {
    obligationId: string;
    personId: string;
    reminderType: ReminderType;
    reminderDate: string;
  }): Promise<Reminder> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db.run(
      `INSERT INTO reminders (id, obligation_id, person_id, reminder_type, reminder_date, is_notified, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [id, data.obligationId, data.personId, data.reminderType, data.reminderDate, now]
    );

    return {
      id,
      obligationId: data.obligationId,
      personId: data.personId,
      reminderType: data.reminderType,
      reminderDate: data.reminderDate,
      isNotified: false,
      createdAt: now,
    };
  }

  async getRemindersForObligation(obligationId: string): Promise<Reminder[]> {
    const rows = await this.db.query<any>(
      'SELECT * FROM reminders WHERE obligation_id = ? ORDER BY reminder_date ASC',
      [obligationId]
    );
    return rows.map((r) => ({
      id: r.id,
      obligationId: r.obligation_id,
      personId: r.person_id,
      reminderType: r.reminder_type as ReminderType,
      reminderDate: r.reminder_date,
      isNotified: Boolean(r.is_notified),
      createdAt: r.created_at,
    }));
  }

  async markAsNotified(id: string): Promise<void> {
    await this.db.run('UPDATE reminders SET is_notified = 1 WHERE id = ?', [id]);
  }
}
