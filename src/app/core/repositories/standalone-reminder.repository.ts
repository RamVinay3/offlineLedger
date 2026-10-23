import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { StandaloneReminder, StandaloneReminderCategory } from '../models';

@Injectable({
  providedIn: 'root',
})
export class StandaloneReminderRepository {
  constructor(private db: DatabaseService) {}

  async getAll(includeCompleted = true): Promise<StandaloneReminder[]> {
    const sql = includeCompleted
      ? 'SELECT * FROM standalone_reminders ORDER BY reminder_date ASC, created_at DESC'
      : 'SELECT * FROM standalone_reminders WHERE is_completed = 0 ORDER BY reminder_date ASC, created_at DESC';
    const rows = await this.db.query(sql);
    return rows.map(this.mapRow);
  }

  async getUpcoming(): Promise<StandaloneReminder[]> {
    const rows = await this.db.query(
      'SELECT * FROM standalone_reminders WHERE is_completed = 0 ORDER BY reminder_date ASC'
    );
    return rows.map(this.mapRow);
  }

  async create(data: {
    title: string;
    category?: StandaloneReminderCategory;
    reminderDate: string;
    notes?: string;
  }): Promise<StandaloneReminder> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const category = data.category || 'GENERAL';

    await this.db.run(
      `INSERT INTO standalone_reminders (id, title, category, reminder_date, notes, is_completed, is_notified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [id, data.title.trim(), category, data.reminderDate, data.notes?.trim() || null, now, now]
    );

    return {
      id,
      title: data.title.trim(),
      category,
      reminderDate: data.reminderDate,
      notes: data.notes?.trim() || undefined,
      isCompleted: false,
      isNotified: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  async toggleComplete(id: string, isCompleted: boolean): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(
      'UPDATE standalone_reminders SET is_completed = ?, updated_at = ? WHERE id = ?',
      [isCompleted ? 1 : 0, now, id]
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM standalone_reminders WHERE id = ?', [id]);
  }

  async markAsNotified(id: string): Promise<void> {
    await this.db.run('UPDATE standalone_reminders SET is_notified = 1 WHERE id = ?', [id]);
  }

  private mapRow(r: any): StandaloneReminder {
    return {
      id: r.id,
      title: r.title,
      category: r.category as StandaloneReminderCategory,
      reminderDate: r.reminder_date,
      notes: r.notes || undefined,
      isCompleted: Boolean(r.is_completed),
      isNotified: Boolean(r.is_notified),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
