import { Component, signal, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoopStateService } from '../../core/state/loop-state.service';
import { Person } from '../../core/models';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, personAddOutline, alertCircleOutline } from 'ionicons/icons';

@Component({
  selector: 'app-add-person-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './add-person-modal.component.html',
  styleUrl: './add-person-modal.component.css',
})
export class AddPersonModalComponent {
  readonly personCreated = output<Person>();
  readonly closed = output<void>();

  name = '';
  phoneNumber = '';
  email = '';
  notes = '';
  duplicateWarning = signal<string>('');
  isSubmitting = signal<boolean>(false);

  constructor(private state: LoopStateService) {
    addIcons({ closeOutline, personAddOutline, alertCircleOutline });
  }

  checkDuplicate(): void {
    const trimmed = this.name.trim().toLowerCase();
    if (!trimmed) {
      this.duplicateWarning.set('');
      return;
    }

    const existing = this.state.people().find((p) => p.name.toLowerCase() === trimmed);
    if (existing) {
      this.duplicateWarning.set(`Notice: "${existing.name}" already exists in your ledger.`);
    } else {
      this.duplicateWarning.set('');
    }
  }

  onPhoneKeyDown(event: KeyboardEvent): void {
    const allowedKeys = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete', 'Enter'];
    if (allowedKeys.includes(event.key)) {
      return;
    }
    // Block non-digit or entry beyond 10 digits
    if (!/^\d$/.test(event.key) || this.phoneNumber.length >= 10) {
      event.preventDefault();
    }
  }

  onPhonePaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasteData = event.clipboardData?.getData('text') || '';
    const digits = pasteData.replace(/\D/g, '').slice(0, 10);
    this.phoneNumber = digits;
    const input = event.target as HTMLInputElement;
    if (input) {
      input.value = digits;
    }
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digitsOnly = input.value.replace(/\D/g, '').slice(0, 10);
    this.phoneNumber = digitsOnly;
    input.value = digitsOnly;
  }

  async savePerson(): Promise<void> {
    if (!this.name.trim() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    try {
      const cleanPhone = this.phoneNumber ? this.phoneNumber.replace(/\D/g, '').slice(0, 10) : undefined;
      const person = await this.state.createPerson({
        name: this.name.trim(),
        phoneNumber: cleanPhone || undefined,
        email: this.email.trim() || undefined,
        notes: this.notes.trim() || undefined,
      });

      this.personCreated.emit(person);
      this.onClose();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onClose(): void {
    this.closed.emit();
  }
}
