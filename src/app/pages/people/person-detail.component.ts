import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoopStateService } from '../../core/state/loop-state.service';
import {
  ObligationWithDetails,
  ObligationDirection,
  ObligationType,
  Activity,
  PersonBalanceSummary,
  Commitment,
  RecurringPayment,
} from '../../core/models';
import { FastEntryModalComponent } from '../../components/fast-entry-modal/fast-entry-modal.component';
import { PaymentModalComponent } from '../../components/payment-modal/payment-modal.component';
import { SettlementModalComponent } from '../../components/settlement-modal/settlement-modal.component';
import { ShareModalComponent } from '../../components/share-modal/share-modal.component';
import { UpiQrModalComponent } from '../../components/upi-qr-modal/upi-qr-modal.component';
import { AddPersonModalComponent } from '../../components/add-person-modal/add-person-modal.component';
import { EditDueDateModalComponent } from '../../components/edit-due-date-modal/edit-due-date-modal.component';
import { CommitmentPromptModalComponent } from '../../components/commitment-prompt-modal/commitment-prompt-modal.component';
import { ContactSyncService } from '../../core/services/contact-sync.service';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  cashOutline,
  cubeOutline,
  checkboxOutline,
  swapHorizontalOutline,
  addOutline,
  arrowDownOutline,
  arrowUpOutline,
  timeOutline,
  checkmarkCircleOutline,
  callOutline,
  mailOutline,
  documentTextOutline,
  checkmarkDoneOutline,
  shareSocialOutline,
  qrCodeOutline,
  chatbubbleEllipsesOutline,
  createOutline,
  logoWhatsapp,
  calendarOutline,
  alertCircleOutline,
  checkmarkCircle,
  ellipseOutline,
  gitCommitOutline,
  repeatOutline,
  personAddOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-person-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonIcon,
    FastEntryModalComponent,
    PaymentModalComponent,
    SettlementModalComponent,
    ShareModalComponent,
    UpiQrModalComponent,
    AddPersonModalComponent,
    EditDueDateModalComponent,
    CommitmentPromptModalComponent,
  ],
  templateUrl: './person-detail.component.html',
  styleUrl: './person-detail.component.css',
})
export class PersonDetailComponent implements OnInit {
  Math = Math;
  personId = signal<string>('');
  selectedTab = signal<'MONEY' | 'ITEMS' | 'COMMITMENTS' | 'TIMELINE'>('MONEY');

  showFastEntry = signal<boolean>(false);
  fastEntryDirection = signal<ObligationDirection>('LENT');
  fastEntryType = signal<ObligationType>('MONEY');

  selectedObligationForPayment = signal<ObligationWithDetails | null>(null);
  selectedObligationForShare = signal<ObligationWithDetails | null>(null);
  selectedObligationForQr = signal<ObligationWithDetails | null>(null);
  selectedObligationForDueDate = signal<ObligationWithDetails | null>(null);
  promptFulfilledItem = signal<{ obligation: ObligationWithDetails; title: string } | null>(null);

  showSettlementModal = signal<boolean>(false);
  showEditPersonModal = signal<boolean>(false);

  newMilestoneInputs: { [key: string]: string } = {};

  readonly currentPerson = computed(() => {
    const id = this.personId();
    return this.state.people().find((p) => p.id === id) || null;
  });

  readonly currentBalance = computed<PersonBalanceSummary | null>(() => {
    const id = this.personId();
    return this.state.personBalances().find((b) => b.personId === id) || null;
  });

  readonly hasMutualDebts = computed<boolean>(() => {
    const b = this.currentBalance();
    return !!b && b.totalOwedToYou > 0 && b.totalYouOwe > 0;
  });

  readonly personRecurringPayments = computed<RecurringPayment[]>(() => {
    const id = this.personId();
    return this.state.recurringPayments().filter((r) => r.personId === id);
  });

  readonly personObligations = computed<ObligationWithDetails[]>(() => {
    const id = this.personId();
    return this.state.obligations().filter((o) => o.personId === id);
  });

