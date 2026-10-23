import { Component, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoopStateService } from '../../core/state/loop-state.service';
import {
  RecurringPayment,
  RecurringPaymentCategory,
  RecurringPaymentDirection,
  RecurringPaymentFrequency,
} from '../../core/models';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  repeatOutline,
  addOutline,
  checkmarkCircleOutline,
  playForwardOutline,
  pauseOutline,
  playOutline,
  trashOutline,
  walletOutline,
  trendingDownOutline,
  trendingUpOutline,
  notificationsOutline,
  calendarOutline,
  personOutline,
  cardOutline,
  businessOutline,
  tvOutline,
  fitnessOutline,
  flashOutline,
  receiptOutline,
} from 'ionicons/icons';

type RecurringFilter = 'ALL' | 'PAY' | 'RECEIVE' | 'ACTIVE' | 'PAUSED';

@Component({
  selector: 'app-recurring-payments-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './recurring-payments-modal.component.html',
  styleUrl: './recurring-payments-modal.component.css',
})
export class RecurringPaymentsModalComponent {
  readonly closed = output<void>();
  readonly openAddRecurring = output<void>();

  filter = signal<RecurringFilter>('ALL');
  actionInProgressId = signal<string | null>(null);

  constructor(public state: LoopStateService) {
    addIcons({
      closeOutline,
      repeatOutline,
      addOutline,
      checkmarkCircleOutline,
      playForwardOutline,
      pauseOutline,
      playOutline,
      trashOutline,
      walletOutline,
      trendingDownOutline,
      trendingUpOutline,
      notificationsOutline,
      calendarOutline,
      personOutline,
      cardOutline,
      businessOutline,
      tvOutline,
      fitnessOutline,
      flashOutline,
      receiptOutline,
    });
  }

  readonly filteredList = computed<RecurringPayment[]>(() => {
    const list = this.state.recurringPayments();
    const f = this.filter();

    switch (f) {
      case 'PAY':
        return list.filter((r) => r.direction === 'PAY');
      case 'RECEIVE':
        return list.filter((r) => r.direction === 'RECEIVE');
      case 'ACTIVE':
        return list.filter((r) => r.isActive);
      case 'PAUSED':
        return list.filter((r) => !r.isActive);
      case 'ALL':
      default:
        return list;
    }
  });

  setFilter(f: RecurringFilter): void {
    this.filter.set(f);
  }

  async markPaid(r: RecurringPayment): Promise<void> {
    if (this.actionInProgressId()) return;
    this.actionInProgressId.set(r.id);
    try {
      await this.state.recordRecurringPaymentCycle(r.id, Boolean(r.personId));
    } finally {
      this.actionInProgressId.set(null);
    }
  }

  async skipCycle(r: RecurringPayment): Promise<void> {
    if (this.actionInProgressId()) return;
    this.actionInProgressId.set(r.id);
    try {
      await this.state.skipRecurringPaymentCycle(r.id);
    } finally {
      this.actionInProgressId.set(null);
    }
  }

  async toggleActive(r: RecurringPayment): Promise<void> {
    if (this.actionInProgressId()) return;
    this.actionInProgressId.set(r.id);
    try {
      await this.state.toggleRecurringPaymentActive(r.id, !r.isActive);
    } finally {
      this.actionInProgressId.set(null);
    }
  }

  async deleteRecurring(r: RecurringPayment): Promise<void> {
    if (this.actionInProgressId()) return;
    if (confirm(`Delete recurring payment "${r.title}"?`)) {
      this.actionInProgressId.set(r.id);
      try {
        await this.state.deleteRecurringPayment(r.id);
      } finally {
        this.actionInProgressId.set(null);
      }
    }
  }

  getCategoryIcon(cat: RecurringPaymentCategory): string {
    switch (cat) {
      case 'RENT':
        return 'business-outline';
      case 'SUBSCRIPTION':
        return 'tv-outline';
      case 'UTILITY':
        return 'flash-outline';
      case 'LOAN_EMI':
        return 'card-outline';
      case 'MEMBERSHIP':
        return 'fitness-outline';
      case 'SALARY':
        return 'wallet-outline';
      default:
        return 'receipt-outline';
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  getDueBadge(dateStr: string): { label: string; cls: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parts = dateStr.split('-').map(Number);
    const due = new Date(parts[0], parts[1] - 1, parts[2]);

    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const past = Math.abs(diffDays);
      return { label: `Overdue by ${past}d`, cls: 'badge-overdue' };
    }
    if (diffDays === 0) {
      return { label: 'Due Today', cls: 'badge-today' };
    }
    if (diffDays === 1) {
      return { label: 'Due Tomorrow', cls: 'badge-soon' };
    }
    if (diffDays <= 7) {
      return { label: `Due in ${diffDays}d`, cls: 'badge-soon' };
    }
    return { label: `In ${diffDays}d`, cls: 'badge-future' };
  }

  onAddNew(): void {
    this.openAddRecurring.emit();
    this.closed.emit();
  }

  onClose(): void {
    this.closed.emit();
  }
}
