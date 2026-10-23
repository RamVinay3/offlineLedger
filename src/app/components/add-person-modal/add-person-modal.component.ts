import { Component, signal, output, input, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoopStateService } from '../../core/state/loop-state.service';
import { ContactSyncService } from '../../core/services/contact-sync.service';
import { Person } from '../../core/models';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  personAddOutline,
  createOutline,
  alertCircleOutline,
  phonePortraitOutline,
  cloudUploadOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-add-person-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './add-person-modal.component.html',
  styleUrl: './add-person-modal.component.css',
})
export class AddPersonModalComponent implements OnInit {
  readonly personToEdit = input<Person | null>(null);
  readonly personCreated = output<Person>();
  readonly personUpdated = output<Person>();
  readonly closed = output<void>();

  name = '';
  phoneNumber = '';
  email = '';
  notes = '';
  saveToPhoneContacts = true;
  duplicateWarning = signal<string>('');
  contactImportNotice = signal<string>('');
  isSubmitting = signal<boolean>(false);
  isPickingContact = signal<boolean>(false);

  constructor(
    private state: LoopStateService,
    public contactSync: ContactSyncService
  ) {
    addIcons({
      closeOutline,
      personAddOutline,
      createOutline,
      alertCircleOutline,
      phonePortraitOutline,
      cloudUploadOutline,
      checkmarkCircleOutline,
    });

    effect(() => {
      const p = this.personToEdit();
      if (p) {
        this.name = p.name;
        this.phoneNumber = p.phoneNumber || '';
        this.email = p.email || '';
        this.notes = p.notes || '';
      }
    });
  }

  ngOnInit(): void {
    const p = this.personToEdit();
    if (p) {
      this.name = p.name;
      this.phoneNumber = p.phoneNumber || '';
      this.email = p.email || '';
      this.notes = p.notes || '';
    }
  }

  async pickFromDevice(): Promise<void> {
    this.contactImportNotice.set('');
    if (this.contactSync.isNativeContactPickerSupported()) {
      try {
        this.isPickingContact.set(true);
        const contact = await this.contactSync.pickSingleNativeContact();
        if (!contact) return;
        this.applyImportedContact(contact.name, contact.phoneNumber, contact.email, contact.notes);
      } catch (e: any) {
        this.contactImportNotice.set(e.message || 'Could not access device contacts.');
      } finally {
        this.isPickingContact.set(false);
      }
    } else {
      // If native picker not supported, open file picker for .vcf
      const fileInput = document.getElementById('vcfQuickInput') as HTMLInputElement;
      if (fileInput) fileInput.click();
    }
  }

  async onVcfPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    try {
      const text = await file.text();
      const contacts = this.contactSync.parseVCard(text);
      if (contacts.length > 0) {
        const c = contacts[0];
        this.applyImportedContact(c.name, c.phoneNumber, c.email, c.notes);
        input.value = '';
      } else {
        this.contactImportNotice.set('No contact details found in file.');
      }
    } catch {
      this.contactImportNotice.set('Failed to read contact file.');
    }
  }

  private applyImportedContact(name: string, phone?: string, email?: string, notes?: string): void {
    this.name = name;
    if (phone) {
      const digits = phone.replace(/\D/g, '').slice(-10);
      this.phoneNumber = digits;
    }
    if (email) this.email = email;
    if (notes && !this.notes) this.notes = notes;
    this.checkDuplicate();
    this.contactImportNotice.set(`Loaded details for "${name}"`);
    setTimeout(() => this.contactImportNotice.set(''), 4000);
  }

  checkDuplicate(): void {
    const trimmed = this.name.trim().toLowerCase();
    if (!trimmed) {
      this.duplicateWarning.set('');
      return;
    }

    const editId = this.personToEdit()?.id;
    const existing = this.state.people().find(
      (p) => p.name.toLowerCase() === trimmed && p.id !== editId
    );
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
      const personData = {
        name: this.name.trim(),
        phoneNumber: cleanPhone || undefined,
        email: this.email.trim() || undefined,
        notes: this.notes.trim() || undefined,
      };

      const toEdit = this.personToEdit();
      if (toEdit) {
        await this.state.updatePerson(toEdit.id, personData);
        const updated: Person = {
          ...toEdit,
          ...personData,
          updatedAt: new Date().toISOString(),
        };
        this.personUpdated.emit(updated);
      } else {
        const person = await this.state.createPerson(personData);
        this.personCreated.emit(person);
      }

      // If phone number is present and save to contacts is checked, trigger device save
      if (this.saveToPhoneContacts && personData.phoneNumber) {
        try {
          await this.contactSync.saveToDeviceContacts(personData);
        } catch {
          // Non-blocking
        }
      }

      this.onClose();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  onClose(): void {
    this.closed.emit();
  }
}
