import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { Settlement, ObligationDirection } from '../models';

@Injectable({
  providedIn: 'root',
})
export class SettlementRepository {
  constructor(private db: DatabaseService) {}

  /**
   * Settle all outstanding money obligations with a person.
   * Preserves full history while reconciling balances and creating an immutable settlement event.
   */
  async settleRelationship(data: {
    personId: string;
    netAmount: number;
    direction: ObligationDirection; // Who was paying who in the final settlement
    notes?: string;
  }): Promise<Settlement> {
    const now = new Date().toISOString();
    const settlementId = crypto.randomUUID();

    return await this.db.executeTransaction(async () => {
      // 1. Fetch person name for audit log
      const pRows = await this.db.query<{ name: string }>(
        'SELECT name FROM people WHERE id = ?',
        [data.personId]
      );
      const personName = pRows[0]?.name || 'Person';

      // 2. Fetch all active money obligations for this person
      const obligations = await this.db.query<{
        id: string;
        title: string;
        direction: string;
        currency: string;
        remaining_amount: number;
        original_amount: number;
      }>(
        `SELECT o.id, o.title, o.direction, o.currency, mt.remaining_amount, mt.original_amount
         FROM obligations o
         JOIN money_transactions mt ON o.id = mt.obligation_id
         WHERE o.person_id = ? AND o.type = 'MONEY' AND o.status NOT IN ('COMPLETED', 'CANCELLED')`,
        [data.personId]
      );

      // 3. For each outstanding obligation, record a final settlement payment and set remaining = 0 & status = COMPLETED
      for (const ob of obligations) {
        const remaining = Number(ob.remaining_amount);
        if (remaining > 0) {
          // Record payment entry
          await this.db.run(
            `INSERT INTO payments (id, obligation_id, person_id, amount, notes, payment_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              ob.id,
              data.personId,
              remaining,
              data.notes?.trim() || 'Settled via relationship reconciliation',
              now.substring(0, 10),
              now,
            ]
          );

          // Update money transaction remaining to 0
          await this.db.run(
            'UPDATE money_transactions SET remaining_amount = 0 WHERE obligation_id = ?',
            [ob.id]
          );

          // Mark obligation as COMPLETED
          await this.db.run(
            'UPDATE obligations SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
            ['COMPLETED', now, now, ob.id]
          );
        }
      }

      // 4. Record the explicit Settlement record
      await this.db.run(
        `INSERT INTO settlements (id, person_id, settled_amount, direction, notes, settled_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          settlementId,
          data.personId,
          data.netAmount,
          data.direction,
          data.notes?.trim() || null,
          now,
          now,
        ]
      );

      // 5. Record immutable Activity Event
      const directionText =
        data.direction === 'LENT'
          ? `${personName} paid you net balance of ₹${data.netAmount.toLocaleString()}`
          : `You paid ${personName} net balance of ₹${data.netAmount.toLocaleString()}`;

      await this.db.run(
        `INSERT INTO activities (id, person_id, obligation_id, event_type, description, metadata_json, created_at)
         VALUES (?, ?, NULL, 'SETTLEMENT_CREATED', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          data.personId,
          `Settlement completed: ${directionText}${data.notes ? ' — ' + data.notes : ''}`,
          JSON.stringify({
            netAmount: data.netAmount,
            direction: data.direction,
            obligationsCount: obligations.length,
            notes: data.notes || '',
          }),
          now,
        ]
      );

      return {
        id: settlementId,
        personId: data.personId,
        settledAmount: data.netAmount,
        direction: data.direction,
        notes: data.notes,
        settledAt: now,
        createdAt: now,
      };
    });
  }

  async getSettlementsForPerson(personId: string): Promise<Settlement[]> {
    const rows = await this.db.query<any>(
      'SELECT * FROM settlements WHERE person_id = ? ORDER BY settled_at DESC',
      [personId]
    );
    return rows.map((s) => ({
      id: s.id,
      personId: s.person_id,
      settledAmount: Number(s.settled_amount),
      direction: s.direction as ObligationDirection,
      notes: s.notes || undefined,
      settledAt: s.settled_at,
      createdAt: s.created_at,
    }));
  }
}
