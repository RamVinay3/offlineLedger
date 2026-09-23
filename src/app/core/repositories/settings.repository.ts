import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { AppSettings } from '../models';

const DEFAULT_SETTINGS: AppSettings = {
  currencySymbol: '₹',
  theme: 'dark',
  isAppLockEnabled: false,
  autoLockTimeout: '5m',
  isBiometricEnabled: false,
  hasCompletedOnboarding: false,
};

@Injectable({
  providedIn: 'root',
})
export class SettingsRepository {
  constructor(private db: DatabaseService) {}

  async getSettings(): Promise<AppSettings> {
    const rows = await this.db.query<{ key: string; value: string }>('SELECT * FROM settings');
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(r.key, r.value);
    }

    return {
      currencySymbol: map.get('currencySymbol') || DEFAULT_SETTINGS.currencySymbol,
      theme: (map.get('theme') as any) || DEFAULT_SETTINGS.theme,
      isAppLockEnabled: map.get('isAppLockEnabled') === 'true',
      pinHash: map.get('pinHash'),
      salt: map.get('salt'),
      autoLockTimeout: (map.get('autoLockTimeout') as any) || DEFAULT_SETTINGS.autoLockTimeout,
      isBiometricEnabled: map.get('isBiometricEnabled') === 'true',
      hasCompletedOnboarding: map.get('hasCompletedOnboarding') === 'true',
      upiId: map.get('upiId') || undefined,
      userName: map.get('userName') || undefined,
    };
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    await this.db.executeTransaction(async () => {
      for (const [key, val] of Object.entries(settings)) {
        if (val !== undefined) {
          const strVal = typeof val === 'boolean' ? (val ? 'true' : 'false') : String(val);
          await this.db.run(
            `INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [key, strVal]
          );
        }
      }
    });
  }
}
