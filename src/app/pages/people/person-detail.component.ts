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
} from '../../core/models';
import { FastEntryModalComponent } from '../../components/fast-entry-modal/fast-entry-modal.component';
import { PaymentModalComponent } from '../../components/payment-modal/payment-modal.component';
import { SettlementModalComponent } from '../../components/settlement-modal/settlement-modal.component';
import { ShareModalComponent } from '../../components/share-modal/share-modal.component';
import { UpiQrModalComponent } from '../../components/upi-qr-modal/upi-qr-modal.component';
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
  showSettlementModal = signal<boolean>(false);

  readonly currentPerson = computed(() => {
    const id = this.personId();
    return this.state.people().find((p) => p.id === id) || null;
  });

  readonly currentBalance = computed<PersonBalanceSummary | null>(() => {
    const id = this.personId();
    return this.state.personBalances().find((b) => b.personId === id) || null;
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
      .filter((o) => o.type === 'COMMITMENT')
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

  constructor(
    public state: LoopStateService,
    private route: ActivatedRoute,
    private router: Router,
    private location: Location
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
    });
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

  async returnItem(item: ObligationWithDetails): Promise<void> {
    await this.state.returnItem(item.id);
  }

  async completeCommitment(c: ObligationWithDetails): Promise<void> {
    await this.state.completeCommitment(c.id);
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
