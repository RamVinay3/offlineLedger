import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from './database/database.service';
import { PersonRepository } from './repositories/person.repository';
import { ObligationRepository } from './repositories/obligation.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { StandaloneReminderRepository } from './repositories/standalone-reminder.repository';
import { ActivityRepository } from './repositories/activity.repository';
import { ContactSyncService } from './services/contact-sync.service';

describe('LOOP Version 2 Features Verification', () => {
  let db: DatabaseService;
  let personRepo: PersonRepository;
  let obligationRepo: ObligationRepository;
  let paymentRepo: PaymentRepository;
  let reminderRepo: StandaloneReminderRepository;
  let activityRepo: ActivityRepository;
  let contactSync: ContactSyncService;

  beforeEach(async () => {
    db = new DatabaseService();
    await db.init();
    personRepo = new PersonRepository(db);
    obligationRepo = new ObligationRepository(db);
    paymentRepo = new PaymentRepository(db);
    reminderRepo = new StandaloneReminderRepository(db);
    activityRepo = new ActivityRepository(db);
    contactSync = new ContactSyncService(personRepo, activityRepo);
  });

  describe('Feature 1, 2, 3: Service / Commitment Checklist & Partial Fulfillment & Payment Thread', () => {
    it('should create service obligation with multi-item checklist and optional fee', async () => {
      const person = await personRepo.create({ name: 'Vikram Test' });

      const service = await obligationRepo.createCommitmentObligation({
        personId: person.id,
        direction: 'LENT',
        title: 'Website Redesign',
        description: 'Complete website redesign contract',
        items: ['Wireframes', 'Frontend Prototype', 'Production Deployment'],
        amount: 3000,
        currency: '₹',
        type: 'SERVICE',
      });

      expect(service.type).toBe('SERVICE');
      expect(service.amount).toBe(3000);
      expect(service.remainingAmount).toBe(3000);
      expect(service.commitmentList?.length).toBe(3);
      expect(service.commitmentList![0].title).toBe('Wireframes');
      expect(service.commitmentList![0].status).toBe('PENDING');
      expect(service.commitmentList![1].title).toBe('Frontend Prototype');
      expect(service.commitmentList![2].title).toBe('Production Deployment');
    });

    it('should support partial checks and prompt payment linking', async () => {
      const person = await personRepo.create({ name: 'Neha Test' });

      const service = await obligationRepo.createCommitmentObligation({
        personId: person.id,
        direction: 'LENT',
        title: 'App Development',
        items: ['Milestone 1', 'Milestone 2'],
        amount: 2000,
        type: 'SERVICE',
      });

      const milestone1 = service.commitmentList![0];
      const milestone2 = service.commitmentList![1];

      // Fulfill milestone 1 only (partial fulfillment)
      const res = await obligationRepo.toggleCommitmentItemStatus(milestone1.id, true);
      expect(res.allCompleted).toBe(false);

      // Verify obligation remains ACTIVE
      let updated = await obligationRepo.getByIdWithDetails(service.id);
      expect(updated?.status).toBe('ACTIVE');
      expect(updated?.commitmentList![0].status).toBe('COMPLETED');
      expect(updated?.commitmentList![1].status).toBe('PENDING');

      // Record linked payment for fulfilled milestone
      await paymentRepo.recordPayment({
        obligationId: service.id,
        personId: person.id,
        amount: 1000,
        notes: 'Payment for Milestone 1 fulfilled',
      });

      updated = await obligationRepo.getByIdWithDetails(service.id);
      expect(updated?.remainingAmount).toBe(1000);
      expect(updated?.payments.length).toBe(1);
      expect(updated?.payments[0].amount).toBe(1000);
      expect(updated?.payments[0].notes).toBe('Payment for Milestone 1 fulfilled');

      // Complete milestone 2
      const res2 = await obligationRepo.toggleCommitmentItemStatus(milestone2.id, true);
      expect(res2.allCompleted).toBe(true);

      updated = await obligationRepo.getByIdWithDetails(service.id);
      expect(updated?.status).toBe('COMPLETED');
    });
  });

  describe('Feature 4: Due Date Reschedule & Missed Payment History', () => {
    it('should record full audit history of due date changes with reasons and counter', async () => {
      const person = await personRepo.create({ name: 'Rahul Due Test' });
      const ob = await obligationRepo.createMoneyObligation({
        personId: person.id,
        direction: 'LENT',
        title: 'Emergency loan',
        amount: 5000,
        dueDate: '2026-11-01',
      });

      // 1st Reschedule
      await obligationRepo.updateDueDate(ob.id, '2026-11-10', 'Rahul requested extension');

      let updated = await obligationRepo.getByIdWithDetails(ob.id);
      expect(updated?.dueDate).toBe('2026-11-10');
      expect(updated?.dueDateChangeCount).toBe(1);
      expect(updated?.dueDateHistory?.[0].newDueDate).toBe('2026-11-10');
      expect(updated?.dueDateHistory?.[0].reason).toBe('Rahul requested extension');

      // 2nd Reschedule (Missed payment)
      await obligationRepo.updateDueDate(ob.id, '2026-11-20', 'Missed payment deadline');

      updated = await obligationRepo.getByIdWithDetails(ob.id);
      expect(updated?.dueDate).toBe('2026-11-20');
      expect(updated?.dueDateChangeCount).toBe(2);
      expect(updated?.dueDateHistory?.length).toBe(2);
      expect(updated?.dueDateHistory?.[1].reason).toBe('Missed payment deadline');
    });
  });

  describe('Feature 5: One-Time Reminders (Interviews, Bills, etc. without person)', () => {
    it('should create standalone reminder without person and toggle completion', async () => {
      const reminder = await reminderRepo.create({
        title: 'Interview with Google',
        category: 'INTERVIEW',
        reminderDate: '2026-10-24T10:30:00.000Z',
        notes: 'Technical coding round on Google Meet',
      });

      expect(reminder.id).toBeDefined();
      expect(reminder.title).toBe('Interview with Google');
      expect(reminder.category).toBe('INTERVIEW');
      expect(reminder.isCompleted).toBe(false);

      // Verify in upcoming query
      let upcoming = await reminderRepo.getUpcoming();
      const found = upcoming.find((r) => r.id === reminder.id);
      expect(found).toBeDefined();

      // Toggle complete
      await reminderRepo.toggleComplete(reminder.id, true);
      upcoming = await reminderRepo.getUpcoming();
      expect(upcoming.find((r) => r.id === reminder.id)).toBeUndefined();

      const all = await reminderRepo.getAll(true);
      const completed = all.find((r) => r.id === reminder.id);
      expect(completed?.isCompleted).toBe(true);

      // Delete reminder
      await reminderRepo.delete(reminder.id);
      const afterDelete = await reminderRepo.getAll(true);
      expect(afterDelete.find((r) => r.id === reminder.id)).toBeUndefined();
    });
  });

  describe('Feature 6: Contact Sync', () => {
    it('should parse vCard (.vcf) and CSV format accurately', () => {
      const vcf = `
BEGIN:VCARD
VERSION:3.0
FN:Aarav Patel
TEL;TYPE=CELL:+919876543210
EMAIL:aarav@example.com
NOTE:Business partner
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Diya Sengupta
TEL;TYPE=CELL:+919812345678
EMAIL:diya@example.com
END:VCARD
      `;

      const parsedVcf = contactSync.parseVCard(vcf);
      expect(parsedVcf.length).toBe(2);
      expect(parsedVcf[0].name).toBe('Aarav Patel');
      expect(parsedVcf[0].phoneNumber).toBe('+919876543210');
      expect(parsedVcf[0].email).toBe('aarav@example.com');
      expect(parsedVcf[0].notes).toBe('Business partner');
      expect(parsedVcf[1].name).toBe('Diya Sengupta');

      const csv = `Name,Phone,Email,Notes\nKavita Roy,+919988776655,kavita@work.com,Designer`;
      const parsedCsv = contactSync.parseCsv(csv);
      expect(parsedCsv.length).toBe(1);
      expect(parsedCsv[0].name).toBe('Kavita Roy');
      expect(parsedCsv[0].phoneNumber).toBe('+919988776655');
      expect(parsedCsv[0].email).toBe('kavita@work.com');
    });

    it('should detect duplicates against existing LOOP people and import in bulk', async () => {
      const existingPerson = await personRepo.create({
        name: 'Sameer Khan',
        phoneNumber: '+919999900000',
      });

      const incomingContacts = [
        { name: 'Sameer Khan', phoneNumber: '+919999900000', email: 'sameer.new@example.com' },
        { name: 'New Contact Person', phoneNumber: '+919888877777', email: 'new@example.com' },
      ];

      const existingPeople = await personRepo.getAll(true);
      const annotated = contactSync.annotateWithExisting(incomingContacts, existingPeople);

      expect(annotated[0].alreadyExists).toBe(true);
      expect(annotated[0].existingPersonId).toBe(existingPerson.id);
      expect(annotated[1].alreadyExists).toBe(false);

      // Select both to test updating existing and creating new
      annotated[0].selected = true;
      annotated[1].selected = true;

      const result = await contactSync.importContacts(annotated, existingPeople);
      expect(result.importedCount).toBe(1);
      expect(result.updatedCount).toBe(1);

      // Verify Sameer has updated email
      const updatedSameer = await personRepo.getById(existingPerson.id);
      expect(updatedSameer?.email).toBe('sameer.new@example.com');

      // Verify new person created
      const newPerson = await personRepo.getByName('New Contact Person');
      expect(newPerson).toBeDefined();
    });
  });
});
