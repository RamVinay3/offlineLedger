import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from './database/database.service';
import { PersonRepository } from './repositories/person.repository';
import { ObligationRepository } from './repositories/obligation.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { ActivityRepository } from './repositories/activity.repository';
import {
  RecurringPaymentRepository,
  computeNextDueDate,
} from './repositories/recurring-payment.repository';
import { NotificationService } from './services/notification.service';
import { ReminderRepository } from './repositories/reminder.repository';

describe('Recurring Payments & Reminders Verification', () => {
  let db: DatabaseService;
  let personRepo: PersonRepository;
  let obligationRepo: ObligationRepository;
  let paymentRepo: PaymentRepository;
  let activityRepo: ActivityRepository;
  let recurringRepo: RecurringPaymentRepository;
  let reminderRepo: ReminderRepository;
  let notificationService: NotificationService;

  beforeEach(async () => {
    db = new DatabaseService();
    await db.init();
    personRepo = new PersonRepository(db);
    obligationRepo = new ObligationRepository(db);
    paymentRepo = new PaymentRepository(db);
    activityRepo = new ActivityRepository(db);
    recurringRepo = new RecurringPaymentRepository(
      db,
      activityRepo,
      obligationRepo,
      paymentRepo
    );
    reminderRepo = new ReminderRepository(db);
    notificationService = new NotificationService(reminderRepo);
  });

  describe('Next Due Date Math & Cycle Computations', () => {
    it('should correctly advance dates for DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, and YEARLY', () => {
      expect(computeNextDueDate('2026-10-23', 'DAILY')).toBe('2026-10-24');
      expect(computeNextDueDate('2026-10-23', 'WEEKLY')).toBe('2026-10-30');
      expect(computeNextDueDate('2026-10-23', 'BIWEEKLY')).toBe('2026-11-06');
      expect(computeNextDueDate('2026-10-23', 'MONTHLY')).toBe('2026-11-23');
      expect(computeNextDueDate('2026-10-23', 'QUARTERLY')).toBe('2027-01-23');
      expect(computeNextDueDate('2026-10-23', 'YEARLY')).toBe('2027-10-23');
    });

    it('should handle month boundaries appropriately (e.g. Jan 31 -> Feb 28)', () => {
      const febNext = computeNextDueDate('2026-01-31', 'MONTHLY');
      expect(febNext).toBe('2026-02-28');
    });
  });

  describe('Recurring Payment Lifecycle & CRUD', () => {
    it('should create an active recurring payment (e.g. monthly rent)', async () => {
      const payment = await recurringRepo.create({
        title: 'Apartment Rent',
        amount: 25000,
        currency: '₹',
        direction: 'PAY',
        frequency: 'MONTHLY',
        category: 'RENT',
        startDate: '2026-11-01',
        nextDueDate: '2026-11-01',
        reminderDaysBefore: 3,
        reminderTime: '09:00',
        notes: 'Pay to landlord Mr. Sharma',
      });

      expect(payment.id).toBeDefined();
      expect(payment.title).toBe('Apartment Rent');
      expect(payment.amount).toBe(25000);
      expect(payment.direction).toBe('PAY');
      expect(payment.frequency).toBe('MONTHLY');
      expect(payment.category).toBe('RENT');
      expect(payment.nextDueDate).toBe('2026-11-01');
      expect(payment.reminderDaysBefore).toBe(3);
      expect(payment.isActive).toBe(true);
      expect(payment.totalPaidOccurrences).toBe(0);
      expect(payment.totalPaidAmount).toBe(0);
    });

    it('should link recurring payment to a person and record activity', async () => {
      const person = await personRepo.create({ name: 'Rahul Retainer Client' });

      const recurring = await recurringRepo.create({
        title: 'Monthly Consulting Retainer',
        amount: 50000,
        currency: '₹',
        direction: 'RECEIVE',
        frequency: 'MONTHLY',
        personId: person.id,
        category: 'SALARY',
        startDate: '2026-11-05',
      });

      expect(recurring.personId).toBe(person.id);
      expect(recurring.personName).toBe('Rahul Retainer Client');

      const timeline = await activityRepo.getTimeline({ personId: person.id });
      const createdActivity = timeline.find((a) => a.eventType === 'RECURRING_PAYMENT_CREATED');
      expect(createdActivity).toBeDefined();
      expect(createdActivity?.description).toContain('Monthly Consulting Retainer');
    });

    it('should mark a payment cycle paid, update statistics, and advance next due date', async () => {
      const payment = await recurringRepo.create({
        title: 'Netflix Premium',
        amount: 649,
        currency: '₹',
        direction: 'PAY',
        frequency: 'MONTHLY',
        category: 'SUBSCRIPTION',
        startDate: '2026-10-25',
        nextDueDate: '2026-10-25',
      });

      const { payment: paidCycle, nextDueDate } = await recurringRepo.recordPaymentCycle(payment.id);

      expect(nextDueDate).toBe('2026-11-25');
      expect(paidCycle.nextDueDate).toBe('2026-11-25');
      expect(paidCycle.totalPaidOccurrences).toBe(1);
      expect(paidCycle.totalPaidAmount).toBe(649);
      expect(paidCycle.lastPaidDate).toBeDefined();

      // Second cycle payment
      const { payment: secondCycle, nextDueDate: secondDueDate } = await recurringRepo.recordPaymentCycle(payment.id);
      expect(secondDueDate).toBe('2026-12-25');
      expect(secondCycle.totalPaidOccurrences).toBe(2);
      expect(secondCycle.totalPaidAmount).toBe(1298);
    });

    it('should skip a cycle and advance due date without incrementing paid amount', async () => {
      const payment = await recurringRepo.create({
        title: 'Gym Membership',
        amount: 2000,
        frequency: 'MONTHLY',
        startDate: '2026-10-23',
        nextDueDate: '2026-10-23',
      });

      const { payment: skipped, nextDueDate } = await recurringRepo.skipCycle(payment.id);

      expect(nextDueDate).toBe('2026-11-23');
      expect(skipped.totalPaidOccurrences).toBe(0);
      expect(skipped.totalPaidAmount).toBe(0);
    });

    it('should pause and resume recurring payments', async () => {
      const payment = await recurringRepo.create({
        title: 'Spotify Family',
        amount: 199,
        frequency: 'MONTHLY',
        startDate: '2026-11-10',
      });

      const paused = await recurringRepo.toggleActive(payment.id, false);
      expect(paused.isActive).toBe(false);

      const activeList = await recurringRepo.getActive();
      expect(activeList.some((p) => p.id === payment.id)).toBe(false);

      const resumed = await recurringRepo.toggleActive(payment.id, true);
      expect(resumed.isActive).toBe(true);

      const activeListAfter = await recurringRepo.getActive();
      expect(activeListAfter.some((p) => p.id === payment.id)).toBe(true);
    });

    it('should optionally auto-record in person ledger when paid', async () => {
      const landlord = await personRepo.create({ name: 'Landlord Sharma' });

      const recurring = await recurringRepo.create({
        title: 'Flat Rent',
        amount: 15000,
        currency: '₹',
        direction: 'PAY',
        frequency: 'MONTHLY',
        personId: landlord.id,
        autoRecordObligation: true,
        startDate: '2026-10-23',
      });

      await recurringRepo.recordPaymentCycle(recurring.id, true);

      const obligations = await obligationRepo.getAllWithDetails({ personId: landlord.id });
      expect(obligations.length).toBeGreaterThan(0);
      const rentOb = obligations.find((o) => o.title.includes('Flat Rent'));
      expect(rentOb).toBeDefined();
      expect(rentOb?.amount).toBe(15000);
      expect(rentOb?.status).toBe('COMPLETED'); // Marked completed by immediate payment
    });

    it('should schedule local reminder notification for recurring payment', async () => {
      const recurring = await recurringRepo.create({
        title: 'Car Loan EMI',
        amount: 12000,
        currency: '₹',
        direction: 'PAY',
        frequency: 'MONTHLY',
        startDate: '2026-10-30',
        nextDueDate: '2026-10-30',
        reminderDaysBefore: 2,
        reminderTime: '10:00',
      });

      await expect(
        notificationService.scheduleRecurringPaymentReminder({
          id: recurring.id,
          title: recurring.title,
          amount: recurring.amount,
          currency: recurring.currency,
          direction: recurring.direction,
          frequency: recurring.frequency,
          nextDueDate: recurring.nextDueDate,
          reminderDaysBefore: recurring.reminderDaysBefore,
          reminderTime: recurring.reminderTime,
        })
      ).resolves.not.toThrow();
    });

    it('should delete a recurring payment', async () => {
      const payment = await recurringRepo.create({
        title: 'Temporary Service',
        amount: 500,
        frequency: 'WEEKLY',
        startDate: '2026-10-23',
      });

      await recurringRepo.delete(payment.id);
      const found = await recurringRepo.getById(payment.id);
      expect(found).toBeNull();
    });
  });
});
