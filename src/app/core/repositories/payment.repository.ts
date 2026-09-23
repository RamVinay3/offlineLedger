import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { Payment } from '../models';

@Injectable({
  providedIn: 'root',
})
export class PaymentRepository {
  constructor(private db: DatabaseService) {}

  /**
   * Record a payment (partial or full) against an obligation.
   * Enforces overpayment checks, updates remaining_amount, and creates activity log.
   */
  async recordPayment(data: {
    obligationId: string;
    personId: string;
    amount: number;
    notes?: string;
    paymentDate?: string;
  }): Promise<Payment> {
    if (data.amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const now = new Date().toISOString();
    const paymentDate = data.paymentDate || now.substring(0, 10);
    const paymentId = crypto.randomUUID();

    return await this.db.executeTransaction(async () => {
      // 1. Fetch current money transaction
      const mtRows = await this.db.query<{
        id: string;
        original_amount: number;
        remaining_amount: number;
        currency: string;
      }>('SELECT * FROM money_transactions WHERE obligation_id = ? LIMIT 1', [
        data.obligationId,
      ]);

      if (mtRows.length === 0) {
        throw new Error('Associated money transaction not found.');
      }

      const mt = mtRows[0];
      const remaining = Number(mt.remaining_amount);

      // Edge case: Overpayment check
      if (data.amount > remaining) {
        throw new Error(
          `Cannot pay ${mt.currency}${data.amount}. Maximum remaining balance is ${mt.currency}${remaining}.`
        );
      }

      const newRemaining = Math.max(0, remaining - data.amount);

      // 2. Insert payment record (historical preservation)
      await this.db.run(
        `INSERT INTO payments (id, obligation_id, person_id, amount, notes, payment_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentId,
          data.obligationId,
          data.personId,
          data.amount,
          data.notes?.trim() || null,
          paymentDate,
          now,
        ]
      );

      // 3. Update remaining amount in money_transactions
      await this.db.run(
        'UPDATE money_transactions SET remaining_amount = ? WHERE id = ?',
        [newRemaining, mt.id]
      );

      // 4. If fully paid off, mark obligation as COMPLETED
      if (newRemaining === 0) {
        await this.db.run(
          'UPDATE obligations SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
          ['COMPLETED', now, now, data.obligationId]
        );
      } else {
        await this.db.run('UPDATE obligations SET updated_at = ? WHERE id = ?', [
          now,
          data.obligationId,
        ]);
      }

      // 5. Fetch obligation details for clear activity description
      const obRows = await this.db.query<{ title: string; direction: string }>(
        'SELECT title, direction FROM obligations WHERE id = ?',
        [data.obligationId]
      );
      const obTitle = obRows[0]?.title || 'obligation';
      const isLent = obRows[0]?.direction === 'LENT';
      const actionText = isLent ? 'received back' : 'repaid';

      // 6. Record activity
      await this.db.run(
        `INSERT INTO activities (id, person_id, obligation_id, event_type, description, metadata_json, created_at)
         VALUES (?, ?, ?, 'PAYMENT_RECORDED', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          data.personId,
          data.obligationId,
          `Payment of ${mt.currency}${data.amount.toLocaleString()} ${actionText} (${mt.currency}${newRemaining.toLocaleString()} remaining)`,
          JSON.stringify({
            amount: data.amount,
            remainingAmount: newRemaining,
            isFullySettled: newRemaining === 0,
            notes: data.notes || '',
          }),
          now,
        ]
      );

      if (newRemaining === 0) {
        await this.db.run(
          `INSERT INTO activities (id, person_id, obligation_id, event_type, description, metadata_json, created_at)
           VALUES (?, ?, ?, 'OBLIGATION_COMPLETED', ?, ?, ?)`,
          [
            crypto.randomUUID(),
            data.personId,
            data.obligationId,
            `Obligation fully settled: "${obTitle}"`,
            JSON.stringify({ obligationId: data.obligationId }),
            now,
          ]
        );
      }

      return {
        id: paymentId,
        obligationId: data.obligationId,
        personId: data.personId,
        amount: data.amount,
        notes: data.notes,
        paymentDate,
        createdAt: now,
      };
    });
  }

  async getPaymentsForObligation(obligationId: string): Promise<Payment[]> {
    const rows = await this.db.query<any>(
      'SELECT * FROM payments WHERE obligation_id = ? ORDER BY payment_date DESC, created_at DESC',
      [obligationId]
    );
    return rows.map((p) => ({
      id: p.id,
      obligationId: p.obligation_id,
      personId: p.person_id,
      amount: Number(p.amount),
      notes: p.notes || undefined,
      paymentDate: p.payment_date,
      createdAt: p.created_at,
    }));
  }
}
