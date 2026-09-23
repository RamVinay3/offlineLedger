import { Component, Input, Output, EventEmitter, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ObligationWithDetails } from '../../core/models';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  qrCodeOutline,
  copyOutline,
  checkmarkOutline,
  createOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import QRCode from 'qrcode';

@Component({
  selector: 'app-upi-qr-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './upi-qr-modal.component.html',
  styleUrl: './upi-qr-modal.component.css',
})
export class UpiQrModalComponent implements OnInit {
  @Input({ required: true }) obligation!: ObligationWithDetails;
  @Input() upiId = '';
  @Input() userName = '';
  @Output() closed = new EventEmitter<void>();
  @Output() upiIdSaved = new EventEmitter<string>();

  qrDataUrl = signal<string>('');
  editingUpi = signal<boolean>(false);
  tempUpiId = signal<string>('');
  copied = signal<boolean>(false);

  constructor() {
    addIcons({
      closeOutline,
      qrCodeOutline,
      copyOutline,
      checkmarkOutline,
      createOutline,
      shieldCheckmarkOutline,
    });
  }

  ngOnInit(): void {
    this.tempUpiId.set(this.upiId);
    if (!this.upiId) {
      this.editingUpi.set(true);
    } else {
      this.generateQr();
    }
  }

  get upiPaymentUrl(): string {
    const activeUpi = this.upiId || this.tempUpiId();
    const amount = this.obligation.remainingAmount;
    const payee = encodeURIComponent(this.userName || 'LOOP Payee');
    const note = encodeURIComponent(this.obligation.title || 'Settlement');
    return `upi://pay?pa=${activeUpi}&pn=${payee}&am=${amount}&cu=INR&tn=${note}`;
  }

  async generateQr(): Promise<void> {
    const activeUpi = this.upiId || this.tempUpiId();
    if (!activeUpi) return;

    try {
      const url = this.upiPaymentUrl;
      const dataUrl = await QRCode.toDataURL(url, {
        width: 260,
        margin: 1.5,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
      this.qrDataUrl.set(dataUrl);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  }

  saveUpiId(): void {
    const clean = this.tempUpiId().trim();
    if (clean) {
      this.upiId = clean;
      this.upiIdSaved.emit(clean);
      this.editingUpi.set(false);
      this.generateQr();
    }
  }

  async copyLink(): Promise<void> {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(this.upiPaymentUrl);
      }
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      // Fallback
    }
  }

  close(): void {
    this.closed.emit();
  }
}
