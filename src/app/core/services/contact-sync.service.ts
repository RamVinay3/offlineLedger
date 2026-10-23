import { Injectable } from '@angular/core';
import { DeviceContact, Person } from '../models';
import { PersonRepository } from '../repositories/person.repository';
import { ActivityRepository } from '../repositories/activity.repository';

@Injectable({
  providedIn: 'root',
})
export class ContactSyncService {
  constructor(
    private personRepo: PersonRepository,
    private activityRepo: ActivityRepository
  ) {}

  /**
   * Check if the device/browser supports the modern native Contacts Picker API
   */
  isNativeContactPickerSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'contacts' in navigator &&
      typeof (navigator as any).contacts?.select === 'function'
    );
  }

  /**
   * Detailed check for contact picker support with diagnostic reason
   */
  getContactPickerSupportStatus(): { supported: boolean; reason?: string } {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return { supported: false, reason: 'Environment does not support contacts.' };
    }
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
      return {
        supported: false,
        reason:
          'Device Contacts Picker requires a Secure Context (HTTPS or localhost). If connecting over Wi-Fi, open via https:// or use the .vcf contact file import.',
      };
    }
    if (!('contacts' in navigator) || typeof (navigator as any).contacts?.select !== 'function') {
      return {
        supported: false,
        reason:
          'Contact Picker API is available in Chrome for Android (v80+). You can import contacts universally using a .vcf contact card file.',
      };
    }
    return { supported: true };
  }

  /**
   * Determine supported contact properties safely using getProperties()
   */
  private async getSupportedProperties(): Promise<string[]> {
    const defaultProps = ['name', 'tel'];
    if (
      typeof navigator !== 'undefined' &&
      'contacts' in navigator &&
      typeof (navigator as any).contacts?.getProperties === 'function'
    ) {
      try {
        const supported: string[] = await (navigator as any).contacts.getProperties();
        const filtered = ['name', 'tel', 'email'].filter((p) => supported.includes(p));
        return filtered.length > 0 ? filtered : defaultProps;
      } catch {
        return defaultProps;
      }
    }
    return defaultProps;
  }

  private async executeNativeSelect(properties: string[], multiple: boolean): Promise<any[]> {
    try {
      return await (navigator as any).contacts.select(properties, { multiple });
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      // If error might be due to properties, try basic properties
      if (properties.includes('email')) {
        try {
          return await (navigator as any).contacts.select(['name', 'tel'], { multiple });
        } catch (inner: any) {
          if (inner?.name === 'AbortError') throw inner;
        }
      }
      return await (navigator as any).contacts.select(['name'], { multiple });
    }
  }

  /**
   * Open the native contact picker dialog on supported devices (Android Chrome, iOS Safari 14.5+)
   */
  async pickFromNativeContacts(): Promise<DeviceContact[]> {
    const status = this.getContactPickerSupportStatus();
    if (!status.supported) {
      throw new Error(status.reason || 'Device Contacts Picker API is not supported on this platform/browser.');
    }

    try {
      const props = await this.getSupportedProperties();
      const contacts = await this.executeNativeSelect(props, true);

      return (contacts || []).map((c: any) => {
        const name = Array.isArray(c.name) ? c.name[0] : c.name || 'Unnamed Contact';
        const tel = Array.isArray(c.tel) ? c.tel[0] : c.tel || undefined;
        const email = Array.isArray(c.email) ? c.email[0] : c.email || undefined;

        return {
          name: name.trim(),
          phoneNumber: tel ? tel.trim() : undefined,
          email: email ? email.trim() : undefined,
          selected: true,
        };
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        return []; // User cancelled picker
      }
      throw e;
    }
  }

  /**
   * Pick a single contact from the device address book (for Add Person modal)
   */
  async pickSingleNativeContact(): Promise<DeviceContact | null> {
    const status = this.getContactPickerSupportStatus();
    if (!status.supported) {
      throw new Error(status.reason || 'Device Contacts Picker is not supported on this browser/device.');
    }

    try {
      const props = await this.getSupportedProperties();
      const contacts = await this.executeNativeSelect(props, false);

      if (!contacts || contacts.length === 0) {
        return null;
      }

      const c = contacts[0];
      const name = Array.isArray(c.name) ? c.name[0] : c.name || 'Unnamed Contact';
      const tel = Array.isArray(c.tel) ? c.tel[0] : c.tel || undefined;
      const email = Array.isArray(c.email) ? c.email[0] : c.email || undefined;

      return {
        name: name.trim(),
        phoneNumber: tel ? tel.trim() : undefined,
        email: email ? email.trim() : undefined,
        selected: true,
      };
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        return null;
      }
      throw e;
    }
  }

  /**
   * Generate standard vCard 3.0 string for a contact
   */
  generateVCard(person: { name: string; phoneNumber?: string; email?: string; notes?: string }): string {
    const cleanName = person.name.replace(/\r?\n/g, ' ').trim();
    const phone = person.phoneNumber ? person.phoneNumber.replace(/[^\d+]/g, '').trim() : '';
    const email = person.email ? person.email.trim() : '';
    const notes = person.notes ? person.notes.replace(/\r?\n/g, '\\n').trim() : '';

    let vcard = 'BEGIN:VCARD\r\nVERSION:3.0\r\n';
    vcard += `FN:${cleanName}\r\n`;
    vcard += `N:;${cleanName};;;\r\n`;
    if (phone) {
      vcard += `TEL;TYPE=CELL,VOICE:${phone}\r\n`;
    }
    if (email) {
      vcard += `EMAIL;TYPE=INTERNET:${email}\r\n`;
    }
    if (notes) {
      vcard += `NOTE:${notes}\r\n`;
    }
    vcard += 'END:VCARD\r\n';
    return vcard;
  }

  /**
   * Generate combined vCard 3.0 string for multiple contacts (bulk backup/export)
   */
  generateAllVCard(people: Array<{ name: string; phoneNumber?: string; email?: string; notes?: string }>): string {
    return people.map((p) => this.generateVCard(p)).join('\r\n');
  }

  /**
   * Save a person to the phone's native contacts:
   * Uses Web Share API with a .vcf file if available (direct system prompt),
   * or triggers a browser download of the .vcf file which opens the phone's Contacts app.
   */
  async saveToDeviceContacts(person: {
    name: string;
    phoneNumber?: string;
    email?: string;
    notes?: string;
  }): Promise<{ success: boolean; method: 'share' | 'download' }> {
    const vcardContent = this.generateVCard(person);
    const blob = new Blob([vcardContent], { type: 'text/vcard;charset=utf-8' });
    const safeBaseName = person.name.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'contact';
    const fileName = `${safeBaseName}.vcf`;

    // 1. Try Web Share API with File (Supported on Android Chrome & iOS Safari)
    if (
      typeof navigator !== 'undefined' &&
      typeof (navigator as any).canShare === 'function' &&
      typeof (navigator as any).share === 'function' &&
      typeof File !== 'undefined'
    ) {
      try {
        const file = new File([blob], fileName, { type: 'text/vcard' });
        if ((navigator as any).canShare({ files: [file] })) {
          await (navigator as any).share({
            files: [file],
            title: `Save ${person.name} to Contacts`,
            text: `Contact card for ${person.name}`,
          });
          return { success: true, method: 'share' };
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          return { success: false, method: 'share' };
        }
        // Fallback to download on share error
      }
    }

    // 2. Fallback: Trigger browser download of .vcf file
    // On Android & iOS, opening a .vcf file automatically launches the Contacts app "Save Contact" screen
    this.triggerVCardDownload(blob, fileName);
    return { success: true, method: 'download' };
  }

  /**
   * Export all people in LOOP as a combined .vcf file for importing into phone contacts
   */
  exportAllContactsAsVcf(people: Array<{ name: string; phoneNumber?: string; email?: string; notes?: string }>): void {
    const vcardContent = this.generateAllVCard(people);
    const blob = new Blob([vcardContent], { type: 'text/vcard;charset=utf-8' });
    this.triggerVCardDownload(blob, 'loop_all_contacts.vcf');
  }

  private triggerVCardDownload(blob: Blob, fileName: string): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /**
   * Parse offline vCard (.vcf) file format (standard format exported by Google Contacts, Apple Contacts, etc.)
   */
  parseVCard(vcfContent: string): DeviceContact[] {
    const contacts: DeviceContact[] = [];
    const vcardBlocks = vcfContent.split(/BEGIN:VCARD/i).slice(1);

    for (const block of vcardBlocks) {
      const lines = block.split(/\r\n|\r|\n/);
      let name = '';
      let phone = '';
      let email = '';
      let notes = '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith('FN:') || line.startsWith('FN;')) {
          const parts = line.split(':');
          if (parts.length > 1) name = parts.slice(1).join(':').trim();
        } else if (!name && (line.startsWith('N:') || line.startsWith('N;'))) {
          const parts = line.split(':');
          if (parts.length > 1) {
            const nameParts = parts[1].split(';').filter(Boolean);
            name = nameParts.reverse().join(' ').trim();
          }
        } else if (line.startsWith('TEL') && !phone) {
          const parts = line.split(':');
          if (parts.length > 1) {
            phone = parts[1].replace(/[^\d+]/g, '').trim();
          }
        } else if (line.startsWith('EMAIL') && !email) {
          const parts = line.split(':');
          if (parts.length > 1) {
            email = parts[1].trim();
          }
        } else if (line.startsWith('NOTE:')) {
          notes = line.substring(5).trim();
        }
      }

      if (name && name.length > 0) {
        contacts.push({
          name,
          phoneNumber: phone || undefined,
          email: email || undefined,
          notes: notes || undefined,
          selected: true,
        });
      }
    }

    return contacts;
  }

  /**
   * Parse CSV format (Name, Phone, Email, Notes)
   */
  parseCsv(csvContent: string): DeviceContact[] {
    const contacts: DeviceContact[] = [];
    const lines = csvContent.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    let startIndex = 0;
    const header = lines[0].toLowerCase();
    if (header.includes('name') || header.includes('phone') || header.includes('email')) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length > 0 && parts[0].length > 0) {
        contacts.push({
          name: parts[0],
          phoneNumber: parts[1] || undefined,
          email: parts[2] || undefined,
          notes: parts[3] || undefined,
          selected: true,
        });
      }
    }

    return contacts;
  }

  /**
   * Annotate imported contact list with duplicate detection against existing LOOP people
   */
  annotateWithExisting(contacts: DeviceContact[], existingPeople: Person[]): DeviceContact[] {
    const peopleByName = new Map<string, Person>();
    const peopleByPhone = new Map<string, Person>();

    for (const p of existingPeople) {
      peopleByName.set(p.name.trim().toLowerCase(), p);
      if (p.phoneNumber) {
        const clean = p.phoneNumber.replace(/\D/g, '');
        if (clean) peopleByPhone.set(clean, p);
      }
    }

    return contacts.map((c) => {
      const cleanPhone = c.phoneNumber ? c.phoneNumber.replace(/\D/g, '') : '';
      const existing =
        peopleByName.get(c.name.trim().toLowerCase()) ||
        (cleanPhone ? peopleByPhone.get(cleanPhone) : undefined);

      if (existing) {
        return {
          ...c,
          alreadyExists: true,
          existingPersonId: existing.id,
          selected: false, // Default to unchecked if duplicate
        };
      }
      return {
        ...c,
        alreadyExists: false,
        selected: true,
      };
    });
  }

  /**
   * Execute bulk import of contacts into SQLite database
   */
  async importContacts(
    contactsToImport: DeviceContact[],
    existingPeople: Person[]
  ): Promise<{ importedCount: number; updatedCount: number }> {
    let importedCount = 0;
    let updatedCount = 0;

    for (const contact of contactsToImport) {
      if (!contact.selected || !contact.name.trim()) continue;

      if (contact.alreadyExists && contact.existingPersonId) {
        // Update existing person if new phone/email/notes provided
        const updates: Partial<Person> = {};
        if (contact.phoneNumber) updates.phoneNumber = contact.phoneNumber;
        if (contact.email) updates.email = contact.email;
        if (contact.notes) updates.notes = contact.notes;

        if (Object.keys(updates).length > 0) {
          await this.personRepo.update(contact.existingPersonId, updates);
          updatedCount++;
        }
      } else {
        // Create new person in LOOP
        const p = await this.personRepo.create({
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          email: contact.email,
          notes: contact.notes,
        });

        await this.activityRepo.logEvent({
          personId: p.id,
          eventType: 'PERSON_CREATED',
          description: `Imported "${p.name}" via Contact Sync`,
        });

        importedCount++;
      }
    }

    return { importedCount, updatedCount };
  }
}
