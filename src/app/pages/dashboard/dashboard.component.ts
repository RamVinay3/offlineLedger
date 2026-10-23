import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LoopStateService, FilterCategory } from '../../core/state/loop-state.service';
import {
  ObligationWithDetails,
  StandaloneReminder,
  Commitment,
  RecurringPayment,
} from '../../core/models';
import {
  FastEntryModalComponent,
  EntryModalType,
} from '../../components/fast-entry-modal/fast-entry-modal.component';
import { PaymentModalComponent } from '../../components/payment-modal/payment-modal.component';
import { ShareModalComponent } from '../../components/share-modal/share-modal.component';
import { UpiQrModalComponent } from '../../components/upi-qr-modal/upi-qr-modal.component';
import { EditDueDateModalComponent } from '../../components/edit-due-date-modal/edit-due-date-modal.component';
import { CommitmentPromptModalComponent } from '../../components/commitment-prompt-modal/commitment-prompt-modal.component';
import { RecurringPaymentsModalComponent } from '../../components/recurring-payments-modal/recurring-payments-modal.component';
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
  qrCodeOutline,
  chatbubbleEllipsesOutline,
  callOutline,
  calendarOutline,
  trashOutline,
  alarmOutline,
  briefcaseOutline,
  cardOutline,
  businessOutline,
  personOutline,
  bookmarkOutline,
  repeatOutline,
  refreshOutline,
  notificationsOutline,
  tvOutline,
  fitnessOutline,
  flashOutline,
  receiptOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonIcon,
    FastEntryModalComponent,
    PaymentModalComponent,
    ShareModalComponent,
    UpiQrModalComponent,
    EditDueDateModalComponent,
    CommitmentPromptModalComponent,
    RecurringPaymentsModalComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  Math = Math;
  showFastEntry = signal<boolean>(false);
  fastEntryInitialType = signal<EntryModalType>('MONEY');
  showRecurringModal = signal<boolean>(false);

  selectedObligationForPayment = signal<ObligationWithDetails | null>(null);
  selectedObligationForShare = signal<ObligationWithDetails | null>(null);
  selectedObligationForQr = signal<ObligationWithDetails | null>(null);
  selectedObligationForDueDate = signal<ObligationWithDetails | null>(null);
  promptFulfilledItem = signal<{ obligation: ObligationWithDetails; title: string } | null>(null);

  readonly filters: { key: FilterCategory; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'MONEY', label: 'Money' },
    { key: 'ITEMS', label: 'Items' },
    { key: 'COMMITMENTS', label: 'Services' },
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
      qrCodeOutline,
      chatbubbleEllipsesOutline,
      callOutline,
      calendarOutline,
      trashOutline,
      alarmOutline,
      briefcaseOutline,
      cardOutline,
      businessOutline,
      personOutline,
      bookmarkOutline,
      repeatOutline,
      refreshOutline,
      notificationsOutline,
      tvOutline,
      fitnessOutline,
      flashOutline,
      receiptOutline,
    });
  }

  openRecurringManager(): void {
    this.showRecurringModal.set(true);
  }

  async markRecurringPaid(r: RecurringPayment): Promise<void> {
    await this.state.recordRecurringPaymentCycle(r.id, Boolean(r.personId));
  }

  async skipRecurringCycle(r: RecurringPayment): Promise<void> {
    await this.state.skipRecurringPaymentCycle(r.id);
  }

  getRecurringDueBadge(dateStr: string): { label: string; cls: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parts = dateStr.split('-').map(Number);
    const due = new Date(parts[0], parts[1] - 1, parts[2]);

    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Overdue ${Math.abs(diffDays)}d`, cls: 'badge-overdue' };
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

  getRecurringCatIcon(cat: string): string {
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

  getPerson(personId: string) {
    return this.state.people().find((p) => p.id === personId) || null;
  }

  getPersonPhone(personId: string): string | undefined {
    return this.getPerson(personId)?.phoneNumber;
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

  formatReminderDate(dateStr: string): string {
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    if (d.toDateString() === today.toDateString()) {
      return `Today at ${timeStr}`;
    } else if (d.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow at ${timeStr}`;
    } else {
      return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${timeStr}`;
    }
  }

  getCategoryIcon(cat: string): string {
    switch (cat) {
      case 'INTERVIEW':
        return 'briefcase-outline';
      case 'BILL':
        return 'card-outline';
      case 'WORK':
        return 'business-outline';
      case 'PERSONAL':
        return 'person-outline';
      default:
        return 'bookmark-outline';
    }
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
        return 'Services & Commitments';
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

  openFastEntryWithType(type: EntryModalType): void {
    this.fastEntryInitialType.set(type);
    this.showFastEntry.set(true);
  }

  openChangeDueDate(ob: ObligationWithDetails): void {
    this.selectedObligationForDueDate.set(ob);
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

  async toggleCommitmentCheckbox(ob: ObligationWithDetails, item: Commitment, event: Event): Promise<void> {
    const isChecked = (event.target as HTMLInputElement).checked;
    await this.state.toggleCommitmentItem(item.id, isChecked);
    if (isChecked) {
      this.promptFulfilledItem.set({ obligation: ob, title: item.title });
    }
  }

  onRecordPaymentFromPrompt(): void {
    const prompt = this.promptFulfilledItem();
    if (prompt) {
      this.selectedObligationForPayment.set(prompt.obligation);
      this.promptFulfilledItem.set(null);
    }
  }

  async toggleStandaloneReminder(r: StandaloneReminder, event: Event): Promise<void> {
    const isChecked = (event.target as HTMLInputElement).checked;
    await this.state.toggleStandaloneReminder(r.id, isChecked);
  }

  async deleteStandaloneReminder(r: StandaloneReminder): Promise<void> {
    await this.state.deleteStandaloneReminder(r.id);
  }

  onFastEntrySaved(): void {
    this.showFastEntry.set(false);
  }

  onPaymentRecorded(): void {
    this.selectedObligationForPayment.set(null);
  }
}
