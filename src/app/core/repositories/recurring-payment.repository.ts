import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { ActivityRepository } from './activity.repository';
import { ObligationRepository } from './obligation.repository';
import { PaymentRepository } from './payment.repository';
import {
  RecurringPayment,
  RecurringPaymentCategory,
  RecurringPaymentDirection,
  RecurringPaymentFrequency,
} from '../models';

export function computeNextDueDate(currentDateStr: string, frequency: RecurringPaymentFrequency): string {
  const parts = currentDateStr.split('-').map(Number);
  const year = parts[0] || new Date().getFullYear();
  const month = parts[1] || new Date().getMonth() + 1;
  const day = parts[2] || new Date().getDate();

  const d = new Date(year, month - 1, day);

  switch (frequency) {
    case 'DAILY':
      d.setDate(d.getDate() + 1);
      break;
    case 'WEEKLY':
      d.setDate(d.getDate() + 7);
      break;
    case 'BIWEEKLY':
      d.setDate(d.getDate() + 14);
      break;
    case 'MONTHLY': {
      const originalDay = day;
      d.setMonth(d.getMonth() + 1);
      // Clamp if day rolled over to following month (e.g. Jan 31 -> March)
      if (d.getDate() < originalDay) {
        d.setDate(0);
      }
      break;
    }
    case 'QUARTERLY': {
      const originalDay = day;
      d.setMonth(d.getMonth() + 3);
      if (d.getDate() < originalDay) {
        d.setDate(0);
      }
      break;
    }
    case 'YEARLY': {
      d.setFullYear(d.getFullYear() + 1);
      break;
    }
    default:
      d.setMonth(d.getMonth() + 1);
      break;
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
}

@Injectable({
  providedIn: 'root',
})
export class RecurringPaymentRepository {
  constructor(
    private db: DatabaseService,
    private activityRepo: ActivityRepository,
    private obligationRepo: ObligationRepository,
    private paymentRepo: PaymentRepository
  ) {}

  async getAll(): Promise<RecurringPayment[]> {
    const sql = `
      SELECT r.*, p.name as person_name
      FROM recurring_payments r
      LEFT JOIN people p ON r.person_id = p.id
      ORDER BY r.next_due_date ASC, r.created_at DESC
    `;
    const rows = await this.db.query(sql);
    return rows.map(this.mapRow);
  }

  async getActive(): Promise<RecurringPayment[]> {
    const sql = `
      SELECT r.*, p.name as person_name
      FROM recurring_payments r
      LEFT JOIN people p ON r.person_id = p.id
      WHERE r.is_active = 1
      ORDER BY r.next_due_date ASC
    `;
    const rows = await this.db.query(sql);
    return rows.map(this.mapRow);
  }

  async getById(id: string): Promise<RecurringPayment | null> {
    const sql = `
      SELECT r.*, p.name as person_name
      FROM recurring_payments r
      LEFT JOIN people p ON r.person_id = p.id
      WHERE r.id = ?
    `;
    const rows = await this.db.query(sql, [id]);
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async getByPersonId(personId: string): Promise<RecurringPayment[]> {
    const sql = `
      SELECT r.*, p.name as person_name
      FROM recurring_payments r
      LEFT JOIN people p ON r.person_id = p.id
      WHERE r.person_id = ?
      ORDER BY r.next_due_date ASC
    `;
    const rows = await this.db.query(sql, [personId]);
    return rows.map(this.mapRow);
  }

  async create(data: {
    title: string;
    amount: number;
    currency?: string;
    direction?: RecurringPaymentDirection;
    frequency: RecurringPaymentFrequency;
    personId?: string;
    category?: RecurringPaymentCategory;
    startDate: string;
    nextDueDate?: string;
    endDate?: string;
    reminderDaysBefore?: number;
    reminderTime?: string;
    autoRecordObligation?: boolean;
    notes?: string;
  }): Promise<RecurringPayment> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const currency = data.currency || '₹';
    const direction = data.direction || 'PAY';
    const category = data.category || 'OTHER';
    const startDate = data.startDate;
    const nextDueDate = data.nextDueDate || startDate;
    const reminderDaysBefore = data.reminderDaysBefore ?? 1;
    const reminderTime = data.reminderTime || '09:00';
    const autoRecordObligation = data.autoRecordObligation ? 1 : 0;

    await this.db.run(
      `INSERT INTO recurring_payments (
        id, title, amount, currency, direction, frequency, person_id, category,
        start_date, next_due_date, end_date, reminder_days_before, reminder_time,
        auto_record_obligation, is_active, notes, last_paid_date,
        total_paid_occurrences, total_paid_amount, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, 0, 0, ?, ?)`,
      [
        id,
        data.title.trim(),
        data.amount,
        currency,
        direction,
        data.frequency,
        data.personId || null,
        category,
        startDate,
        nextDueDate,
        data.endDate || null,
        reminderDaysBefore,
        reminderTime,
        autoRecordObligation,
        data.notes?.trim() || null,
        now,
        now,
      ]
    );

    // If attached to a person, log activity
    if (data.personId) {
      await this.activityRepo.logEvent({
        personId: data.personId,
        eventType: 'RECURRING_PAYMENT_CREATED',
        description: `Created recurring ${direction === 'PAY' ? 'payment' : 'receipt'}: "${data.title.trim()}" (${currency}${data.amount} ${data.frequency.toLowerCase()})`,
        metadata: {
          recurringPaymentId: id,
          amount: data.amount,
          frequency: data.frequency,
          category,
          nextDueDate,
        },
      });
    }

    const created = await this.getById(id);
    return created!;
  }

  async update(
    id: string,
    updates: Partial<{
      title: string;
      amount: number;
      currency: string;
      direction: RecurringPaymentDirection;
      frequency: RecurringPaymentFrequency;
      personId?: string | null;
      category: RecurringPaymentCategory;
      startDate: string;
      nextDueDate: string;
      endDate?: string | null;
      reminderDaysBefore: number;
      reminderTime: string;
      autoRecordObligation: boolean;
      isActive: boolean;
      notes?: string | null;
    }>
  ): Promise<RecurringPayment> {
    const now = new Date().toISOString();
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Recurring payment with id ${id} not found.`);
    }

    const setClauses: string[] = ['updated_at = ?'];
    const params: any[] = [now];

    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      params.push(updates.title.trim());
    }
    if (updates.amount !== undefined) {
      setClauses.push('amount = ?');
      params.push(updates.amount);
    }
    if (updates.currency !== undefined) {
      setClauses.push('currency = ?');
      params.push(updates.currency);
    }
    if (updates.direction !== undefined) {
      setClauses.push('direction = ?');
      params.push(updates.direction);
    }
    if (updates.frequency !== undefined) {
      setClauses.push('frequency = ?');
      params.push(updates.frequency);
    }
    if (updates.personId !== undefined) {
      setClauses.push('person_id = ?');
      params.push(updates.personId);
    }
    if (updates.category !== undefined) {
      setClauses.push('category = ?');
      params.push(updates.category);
    }
    if (updates.startDate !== undefined) {
      setClauses.push('start_date = ?');
      params.push(updates.startDate);
    }
    if (updates.nextDueDate !== undefined) {
      setClauses.push('next_due_date = ?');
      params.push(updates.nextDueDate);
    }
    if (updates.endDate !== undefined) {
      setClauses.push('end_date = ?');
      params.push(updates.endDate);
    }
    if (updates.reminderDaysBefore !== undefined) {
      setClauses.push('reminder_days_before = ?');
      params.push(updates.reminderDaysBefore);
    }
    if (updates.reminderTime !== undefined) {
      setClauses.push('reminder_time = ?');
      params.push(updates.reminderTime);
    }
    if (updates.autoRecordObligation !== undefined) {
      setClauses.push('auto_record_obligation = ?');
      params.push(updates.autoRecordObligation ? 1 : 0);
    }
    if (updates.isActive !== undefined) {
      setClauses.push('is_active = ?');
      params.push(updates.isActive ? 1 : 0);
    }
    if (updates.notes !== undefined) {
      setClauses.push('notes = ?');
      params.push(updates.notes ? updates.notes.trim() : null);
    }

    params.push(id);
    await this.db.run(
      `UPDATE recurring_payments SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    const updated = await this.getById(id);
    return updated!;
  }

  async toggleActive(id: string, isActive: boolean): Promise<RecurringPayment> {
    const existing = await this.getById(id);
    if (!existing) throw new Error('Recurring payment not found');

    const updated = await this.update(id, { isActive });

    if (existing.personId) {
      await this.activityRepo.logEvent({
        personId: existing.personId,
        eventType: isActive ? 'RECURRING_PAYMENT_RESUMED' : 'RECURRING_PAYMENT_PAUSED',
        description: `${isActive ? 'Resumed' : 'Paused'} recurring payment: "${existing.title}"`,
        metadata: { recurringPaymentId: id },
      });
    }

    return updated;
  }

  async recordPaymentCycle(
    id: string,
    recordInLedger = false
  ): Promise<{ payment: RecurringPayment; nextDueDate: string }> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Recurring payment with id ${id} not found.`);
    }

    const todayStr = new Date().toISOString().substring(0, 10);
    const nextDueDate = computeNextDueDate(existing.nextDueDate, existing.frequency);
    const newOccurrences = existing.totalPaidOccurrences + 1;
    const newTotalAmount = existing.totalPaidAmount + existing.amount;
    const now = new Date().toISOString();

    await this.db.run(
      `UPDATE recurring_payments 
       SET last_paid_date = ?, 
           next_due_date = ?, 
           total_paid_occurrences = ?, 
           total_paid_amount = ?, 
           updated_at = ? 
       WHERE id = ?`,
      [todayStr, nextDueDate, newOccurrences, newTotalAmount, now, id]
    );

    // If attached to person and requested or auto-configured, record in ledger
    if (existing.personId && (recordInLedger || existing.autoRecordObligation)) {
      try {
        const obligationDirection = existing.direction === 'PAY' ? 'BORROWED' : 'LENT';
        const obligation = await this.obligationRepo.createMoneyObligation({
          personId: existing.personId,
          direction: obligationDirection,
          title: `[Recurring] ${existing.title} (Cycle #${newOccurrences})`,
          amount: existing.amount,
          currency: existing.currency,
          description: `Automatically recorded recurring payment cycle for ${existing.frequency.toLowerCase()} payment.`,
        });

        // Immediately mark payment recorded for this obligation cycle
        await this.paymentRepo.recordPayment({
          obligationId: obligation.id,
          personId: existing.personId,
          amount: existing.amount,
          paymentDate: now,
          notes: `Recurring cycle payment: ${existing.title}`,
        });
      } catch (err) {
        console.warn('Could not record ledger obligation for recurring cycle:', err);
      }
    }

    if (existing.personId) {
      await this.activityRepo.logEvent({
        personId: existing.personId,
        eventType: 'RECURRING_PAYMENT_PAID',
        description: `Recorded recurring payment: "${existing.title}" (${existing.currency}${existing.amount}). Next due: ${nextDueDate}`,
        metadata: {
          recurringPaymentId: id,
          paidDate: todayStr,
          previousDueDate: existing.nextDueDate,
          newNextDueDate: nextDueDate,
          totalOccurrences: newOccurrences,
        },
      });
    }

    const updated = await this.getById(id);
    return { payment: updated!, nextDueDate };
  }

  async skipCycle(id: string): Promise<{ payment: RecurringPayment; nextDueDate: string }> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Recurring payment with id ${id} not found.`);
    }

    const nextDueDate = computeNextDueDate(existing.nextDueDate, existing.frequency);
    const now = new Date().toISOString();

    await this.db.run(
      `UPDATE recurring_payments 
       SET next_due_date = ?, 
           updated_at = ? 
       WHERE id = ?`,
      [nextDueDate, now, id]
    );

    if (existing.personId) {
      await this.activityRepo.logEvent({
        personId: existing.personId,
        eventType: 'RECURRING_PAYMENT_SKIPPED',
        description: `Skipped cycle for recurring payment: "${existing.title}". Advanced next due to: ${nextDueDate}`,
        metadata: {
          recurringPaymentId: id,
          skippedDueDate: existing.nextDueDate,
          newNextDueDate: nextDueDate,
        },
      });
    }

    const updated = await this.getById(id);
    return { payment: updated!, nextDueDate };
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM recurring_payments WHERE id = ?', [id]);
  }

  private mapRow(r: any): RecurringPayment {
    return {
      id: r.id,
      title: r.title,
      amount: Number(r.amount),
      currency: r.currency || '₹',
      direction: r.direction as RecurringPaymentDirection,
      frequency: r.frequency as RecurringPaymentFrequency,
      personId: r.person_id || undefined,
      personName: r.person_name || undefined,
      category: (r.category || 'OTHER') as RecurringPaymentCategory,
      startDate: r.start_date,
      nextDueDate: r.next_due_date,
      endDate: r.end_date || undefined,
      reminderDaysBefore: Number(r.reminder_days_before ?? 1),
      reminderTime: r.reminder_time || '09:00',
      autoRecordObligation: Boolean(r.auto_record_obligation),
      isActive: Boolean(r.is_active),
      notes: r.notes || undefined,
      lastPaidDate: r.last_paid_date || undefined,
      totalPaidOccurrences: Number(r.total_paid_occurrences || 0),
      totalPaidAmount: Number(r.total_paid_amount || 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
