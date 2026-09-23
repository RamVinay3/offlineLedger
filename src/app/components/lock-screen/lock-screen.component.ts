import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SecurityService } from '../../core/services/security.service';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { lockClosed, backspaceOutline, fingerPrintOutline, shieldCheckmarkOutline } from 'ionicons/icons';

@Component({
  selector: 'app-lock-screen',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './lock-screen.component.html',
  styleUrl: './lock-screen.component.css',
})
export class LockScreenComponent {
  enteredPin = signal<string>('');
  errorMessage = signal<string>('');

  constructor(public securityService: SecurityService) {
    addIcons({ lockClosed, backspaceOutline, fingerPrintOutline, shieldCheckmarkOutline });
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
