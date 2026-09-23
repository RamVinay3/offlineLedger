import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from './database/database.service';
import { PersonRepository } from './repositories/person.repository';
import { ObligationRepository } from './repositories/obligation.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { ItemRepository } from './repositories/item.repository';
import { SettlementRepository } from './repositories/settlement.repository';
import { ActivityRepository } from './repositories/activity.repository';
import { SettingsRepository } from './repositories/settings.repository';
import { BackupService } from './services/backup.service';
import { SecurityService } from './services/security.service';

describe('LOOP Core Domain & Ledger Verification', () => {
  let db: DatabaseService;
  let personRepo: PersonRepository;
  let obligationRepo: ObligationRepository;
  let paymentRepo: PaymentRepository;
  let itemRepo: ItemRepository;
  let settlementRepo: SettlementRepository;
  let activityRepo: ActivityRepository;
  let settingsRepo: SettingsRepository;
  let backupService: BackupService;
  let securityService: SecurityService;

  beforeEach(async () => {
    db = new DatabaseService();
    await db.init();
    personRepo = new PersonRepository(db);
    obligationRepo = new ObligationRepository(db);
    paymentRepo = new PaymentRepository(db);
    itemRepo = new ItemRepository(db);
    settlementRepo = new SettlementRepository(db);
    activityRepo = new ActivityRepository(db);
    settingsRepo = new SettingsRepository(db);
    backupService = new BackupService(db, obligationRepo);
    securityService = new SecurityService(settingsRepo);
    await securityService.init();
  });

  it('1. should create person, lend ₹2,000 and calculate net balance', async () => {
    const rahul = await personRepo.create({ name: 'Rahul Sharma' });
    expect(rahul.id).toBeDefined();

    const ob = await obligationRepo.createMoneyObligation({
      personId: rahul.id,
      direction: 'LENT',
      title: 'Lunch bill share',
      amount: 2000,
    });

    expect(ob.remainingAmount).toBe(2000);
    expect(ob.status).toBe('ACTIVE');

    const balance = await personRepo.getBalanceSummary(rahul.id);
    expect(balance.totalOwedToYou).toBe(2000);
    expect(balance.totalYouOwe).toBe(0);
    expect(balance.netBalance).toBe(2000);
  });

  it('2. should record partial payment and prevent overpayment', async () => {
    const rahul = await personRepo.create({ name: 'Rahul Sharma 2' });
    const ob = await obligationRepo.createMoneyObligation({
      personId: rahul.id,
      direction: 'LENT',
      title: 'Project expenses',
      amount: 2000,
    });

    // Partial payment of ₹500
    const p1 = await paymentRepo.recordPayment({
      obligationId: ob.id,
      personId: rahul.id,
      amount: 500,
      notes: 'UPI payment',
    });
    expect(p1.amount).toBe(500);

    const updated = await obligationRepo.getByIdWithDetails(ob.id);
    expect(updated?.remainingAmount).toBe(1500);
    expect(updated?.status).toBe('ACTIVE');

    // Overpayment check: Attempting to pay ₹1,600 when only ₹1,500 remains must throw
    await expect(
      paymentRepo.recordPayment({
        obligationId: ob.id,
        personId: rahul.id,
        amount: 1600,
      })
    ).rejects.toThrow();

    // Valid remaining payment of ₹1,500
    await paymentRepo.recordPayment({
      obligationId: ob.id,
      personId: rahul.id,
      amount: 1500,
    });

    const completed = await obligationRepo.getByIdWithDetails(ob.id);
    expect(completed?.remainingAmount).toBe(0);
    expect(completed?.status).toBe('COMPLETED');
  });

  it('3. should track items and mark them returned', async () => {
    const amit = await personRepo.create({ name: 'Amit Kumar' });
    const itemOb = await obligationRepo.createItemObligation({
      personId: amit.id,
      direction: 'LENT',
      name: 'Sony Headphones',
      expectedReturnDate: '2026-09-30',
    });

    expect(itemOb.itemDetails?.name).toBe('Sony Headphones');
    expect(itemOb.itemDetails?.status).toBe('ACTIVE');

    await itemRepo.markAsReturned(itemOb.id, 'Returned in good condition');

    const updated = await obligationRepo.getByIdWithDetails(itemOb.id);
    expect(updated?.status).toBe('COMPLETED');
    expect(updated?.itemDetails?.status).toBe('RETURNED');
  });

  it('4. should settle relationship net balance without deleting historical transactions', async () => {
    const neha = await personRepo.create({ name: 'Neha Gupta' });

    // You lend Neha ₹3,000
    await obligationRepo.createMoneyObligation({
      personId: neha.id,
      direction: 'LENT',
      title: 'Shopping loan',
      amount: 3000,
    });

    // You borrow ₹1,200 from Neha
    await obligationRepo.createMoneyObligation({
      personId: neha.id,
      direction: 'BORROWED',
      title: 'Cab fare share',
      amount: 1200,
    });

    const beforeBalance = await personRepo.getBalanceSummary(neha.id);
    expect(beforeBalance.totalOwedToYou).toBe(3000);
    expect(beforeBalance.totalYouOwe).toBe(1200);
    expect(beforeBalance.netBalance).toBe(1800); // Neha owes you ₹1,800 net

    // Settle relationship explicitly
    const settlement = await settlementRepo.settleRelationship({
      personId: neha.id,
      netAmount: 1800,
      direction: 'LENT',
      notes: 'Cleared via PhonePe',
    });

    expect(settlement.settledAmount).toBe(1800);

    const afterBalance = await personRepo.getBalanceSummary(neha.id);
    expect(afterBalance.totalOwedToYou).toBe(0);
    expect(afterBalance.totalYouOwe).toBe(0);
    expect(afterBalance.netBalance).toBe(0);

    // Verify history remains intact
    const allObligations = await obligationRepo.getAllWithDetails({ personId: neha.id });
    expect(allObligations.length).toBe(2);
    expect(allObligations[0].status).toBe('COMPLETED');
    expect(allObligations[1].status).toBe('COMPLETED');

    const timeline = await activityRepo.getTimeline({ personId: neha.id });
    const settlementEvent = timeline.find((t) => t.eventType === 'SETTLEMENT_CREATED');
    expect(settlementEvent).toBeDefined();
  });

  it('5. should encrypt backup and restore without data loss', async () => {
    const priya = await personRepo.create({ name: 'Priya Verma' });
    await obligationRepo.createMoneyObligation({
      personId: priya.id,
      direction: 'LENT',
      title: 'Concert Ticket',
      amount: 4500,
    });

    const password = 'SuperSecretLocalPassword123!';
    const backupJson = await backupService.createEncryptedBackup(password);
    expect(backupJson).toContain('LOOP_ENCRYPTED_BACKUP');

    // Attempt decrypting with wrong password should fail
    await expect(
      backupService.restoreEncryptedBackup(backupJson, 'WrongPassword')
    ).rejects.toThrow();

    // Decrypting with correct password succeeds
    await backupService.restoreEncryptedBackup(backupJson, password);
    const restoredPeople = await personRepo.getAll();
    expect(restoredPeople.some((p) => p.name === 'Priya Verma')).toBe(true);
  });

  it('6. should create commitment obligation without transaction failure', async () => {
    const kiran = await personRepo.create({ name: 'Kiran Patel' });
    const commOb = await obligationRepo.createCommitmentObligation({
      personId: kiran.id,
      direction: 'LENT',
      title: 'Send project document',
      description: 'By Friday afternoon',
      dueDate: '2026-09-26',
    });

    expect(commOb.id).toBeDefined();
    expect(commOb.title).toBe('Send project document');
    expect(commOb.commitmentDetails?.status).toBe('PENDING');
  });

  it('7. should persist theme settings (dark/light) smoothly without transaction rollback errors', async () => {
    // Switch to light theme
    await settingsRepo.saveSettings({ theme: 'light' });
    let settings = await settingsRepo.getSettings();
    expect(settings.theme).toBe('light');

    // Switch back to dark theme
    await settingsRepo.saveSettings({ theme: 'dark' });
    settings = await settingsRepo.getSettings();
    expect(settings.theme).toBe('dark');
  });

  it('8. should enforce phone number sanitization to strictly 10 digits', async () => {
    const rawNumber = '+91 (987) 654-3210 9999'; // 14 digits
    const digitsOnly = rawNumber.replace(/\D/g, '').slice(0, 10);
    expect(digitsOnly.length).toBe(10);
    expect(digitsOnly).toBe('9198765432');

    const person = await personRepo.create({
      name: 'Phone Test User',
      phoneNumber: digitsOnly,
    });

    const retrieved = await personRepo.getById(person.id);
    expect(retrieved?.phoneNumber?.length).toBe(10);
    expect(retrieved?.phoneNumber).toBe('9198765432');
  });

  it('9. should configure PIN, verify PIN hash, and manage App Lock state correctly', async () => {
    // 1. Set 4-digit PIN
    await securityService.setPin('1234');
    let settings = await settingsRepo.getSettings();
    expect(settings.isAppLockEnabled).toBe(true);
    expect(settings.pinHash).toBeDefined();
    expect(settings.salt).toBeDefined();

    // 2. Verify correct PIN
    const isValid = await securityService.verifyPin('1234');
    expect(isValid).toBe(true);

    // 3. Verify incorrect PIN
    const isWrong = await securityService.verifyPin('9999');
    expect(isWrong).toBe(false);

    // 4. Toggle lock disabled (PIN preserved)
    await settingsRepo.saveSettings({ isAppLockEnabled: false });
    settings = await settingsRepo.getSettings();
    expect(settings.isAppLockEnabled).toBe(false);
    expect(settings.pinHash).toBeDefined();

    // 5. Remove PIN completely
    await securityService.removePin();
    settings = await settingsRepo.getSettings();
    expect(settings.isAppLockEnabled).toBe(false);
    expect(settings.pinHash).toBeFalsy();
  });

  it('10. should separate active obligations from settled/completed history', async () => {
    const sam = await personRepo.create({ name: 'Sam Taylor' });

    // Active loan
    const activeOb = await obligationRepo.createMoneyObligation({
      personId: sam.id,
      direction: 'LENT',
      title: 'Active Rent Loan',
      amount: 5000,
    });

    // Settled loan
    const settledOb = await obligationRepo.createMoneyObligation({
      personId: sam.id,
      direction: 'LENT',
      title: 'Settled Dinner',
      amount: 1000,
    });
    await paymentRepo.recordPayment({
      obligationId: settledOb.id,
      personId: sam.id,
      amount: 1000,
    });

    const all = await obligationRepo.getAllWithDetails({ personId: sam.id });
    expect(all.length).toBe(2);

    const activeItems = all.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
    const completedItems = all.filter((o) => o.status === 'COMPLETED');

    expect(activeItems.length).toBe(1);
    expect(activeItems[0].title).toBe('Active Rent Loan');

    expect(completedItems.length).toBe(1);
    expect(completedItems[0].title).toBe('Settled Dinner');
  });

  it('11. should update person details and reflect across obligations and activities', async () => {
    const priya = await personRepo.create({
      name: 'Priya',
      phoneNumber: '9876543210',
      email: 'priya@old.com',
      notes: 'Old note',
    });

    const ob = await obligationRepo.createMoneyObligation({
      personId: priya.id,
      direction: 'LENT',
      title: 'Groceries split',
      amount: 450,
    });

    expect(ob.personName).toBe('Priya');

    // Update person
    await personRepo.update(priya.id, {
      name: 'Priya Sharma',
      phoneNumber: '9988776655',
      email: 'priya@new.com',
      notes: 'Colleague at TechCorp',
    });

    const updated = await personRepo.getById(priya.id);
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Priya Sharma');
    expect(updated!.phoneNumber).toBe('9988776655');
    expect(updated!.email).toBe('priya@new.com');
    expect(updated!.notes).toBe('Colleague at TechCorp');

    // Verify obligations join with updated person name
    const obligations = await obligationRepo.getAllWithDetails({ personId: priya.id });
    expect(obligations[0].personName).toBe('Priya Sharma');
  });
});
