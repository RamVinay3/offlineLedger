import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoopStateService } from '../../core/state/loop-state.service';
import { ObligationWithDetails } from '../../core/models';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, cashOutline, alertCircleOutline, checkmarkCircleOutline } from 'ionicons/icons';

@Component({
  selector: 'app-payment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './payment-modal.component.html',
  styleUrl: './payment-modal.component.css',
})
export class PaymentModalComponent {
  readonly obligation = input.required<ObligationWithDetails>();
  readonly paymentRecorded = output<void>();
  readonly closed = output<void>();

  amount = 0;
  paymentDate = new Date().toISOString().substring(0, 10);
  notes = '';
  isSubmitting = signal<boolean>(false);
  Math = Math;

  constructor(private state: LoopStateService) {
    addIcons({ closeOutline, cashOutline, alertCircleOutline, checkmarkCircleOutline });
  }

  isOverpayment(): boolean {
    return this.amount > this.obligation().remainingAmount;
  }

  setAmount(val: number): void {
    this.amount = val;
  }

  async submitPayment(): Promise<void> {
    if (this.amount <= 0 || this.isOverpayment() || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    try {
      await this.state.recordPayment({
        obligationId: this.obligation().id,
        personId: this.obligation().personId,
        amount: this.amount,
        notes: this.notes.trim() || undefined,
        paymentDate: this.paymentDate,
      });

      this.paymentRecorded.emit();
      this.onClose();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  autoGrow(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  onClose(): void {
    this.closed.emit();
  }
}
