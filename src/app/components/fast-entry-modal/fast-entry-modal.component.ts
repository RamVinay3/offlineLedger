import { Component, input, output, signal } from '@angular/core';
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
} from 'ionicons/icons';

@Component({
  selector: 'app-fast-entry-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, AddPersonModalComponent],
  templateUrl: './fast-entry-modal.component.html',
  styleUrl: './fast-entry-modal.component.css',
})
export class FastEntryModalComponent {
  readonly initialPersonId = input<string | null>(null);
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

  showAddPersonModal = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);

  constructor(public state: LoopStateService) {
    addIcons({ closeOutline, flashOutline, cashOutline, cubeOutline, checkboxOutline, personAddOutline });
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

  setDuePreset(days: number): void {
    const d = new Date();
    d.setDate(d.getDate() + days);
    this.dueDate = d.toISOString().substring(0, 10);
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
    } else {
      return {
        isPast: false,
        label: `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`,
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
    this.selectedPersonId = person.id;
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
