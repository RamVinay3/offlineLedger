import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LoopStateService, FilterCategory } from '../../core/state/loop-state.service';
import { ObligationWithDetails } from '../../core/models';
import { FastEntryModalComponent } from '../../components/fast-entry-modal/fast-entry-modal.component';
import { PaymentModalComponent } from '../../components/payment-modal/payment-modal.component';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  searchOutline,
  alertCircle,
  timeOutline,
  cashOutline,
  cubeOutline,
  checkboxOutline,
  checkmarkCircle,
  arrowUpOutline,
  arrowDownOutline,
  addOutline,
  filterOutline,
  checkmarkDoneOutline,
  chevronForwardOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, FastEntryModalComponent, PaymentModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  Math = Math;
  showFastEntry = signal<boolean>(false);
  selectedObligationForPayment = signal<ObligationWithDetails | null>(null);

  readonly filters: { key: FilterCategory; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'MONEY', label: 'Money' },
    { key: 'ITEMS', label: 'Items' },
    { key: 'COMMITMENTS', label: 'Commitments' },
    { key: 'OVERDUE', label: 'Overdue' },
    { key: 'DUE', label: 'Due Soon' },
    { key: 'COMPLETED', label: 'Completed' },
  ];

  constructor(
    public state: LoopStateService,
    private router: Router
  ) {
    addIcons({
      searchOutline,
      alertCircle,
      timeOutline,
      cashOutline,
      cubeOutline,
      checkboxOutline,
      checkmarkCircle,
      arrowUpOutline,
      arrowDownOutline,
      addOutline,
      filterOutline,
      checkmarkDoneOutline,
      chevronForwardOutline,
      shieldCheckmarkOutline,
    });
  }

  isOverdue(dueDate?: string): boolean {
    if (!dueDate) return false;
    const d = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  getFilterTitle(filter: FilterCategory): string {
    if (this.state.searchQuery()) {
      return `Search Results for "${this.state.searchQuery()}"`;
    }
    switch (filter) {
      case 'MONEY':
        return 'Active Money Obligations';
      case 'ITEMS':
        return 'Active Lent & Borrowed Items';
      case 'COMMITMENTS':
        return 'Active Commitments';
      case 'OVERDUE':
        return 'Overdue Obligations';
      case 'DUE':
        return 'Upcoming Obligations';
      case 'COMPLETED':
        return 'Completed History';
      case 'ALL':
      default:
        return 'All Active Obligations';
    }
  }

  getPaymentProgress(ob: ObligationWithDetails): number {
    if (ob.amount <= 0) return 0;
    const paid = ob.amount - ob.remainingAmount;
    return Math.min(100, Math.max(0, (paid / ob.amount) * 100));
  }

  openPerson(personId: string): void {
    this.router.navigate(['/people', personId], { state: { from: '/tabs/dashboard' } });
  }

  openPaymentModal(ob: ObligationWithDetails): void {
    this.selectedObligationForPayment.set(ob);
  }

  async returnItem(ob: ObligationWithDetails): Promise<void> {
    await this.state.returnItem(ob.id);
  }

  async completeCommitment(ob: ObligationWithDetails): Promise<void> {
    await this.state.completeCommitment(ob.id);
  }

  onFastEntrySaved(): void {
    this.showFastEntry.set(false);
  }

  onPaymentRecorded(): void {
    this.selectedObligationForPayment.set(null);
  }
}
