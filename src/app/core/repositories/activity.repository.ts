import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { Activity, ActivityEventType } from '../models';

@Injectable({
  providedIn: 'root',
})
export class ActivityRepository {
  constructor(private db: DatabaseService) {}

  async getTimeline(options?: { personId?: string; limit?: number }): Promise<Activity[]> {
    let sql = `
      SELECT a.*, p.name as person_name 
      FROM activities a
      LEFT JOIN people p ON a.person_id = p.id
    `;
    const params: any[] = [];

    if (options?.personId) {
      sql += ' WHERE a.person_id = ?';
      params.push(options.personId);
    }

    sql += ' ORDER BY a.created_at DESC';

    if (options?.limit && options.limit > 0) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = await this.db.query<any>(sql, params);
    return rows.map((r) => ({
      id: r.id,
      personId: r.person_id,
      personName: r.person_name || undefined,
      obligationId: r.obligation_id || undefined,
      eventType: r.event_type as ActivityEventType,
      description: r.description,
      metadataJson: r.metadata_json || undefined,
      createdAt: r.created_at,
    }));
  }

  async logEvent(data: {
    personId: string;
    obligationId?: string;
    eventType: ActivityEventType;
    description: string;
    metadata?: any;
  }): Promise<Activity> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;

    await this.db.run(
      `INSERT INTO activities (id, person_id, obligation_id, event_type, description, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.personId,
        data.obligationId || null,
        data.eventType,
        data.description,
        metadataJson,
        now,
      ]
    );

    return {
      id,
      personId: data.personId,
      obligationId: data.obligationId,
      eventType: data.eventType,
      description: data.description,
      metadataJson: metadataJson || undefined,
      createdAt: now,
    };
  }
}
