import { Component, Input, Output, EventEmitter, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ObligationWithDetails, Person } from '../../core/models';
import { LoopStateService } from '../../core/state/loop-state.service';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  logoWhatsapp,
  chatbubbleEllipsesOutline,
  copyOutline,
  checkmarkOutline,
  sendOutline,
  callOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-share-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './share-modal.component.html',
  styleUrl: './share-modal.component.css',
})
export class ShareModalComponent implements OnInit {
  @Input({ required: true }) obligation!: ObligationWithDetails;
  @Input() person: Person | null = null;
  @Output() closed = new EventEmitter<void>();

  selectedTone = signal<'FRIENDLY' | 'SHORT' | 'POLITE'>('FRIENDLY');
  messageText = signal<string>('');
  copied = signal<boolean>(false);

  readonly activePerson = computed<Person | null>(() => {
    if (this.person) return this.person;
    if (this.obligation?.personId) {
      return this.state.people().find((p) => p.id === this.obligation.personId) || null;
    }
    return null;
  });

  constructor(private state: LoopStateService) {
    addIcons({
      closeOutline,
      logoWhatsapp,
      chatbubbleEllipsesOutline,
      copyOutline,
      checkmarkOutline,
      sendOutline,
      callOutline,
    });
  }

  ngOnInit(): void {
    this.updateMessage();
  }

  setTone(tone: 'FRIENDLY' | 'SHORT' | 'POLITE'): void {
    this.selectedTone.set(tone);
    this.updateMessage();
  }

  private updateMessage(): void {
    const ob = this.obligation;
    const name = ob.personName || this.person?.name || 'friend';
    const amount = ob.remainingAmount;
    const curr = ob.currency || '₹';
    const title = ob.title;
    const dueDateStr = ob.dueDate
      ? new Date(ob.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      : '';

    let text = '';

    if (ob.type === 'MONEY') {
      switch (this.selectedTone()) {
        case 'SHORT':
          text = `Hi ${name}, friendly reminder: ${curr}${amount.toLocaleString()} for "${title}" is due${dueDateStr ? ' on ' + dueDateStr : ''}. Thanks!`;
          break;
        case 'POLITE':
          text = `Hello ${name}, hope you are having a wonderful week! Just checking in regarding the ${curr}${amount.toLocaleString()} for "${title}"${dueDateStr ? ' (due ' + dueDateStr + ')' : ''}. Whenever convenient for you, take your time! 🙏`;
          break;
        case 'FRIENDLY':
        default:
          text = `Hey ${name}! Hope you're doing well. Just a quick reminder about the ${curr}${amount.toLocaleString()} for "${title}"${dueDateStr ? ' due on ' + dueDateStr : ''}. Let me know whenever convenient! 👍`;
          break;
      }
    } else if (ob.type === 'ITEM') {
      switch (this.selectedTone()) {
        case 'SHORT':
          text = `Hi ${name}, checking in on the item "${title}"${dueDateStr ? ' expected back by ' + dueDateStr : ''}. Thanks!`;
          break;
        case 'POLITE':
        case 'FRIENDLY':
        default:
          text = `Hey ${name}! Hope all is well. Just checking in on "${title}" lent to you${dueDateStr ? ' (expected around ' + dueDateStr + ')' : ''}. Whenever you're done using it, please let me know. Thanks! 😊`;
          break;
      }
    } else {
      text = `Hi ${name}! Just a quick note regarding our commitment: "${title}". Looking forward to it!`;
    }

    this.messageText.set(text);
  }

  openWhatsApp(): void {
    const text = encodeURIComponent(this.messageText());
    const rawPhone = this.activePerson()?.phoneNumber?.trim() || '';
    const phone = rawPhone.replace(/\D/g, '');
    let url = `https://wa.me/?text=${text}`;
    if (phone.length === 10) {
      url = `https://wa.me/91${phone}?text=${text}`;
    } else if (phone.length > 10) {
      url = `https://wa.me/${phone}?text=${text}`;
    }
    window.open(url, '_blank');
  }

  openSms(): void {
    const text = encodeURIComponent(this.messageText());
    const rawPhone = this.activePerson()?.phoneNumber?.trim() || '';
    const phone = rawPhone.replace(/\D/g, '');
    const isApple = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const separator = isApple ? '&' : '?';
    const url = phone ? `sms:${phone}${separator}body=${text}` : `sms:?body=${text}`;
    window.location.href = url;
  }

  callPerson(): void {
    const rawPhone = this.activePerson()?.phoneNumber?.trim() || '';
    if (rawPhone) {
      window.location.href = `tel:${rawPhone}`;
    }
  }

  async copyText(): Promise<void> {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(this.messageText());
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = this.messageText();
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
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
