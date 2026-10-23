import { Component, input, output, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoopStateService } from '../../core/state/loop-state.service';
import {
  ObligationDirection,
  ObligationType,
  Person,
  StandaloneReminderCategory,
  RecurringPaymentCategory,
  RecurringPaymentFrequency,
  RecurringPaymentDirection,
} from '../../core/models';
import { AddPersonModalComponent } from '../add-person-modal/add-person-modal.component';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  flashOutline,
  cashOutline,
  cubeOutline,
  checkboxOutline,
  personAddOutline,
  lockClosedOutline,
  alarmOutline,
  addOutline,
  trashOutline,
  briefcaseOutline,
  cardOutline,
  businessOutline,
  personOutline,
  bookmarkOutline,
  repeatOutline,
  refreshOutline,
  notificationsOutline,
  receiptOutline,
  tvOutline,
  fitnessOutline,
  walletOutline,
} from 'ionicons/icons';

export type EntryModalType = 'MONEY' | 'ITEM' | 'COMMITMENT' | 'REMINDER' | 'RECURRING';

@Component({
  selector: 'app-fast-entry-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, AddPersonModalComponent],
  templateUrl: './fast-entry-modal.component.html',
  styleUrl: './fast-entry-modal.component.css',
})
export class FastEntryModalComponent implements OnInit {
  readonly initialPersonId = input<string | null>(null);
  readonly lockPerson = input<boolean>(false);
  readonly initialDirection = input<ObligationDirection>('LENT');
  readonly initialType = input<ObligationType | 'REMINDER' | 'RECURRING'>('MONEY');
  readonly saved = output<void>();
  readonly closed = output<void>();

  direction = signal<ObligationDirection>('LENT');
  entryType = signal<EntryModalType>('MONEY');
  selectedPersonId = '';
  title = '';
  description = '';
  amount: number | null = null;
  serviceFee: number | null = null;
  dueDate = '';
  selectedPreset = signal<number | null>(null);

  // Commitment / Service Checklist Items
  commitmentChecklist: string[] = ['Deliver first milestone'];
  newChecklistItem = '';

  // Standalone Reminder properties
  reminderCategory = signal<StandaloneReminderCategory>('INTERVIEW');
  reminderTime = '10:00';

  // Recurring Payment properties
  recurringFrequency = signal<RecurringPaymentFrequency>('MONTHLY');
  recurringCategory = signal<RecurringPaymentCategory>('SUBSCRIPTION');
  recurringDirection = signal<RecurringPaymentDirection>('PAY');
  recurringReminderDays = signal<number>(1);
  recurringReminderTime = '09:00';
  recurringAutoRecord = signal<boolean>(false);

