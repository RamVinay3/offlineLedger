import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoopStateService } from '../../core/state/loop-state.service';
import { SecurityService } from '../../core/services/security.service';
import { BackupService } from '../../core/services/backup.service';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  settingsOutline,
  lockClosedOutline,
  shieldCheckmarkOutline,
  cloudDownloadOutline,
  cloudUploadOutline,
  documentTextOutline,
  colorPaletteOutline,
  cashOutline,
  checkmarkCircle,
  alertCircle,
  fingerPrintOutline,
  keyOutline,
  trashOutline,
  createOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  newPin = '';
  backupPassword = '';
  restorePassword = '';
  statusMessage = signal<string>('');
  isErrorStatus = signal<boolean>(false);
  isExportingBackup = signal<boolean>(false);
  isEditingPin = signal<boolean>(false);

  constructor(
    public state: LoopStateService,
    public securityService: SecurityService,
    private backupService: BackupService
  ) {
    addIcons({
      settingsOutline,
      lockClosedOutline,
      shieldCheckmarkOutline,
      cloudDownloadOutline,
      cloudUploadOutline,
      documentTextOutline,
      colorPaletteOutline,
      cashOutline,
      checkmarkCircle,
      alertCircle,
      fingerPrintOutline,
      keyOutline,
      trashOutline,
      createOutline,
    });
  }

  showStatus(msg: string, isError = false): void {
    this.statusMessage.set(msg);
    this.isErrorStatus.set(isError);
    setTimeout(() => {
      this.statusMessage.set('');
    }, 4000);
  }

  onPinKeyDown(event: KeyboardEvent): void {
    const allowed = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete'];
    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.newPin.length === 4) {
        this.savePin();
      }
      return;
    }
    if (allowed.includes(event.key)) {
      return;
    }
    if (!/^\d$/.test(event.key) || this.newPin.length >= 4) {
      event.preventDefault();
    }
  }

  onPinInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 4);
    this.newPin = digits;
    input.value = digits;
  }

  async toggleAppLock(event: any): Promise<void> {
    const checked = event.target.checked;
    if (checked) {
      if (!this.state.settings().pinHash) {
        event.target.checked = false;
        this.showStatus('Please set a 4-digit PIN first below.', false);
        const pinInput = document.getElementById('initialPinInput') as HTMLInputElement;
        if (pinInput) {
          pinInput.focus();
        }
        return;
      }
      await this.state.updateSettings({ isAppLockEnabled: true });
      this.showStatus('App lock enabled.');
    } else {
      await this.state.updateSettings({ isAppLockEnabled: false });
      this.showStatus('App lock turned off. Your saved PIN is preserved.');
    }
  }

  async savePin(): Promise<void> {
    if (this.newPin.length !== 4 || !/^\d{4}$/.test(this.newPin)) {
      this.showStatus('PIN must be exactly 4 digits.', true);
      return;
    }

    try {
      await this.securityService.setPin(this.newPin);
      await this.state.updateSettings({ isAppLockEnabled: true });
      this.newPin = '';
      this.isEditingPin.set(false);
      this.showStatus('4-Digit PIN saved and App Lock activated!');
    } catch (err: any) {
      console.error('Error saving PIN:', err);
      this.showStatus('Failed to save PIN: ' + (err?.message || err), true);
    }
  }

  async removePin(): Promise<void> {
    try {
      await this.securityService.removePin();
      await this.state.updateSettings({
        isAppLockEnabled: false,
        pinHash: undefined,
        salt: undefined,
        isBiometricEnabled: false,
      });
      this.isEditingPin.set(false);
      this.newPin = '';
      this.showStatus('PIN removed and App Lock disabled.');
    } catch (err: any) {
      console.error('Error removing PIN:', err);
      this.showStatus('Failed to remove PIN: ' + (err?.message || err), true);
    }
  }

  async toggleBiometrics(event: any): Promise<void> {
    const checked = event.target.checked;
    await this.state.updateSettings({ isBiometricEnabled: checked });
    this.showStatus(checked ? 'Biometric unlock enabled.' : 'Biometric unlock disabled.');
  }

  async updateAutoLockTimeout(timeout: any): Promise<void> {
    await this.state.updateSettings({ autoLockTimeout: timeout });
    this.showStatus(`Auto-lock set to ${timeout}.`);
  }

  lockAppNow(): void {
    this.securityService.lock();
  }

  async updateCurrency(symbol: string): Promise<void> {
    await this.state.updateSettings({ currencySymbol: symbol });
    this.showStatus(`Default currency updated to ${symbol}`);
  }

  async setTheme(theme: 'dark' | 'light' | 'system'): Promise<void> {
    try {
      this.state.applyTheme(theme);
      await this.state.updateSettings({ theme });
      this.showStatus(`Theme switched to ${theme} mode.`);
    } catch (err: any) {
      console.error('Failed to save theme setting:', err);
      this.showStatus('Failed to save theme: ' + (err?.message || err), true);
    }
  }

  async exportEncryptedBackup(): Promise<void> {
    if (!this.backupPassword) {
      this.showStatus('Please enter a password to encrypt your backup.', true);
      return;
    }

    this.isExportingBackup.set(true);
    try {
      const backupString = await this.backupService.createEncryptedBackup(this.backupPassword);
      const dateStr = new Date().toISOString().substring(0, 10);
      const filename = `LOOP_BACKUP_${dateStr}.loop`;
      this.backupService.downloadFile(backupString, filename, 'application/json');
      this.backupPassword = '';
      this.showStatus(`Encrypted backup created: ${filename}`);
    } catch (e: any) {
      this.showStatus(`Backup failed: ${e.message}`, true);
    } finally {
      this.isExportingBackup.set(false);
    }
  }

  async onBackupFileSelected(event: any): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!this.restorePassword) {
      this.showStatus('Please enter your backup password above before selecting the file.', true);
      event.target.value = '';
      return;
    }

    try {
      const content = await file.text();
      await this.backupService.restoreEncryptedBackup(content, this.restorePassword);
      await this.state.refreshAll();
      this.restorePassword = '';
      event.target.value = '';
      this.showStatus('Backup restored successfully! All data updated.');
    } catch (e: any) {
      this.showStatus(`Restore failed: ${e.message}`, true);
      event.target.value = '';
    }
  }

  async exportCsv(): Promise<void> {
    try {
      const csv = await this.backupService.exportCsv();
      const dateStr = new Date().toISOString().substring(0, 10);
      this.backupService.downloadFile(csv, `LOOP_OBLIGATIONS_${dateStr}.csv`, 'text/csv');
      this.showStatus('CSV export downloaded.');
    } catch (e: any) {
      this.showStatus(`CSV export failed: ${e.message}`, true);
    }
  }

  async exportJson(): Promise<void> {
    try {
      const json = await this.backupService.exportJson();
      const dateStr = new Date().toISOString().substring(0, 10);
      this.backupService.downloadFile(json, `LOOP_DATA_${dateStr}.json`, 'application/json');
      this.showStatus('JSON export downloaded.');
    } catch (e: any) {
      this.showStatus(`JSON export failed: ${e.message}`, true);
    }
  }
}
