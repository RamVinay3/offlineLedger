import { Component, input, output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoopStateService } from '../../core/state/loop-state.service';
import { ObligationWithDetails } from '../../core/models';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  calendarOutline,
  timeOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-edit-due-date-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  template: `
    <div class="modal-backdrop animate-fade-in" (click)="onClose()">
      <div class="modal-dialog card-container" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header">
          <div class="title-wrap">
            <ion-icon name="calendar-outline" class="header-icon"></ion-icon>
            <div>
              <h2>Reschedule / Change Due Date</h2>
              <span class="sub-text">For {{ obligation().title }} ({{ obligation().personName }})</span>
            </div>
          </div>
          <button class="icon-btn" (click)="onClose()" title="Close">
            <ion-icon name="close-outline"></ion-icon>
          </button>
        </div>

        <div class="modal-body">
          <!-- Current Due Status Banner -->
          <div class="status-banner" [class.overdue]="isCurrentOverdue()">
            <ion-icon [name]="isCurrentOverdue() ? 'alert-circle-outline' : 'time-outline'"></ion-icon>
            <div>
              <strong>Current Due Date:</strong>
              <span>{{ obligation().dueDate ? formatDate(obligation().dueDate!) : 'None set' }}</span>
              @if (isCurrentOverdue()) {
                <span class="overdue-tag">Overdue</span>
              }
            </div>
          </div>

          <!-- Due Date Modification History -->
          @if (obligation().dueDateHistory && obligation().dueDateHistory!.length > 0) {
            <div class="history-section">
              <div class="history-header">
                <span class="history-title">
                  ⚠️ Modified {{ obligation().dueDateHistory!.length }} time{{ obligation().dueDateHistory!.length > 1 ? 's' : '' }}
                </span>
                <span class="history-sub">Missed payment / extension record</span>
              </div>
              <div class="history-list">
                @for (h of obligation().dueDateHistory; track h.changedAt) {
                  <div class="history-item">
                    <div class="history-dot"></div>
                    <div class="history-info">
                      <div class="history-dates">
                        <span class="old-date">{{ h.oldDueDate ? formatDate(h.oldDueDate) : 'Initial' }}</span>
                        <span class="arrow">➔</span>
                        <span class="new-date">{{ formatDate(h.newDueDate) }}</span>
                      </div>
                      @if (h.reason) {
                        <div class="history-reason">Reason: "{{ h.reason }}"</div>
                      }
                      <div class="history-time">{{ formatDateTime(h.changedAt) }}</div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- New Due Date Presets -->
          <div class="presets-wrap">
            <label class="form-label">Quick Reschedule Presets</label>
            <div class="preset-chips">
              <button
                type="button"
                class="chip-btn"
                [class.active]="selectedPreset() === 3"
                (click)="setPreset(3)"
              >
                +3 Days
              </button>
              <button
                type="button"
                class="chip-btn"
                [class.active]="selectedPreset() === 7"
                (click)="setPreset(7)"
              >
                +1 Week
              </button>
              <button
                type="button"
                class="chip-btn"
                [class.active]="selectedPreset() === 14"
                (click)="setPreset(14)"
              >
                +2 Weeks
              </button>
              <button
                type="button"
                class="chip-btn"
                [class.active]="selectedPreset() === 30"
                (click)="setPreset(30)"
              >
                +1 Month
              </button>
            </div>
          </div>

          <!-- Date Input -->
          <div class="form-group">
            <label for="newDueDate">New Due Date <span class="required">*</span></label>
            <input
              id="newDueDate"
              type="date"
              class="form-input"
              [(ngModel)]="newDueDate"
              (ngModelChange)="onDateChange()"
              required
            />
          </div>

          <!-- Reason Field -->
          <div class="form-group">
            <label for="reason">Reason for Change / Extension</label>
            <div class="reason-preset-row">
              <button type="button" class="reason-pill" (click)="setReason('Missed payment deadline')">
                Missed deadline
              </button>
              <button type="button" class="reason-pill" (click)="setReason('Requested extension')">
                Requested extension
              </button>
              <button type="button" class="reason-pill" (click)="setReason('Mutual agreement')">
                Mutual agreement
              </button>
              <button type="button" class="reason-pill" (click)="setReason('Salary delayed')">
                Salary delayed
              </button>
            </div>
            <input
              id="reason"
              type="text"
              class="form-input"
              placeholder="e.g. Rahul promised to pay next Monday"
              [(ngModel)]="reason"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button type="button" class="btn-secondary" (click)="onClose()">Cancel</button>
          <button
            type="button"
            class="btn-primary"
            [disabled]="!newDueDate || isSubmitting()"
            (click)="saveNewDueDate()"
          >
            {{ isSubmitting() ? 'Saving...' : 'Update Due Date' }}
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
      max-width: 480px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      background: #111827;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 1rem;
      overflow: hidden;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .title-wrap {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .header-icon {
      font-size: 1.5rem;
      color: #38bdf8;
    }
    h2 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 600;
      color: #f8fafc;
    }
    .sub-text {
      font-size: 0.8rem;
      color: #94a3b8;
    }
    .icon-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 0.375rem;
    }
    .icon-btn:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.05);
    }
    .modal-body {
      padding: 1.25rem 1.5rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .status-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 0.5rem;
      color: #bae6fd;
      font-size: 0.875rem;
    }
    .status-banner.overdue {
      background: rgba(244, 63, 94, 0.1);
      border-color: rgba(244, 63, 94, 0.25);
      color: #fecdd3;
    }
    .overdue-tag {
      background: #f43f5e;
      color: white;
      font-size: 0.7rem;
      padding: 0.15rem 0.4rem;
      border-radius: 9999px;
      margin-left: 0.5rem;
      font-weight: 600;
    }
    .history-section {
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.2);
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
    }
    .history-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .history-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: #fcd34d;
    }
    .history-sub {
      font-size: 0.725rem;
      color: #d1d5db;
    }
    .history-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 120px;
      overflow-y: auto;
    }
    .history-item {
      display: flex;
      gap: 0.5rem;
      font-size: 0.8rem;
    }
    .history-dot {
      width: 6px;
      height: 6px;
      background: #f59e0b;
      border-radius: 50%;
      margin-top: 6px;
      flex-shrink: 0;
    }
    .history-dates {
      display: flex;
      gap: 0.35rem;
      font-weight: 500;
    }
    .old-date {
      color: #94a3b8;
      text-decoration: line-through;
    }
    .arrow {
      color: #f59e0b;
    }
    .new-date {
      color: #f8fafc;
    }
    .history-reason {
      color: #cbd5e1;
      font-style: italic;
      font-size: 0.75rem;
    }
    .history-time {
      font-size: 0.7rem;
      color: #64748b;
    }
    .form-label {
      font-size: 0.8rem;
      font-weight: 500;
      color: #94a3b8;
      margin-bottom: 0.35rem;
      display: block;
    }
    .preset-chips {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .chip-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 0.35rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .chip-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .chip-btn.active {
      background: #38bdf8;
      color: #0f172a;
      border-color: #38bdf8;
      font-weight: 600;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    label {
      font-size: 0.85rem;
      font-weight: 500;
      color: #cbd5e1;
    }
    .required {
      color: #f43f5e;
    }
    .form-input {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 0.5rem;
      padding: 0.65rem 0.85rem;
      color: #f8fafc;
      font-size: 0.9rem;
      outline: none;
    }
    .form-input:focus {
      border-color: #38bdf8;
    }
    .reason-preset-row {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-bottom: 0.35rem;
    }
    .reason-pill {
      background: rgba(255, 255, 255, 0.04);
      border: 1px dashed rgba(255, 255, 255, 0.15);
      color: #94a3b8;
      font-size: 0.75rem;
      padding: 0.2rem 0.5rem;
      border-radius: 0.25rem;
      cursor: pointer;
    }
    .reason-pill:hover {
      color: #f8fafc;
      border-color: #38bdf8;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.2);
    }
    .btn-secondary {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      padding: 0.6rem 1.25rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .btn-primary {
      background: #38bdf8;
      border: none;
      color: #0f172a;
      padding: 0.6rem 1.25rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
})
export class EditDueDateModalComponent implements OnInit {
  readonly obligation = input.required<ObligationWithDetails>();
  readonly closed = output<void>();
  readonly updated = output<void>();

  newDueDate = '';
  reason = '';
  selectedPreset = signal<number | null>(null);
  isSubmitting = signal<boolean>(false);

  constructor(public state: LoopStateService) {
    addIcons({
      closeOutline,
      calendarOutline,
      timeOutline,
      alertCircleOutline,
      checkmarkCircleOutline,
    });
  }

  ngOnInit(): void {
    if (this.obligation().dueDate) {
      this.newDueDate = this.obligation().dueDate!;
    }
  }

  isCurrentOverdue(): boolean {
    const ob = this.obligation();
    if (!ob.dueDate) return false;
    const d = new Date(ob.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  }

  setPreset(days: number): void {
    const d = new Date();
    d.setDate(d.getDate() + days);
    this.newDueDate = d.toISOString().substring(0, 10);
    this.selectedPreset.set(days);
    if (!this.reason) {
      this.reason = `Extended by ${days} days`;
    }
  }

  setReason(r: string): void {
    this.reason = r;
  }

  onDateChange(): void {
    this.selectedPreset.set(null);
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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

  async saveNewDueDate(): Promise<void> {
    if (!this.newDueDate || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    try {
      await this.state.updateDueDate(
        this.obligation().id,
        this.newDueDate,
        this.reason.trim() || undefined
      );
      this.updated.emit();
      this.onClose();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onClose(): void {
    this.closed.emit();
  }
}
