import { Injectable, signal, effect } from '@angular/core';
import { SettingsRepository } from '../repositories/settings.repository';
import { AppSettings } from '../models';

@Injectable({
  providedIn: 'root',
})
export class SecurityService {
  readonly isLocked = signal<boolean>(false);
  readonly isBiometricsAvailable = signal<boolean>(false);
  readonly settings = signal<AppSettings | null>(null);

  private lastActiveTimestamp = Date.now();
  private autoLockTimer: any = null;

  constructor(private settingsRepo: SettingsRepository) {
    this.checkBiometricsSupport();
    this.setupInactivityListener();
  }

  async init(): Promise<void> {
    const s = await this.settingsRepo.getSettings();
    this.settings.set(s);
    if (s.isAppLockEnabled && s.pinHash) {
      // Start app in locked state if lock is enabled
      this.isLocked.set(true);
    }
  }

  private async checkBiometricsSupport(): Promise<void> {
    if (
      typeof window !== 'undefined' &&
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    ) {
      try {
        const available =
          await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        this.isBiometricsAvailable.set(available);
      } catch {
        this.isBiometricsAvailable.set(false);
      }
    }
  }

  private setupInactivityListener(): void {
    if (typeof window === 'undefined') return;

    const resetActivity = () => {
      this.lastActiveTimestamp = Date.now();
    };

    window.addEventListener('touchstart', resetActivity, { passive: true });
    window.addEventListener('mousedown', resetActivity, { passive: true });
    window.addEventListener('keydown', resetActivity, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.checkAutoLockOnBackground();
      } else {
        this.checkAutoLockTimeout();
      }
    });

    // Heartbeat check every 10 seconds
    setInterval(() => {
      this.checkAutoLockTimeout();
    }, 10000);
  }

  private checkAutoLockOnBackground(): void {
    const s = this.settings();
    if (!s?.isAppLockEnabled || this.isLocked()) return;
    if (s.autoLockTimeout === 'immediately') {
      this.lock();
    }
  }

  private checkAutoLockTimeout(): void {
    const s = this.settings();
    if (!s?.isAppLockEnabled || this.isLocked()) return;

    const timeoutMs = this.getTimeoutMilliseconds(s.autoLockTimeout);
    if (timeoutMs === null) return; // 'never'

    const elapsed = Date.now() - this.lastActiveTimestamp;
    if (elapsed >= timeoutMs) {
      this.lock();
    }
  }

  private getTimeoutMilliseconds(timeout: string): number | null {
    switch (timeout) {
      case 'immediately':
        return 0;
      case '1m':
        return 60 * 1000;
      case '5m':
        return 5 * 60 * 1000;
      case '15m':
        return 15 * 60 * 1000;
      case 'never':
      default:
        return null;
    }
  }

  lock(): void {
    const s = this.settings();
    if (s?.isAppLockEnabled) {
      this.isLocked.set(true);
    }
  }

  unlock(): void {
    this.lastActiveTimestamp = Date.now();
    this.isLocked.set(false);
  }

  /**
   * Set or update PIN
   */
  async setPin(pin: string): Promise<void> {
    const salt = crypto.randomUUID();
    const pinHash = await this.hashPin(pin, salt);
    await this.settingsRepo.saveSettings({
      isAppLockEnabled: true,
      pinHash,
      salt,
    });
    const s = await this.settingsRepo.getSettings();
    this.settings.set(s);
  }

  /**
   * Remove PIN and disable lock
   */
  async removePin(): Promise<void> {
    await this.settingsRepo.saveSettings({
      isAppLockEnabled: false,
      pinHash: '',
      salt: '',
      isBiometricEnabled: false,
    });
    const s = await this.settingsRepo.getSettings();
    this.settings.set(s);
    this.isLocked.set(false);
  }

  /**
   * Verify provided PIN
   */
  async verifyPin(pin: string): Promise<boolean> {
    const s = this.settings();
    if (!s?.pinHash || !s?.salt) return false;
    const computedHash = await this.hashPin(pin, s.salt);
    const valid = computedHash === s.pinHash;
    if (valid) {
      this.unlock();
    }
    return valid;
  }

  /**
   * Authenticate with platform biometrics (WebAuthn / TouchID / FaceID)
   */
  async authenticateBiometrics(): Promise<boolean> {
    if (!this.isBiometricsAvailable()) return false;
    try {
      // Prompt user biometric verification via WebAuthn
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'required',
        },
      });

      if (credential) {
        this.unlock();
        return true;
      }
      return false;
    } catch {
      // In dev or web environment without registered credential, fallback for testing
      return false;
    }
  }

  private async hashPin(pin: string, salt: string): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(pin),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const exported = await crypto.subtle.exportKey('raw', derivedKey);
    return Array.from(new Uint8Array(exported))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
