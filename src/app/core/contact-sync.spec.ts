import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContactSyncService } from './services/contact-sync.service';
import { PersonRepository } from './repositories/person.repository';
import { ActivityRepository } from './repositories/activity.repository';
import { Person } from './models';

describe('ContactSyncService - Two-Way Sync & vCard Export', () => {
  let service: ContactSyncService;
  let mockPersonRepo: Partial<PersonRepository>;
  let mockActivityRepo: Partial<ActivityRepository>;

  const samplePeople: Person[] = [
    {
      id: 'p-1',
      name: 'Rahul Sharma',
      phoneNumber: '9876543210',
      email: 'rahul@example.com',
      notes: 'College friend',
      isArchived: false,
      createdAt: '2026-10-23T10:00:00.000Z',
      updatedAt: '2026-10-23T10:00:00.000Z',
    },
    {
      id: 'p-2',
      name: 'Amit Patel',
      phoneNumber: '9123456780',
      isArchived: false,
      createdAt: '2026-10-23T10:00:00.000Z',
      updatedAt: '2026-10-23T10:00:00.000Z',
    },
  ];

  beforeEach(() => {
    mockPersonRepo = {
      create: vi.fn(),
      update: vi.fn(),
    };
    mockActivityRepo = {
      logEvent: vi.fn(),
    };
    service = new ContactSyncService(
      mockPersonRepo as PersonRepository,
      mockActivityRepo as ActivityRepository
    );
  });

  it('should generate valid vCard 3.0 formatted string for a single person', () => {
    const vcard = service.generateVCard({
      name: 'Rahul Sharma',
      phoneNumber: '9876543210',
      email: 'rahul@example.com',
      notes: 'College friend',
    });

    expect(vcard).toContain('BEGIN:VCARD');
    expect(vcard).toContain('VERSION:3.0');
    expect(vcard).toContain('FN:Rahul Sharma');
    expect(vcard).toContain('TEL;TYPE=CELL,VOICE:9876543210');
    expect(vcard).toContain('EMAIL;TYPE=INTERNET:rahul@example.com');
    expect(vcard).toContain('NOTE:College friend');
    expect(vcard).toContain('END:VCARD');
  });

  it('should generate combined vCard 3.0 string for multiple contacts', () => {
    const combined = service.generateAllVCard(samplePeople);

    expect(combined).toContain('FN:Rahul Sharma');
    expect(combined).toContain('FN:Amit Patel');
    expect(combined).toContain('TEL;TYPE=CELL,VOICE:9876543210');
    expect(combined).toContain('TEL;TYPE=CELL,VOICE:9123456780');
    expect(combined.match(/BEGIN:VCARD/g)?.length).toBe(2);
    expect(combined.match(/END:VCARD/g)?.length).toBe(2);
  });

  it('should parse vCard string and extract name, phone, and email', () => {
    const vcardRaw = `BEGIN:VCARD
VERSION:3.0
FN:Vikram Rao
TEL;TYPE=CELL:+919876543211
EMAIL;TYPE=INTERNET:vikram@test.com
NOTE:Business partner
END:VCARD`;

    const parsed = service.parseVCard(vcardRaw);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('Vikram Rao');
    expect(parsed[0].phoneNumber).toBe('+919876543211');
    expect(parsed[0].email).toBe('vikram@test.com');
    expect(parsed[0].notes).toBe('Business partner');
  });

  it('should detect duplicates by name or phone with annotateWithExisting', () => {
    const incomingContacts = [
      { name: 'Rahul Sharma', phoneNumber: '9876543210', selected: true },
      { name: 'Suresh Raina', phoneNumber: '9988776655', selected: true },
    ];

    const annotated = service.annotateWithExisting(incomingContacts, samplePeople);
    expect(annotated.length).toBe(2);

    // Rahul Sharma should be detected as duplicate
    expect(annotated[0].alreadyExists).toBe(true);
    expect(annotated[0].existingPersonId).toBe('p-1');
    expect(annotated[0].selected).toBe(false);

    // Suresh Raina should be new
    expect(annotated[1].alreadyExists).toBe(false);
    expect(annotated[1].selected).toBe(true);
  });

  it('should save to device contacts via download fallback when Web Share is not supported', async () => {
    const person = {
      name: 'Kavita Singh',
      phoneNumber: '9876501234',
      email: 'kavita@example.com',
    };

    const mockClick = vi.fn();
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();

    const mockAnchor = {
      href: '',
      download: '',
      click: mockClick,
    };

    (globalThis as any).window = globalThis;
    (globalThis as any).document = {
      createElement: vi.fn().mockReturnValue(mockAnchor),
      body: {
        appendChild: mockAppendChild,
        removeChild: mockRemoveChild,
      },
    };
    (globalThis as any).URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/mock-vcf'),
      revokeObjectURL: vi.fn(),
    };

    const result = await service.saveToDeviceContacts(person);

    expect(result.success).toBe(true);
    expect(result.method).toBe('download');
    expect(mockClick).toHaveBeenCalled();
  });
});
