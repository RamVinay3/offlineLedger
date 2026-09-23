import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { Item, ItemStatus } from '../models';

@Injectable({
  providedIn: 'root',
})
export class ItemRepository {
  constructor(private db: DatabaseService) {}

  async markAsReturned(obligationId: string, notes?: string): Promise<void> {
    const now = new Date().toISOString();

    const rows = await this.db.query<{
      id: string;
      name: string;
      person_id: string;
      direction: string;
    }>(
      `SELECT i.id, i.name, i.person_id, o.direction 
       FROM items i
       JOIN obligations o ON i.obligation_id = o.id
       WHERE i.obligation_id = ? LIMIT 1`,
      [obligationId]
    );

    if (rows.length === 0) {
      throw new Error(`Item obligation with id ${obligationId} not found.`);
    }

    const item = rows[0];
    const isLent = item.direction === 'LENT';
    const actionText = isLent ? 'returned to you' : 'returned by you';

    await this.db.executeTransaction(async () => {
      // 1. Update item status and returned_at
      await this.db.run(
        `UPDATE items SET status = 'RETURNED', returned_at = ? WHERE obligation_id = ?`,
        [now, obligationId]
      );

      // 2. Update parent obligation status
      await this.db.run(
        `UPDATE obligations SET status = 'COMPLETED', completed_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, obligationId]
      );

      // 3. Log activity
      await this.db.run(
        `INSERT INTO activities (id, person_id, obligation_id, event_type, description, metadata_json, created_at)
         VALUES (?, ?, ?, 'ITEM_RETURNED', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          item.person_id,
          obligationId,
          `Item ${actionText}: "${item.name}"${notes ? ' (' + notes + ')' : ''}`,
          JSON.stringify({ itemName: item.name, notes: notes || '' }),
          now,
        ]
      );
    });
  }

  async getItemsByPerson(personId: string, includeReturned = true): Promise<Item[]> {
    let sql = 'SELECT * FROM items WHERE person_id = ?';
    if (!includeReturned) {
      sql += " AND status != 'RETURNED'";
    }
    sql += ' ORDER BY borrowed_at DESC';

    const rows = await this.db.query(sql, [personId]);
    return rows.map((r: any) => ({
      id: r.id,
      obligationId: r.obligation_id,
      personId: r.person_id,
      name: r.name,
      description: r.description || undefined,
      borrowedAt: r.borrowed_at,
      expectedReturnDate: r.expected_return_date || undefined,
      returnedAt: r.returned_at || undefined,
      status: r.status as ItemStatus,
      createdAt: r.created_at,
    }));
  }
}