  readonly moneyObligations = computed<ObligationWithDetails[]>(() => {
    return this.personObligations()
      .filter((o) => o.type === 'MONEY')
      .sort((a, b) => {
        const aActive = a.status !== 'COMPLETED' && a.status !== 'CANCELLED' ? 0 : 1;
        const bActive = b.status !== 'COMPLETED' && b.status !== 'CANCELLED' ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  });

  readonly activeMoneyObligationsCount = computed<number>(() => {
    return this.moneyObligations().filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
  });

  readonly itemObligations = computed<ObligationWithDetails[]>(() => {
    return this.personObligations()
      .filter((o) => o.type === 'ITEM')
      .sort((a, b) => {
        const aActive = a.status !== 'COMPLETED' && a.status !== 'CANCELLED' ? 0 : 1;
        const bActive = b.status !== 'COMPLETED' && b.status !== 'CANCELLED' ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  });

  readonly commitmentObligations = computed<ObligationWithDetails[]>(() => {
    return this.personObligations()
      .filter((o) => o.type === 'COMMITMENT' || o.type === 'SERVICE')
      .sort((a, b) => {
        const aActive = a.status !== 'COMPLETED' && a.status !== 'CANCELLED' ? 0 : 1;
        const bActive = b.status !== 'COMPLETED' && b.status !== 'CANCELLED' ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  });

  readonly personActivities = computed<Activity[]>(() => {
    const id = this.personId();
    return this.state.activities().filter((a) => a.personId === id);
  });

  contactSavedFeedback = signal<string>('');

  constructor(
    public state: LoopStateService,
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private contactSync: ContactSyncService
  ) {
    addIcons({
      arrowBackOutline,
      cashOutline,
      cubeOutline,
      checkboxOutline,
      swapHorizontalOutline,
      addOutline,
      arrowDownOutline,
      arrowUpOutline,
      timeOutline,
      checkmarkCircleOutline,
      callOutline,
      mailOutline,
      documentTextOutline,
      checkmarkDoneOutline,
      shareSocialOutline,
      qrCodeOutline,
      chatbubbleEllipsesOutline,
      createOutline,
      logoWhatsapp,
      calendarOutline,
      alertCircleOutline,
      checkmarkCircle,
      ellipseOutline,
      gitCommitOutline,
      repeatOutline,
      personAddOutline,
    });
  }

  async savePersonToContacts(): Promise<void> {
    const p = this.currentPerson();
    if (!p || !p.phoneNumber) return;

    try {
      const res = await this.contactSync.saveToDeviceContacts(p);
      if (res.method === 'download') {
        this.contactSavedFeedback.set(`Contact card (.vcf) downloaded for ${p.name}. Tap to save to phone.`);
      } else {
        this.contactSavedFeedback.set(`Saved "${p.name}" to phone contacts!`);
      }
      setTimeout(() => this.contactSavedFeedback.set(''), 4500);
    } catch {
      this.contactSavedFeedback.set('Could not export contact.');
      setTimeout(() => this.contactSavedFeedback.set(''), 3000);
    }
  }

  getWhatsAppUrl(phoneNumber?: string): string {
    if (!phoneNumber) return 'https://wa.me/';
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length === 10) {
      return `https://wa.me/91${digits}`;
    }
    return `https://wa.me/${digits}`;
  }

  getEmailLabel(email?: string): string {
    if (!email) return 'Email';
    return email.toLowerCase().includes('gmail') ? 'Gmail' : 'Email';
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.personId.set(id);
      this.state.selectedPersonId.set(id);
    }
  }

  goBack(): void {
    const from = (window.history.state as any)?.from;
    if (from) {
      this.router.navigateByUrl(from);
    } else if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/tabs/dashboard']);
    }
  }

  openFastEntry(direction: ObligationDirection, type: ObligationType): void {
    this.fastEntryDirection.set(direction);
    this.fastEntryType.set(type);
    this.showFastEntry.set(true);
  }

  openPaymentModal(ob: ObligationWithDetails): void {
    this.selectedObligationForPayment.set(ob);
  }

  openChangeDueDate(ob: ObligationWithDetails): void {
    this.selectedObligationForDueDate.set(ob);
  }

  async returnItem(item: ObligationWithDetails): Promise<void> {
    await this.state.returnItem(item.id);
  }

  // --- Commitment & Milestone Item Actions ---

  async toggleCommitmentCheckbox(ob: ObligationWithDetails, item: Commitment, event: Event): Promise<void> {
    const isChecked = (event.target as HTMLInputElement).checked;
    const res = await this.state.toggleCommitmentItem(item.id, isChecked);

    // If marked fulfilled, prompt to record payment!
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

  async addMilestoneToObligation(obligationId: string): Promise<void> {
    const text = (this.newMilestoneInputs[obligationId] || '').trim();
    if (!text) return;
    await this.state.addCommitmentItem(obligationId, text);
    this.newMilestoneInputs[obligationId] = '';
  }

  async completeCommitment(c: ObligationWithDetails): Promise<void> {
    await this.state.completeCommitment(c.id);
  }

  getCommitmentProgress(ob: ObligationWithDetails): number {
    const list = ob.commitmentList || [];
    if (list.length === 0) {
      return ob.status === 'COMPLETED' ? 100 : 0;
    }
    const completed = list.filter((i) => i.status === 'COMPLETED').length;
    return Math.round((completed / list.length) * 100);
  }

  getCompletedCount(ob: ObligationWithDetails): number {
    const list = ob.commitmentList || [];
    return list.filter((i) => i.status === 'COMPLETED').length;
  }

  getPaymentProgress(ob: ObligationWithDetails): number {
    if (ob.amount <= 0) return 0;
    const paid = ob.amount - ob.remainingAmount;
    return Math.min(100, Math.max(0, (paid / ob.amount) * 100));
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

  formatDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatEventType(type: string): string {
    return type.replace(/_/g, ' ');
  }

  onFastEntrySaved(): void {
    this.showFastEntry.set(false);
  }

  onPaymentRecorded(): void {
    this.selectedObligationForPayment.set(null);
  }

  onSettled(): void {
    this.showSettlementModal.set(false);
  }
}
