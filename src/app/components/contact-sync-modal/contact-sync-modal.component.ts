import { Component, output, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoopStateService } from '../../core/state/loop-state.service';
import { ContactSyncService } from '../../core/services/contact-sync.service';
import { DeviceContact } from '../../core/models';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  peopleOutline,
  personAddOutline,
  documentTextOutline,
  phonePortraitOutline,
  checkmarkCircleOutline,
  checkmarkCircle,
  alertCircleOutline,
  searchOutline,
  cloudUploadOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-contact-sync-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  template: `
    <div class="modal-backdrop animate-fade-in" (click)="onClose()">
      <div class="modal-dialog card-container" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header">
          <div class="title-wrap">
            <ion-icon name="people-outline" class="header-icon"></ion-icon>
            <div>
              <h2>Sync & Import Contacts</h2>
              <span class="sub-text">Import your phone contacts directly into LOOP</span>
            </div>
          </div>
          <button class="icon-btn" (click)="onClose()" title="Close">
            <ion-icon name="close-outline"></ion-icon>
          </button>
        </div>

        <div class="modal-body">
          <!-- Step 1: Source Selection (if no contacts loaded yet) -->
          @if (parsedContacts().length === 0) {
            <div class="sources-grid">
              <!-- Option A: Native Contact Picker -->
              @if (isNativeSupported()) {
                <button type="button" class="source-card" (click)="pickNativeContacts()">
                  <div class="source-icon native-icon">
                    <ion-icon name="phone-portrait-outline"></ion-icon>
                  </div>
                  <div class="source-info">
                    <strong>Pick from Device Contacts</strong>
                    <span>Choose directly from your phone address book</span>
                  </div>
                </button>
              }

              <!-- Option B: vCard (.vcf) File -->
              <label class="source-card cursor-pointer">
                <input
                  type="file"
                  accept=".vcf,.vcard"
                  class="hidden-file-input"
                  (change)="onVcfFileSelected($event)"
                />
                <div class="source-icon vcard-icon">
                  <ion-icon name="cloud-upload-outline"></ion-icon>
                </div>
                <div class="source-info">
                  <strong>Import from Phone Contacts (.vcf file)</strong>
                  <span>Universal file export from iPhone Contacts or Google Contacts</span>
                </div>
              </label>

              <!-- Option C: CSV Spreadsheet -->
              <label class="source-card cursor-pointer">
                <input
                  type="file"
                  accept=".csv,.txt"
                  class="hidden-file-input"
                  (change)="onCsvFileSelected($event)"
                />
                <div class="source-icon csv-icon">
                  <ion-icon name="document-text-outline"></ion-icon>
                </div>
                <div class="source-info">
                  <strong>Import from CSV / Spreadsheet</strong>
                  <span>Import spreadsheet with Name, Phone, and Email</span>
                </div>
              </label>
            </div>

            <!-- Helpful note -->
            <div class="info-tip">
              <ion-icon name="alert-circle-outline"></ion-icon>
              <span>
                100% Offline: Your contacts are parsed locally in memory on your device. Zero data is sent to any server.
              </span>
            </div>
          } @else {
            <!-- Step 2: Contact Selection & Preview List -->
            <div class="preview-header">
              <div class="search-wrap">
                <ion-icon name="search-outline"></ion-icon>
                <input
                  type="text"
                  placeholder="Filter parsed contacts..."
                  class="search-input"
                  [(ngModel)]="filterQuery"
                />
              </div>

              <div class="selection-meta">
                <span class="count-tag">
                  {{ selectedCount() }} of {{ parsedContacts().length }} selected
                </span>
                <button type="button" class="text-link-btn" (click)="toggleSelectAll()">
                  {{ allSelected() ? 'Deselect All' : 'Select All' }}
                </button>
              </div>
            </div>

            <div class="contact-list">
              @for (contact of filteredContacts(); track contact.name + (contact.phoneNumber || '')) {
                <label class="contact-row" [class.selected]="contact.selected">
                  <input
                    type="checkbox"
                    class="custom-checkbox"
                    [(ngModel)]="contact.selected"
                  />
                  <div class="contact-details">
                    <div class="contact-name-line">
                      <span class="contact-name">{{ contact.name }}</span>
                      @if (contact.alreadyExists) {
                        <span class="duplicate-badge">Already in LOOP</span>
                      } @else {
                        <span class="new-badge">New</span>
                      }
                    </div>
                    <div class="contact-sub-line">
                      @if (contact.phoneNumber) {
                        <span>📞 {{ contact.phoneNumber }}</span>
                      }
                      @if (contact.email) {
                        <span>✉️ {{ contact.email }}</span>
                      }
                    </div>
                  </div>
                </label>
              }
            </div>

            <div class="reset-wrap">
              <button type="button" class="text-btn" (click)="resetList()">
                ← Choose another file or contact source
              </button>
            </div>
          }

          <!-- Status / Error message -->
          @if (statusMessage()) {
            <div class="status-msg" [class.error]="isError()">
              {{ statusMessage() }}
            </div>
          }
        </div>

        <!-- Footer -->
        @if (parsedContacts().length > 0) {
          <div class="modal-footer">
            <button type="button" class="btn-secondary" (click)="onClose()">Cancel</button>
            <button
              type="button"
              class="btn-primary"
              [disabled]="selectedCount() === 0 || isImporting()"
              (click)="executeImport()"
            >
              {{ isImporting() ? 'Importing...' : 'Import ' + selectedCount() + ' Contacts' }}
            </button>
          </div>
        }
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
      max-width: 520px;
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
      color: #10b981;
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
    .sources-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .source-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.25rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 0.75rem;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s;
      color: inherit;
    }
    .source-card:hover {
      background: rgba(255, 255, 255, 0.07);
      border-color: rgba(16, 185, 129, 0.3);
      transform: translateY(-1px);
    }
    .hidden-file-input {
      display: none;
    }
    .source-icon {
      width: 44px;
      height: 44px;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.35rem;
      flex-shrink: 0;
    }
    .native-icon {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }
    .vcard-icon {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
    }
    .csv-icon {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
    .source-info {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .source-info strong {
      font-size: 0.95rem;
      color: #f8fafc;
    }
    .source-info span {
      font-size: 0.8rem;
      color: #94a3b8;
    }
    .info-tip {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
      font-size: 0.8rem;
      color: #a7f3d0;
    }
    .info-tip ion-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
    }
    .preview-header {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .search-wrap {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 0.5rem;
      padding: 0.5rem 0.75rem;
    }
    .search-wrap ion-icon {
      color: #94a3b8;
    }
    .search-input {
      background: transparent;
      border: none;
      outline: none;
      color: #f8fafc;
      width: 100%;
      font-size: 0.875rem;
    }
    .selection-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .count-tag {
      font-size: 0.8rem;
      color: #94a3b8;
    }
    .text-link-btn {
      background: transparent;
      border: none;
      color: #38bdf8;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
    }
    .contact-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 360px;
      overflow-y: auto;
    }
    .contact-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.65rem 0.85rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .contact-row:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    .contact-row.selected {
      border-color: rgba(16, 185, 129, 0.4);
      background: rgba(16, 185, 129, 0.04);
    }
    .custom-checkbox {
      width: 18px;
      height: 18px;
      accent-color: #10b981;
      cursor: pointer;
    }
    .contact-details {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      flex: 1;
      overflow: hidden;
    }
    .contact-name-line {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .contact-name {
      font-weight: 600;
      font-size: 0.9rem;
      color: #f8fafc;
    }
    .duplicate-badge {
      font-size: 0.7rem;
      background: rgba(245, 158, 11, 0.15);
      color: #fcd34d;
      padding: 0.15rem 0.4rem;
      border-radius: 9999px;
      font-weight: 500;
    }
    .new-badge {
      font-size: 0.7rem;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      padding: 0.15rem 0.4rem;
      border-radius: 9999px;
      font-weight: 500;
    }
    .contact-sub-line {
      display: flex;
      gap: 0.75rem;
      font-size: 0.75rem;
      color: #94a3b8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .reset-wrap {
      text-align: center;
    }
    .text-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .text-btn:hover {
      color: #f8fafc;
      text-decoration: underline;
    }
    .status-msg {
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.85rem;
      background: rgba(16, 185, 129, 0.1);
      color: #a7f3d0;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }
    .status-msg.error {
      background: rgba(244, 63, 94, 0.1);
      color: #fecdd3;
      border-color: rgba(244, 63, 94, 0.2);
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
      background: #10b981;
      border: none;
      color: #064e3b;
      padding: 0.6rem 1.25rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
})
export class ContactSyncModalComponent implements OnInit {
  readonly closed = output<void>();
  readonly imported = output<void>();

  isNativeSupported = signal<boolean>(false);
  parsedContacts = signal<DeviceContact[]>([]);
  filterQuery = '';
  statusMessage = signal<string>('');
  isError = signal<boolean>(false);
  isImporting = signal<boolean>(false);

  readonly filteredContacts = computed<DeviceContact[]>(() => {
    const list = this.parsedContacts();
    const q = this.filterQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phoneNumber && c.phoneNumber.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  });

  readonly selectedCount = computed<number>(() => {
    return this.parsedContacts().filter((c) => c.selected).length;
  });

  readonly allSelected = computed<boolean>(() => {
    const list = this.parsedContacts();
    return list.length > 0 && list.every((c) => c.selected);
  });

  constructor(
    public state: LoopStateService,
    private contactSync: ContactSyncService
  ) {
    addIcons({
      closeOutline,
      peopleOutline,
      personAddOutline,
      documentTextOutline,
      phonePortraitOutline,
      checkmarkCircleOutline,
      checkmarkCircle,
      alertCircleOutline,
      searchOutline,
      cloudUploadOutline,
    });
  }

  ngOnInit(): void {
    this.isNativeSupported.set(this.contactSync.isNativeContactPickerSupported());
  }

  async pickNativeContacts(): Promise<void> {
    try {
      this.statusMessage.set('');
      const picked = await this.contactSync.pickFromNativeContacts();
      if (picked.length === 0) return;

      const annotated = this.contactSync.annotateWithExisting(picked, this.state.people());
      this.parsedContacts.set(annotated);
    } catch (e: any) {
      this.isError.set(true);
      this.statusMessage.set(e.message || 'Failed to access device contacts.');
    }
  }

  async onVcfFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    try {
      this.statusMessage.set('');
      const text = await file.text();
      const parsed = this.contactSync.parseVCard(text);
      if (parsed.length === 0) {
        this.isError.set(true);
        this.statusMessage.set('No valid contacts found in this .vcf file.');
        return;
      }
      const annotated = this.contactSync.annotateWithExisting(parsed, this.state.people());
      this.parsedContacts.set(annotated);
    } catch {
      this.isError.set(true);
      this.statusMessage.set('Failed to read the .vcf file.');
    }
  }

  async onCsvFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    try {
      this.statusMessage.set('');
      const text = await file.text();
      const parsed = this.contactSync.parseCsv(text);
      if (parsed.length === 0) {
        this.isError.set(true);
        this.statusMessage.set('No valid contacts found in this CSV file.');
        return;
      }
      const annotated = this.contactSync.annotateWithExisting(parsed, this.state.people());
      this.parsedContacts.set(annotated);
    } catch {
      this.isError.set(true);
      this.statusMessage.set('Failed to read the CSV file.');
    }
  }

  toggleSelectAll(): void {
    const targetState = !this.allSelected();
    this.parsedContacts.update((list) =>
      list.map((c) => ({ ...c, selected: targetState }))
    );
  }

  resetList(): void {
    this.parsedContacts.set([]);
    this.statusMessage.set('');
    this.isError.set(false);
  }

  async executeImport(): Promise<void> {
    if (this.selectedCount() === 0 || this.isImporting()) return;
    this.isImporting.set(true);
    try {
      const selected = this.parsedContacts().filter((c) => c.selected);
      const res = await this.contactSync.importContacts(selected, this.state.people());
      await this.state.refreshAll();
      this.imported.emit();
      this.onClose();
    } catch (e: any) {
      this.isError.set(true);
      this.statusMessage.set(e.message || 'Error importing contacts.');
    } finally {
      this.isImporting.set(false);
    }
  }

  onClose(): void {
    this.closed.emit();
  }
}