  showAddPersonModal = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);

  readonly isPersonLocked = computed<boolean>(() => {
    return this.lockPerson() || !!this.initialPersonId();
  });

  readonly lockedPerson = computed(() => {
    const id = this.initialPersonId() || this.selectedPersonId;
    if (!id) return null;
    return this.state.people().find((p) => p.id === id) || null;
  });

  constructor(public state: LoopStateService) {
    addIcons({
      closeOutline,
      flashOutline,
      cashOutline,
      cubeOutline,
      checkboxOutline,
      personAddOutline,
      lockClosedOutline,
      alarmOutline,
      addOutline,
      trashOutline,
      briefcaseOutline,
      cardOutline,
      businessOutline,
      personOutline,
      bookmarkOutline,
      repeatOutline,
      refreshOutline,
      notificationsOutline,
      receiptOutline,
      tvOutline,
      fitnessOutline,
      walletOutline,
    });
  }

  ngOnInit(): void {
    if (this.initialPersonId()) {
      this.selectedPersonId = this.initialPersonId()!;
    }
    if (this.initialDirection()) {
      this.direction.set(this.initialDirection());
    }
    if (this.initialType()) {
      this.entryType.set(this.initialType() as EntryModalType);
    }
  }

  setDirection(d: ObligationDirection): void {
    this.direction.set(d);
  }

  setEntryType(t: EntryModalType): void {
    this.entryType.set(t);
  }

  // --- Checklist Management for Commitments/Services ---

  addChecklistItem(text?: string): void {
    const itemText = (text || this.newChecklistItem).trim();
    if (!itemText) return;
    this.commitmentChecklist.push(itemText);
    this.newChecklistItem = '';
  }

  removeChecklistItem(index: number): void {
    if (this.commitmentChecklist.length > 1) {
      this.commitmentChecklist.splice(index, 1);
    } else {
      this.commitmentChecklist[0] = '';
    }
  }

  autoGrow(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  setDuePreset(days: number): void {
    if (this.selectedPreset() === days) {
      this.clearDueDate();
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + days);
    this.dueDate = d.toISOString().substring(0, 10);
    this.selectedPreset.set(days);
  }

  clearDueDate(): void {
    this.dueDate = '';
    this.selectedPreset.set(null);
  }

  onDateInputChange(): void {
    if (!this.dueDate) {
      this.selectedPreset.set(null);
      return;
    }
    const due = new Date(this.dueDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 3 || diffDays === 7 || diffDays === 30) {
      this.selectedPreset.set(diffDays);
    } else {
      this.selectedPreset.set(null);
    }
  }

  getDueDateStatus(): { isPast: boolean; label: string } | null {
    if (!this.dueDate) return null;
    const due = new Date(this.dueDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const pastDays = Math.abs(diffDays);
      return {
        isPast: true,
        label: `Past date (${pastDays} day${pastDays > 1 ? 's' : ''} ago) — recorded as Overdue`,
      };
    } else if (diffDays === 0) {
      return { isPast: false, label: 'Due today' };
    } else if (diffDays === 1) {
      return { isPast: false, label: 'Due tomorrow (in 1 day)' };
    } else if (diffDays === 7) {
      return { isPast: false, label: 'Due in 1 week (7 days)' };
    } else {
      return { isPast: false, label: `Due in ${diffDays} days` };
    }
  }

  applyRecurringPreset(preset: {
    title: string;
    amount?: number;
    category: RecurringPaymentCategory;
    frequency: RecurringPaymentFrequency;
    direction: RecurringPaymentDirection;
  }): void {
    this.title = preset.title;
    if (preset.amount) this.amount = preset.amount;
    this.recurringCategory.set(preset.category);
    this.recurringFrequency.set(preset.frequency);
    this.recurringDirection.set(preset.direction);
    if (!this.dueDate) {
      this.setDuePreset(0);
    }
  }

  isValid(): boolean {
    const type = this.entryType();

    // Standalone Reminder requires title & dueDate, but NO person!
    if (type === 'REMINDER') {
      return this.title.trim().length > 0 && this.dueDate.length > 0;
    }

    // Recurring Payment requires title, amount, dueDate (person is optional)
    if (type === 'RECURRING') {
      return this.title.trim().length > 0 && (this.amount || 0) > 0 && this.dueDate.length > 0;
    }

    // All other obligations require a selected person
    if (!this.selectedPersonId) return false;

    if (type === 'MONEY') {
      return (this.amount || 0) > 0;
    }
    if (type === 'ITEM') {
      return this.title.trim().length > 0;
    }
    if (type === 'COMMITMENT') {
      const validItems = this.commitmentChecklist.filter((c) => c.trim().length > 0);
      return this.title.trim().length > 0 && (validItems.length > 0 || this.newChecklistItem.trim().length > 0);
    }
    return true;
  }

  onNewPersonCreated(person: Person): void {
    if (!this.lockPerson()) {
      this.selectedPersonId = person.id;
    }
    this.showAddPersonModal.set(false);
  }

  async saveEntry(): Promise<void> {
    if (!this.isValid() || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    try {
      const type = this.entryType();
      const dir = this.direction();

      if (type === 'REMINDER') {
        // One-time standalone reminder (e.g. interview with company, bill)
        const reminderDateTime = `${this.dueDate}T${this.reminderTime || '09:00'}:00`;
        await this.state.createStandaloneReminder({
          title: this.title.trim(),
          category: this.reminderCategory(),
          reminderDate: reminderDateTime,
          notes: this.description.trim() || undefined,
        });
      } else if (type === 'RECURRING') {
        // Recurring payment (rent, subscription, EMI, retainer)
        await this.state.createRecurringPayment({
          title: this.title.trim(),
          amount: this.amount!,
          currency: this.state.settings().currencySymbol,
          direction: this.recurringDirection(),
          frequency: this.recurringFrequency(),
          personId: this.selectedPersonId || undefined,
          category: this.recurringCategory(),
          startDate: this.dueDate,
          nextDueDate: this.dueDate,
          reminderDaysBefore: this.recurringReminderDays(),
          reminderTime: this.recurringReminderTime || '09:00',
          autoRecordObligation: this.recurringAutoRecord(),
          notes: this.description.trim() || undefined,
        });
      } else if (type === 'MONEY') {
        const title = this.title.trim() || (dir === 'LENT' ? 'Money lent' : 'Money borrowed');
        await this.state.addMoneyObligation({
          personId: this.selectedPersonId,
          direction: dir,
          title,
          description: this.description.trim() || undefined,
          amount: this.amount!,
          currency: this.state.settings().currencySymbol,
          dueDate: this.dueDate || undefined,
        });
      } else if (type === 'ITEM') {
        await this.state.addItemObligation({
          personId: this.selectedPersonId,
          direction: dir,
          name: this.title.trim(),
          description: this.description.trim() || undefined,
          expectedReturnDate: this.dueDate || undefined,
        });
      } else if (type === 'COMMITMENT') {
        // Service / Commitment with checklist items and optional fee
        const validItems = this.commitmentChecklist
          .map((c) => c.trim())
          .filter((c) => c.length > 0);

        if (this.newChecklistItem.trim()) {
          validItems.push(this.newChecklistItem.trim());
        }

        const fee = this.serviceFee && this.serviceFee > 0 ? this.serviceFee : undefined;

        await this.state.addCommitmentObligation({
          personId: this.selectedPersonId,
          direction: dir,
          title: this.title.trim(),
          description: this.description.trim() || undefined,
          dueDate: this.dueDate || undefined,
          items: validItems.length > 0 ? validItems : [this.title.trim()],
          amount: fee,
          currency: this.state.settings().currencySymbol,
          type: fee ? 'SERVICE' : 'COMMITMENT',
        });
      }

      this.saved.emit();
      this.onClose();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onClose(): void {
    this.closed.emit();
  }
}
