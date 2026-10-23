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
   * Open the native contact picker dialog on supported devices (Android Chrome, iOS Safari 14.5+)
   */
  async pickFromNativeContacts(): Promise<DeviceContact[]> {
    if (!this.isNativeContactPickerSupported()) {
      throw new Error('Device Contacts Picker API is not supported on this platform/browser.');
    }

    try {
      const contacts = await (navigator as any).contacts.select(['name', 'tel', 'email'], {
        multiple: true,
      });

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
