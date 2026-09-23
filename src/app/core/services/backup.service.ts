import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { ObligationRepository } from '../repositories/obligation.repository';

export interface LoopBackupEnvelope {
  format: 'LOOP_ENCRYPTED_BACKUP';
  version: number;
  appName: 'LOOP';
  exportedAt: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

@Injectable({
  providedIn: 'root',
})
export class BackupService {
  constructor(
    private db: DatabaseService,
    private obligationRepo: ObligationRepository
  ) {}

  /**
   * Create an AES-GCM encrypted backup file (.loop)
   */
  async createEncryptedBackup(password: string): Promise<string> {
    const rawDump = await this.db.dumpAllJson();
    const payloadString = JSON.stringify(rawDump);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await this.deriveKey(password, salt);

    const enc = new TextEncoder();
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      enc.encode(payloadString)
    );

    const envelope: LoopBackupEnvelope = {
      format: 'LOOP_ENCRYPTED_BACKUP',
      version: 1,
      appName: 'LOOP',
      exportedAt: new Date().toISOString(),
      salt: this.bufToHex(salt),
      iv: this.bufToHex(iv),
      ciphertext: this.bufToBase64(new Uint8Array(encryptedBuffer)),
    };

    return JSON.stringify(envelope, null, 2);
  }

  /**
   * Restore an encrypted backup file (.loop)
   */
  async restoreEncryptedBackup(backupJsonString: string, password: string): Promise<void> {
    let envelope: LoopBackupEnvelope;
    try {
      envelope = JSON.parse(backupJsonString);
    } catch {
      throw new Error('Invalid backup file format: not valid JSON.');
    }

    if (envelope.format !== 'LOOP_ENCRYPTED_BACKUP' || envelope.appName !== 'LOOP') {
      throw new Error('Incompatible backup file: this is not a valid LOOP backup.');
    }

    if (envelope.version !== 1) {
      throw new Error(`Unsupported backup version: ${envelope.version}. Current supported version is 1.`);
    }

    const salt = this.hexToBuf(envelope.salt);
    const iv = this.hexToBuf(envelope.iv);
    const ciphertext = this.base64ToBuf(envelope.ciphertext);

    const key = await this.deriveKey(password, salt);

    let decryptedBuffer: ArrayBuffer;
    try {
      decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        ciphertext as unknown as BufferSource
      );
    } catch {
      throw new Error('Decryption failed. Incorrect backup password or corrupted file.');
    }

    const dec = new TextDecoder();
    const rawJson = dec.decode(decryptedBuffer);
    const dump = JSON.parse(rawJson);

    await this.db.restoreAllJson(dump);
  }

  /**
   * Generate raw JSON export
   */
  async exportJson(): Promise<string> {
    const rawDump = await this.db.dumpAllJson();
    return JSON.stringify(
      {
        format: 'LOOP_RAW_JSON_EXPORT',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: rawDump,
      },
      null,
      2
    );
  }

  /**
   * Restore from raw JSON export
   */
  async restoreJson(jsonString: string): Promise<void> {
    const parsed = JSON.parse(jsonString);
    if (!parsed.data) {
      throw new Error('Invalid JSON export file.');
    }
    await this.db.restoreAllJson(parsed.data);
  }

  /**
   * Generate CSV export of all obligations
   */
  async exportCsv(): Promise<string> {
    const obligations = await this.obligationRepo.getAllWithDetails();

    const headers = [
      'Person',
      'Type',
      'Direction',
      'Title',
      'Description',
      'Original Amount',
      'Remaining Amount',
      'Currency',
      'Status',
      'Due Date',
      'Created Date',
    ];

    const rows = obligations.map((o) => [
      this.escapeCsv(o.personName),
      o.type,
      o.direction,
      this.escapeCsv(o.title),
      this.escapeCsv(o.description || ''),
      o.amount.toString(),
      o.remainingAmount.toString(),
      o.currency,
      o.status,
      o.dueDate || '',
      o.createdAt.substring(0, 10),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  /**
   * Download a text/blob payload locally in the browser/webview
   */
  downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Cryptography Helpers ---

  private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as unknown as BufferSource,
        iterations: 150000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private escapeCsv(str: string): string {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  private bufToHex(buf: Uint8Array): string {
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private hexToBuf(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  private bufToBase64(buf: Uint8Array): string {
    let binary = '';
    const len = buf.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buf[i]);
    }
    return btoa(binary);
  }

  private base64ToBuf(base64: string): Uint8Array {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
