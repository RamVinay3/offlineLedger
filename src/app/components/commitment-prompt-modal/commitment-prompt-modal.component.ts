import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, cashOutline, closeOutline, checkmarkDoneOutline } from 'ionicons/icons';

@Component({
  selector: 'app-commitment-prompt-modal',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="modal-backdrop animate-fade-in" (click)="onDismiss()">
      <div class="modal-dialog card-container" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div class="icon-circle">
            <ion-icon name="checkmark-circle"></ion-icon>
          </div>
          <button class="icon-btn" (click)="onDismiss()" title="Close">
            <ion-icon name="close-outline"></ion-icon>
          </button>
        </div>

        <div class="modal-body">
          <h3>Commitment Fulfilled!</h3>
          <p class="commitment-title">"{{ itemTitle() }}"</p>
          <p class="subtitle">
            Would you like to record a payment or service fee for this completed milestone now?
          </p>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-primary" (click)="onRecordPayment()">
            <ion-icon name="cash-outline"></ion-icon>
            <span>Record Payment Now</span>
          </button>
          <button type="button" class="btn-secondary" (click)="onDismiss()">
            <span>Skip / Later</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .modal-dialog {
      width: 100%;
      max-width: 400px;
      background: #111827;
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 1rem;
      padding: 1.5rem;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 0 40px rgba(16, 185, 129, 0.15);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }
    .icon-circle {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      color: #10b981;
      margin: 0 auto;
    }
    .icon-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 1.25rem;
      cursor: pointer;
      position: absolute;
      right: 1.25rem;
      top: 1.25rem;
    }
    h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: #f8fafc;
    }
    .commitment-title {
      font-size: 1rem;
      font-weight: 600;
      color: #10b981;
      margin: 0 0 0.75rem 0;
      word-break: break-word;
    }
    .subtitle {
      font-size: 0.875rem;
      color: #94a3b8;
      line-height: 1.4;
      margin: 0 0 1.5rem 0;
    }
    .modal-actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .btn-primary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: #10b981;
      border: none;
      color: #064e3b;
      font-weight: 700;
      font-size: 0.95rem;
      padding: 0.8rem 1rem;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary:hover {
      background: #059669;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      font-size: 0.875rem;
      padding: 0.65rem 1rem;
      border-radius: 0.5rem;
      cursor: pointer;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  `],
})
export class CommitmentPromptModalComponent {
  readonly itemTitle = input.required<string>();
  readonly recordPayment = output<void>();
  readonly dismiss = output<void>();

  constructor() {
    addIcons({
      checkmarkCircle,
      cashOutline,
      closeOutline,
      checkmarkDoneOutline,
    });
  }

  onRecordPayment(): void {
    this.recordPayment.emit();
  }

  onDismiss(): void {
    this.dismiss.emit();
  }
}
