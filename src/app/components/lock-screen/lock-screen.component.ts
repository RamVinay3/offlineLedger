import { Component, signal, OnInit, OnDestroy, HostListener, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SecurityService } from '../../core/services/security.service';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { lockClosed, backspaceOutline, fingerPrintOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-lock-screen',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './lock-screen.component.html',
  styleUrl: './lock-screen.component.css',
})
export class LockScreenComponent implements OnInit, OnDestroy {
  enteredPin = signal<string>('');
  errorMessage = signal<string>('');
  private backButtonListenerHandle: any = null;

  constructor(public securityService: SecurityService) {
    addIcons({ lockClosed, backspaceOutline, fingerPrintOutline, shieldCheckmarkOutline });

    // Lock down browser history while locked so back button cannot navigate routes behind lock
    effect(() => {
      const locked = this.securityService.isLocked();
      if (typeof window !== 'undefined') {
        if (locked) {
          window.history.pushState({ appLocked: true }, '', window.location.href);
        }
      }
    });
  }

  async ngOnInit(): Promise<void> {
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this.onPopState);
    }

    try {
      this.backButtonListenerHandle = await App.addListener('backButton', () => {
        if (this.securityService.isLocked()) {
          // Do not navigate back inside app when locked! Exit app on Android
          App.exitApp();
        }
      });
    } catch {
      // Non-Capacitor environment (web browser preview)
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.onPopState);
    }
    if (this.backButtonListenerHandle?.remove) {
      this.backButtonListenerHandle.remove();
    }
  }

  private onPopState = (event: PopStateEvent): void => {
    if (this.securityService.isLocked()) {
      // Re-push state immediately to freeze URL and prevent navigation while locked
      window.history.pushState({ appLocked: true }, '', window.location.href);
    }
  };

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (!this.securityService.isLocked()) return;

    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault();
      event.stopPropagation();
      this.appendDigit(event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      this.backspace();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.enteredPin.set('');
      this.errorMessage.set('');
    } else if (event.key === 'Tab') {
      // Trap focus completely
      event.preventDefault();
      event.stopPropagation();
    }
  }

  appendDigit(digit: string): void {
    if (this.enteredPin().length >= 4) return;
    this.errorMessage.set('');
    const newPin = this.enteredPin() + digit;
    this.enteredPin.set(newPin);

    if (newPin.length === 4) {
      this.validatePin(newPin);
    }
  }

  backspace(): void {
    this.errorMessage.set('');
    const current = this.enteredPin();
    if (current.length > 0) {
      this.enteredPin.set(current.slice(0, -1));
    }
  }

  private async validatePin(pin: string): Promise<void> {
    const valid = await this.securityService.verifyPin(pin);
    if (valid) {
      this.enteredPin.set('');
      this.errorMessage.set('');
    } else {
      this.errorMessage.set('Incorrect PIN. Please try again.');
      this.enteredPin.set('');
    }
  }

  async unlockWithBiometrics(): Promise<void> {
    const success = await this.securityService.authenticateBiometrics();
    if (success) {
      this.enteredPin.set('');
      this.errorMessage.set('');
    }
  }
}
