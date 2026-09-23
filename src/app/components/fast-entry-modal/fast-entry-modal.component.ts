import { Component, input, output, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoopStateService } from '../../core/state/loop-state.service';
import { ObligationDirection, ObligationType, Person } from '../../core/models';
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
} from 'ionicons/icons';

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
  readonly initialType = input<ObligationType>('MONEY');
  readonly saved = output<void>();
  readonly closed = output<void>();

  direction = signal<ObligationDirection>('LENT');
  entryType = signal<ObligationType>('MONEY');
  selectedPersonId = '';
  title = '';
  description = '';
  amount: number | null = null;
  dueDate = '';
  selectedPreset = signal<number | null>(null);

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
      this.entryType.set(this.initialType());
    }
  }

  setDirection(d: ObligationDirection): void {
    this.direction.set(d);
  }

  setEntryType(t: ObligationType): void {
    this.entryType.set(t);
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
        label: `Past date (${pastDays} day${pastDays > 1 ? 's' : ''} ago) — will be recorded as Overdue immediately`,
      };
    } else if (diffDays === 0) {
      return {
        isPast: false,
        label: 'Due today',
      };
    } else if (diffDays === 1) {
      return {
        isPast: false,
        label: 'Due tomorrow (in 1 day)',
      };
    } else if (diffDays === 7) {
      return {
        isPast: false,
        label: 'Due in 1 week (7 days)',
      };
    } else if (diffDays === 14) {
      return {
        isPast: false,
        label: 'Due in 2 weeks (14 days)',
      };
    } else if (diffDays === 30 || diffDays === 31) {
      return {
        isPast: false,
        label: 'Due in 1 month (30 days)',
      };
    } else {
      return {
        isPast: false,
        label: `Due in ${diffDays} days`,
      };
    }
  }

  isValid(): boolean {
    if (!this.selectedPersonId) return false;
    const type = this.entryType();
    if (type === 'MONEY') {
      return (this.amount || 0) > 0;
    }
    if (type === 'ITEM' || type === 'COMMITMENT') {
      return this.title.trim().length > 0;
    }
    return true;
  }

  onNewPersonCreated(person: Person): void {
    // Only auto-assign if person is not locked to a specific profile
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

      if (type === 'MONEY') {
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
        await this.state.addCommitmentObligation({
          personId: this.selectedPersonId,
          direction: dir,
          title: this.title.trim(),
          description: this.description.trim() || undefined,
          dueDate: this.dueDate || undefined,
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
