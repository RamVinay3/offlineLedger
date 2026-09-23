import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoopStateService } from '../../core/state/loop-state.service';
import { PersonBalanceSummary, ObligationDirection } from '../../core/models';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkDoneCircleOutline, swapHorizontalOutline, informationCircleOutline } from 'ionicons/icons';

@Component({
  selector: 'app-settlement-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './settlement-modal.component.html',
  styleUrl: './settlement-modal.component.css',
})
export class SettlementModalComponent {
  readonly balance = input.required<PersonBalanceSummary>();
  readonly settled = output<void>();
  readonly closed = output<void>();

  readonly isMutualSettlement = computed<boolean>(() => {
    const b = this.balance();
    return b.totalOwedToYou > 0 && b.totalYouOwe > 0;
  });

  notes = '';
  isSubmitting = signal<boolean>(false);
  Math = Math;

  constructor(private state: LoopStateService) {
    addIcons({ closeOutline, checkmarkDoneCircleOutline, swapHorizontalOutline, informationCircleOutline });
  }

  async confirmSettlement(): Promise<void> {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    try {
      const net = this.balance().netBalance;
      const direction: ObligationDirection = net >= 0 ? 'LENT' : 'BORROWED';
      const absAmount = Math.abs(net);

      await this.state.settleRelationship({
        personId: this.balance().personId,
        netAmount: absAmount,
        direction,
        notes: this.notes.trim() || undefined,
      });

      this.settled.emit();
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
