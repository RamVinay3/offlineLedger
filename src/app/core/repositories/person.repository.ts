import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { Person, PersonBalanceSummary } from '../models';

@Injectable({
  providedIn: 'root',
})
export class PersonRepository {
  constructor(private db: DatabaseService) {}

  async getAll(includeArchived = false): Promise<Person[]> {
    const sql = includeArchived
      ? 'SELECT * FROM people ORDER BY name ASC'
      : 'SELECT * FROM people WHERE is_archived = 0 ORDER BY name ASC';
    const rows = await this.db.query(sql);
    return rows.map(this.mapRowToPerson);
  }

  async getById(id: string): Promise<Person | null> {
    const rows = await this.db.query('SELECT * FROM people WHERE id = ? LIMIT 1', [id]);
    return rows.length > 0 ? this.mapRowToPerson(rows[0]) : null;
  }

  async getByName(name: string): Promise<Person | null> {
    const rows = await this.db.query(
      'SELECT * FROM people WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
      [name]
    );
    return rows.length > 0 ? this.mapRowToPerson(rows[0]) : null;
  }

  async create(data: {
    name: string;
    phoneNumber?: string;
    email?: string;
    notes?: string;
  }): Promise<Person> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const person: Person = {
      id,
      name: data.name.trim(),
      phoneNumber: data.phoneNumber?.trim() || undefined,
      email: data.email?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.run(
      `INSERT INTO people (id, name, phone_number, email, notes, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        person.id,
        person.name,
        person.phoneNumber || null,
        person.email || null,
        person.notes || null,
        person.isArchived ? 1 : 0,
        person.createdAt,
        person.updatedAt,
      ]
    );

    return person;
  }

  async update(id: string, updates: Partial<Omit<Person, 'id' | 'createdAt'>>): Promise<void> {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name.trim());
    }
    if (updates.phoneNumber !== undefined) {
      fields.push('phone_number = ?');
      values.push(updates.phoneNumber.trim() || null);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email.trim() || null);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes.trim() || null);
    }
    if (updates.isArchived !== undefined) {
      fields.push('is_archived = ?');
      values.push(updates.isArchived ? 1 : 0);
    }

    fields.push('updated_at = ?');
    values.push(now);

    values.push(id);

    await this.db.run(`UPDATE people SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async archive(id: string, isArchived: boolean): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run('UPDATE people SET is_archived = ?, updated_at = ? WHERE id = ?', [
      isArchived ? 1 : 0,
      now,
      id,
    ]);
  }

  async search(query: string): Promise<Person[]> {
    const q = `%${query.trim().toLowerCase()}%`;
    const rows = await this.db.query(
      `SELECT * FROM people 
       WHERE is_archived = 0 AND (
         LOWER(name) LIKE ? OR 
         LOWER(phone_number) LIKE ? OR 
         LOWER(email) LIKE ? OR 
         LOWER(notes) LIKE ?
       ) ORDER BY name ASC`,
      [q, q, q, q]
    );
    return rows.map(this.mapRowToPerson);
  }

  async getBalanceSummary(personId: string): Promise<PersonBalanceSummary> {
    const person = await this.getById(personId);
    if (!person) {
      throw new Error(`Person with id ${personId} not found`);
    }

    // Money owed to user (direction = LENT and status != COMPLETED/CANCELLED)
    const owedRows = await this.db.query<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(mt.remaining_amount), 0) as total, COUNT(*) as count
       FROM obligations o
       JOIN money_transactions mt ON o.id = mt.obligation_id
       WHERE o.person_id = ? AND o.direction = 'LENT' AND o.status NOT IN ('COMPLETED', 'CANCELLED')`,
      [personId]
    );

    // Money user owes to them (direction = BORROWED and status != COMPLETED/CANCELLED)
    const owingRows = await this.db.query<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(mt.remaining_amount), 0) as total, COUNT(*) as count
       FROM obligations o
       JOIN money_transactions mt ON o.id = mt.obligation_id
       WHERE o.person_id = ? AND o.direction = 'BORROWED' AND o.status NOT IN ('COMPLETED', 'CANCELLED')`,
      [personId]
    );

    // Active items count
    const itemRows = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM items
       WHERE person_id = ? AND status != 'RETURNED'`,
      [personId]
    );

    // Check overdue
    const overdueRows = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM obligations
       WHERE person_id = ? AND status = 'OVERDUE'`,
      [personId]
    );

    const totalOwedToYou = owedRows[0]?.total || 0;
    const totalYouOwe = owingRows[0]?.total || 0;
    const netBalance = totalOwedToYou - totalYouOwe;

    return {
      personId,
      personName: person.name,
      totalOwedToYou,
      totalYouOwe,
      netBalance,
      activeObligationsCount: (owedRows[0]?.count || 0) + (owingRows[0]?.count || 0),
      activeItemsCount: itemRows[0]?.count || 0,
      hasOverdue: (overdueRows[0]?.count || 0) > 0,
    };
  }

  private mapRowToPerson(row: any): Person {
    return {
      id: row.id,
      name: row.name,
      phoneNumber: row.phone_number || undefined,
      email: row.email || undefined,
      notes: row.notes || undefined,
      isArchived: Boolean(row.is_archived),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
