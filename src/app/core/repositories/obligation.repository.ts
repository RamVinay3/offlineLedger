import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import {
  Obligation,
  ObligationWithDetails,
  ObligationType,
  ObligationDirection,
  ObligationStatus,
  Payment,
  Item,
  Commitment,
  DueDateChangeRecord,
} from '../models';

@Injectable({
  providedIn: 'root',
})
export class ObligationRepository {
  constructor(private db: DatabaseService) {}

  async getAllWithDetails(options?: {
    personId?: string;
    type?: ObligationType;
    status?: ObligationStatus;
    direction?: ObligationDirection;
    searchQuery?: string;
  }): Promise<ObligationWithDetails[]> {
    let sql = `
      SELECT o.*, p.name as person_name, 
             COALESCE(mt.remaining_amount, o.amount) as remaining_amount,
             mt.original_amount
      FROM obligations o
      JOIN people p ON o.person_id = p.id
      LEFT JOIN money_transactions mt ON o.id = mt.obligation_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.personId) {
      sql += ' AND o.person_id = ?';
      params.push(options.personId);
    }
    if (options?.type) {
      sql += ' AND o.type = ?';
      params.push(options.type);
    }
    if (options?.status) {
      sql += ' AND o.status = ?';
      params.push(options.status);
    }
    if (options?.direction) {
      sql += ' AND o.direction = ?';
      params.push(options.direction);
    }
    if (options?.searchQuery && options.searchQuery.trim().length > 0) {
      const q = `%${options.searchQuery.trim().toLowerCase()}%`;
      sql += ` AND (
        LOWER(p.name) LIKE ? OR 
        LOWER(o.title) LIKE ? OR 
        LOWER(COALESCE(o.description, '')) LIKE ?
      )`;
      params.push(q, q, q);
    }

    sql += ' ORDER BY o.created_at DESC';

    const rows = await this.db.query(sql, params);
    const results: ObligationWithDetails[] = [];

    for (const row of rows) {
      // Fetch payments for this obligation
      const payments = await this.db.query<Payment>(
        'SELECT * FROM payments WHERE obligation_id = ? ORDER BY payment_date DESC, created_at DESC',
        [row.id]
      );

      // Fetch item details if ITEM type
      let itemDetails: Item | undefined = undefined;
      if (row.type === 'ITEM') {
        const itemRows = await this.db.query(
          'SELECT * FROM items WHERE obligation_id = ? LIMIT 1',
          [row.id]
        );
        if (itemRows.length > 0) {
          itemDetails = {
            id: itemRows[0].id,
            obligationId: itemRows[0].obligation_id,
            personId: itemRows[0].person_id,
            name: itemRows[0].name,
            description: itemRows[0].description || undefined,
            borrowedAt: itemRows[0].borrowed_at,
            expectedReturnDate: itemRows[0].expected_return_date || undefined,
            returnedAt: itemRows[0].returned_at || undefined,
            status: itemRows[0].status,
            createdAt: itemRows[0].created_at,
          };
        }
      }

      // Fetch commitment details if COMMITMENT or SERVICE type
      let commitmentDetails: Commitment | undefined = undefined;
      let commitmentList: Commitment[] = [];
      if (row.type === 'COMMITMENT' || row.type === 'SERVICE') {
        const commRows = await this.db.query(
          'SELECT * FROM commitments WHERE obligation_id = ? ORDER BY created_at ASC',
          [row.id]
        );
        commitmentList = commRows.map((c) => ({
          id: c.id,
          obligationId: c.obligation_id,
          personId: c.person_id,
          title: c.title,
          description: c.description || undefined,
          dueDate: c.due_date || undefined,
          status: c.status,
          completedAt: c.completed_at || undefined,
          createdAt: c.created_at,
        }));
        if (commitmentList.length > 0) {
          commitmentDetails = commitmentList[0];
        }
      }

      // Fetch due date change history
      const dueDateActivities = await this.db.query(
        `SELECT metadata_json, created_at FROM activities WHERE obligation_id = ? AND event_type = 'DUE_DATE_CHANGED' ORDER BY created_at ASC`,
        [row.id]
      );
      const dueDateHistory: DueDateChangeRecord[] = dueDateActivities.map((a) => {
        try {
          const m = JSON.parse(a.metadata_json || '{}');
          return {
            oldDueDate: m.oldDueDate,
            newDueDate: m.newDueDate,
            reason: m.reason,
            changedAt: a.created_at,
          };
        } catch {
          return { newDueDate: '', changedAt: a.created_at };
        }
      });

      // Refresh overdue status if active and past due date
      let status: ObligationStatus = row.status;
      if (status === 'ACTIVE' && row.due_date) {
        const dueDate = new Date(row.due_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dueDate < today) {
          status = 'OVERDUE';
        }
      }

      results.push({
        id: row.id,
        personId: row.person_id,
        personName: row.person_name,
        type: row.type,
        direction: row.direction,
        title: row.title,
        description: row.description || undefined,
        amount: Number(row.amount) || 0,
        currency: row.currency || '₹',
        status,
        dueDate: row.due_date || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at || undefined,
        remainingAmount: Number(row.remaining_amount) || 0,
        payments: payments.map((p: any) => ({
          id: p.id,
          obligationId: p.obligation_id,
          personId: p.person_id,
          amount: Number(p.amount),
          notes: p.notes || undefined,
          paymentDate: p.payment_date,
          createdAt: p.created_at,
        })),
        itemDetails,
        commitmentDetails,
        commitmentList,
        dueDateChangeCount: dueDateHistory.length,
        dueDateHistory,
      });
    }

    return results;
  }

  async getByIdWithDetails(id: string): Promise<ObligationWithDetails | null> {
    const list = await this.getAllWithDetails();
    return list.find((o) => o.id === id) || null;
  }

  /**
   * Create Money Obligation (Lend or Borrow)
   */
  async createMoneyObligation(data: {
    personId: string;
    direction: ObligationDirection;
    title: string;
    description?: string;
    amount: number;
    currency?: string;
    dueDate?: string;
  }): Promise<ObligationWithDetails> {
    const id = crypto.randomUUID();
    const moneyTxId = crypto.randomUUID();
    const now = new Date().toISOString();
    const currency = data.currency || '₹';

    await this.db.executeTransaction(async () => {
      // Insert obligation
      await this.db.run(
        `INSERT INTO obligations (id, person_id, type, direction, title, description, amount, currency, status, due_date, created_at, updated_at)
         VALUES (?, ?, 'MONEY', ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
        [
          id,
          data.personId,
          data.direction,
          data.title.trim(),
          data.description?.trim() || null,
          data.amount,
          currency,
          data.dueDate || null,
          now,
          now,
        ]
      );

      // Insert money transaction
      await this.db.run(
        `INSERT INTO money_transactions (id, obligation_id, original_amount, remaining_amount, currency, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [moneyTxId, id, data.amount, data.amount, currency, now]
      );

      // Log activity
      const verb = data.direction === 'LENT' ? 'lent' : 'borrowed';
      await this.db.run(
        `INSERT INTO activities (id, person_id, obligation_id, event_type, description, metadata_json, created_at)
         VALUES (?, ?, ?, 'OBLIGATION_CREATED', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          data.personId,
          id,
          `${currency}${data.amount.toLocaleString()} ${verb}: ${data.title.trim()}`,
          JSON.stringify({ amount: data.amount, currency, direction: data.direction }),
          now,
        ]
      );
    });

    return (await this.getByIdWithDetails(id))!;
  }

  /**
   * Create Item Obligation
   */
  async createItemObligation(data: {
    personId: string;
    direction: ObligationDirection;
    name: string;
    description?: string;
    expectedReturnDate?: string;
  }): Promise<ObligationWithDetails> {
    const id = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db.executeTransaction(async () => {
      await this.db.run(
        `INSERT INTO obligations (id, person_id, type, direction, title, description, amount, currency, status, due_date, created_at, updated_at)
         VALUES (?, ?, 'ITEM', ?, ?, ?, 0, '', 'ACTIVE', ?, ?, ?)`,
        [
          id,
          data.personId,
          data.direction,
          data.name.trim(),
          data.description?.trim() || null,
          data.expectedReturnDate || null,
          now,
          now,
        ]
      );

      await this.db.run(
        `INSERT INTO items (id, obligation_id, person_id, name, description, borrowed_at, expected_return_date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
        [
          itemId,
          id,
          data.personId,
          data.name.trim(),
          data.description?.trim() || null,
          now,
          data.expectedReturnDate || null,
          now,
        ]
      );

      const verb = data.direction === 'LENT' ? 'Lent item' : 'Borrowed item';
      await this.db.run(
        `INSERT INTO activities (id, person_id, obligation_id, event_type, description, metadata_json, created_at)
         VALUES (?, ?, ?, 'ITEM_BORROWED', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          data.personId,
          id,
          `${verb}: ${data.name.trim()}`,
          JSON.stringify({ itemName: data.name.trim(), direction: data.direction }),
          now,
        ]
      );
    });

    return (await this.getByIdWithDetails(id))!;
  }

  /**
   * Create Commitment / Service Obligation with multiple checklist items and optional amount
   */
  async createCommitmentObligation(data: {
    personId: string;
    direction: ObligationDirection;
    title: string;
    description?: string;
    dueDate?: string;
    items?: string[];
    amount?: number;
    currency?: string;
    type?: ObligationType;
  }): Promise<ObligationWithDetails> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const type: ObligationType = data.type || (data.amount && data.amount > 0 ? 'SERVICE' : 'COMMITMENT');
    const amount = data.amount || 0;
    const currency = data.currency || '₹';

    await this.db.executeTransaction(async () => {
      await this.db.run(
        `INSERT INTO obligations (id, person_id, type, direction, title, description, amount, currency, status, due_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
        [
          id,
          data.personId,
          type,
          data.direction,
          data.title.trim(),
          data.description?.trim() || null,
          amount,
          amount > 0 ? currency : '',
          data.dueDate || null,
          now,
          now,
        ]
      );

      // If amount attached, track in money_transactions
      if (amount > 0) {
        await this.db.run(
          `INSERT INTO money_transactions (id, obligation_id, original_amount, remaining_amount, currency, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), id, amount, amount, currency, now]
        );
      }

      // Add checklist items (or fallback to obligation title)
      const checklist = (data.items && data.items.length > 0)
        ? data.items.map((it) => it.trim()).filter((it) => it.length > 0)
        : [data.title.trim()];

      for (const itemTitle of checklist) {
        await this.db.run(
          `INSERT INTO commitments (id, obligation_id, person_id, title, description, due_date, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
          [
            crypto.randomUUID(),
            id,
            data.personId,
            itemTitle,
            data.description?.trim() || null,
            data.dueDate || null,
            now,
          ]
        );
      }

      await this.db.run(
        `INSERT INTO activities (id, person_id, obligation_id, event_type, description, metadata_json, created_at)
         VALUES (?, ?, ?, 'OBLIGATION_CREATED', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          data.personId,
          id,
          `${type === 'SERVICE' ? 'Service' : 'Commitment'} added: "${data.title.trim()}" (${checklist.length} checklist milestone${checklist.length > 1 ? 's' : ''})`,
          JSON.stringify({ title: data.title.trim(), checklistCount: checklist.length, amount }),
          now,
        ]
      );
    });

    return (await this.getByIdWithDetails(id))!;
  }

  /**
   * Toggle commitment checklist item status (partial fulfillment support)
   */
  async toggleCommitmentItemStatus(
    commitmentId: string,
    isCompleted: boolean
  ): Promise<{ obligationId: string; itemTitle: string; allCompleted: boolean }> {
    const now = new Date().toISOString();
    const rows = await this.db.query('SELECT * FROM commitments WHERE id = ?', [commitmentId]);
    if (rows.length === 0) {
      throw new Error('Commitment item not found.');
    }
    const item = rows[0];
    const obligationId = item.obligation_id;

    let allCompleted = false;

    await this.db.executeTransaction(async () => {
      await this.db.run(
        'UPDATE commitments SET status = ?, completed_at = ? WHERE id = ?',
        [isCompleted ? 'COMPLETED' : 'PENDING', isCompleted ? now : null, commitmentId]
      );

      // Check all commitment items for this obligation
      const allItems = await this.db.query('SELECT status FROM commitments WHERE obligation_id = ?', [obligationId]);
      allCompleted = allItems.length > 0 && allItems.every((it) => it.status === 'COMPLETED');

      // Update parent obligation status
      if (allCompleted) {
        await this.db.run(
          'UPDATE obligations SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
          ['COMPLETED', now, now, obligationId]
        );
      } else {
        await this.db.run(
          'UPDATE obligations SET status = ?, completed_at = NULL, updated_at = ? WHERE id = ?',
          ['ACTIVE', now, obligationId]
        );
      }

      // Log activity
      const actionText = isCompleted ? 'Fulfilled commitment' : 'Reopened commitment';
      await this.db.run(
        `INSERT INTO activities (id, person_id, obligation_id, event_type, description, metadata_json, created_at)
         VALUES (?, ?, ?, 'COMMITMENT_FULFILLED', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          item.person_id,
          obligationId,
          `${actionText}: "${item.title}"`,
          JSON.stringify({ commitmentId, title: item.title, isCompleted, allCompleted }),
          now,
        ]
      );
    });

    return { obligationId, itemTitle: item.title, allCompleted };
  }

  /**
   * Add a checklist item to an existing commitment/service obligation
   */
  async addCommitmentItem(obligationId: string, title: string): Promise<Commitment> {
    const now = new Date().toISOString();
    const obRows = await this.db.query('SELECT * FROM obligations WHERE id = ?', [obligationId]);
    if (obRows.length === 0) throw new Error('Obligation not found.');
    const ob = obRows[0];

    const id = crypto.randomUUID();
    await this.db.run(
      `INSERT INTO commitments (id, obligation_id, person_id, title, description, due_date, status, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, 'PENDING', ?)`,
      [id, obligationId, ob.person_id, title.trim(), ob.due_date || null, now]
    );

    // If obligation was completed, reopen it since new item is pending
    if (ob.status === 'COMPLETED') {
      await this.db.run('UPDATE obligations SET status = ?, completed_at = NULL, updated_at = ? WHERE id = ?', [
        'ACTIVE',
        now,
        obligationId,
      ]);
    }

    return {
      id,
      obligationId,
      personId: ob.person_id,
      title: title.trim(),
      status: 'PENDING',
      createdAt: now,
    };
  }

  /**
   * Update Due Date with full history tracking and reason
   */
  async updateDueDate(obligationId: string, newDueDate: string, reason?: string): Promise<void> {
    const now = new Date().toISOString();
    const rows = await this.db.query('SELECT * FROM obligations WHERE id = ?', [obligationId]);
    if (rows.length === 0) return;
    const ob = rows[0];
    const oldDueDate = ob.due_date;

    await this.db.executeTransaction(async () => {
      await this.db.run(
        'UPDATE obligations SET due_date = ?, updated_at = ? WHERE id = ?',
        [newDueDate, now, obligationId]
      );

      if (ob.type === 'ITEM') {
        await this.db.run(
          'UPDATE items SET expected_return_date = ? WHERE obligation_id = ?',
          [newDueDate, obligationId]
        );
      } else if (ob.type === 'COMMITMENT' || ob.type === 'SERVICE') {
        await this.db.run(
          'UPDATE commitments SET due_date = ? WHERE obligation_id = ?',
          [newDueDate, obligationId]
        );
      }

      const reasonSuffix = reason && reason.trim().length > 0 ? ` (${reason.trim()})` : '';
      await this.db.run(
        `INSERT INTO activities (id, person_id, obligation_id, event_type, description, metadata_json, created_at)
         VALUES (?, ?, ?, 'DUE_DATE_CHANGED', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          ob.person_id,
          obligationId,
          `Due date changed to ${newDueDate}${reasonSuffix}`,
          JSON.stringify({ oldDueDate, newDueDate, reason: reason?.trim() || 'Rescheduled' }),
          now,
        ]
      );
    });
  }

  /**
   * Complete commitment obligation
   */
  async completeCommitment(obligationId: string): Promise<void> {
    const now = new Date().toISOString();
    const rows = await this.db.query('SELECT * FROM obligations WHERE id = ?', [obligationId]);
    if (rows.length === 0) return;
    const ob = rows[0];

    await this.db.executeTransaction(async () => {
      await this.db.run(
        'UPDATE obligations SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
        ['COMPLETED', now, now, obligationId]
      );
      await this.db.run(
        'UPDATE commitments SET status = ?, completed_at = ? WHERE obligation_id = ?',
        ['COMPLETED', now, obligationId]
      );
      await this.db.run(
        `INSERT INTO activities (id, person_id, obligation_id, event_type, description, metadata_json, created_at)
         VALUES (?, ?, ?, 'OBLIGATION_COMPLETED', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          ob.person_id,
          obligationId,
          `Commitment completed: "${ob.title}"`,
          JSON.stringify({ title: ob.title }),
          now,
        ]
      );
    });
  }
}
