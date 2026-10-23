import { Injectable, signal, computed } from '@angular/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { PersonRepository } from '../repositories/person.repository';
import { ObligationRepository } from '../repositories/obligation.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { ItemRepository } from '../repositories/item.repository';
import { SettlementRepository } from '../repositories/settlement.repository';
import { ActivityRepository } from '../repositories/activity.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { StandaloneReminderRepository } from '../repositories/standalone-reminder.repository';
import { RecurringPaymentRepository } from '../repositories/recurring-payment.repository';
import { NotificationService } from '../services/notification.service';
import {
  Person,
  ObligationWithDetails,
  Activity,
  AppSettings,
  DashboardSummary,
  PersonBalanceSummary,
  ObligationDirection,
  ObligationType,
  StandaloneReminder,
  StandaloneReminderCategory,
  Commitment,
  RecurringPayment,
  RecurringPaymentFrequency,
  RecurringPaymentCategory,
  RecurringPaymentDirection,
} from '../models';

export type FilterCategory = 'ALL' | 'MONEY' | 'ITEMS' | 'COMMITMENTS' | 'REMINDERS' | 'RECURRING' | 'DUE' | 'OVERDUE' | 'COMPLETED';

@Injectable({
  providedIn: 'root',
})
export class LoopStateService {
  // --- Raw Signals ---
  readonly isLoading = signal<boolean>(true);
  readonly people = signal<Person[]>([]);
  readonly obligations = signal<ObligationWithDetails[]>([]);
  readonly activities = signal<Activity[]>([]);
  readonly standaloneReminders = signal<StandaloneReminder[]>([]);
  readonly recurringPayments = signal<RecurringPayment[]>([]);
  readonly settings = signal<AppSettings>({
    currencySymbol: '₹',
    theme: 'dark',
    isAppLockEnabled: false,
    autoLockTimeout: '5m',
    isBiometricEnabled: false,
    hasCompletedOnboarding: false,
  });

  readonly searchQuery = signal<string>('');
  readonly activeFilter = signal<FilterCategory>('ALL');
  readonly selectedPersonId = signal<string | null>(null);

  // --- Computed Signals ---

  /**
   * High-level dashboard metrics
   */
  readonly dashboardSummary = computed<DashboardSummary>(() => {
    const obList = this.obligations();
    let totalOwedToYou = 0;
    let totalYouOwe = 0;
    const peopleOwedSet = new Set<string>();
    const peopleOwingSet = new Set<string>();
    let activeItemsOwedCount = 0;
    let activeItemsOwingCount = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    for (const ob of obList) {
      const isCompleted = ob.status === 'COMPLETED' || ob.status === 'CANCELLED';

      if ((ob.type === 'MONEY' || ob.type === 'SERVICE') && !isCompleted && ob.remainingAmount > 0) {
        if (ob.direction === 'LENT') {
          totalOwedToYou += ob.remainingAmount;
          peopleOwedSet.add(ob.personId);
        } else {
          totalYouOwe += ob.remainingAmount;
          peopleOwingSet.add(ob.personId);
        }
      }

      if (ob.type === 'ITEM' && !isCompleted) {
        if (ob.direction === 'LENT') {
          activeItemsOwedCount++;
        } else {
          activeItemsOwingCount++;
        }
      }

      // Check overdue and due soon
      if (!isCompleted && ob.dueDate) {
        const d = new Date(ob.dueDate);
        if (d < today) {
          overdueCount++;
        } else if (d <= threeDaysLater) {
          dueSoonCount++;
        }
      }
    }

    const pendingRemindersCount = this.standaloneReminders().filter((r) => !r.isCompleted).length;
    const activeRecurringCount = this.activeRecurringPayments().length;
    const dueRecurringCount = this.dueSoonRecurringPayments().length;
    const { monthlyOutflow: monthlyRecurringOutflow, monthlyInflow: monthlyRecurringInflow } = this.recurringFinancialSummary();

    return {
      totalOwedToYou,
      totalYouOwe,
      netPosition: totalOwedToYou - totalYouOwe,
      peopleCountOwed: peopleOwedSet.size,
      peopleCountOwing: peopleOwingSet.size,
      activeItemsOwedCount,
      activeItemsOwingCount,
      overdueCount,
      dueSoonCount,
      pendingRemindersCount,
      activeRecurringCount,
      dueRecurringCount,
      monthlyRecurringOutflow,
      monthlyRecurringInflow,
    };
  });

  /**
   * Active recurring payments
   */
  readonly activeRecurringPayments = computed<RecurringPayment[]>(() => {
    return this.recurringPayments().filter((r) => r.isActive);
  });

  /**
   * Recurring payments that are overdue or due within the next 7 days
   */
  readonly dueSoonRecurringPayments = computed<RecurringPayment[]>(() => {
    const active = this.activeRecurringPayments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    return active
      .filter((r) => {
        const d = new Date(r.nextDueDate + 'T00:00:00');
        return d <= sevenDaysLater;
      })
      .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
  });

  /**
   * Monthly financial projection from recurring payments
   */
  readonly recurringFinancialSummary = computed(() => {
    const list = this.activeRecurringPayments();
    let monthlyOutflow = 0;
    let monthlyInflow = 0;

    for (const item of list) {
      let multiplier = 1;
      switch (item.frequency) {
        case 'DAILY':
          multiplier = 30;
          break;
        case 'WEEKLY':
          multiplier = 52 / 12;
          break;
        case 'BIWEEKLY':
          multiplier = 26 / 12;
          break;
        case 'MONTHLY':
          multiplier = 1;
          break;
        case 'QUARTERLY':
          multiplier = 1 / 3;
          break;
        case 'YEARLY':
          multiplier = 1 / 12;
          break;
      }

      const monthlyAmount = item.amount * multiplier;
      if (item.direction === 'PAY') {
        monthlyOutflow += monthlyAmount;
      } else {
        monthlyInflow += monthlyAmount;
      }
    }

    return {
      monthlyOutflow: Math.round(monthlyOutflow),
      monthlyInflow: Math.round(monthlyInflow),
      netMonthlyProjection: Math.round(monthlyInflow - monthlyOutflow),
      activeCount: list.length,
      dueSoonCount: this.dueSoonRecurringPayments().length,
    };
  });

  /**
   * Obligations that require immediate attention (Overdue or Due in <= 3 days)
   */
  readonly needsAttentionObligations = computed<ObligationWithDetails[]>(() => {
    const obList = this.obligations();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    return obList
      .filter((ob) => {
        if (ob.status === 'COMPLETED' || ob.status === 'CANCELLED') return false;
        if (!ob.dueDate) return false;
        const d = new Date(ob.dueDate);
        return d <= threeDaysLater;
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  });

  /**
   * Active standalone reminders (interviews, bills, errands)
   */
  readonly activeStandaloneReminders = computed<StandaloneReminder[]>(() => {
    return this.standaloneReminders().filter((r) => !r.isCompleted);
  });

  /**
   * Person balance summaries for all active people
   */
  readonly personBalances = computed<PersonBalanceSummary[]>(() => {
    const peopleList = this.people().filter((p) => !p.isArchived);
    const obList = this.obligations();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return peopleList.map((p) => {
      let totalOwedToYou = 0;
      let totalYouOwe = 0;
      let activeObligationsCount = 0;
      let activeItemsCount = 0;
      let hasOverdue = false;

      for (const ob of obList) {
        if (ob.personId !== p.id) continue;
        const isCompleted = ob.status === 'COMPLETED' || ob.status === 'CANCELLED';

        if ((ob.type === 'MONEY' || ob.type === 'SERVICE') && !isCompleted && ob.remainingAmount > 0) {
          activeObligationsCount++;
          if (ob.direction === 'LENT') {
            totalOwedToYou += ob.remainingAmount;
          } else {
            totalYouOwe += ob.remainingAmount;
          }
        }

        if (ob.type === 'ITEM' && !isCompleted) {
          activeItemsCount++;
          activeObligationsCount++;
        }

        if ((ob.type === 'COMMITMENT' || ob.type === 'SERVICE') && !isCompleted) {
          activeObligationsCount++;
        }

        if (!isCompleted && ob.dueDate) {
          if (new Date(ob.dueDate) < today) {
            hasOverdue = true;
          }
        }
      }

      return {
        personId: p.id,
        personName: p.name,
        totalOwedToYou,
        totalYouOwe,
        netBalance: totalOwedToYou - totalYouOwe,
        activeObligationsCount,
        activeItemsCount,
        hasOverdue,
      };
    });
  });

  /**
   * Filtered and searched obligations
   */
  readonly filteredObligations = computed<ObligationWithDetails[]>(() => {
    const obList = this.obligations();
    const filter = this.activeFilter();
    const query = this.searchQuery().trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return obList.filter((ob) => {
      // 1. Text Search Filter
      if (query.length > 0) {
        const matchesName = ob.personName.toLowerCase().includes(query);
        const matchesTitle = ob.title.toLowerCase().includes(query);
        const matchesDesc = (ob.description || '').toLowerCase().includes(query);
        if (!matchesName && !matchesTitle && !matchesDesc) {
          return false;
        }
      }

      const isActive = ob.status !== 'COMPLETED' && ob.status !== 'CANCELLED';

      // 2. Category Filter
      switch (filter) {
        case 'MONEY':
          return ob.type === 'MONEY' && (query.length > 0 ? true : isActive);
        case 'ITEMS':
          return ob.type === 'ITEM' && (query.length > 0 ? true : isActive);
        case 'COMMITMENTS':
          return (ob.type === 'COMMITMENT' || ob.type === 'SERVICE') && (query.length > 0 ? true : isActive);
        case 'DUE':
          return (
            isActive &&
            ob.dueDate !== undefined &&
            new Date(ob.dueDate) >= today
          );
        case 'OVERDUE':
          return (
            isActive &&
            ob.dueDate !== undefined &&
            new Date(ob.dueDate) < today
          );
        case 'COMPLETED':
          return ob.status === 'COMPLETED';
        case 'REMINDERS':
          return false; // Handled in dedicated section
        case 'ALL':
        default:
          return query.length > 0 ? true : isActive;
      }
    });
  });

  /**
   * Current selected person details and ledger
   */
  readonly selectedPersonLedger = computed(() => {
    const pId = this.selectedPersonId();
    if (!pId) return null;

    const person = this.people().find((p) => p.id === pId) || null;
    const balance = this.personBalances().find((b) => b.personId === pId) || null;
    const obligations = this.obligations().filter((o) => o.personId === pId);
    const activities = this.activities().filter((a) => a.personId === pId);

    return {
      person,
      balance,
      obligations,
      activities,
    };
  });

  constructor(
    private personRepo: PersonRepository,
    private obligationRepo: ObligationRepository,
    private paymentRepo: PaymentRepository,
    private itemRepo: ItemRepository,
    private settlementRepo: SettlementRepository,
    private activityRepo: ActivityRepository,
    private settingsRepo: SettingsRepository,
    private standaloneReminderRepo: StandaloneReminderRepository,
    private recurringPaymentRepo: RecurringPaymentRepository,
    private notificationService: NotificationService
  ) {}

  async loadInitialData(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.refreshAll();
    } finally {
      this.isLoading.set(false);
    }
  }

  async refreshAll(): Promise<void> {
    const [people, obligations, activities, settings, standaloneReminders, recurringPayments] = await Promise.all([
      this.personRepo.getAll(true),
      this.obligationRepo.getAllWithDetails(),
      this.activityRepo.getTimeline({ limit: 100 }),
      this.settingsRepo.getSettings(),
      this.standaloneReminderRepo.getAll(true),
      this.recurringPaymentRepo.getAll(),
    ]);

    this.people.set(people);
    this.obligations.set(obligations);
    this.activities.set(activities);
    this.settings.set(settings);
    this.standaloneReminders.set(standaloneReminders);
    this.recurringPayments.set(recurringPayments);
    this.applyTheme(settings.theme);
  }

  // --- Person Actions ---

  async createPerson(data: {
    name: string;
    phoneNumber?: string;
    email?: string;
    notes?: string;
  }): Promise<Person> {
    const person = await this.personRepo.create(data);
    await this.activityRepo.logEvent({
      personId: person.id,
      eventType: 'PERSON_CREATED',
      description: `Added "${person.name}" to LOOP`,
    });
    await this.refreshAll();
    return person;
  }

  async updatePerson(id: string, updates: Partial<Person>): Promise<void> {
    await this.personRepo.update(id, updates);
    await this.activityRepo.logEvent({
      personId: id,
      eventType: 'PERSON_UPDATED',
      description: `Updated profile details for "${updates.name || 'person'}"`,
    });
    await this.refreshAll();
  }

  async archivePerson(id: string, isArchived: boolean): Promise<void> {
    await this.personRepo.archive(id, isArchived);
    await this.activityRepo.logEvent({
      personId: id,
      eventType: 'PERSON_ARCHIVED',
      description: isArchived ? 'Person archived' : 'Person unarchived',
    });
    await this.refreshAll();
  }

  // --- Obligation Actions ---

  async addMoneyObligation(data: {
    personId: string;
    direction: ObligationDirection;
    title: string;
    description?: string;
    amount: number;
    currency?: string;
    dueDate?: string;
  }): Promise<ObligationWithDetails> {
    const ob = await this.obligationRepo.createMoneyObligation(data);
    if (data.dueDate) {
      await this.notificationService.scheduleObligationReminders({
        obligationId: ob.id,
        personId: data.personId,
        personName: ob.personName,
        title: ob.title,
        type: ob.type,
        direction: ob.direction,
        dueDate: data.dueDate,
      });
    }
    await this.refreshAll();
    return ob;
  }

  async addItemObligation(data: {
    personId: string;
    direction: ObligationDirection;
    name: string;
    description?: string;
    expectedReturnDate?: string;
  }): Promise<ObligationWithDetails> {
    const ob = await this.obligationRepo.createItemObligation(data);
    if (data.expectedReturnDate) {
      await this.notificationService.scheduleObligationReminders({
        obligationId: ob.id,
        personId: data.personId,
        personName: ob.personName,
        title: ob.title,
        type: ob.type,
        direction: ob.direction,
        dueDate: data.expectedReturnDate,
      });
    }
    await this.refreshAll();
    return ob;
  }

  async addCommitmentObligation(data: {
    personId: string;
    direction: ObligationDirection;
    title: string;
    description?: string;
    dueDate?: string;
    items?: string[];
    amount?: number;
    currency?: string;
    type?: ObligationType;
  }): Promise<ObligationWithDetails> {
    const ob = await this.obligationRepo.createCommitmentObligation(data);
    if (data.dueDate) {
      await this.notificationService.scheduleObligationReminders({
        obligationId: ob.id,
        personId: data.personId,
        personName: ob.personName,
        title: ob.title,
        type: ob.type,
        direction: ob.direction,
        dueDate: data.dueDate,
      });
    }
    await this.refreshAll();
    return ob;
  }

  async toggleCommitmentItem(
    commitmentId: string,
    isCompleted: boolean
  ): Promise<{ obligationId: string; itemTitle: string; allCompleted: boolean }> {
    const res = await this.obligationRepo.toggleCommitmentItemStatus(commitmentId, isCompleted);
    if (res.allCompleted) {
      await this.notificationService.cancelRemindersForObligation(res.obligationId);
    }
    await this.refreshAll();
    return res;
  }

  async addCommitmentItem(obligationId: string, title: string): Promise<Commitment> {
    const item = await this.obligationRepo.addCommitmentItem(obligationId, title);
    await this.refreshAll();
    return item;
  }

  async recordPayment(data: {
    obligationId: string;
    personId: string;
    amount: number;
    notes?: string;
    paymentDate?: string;
  }): Promise<void> {
    await this.paymentRepo.recordPayment(data);
    await this.refreshAll();
  }

  async returnItem(obligationId: string, notes?: string): Promise<void> {
    await this.itemRepo.markAsReturned(obligationId, notes);
    await this.notificationService.cancelRemindersForObligation(obligationId);
    await this.refreshAll();
  }

  async completeCommitment(obligationId: string): Promise<void> {
    await this.obligationRepo.completeCommitment(obligationId);
    await this.notificationService.cancelRemindersForObligation(obligationId);
    await this.refreshAll();
  }

  async updateDueDate(obligationId: string, newDueDate: string, reason?: string): Promise<void> {
    await this.obligationRepo.updateDueDate(obligationId, newDueDate, reason);
    const ob = await this.obligationRepo.getByIdWithDetails(obligationId);
    if (ob) {
      await this.notificationService.cancelRemindersForObligation(obligationId);
      await this.notificationService.scheduleObligationReminders({
        obligationId: ob.id,
        personId: ob.personId,
        personName: ob.personName,
        title: ob.title,
        type: ob.type,
        direction: ob.direction,
        dueDate: newDueDate,
      });
    }
    await this.refreshAll();
  }

  async settleRelationship(data: {
    personId: string;
    netAmount: number;
    direction: ObligationDirection;
    notes?: string;
  }): Promise<void> {
    await this.settlementRepo.settleRelationship(data);
    await this.refreshAll();
  }

  // --- Standalone Reminder Actions ---

  async createStandaloneReminder(data: {
    title: string;
    category?: StandaloneReminderCategory;
    reminderDate: string;
    notes?: string;
  }): Promise<StandaloneReminder> {
    const reminder = await this.standaloneReminderRepo.create(data);
    await this.notificationService.scheduleStandaloneReminder(reminder);
    await this.refreshAll();
    return reminder;
  }

  async toggleStandaloneReminder(id: string, isCompleted: boolean): Promise<void> {
    await this.standaloneReminderRepo.toggleComplete(id, isCompleted);
    if (isCompleted) {
      await this.notificationService.cancelStandaloneReminder(id);
    } else {
      const r = this.standaloneReminders().find((item) => item.id === id);
      if (r) {
        await this.notificationService.scheduleStandaloneReminder(r);
      }
    }
    await this.refreshAll();
  }

  async deleteStandaloneReminder(id: string): Promise<void> {
    await this.standaloneReminderRepo.delete(id);
    await this.notificationService.cancelStandaloneReminder(id);
    await this.refreshAll();
  }

  // --- Recurring Payment Actions ---

  async createRecurringPayment(data: {
    title: string;
    amount: number;
    currency?: string;
    direction?: RecurringPaymentDirection;
    frequency: RecurringPaymentFrequency;
    personId?: string;
    category?: RecurringPaymentCategory;
    startDate: string;
    nextDueDate?: string;
    endDate?: string;
    reminderDaysBefore?: number;
    reminderTime?: string;
    autoRecordObligation?: boolean;
    notes?: string;
  }): Promise<RecurringPayment> {
    const payment = await this.recurringPaymentRepo.create(data);
    await this.notificationService.scheduleRecurringPaymentReminder(payment);
    await this.refreshAll();
    return payment;
  }

  async updateRecurringPayment(
    id: string,
    updates: Partial<{
      title: string;
      amount: number;
      currency: string;
      direction: RecurringPaymentDirection;
      frequency: RecurringPaymentFrequency;
      personId?: string | null;
      category: RecurringPaymentCategory;
      startDate: string;
      nextDueDate: string;
      endDate?: string | null;
      reminderDaysBefore: number;
      reminderTime: string;
      autoRecordObligation: boolean;
      isActive: boolean;
      notes?: string | null;
    }>
  ): Promise<RecurringPayment> {
    const updated = await this.recurringPaymentRepo.update(id, updates);
    if (updated.isActive) {
      await this.notificationService.scheduleRecurringPaymentReminder(updated);
    } else {
      await this.notificationService.cancelRecurringPaymentReminder(id);
    }
    await this.refreshAll();
    return updated;
  }

  async toggleRecurringPaymentActive(id: string, isActive: boolean): Promise<void> {
    const updated = await this.recurringPaymentRepo.toggleActive(id, isActive);
    if (isActive) {
      await this.notificationService.scheduleRecurringPaymentReminder(updated);
    } else {
      await this.notificationService.cancelRecurringPaymentReminder(id);
    }
    await this.refreshAll();
  }

  async recordRecurringPaymentCycle(
    id: string,
    recordInLedger = false
  ): Promise<{ payment: RecurringPayment; nextDueDate: string }> {
    const res = await this.recurringPaymentRepo.recordPaymentCycle(id, recordInLedger);
    if (res.payment.isActive) {
      await this.notificationService.scheduleRecurringPaymentReminder(res.payment);
    }
    await this.refreshAll();
    return res;
  }

  async skipRecurringPaymentCycle(
    id: string
  ): Promise<{ payment: RecurringPayment; nextDueDate: string }> {
    const res = await this.recurringPaymentRepo.skipCycle(id);
    if (res.payment.isActive) {
      await this.notificationService.scheduleRecurringPaymentReminder(res.payment);
    }
    await this.refreshAll();
    return res;
  }

  async deleteRecurringPayment(id: string): Promise<void> {
    await this.recurringPaymentRepo.delete(id);
    await this.notificationService.cancelRecurringPaymentReminder(id);
    await this.refreshAll();
  }

  // --- Settings & Themes ---

  async updateSettings(partial: Partial<AppSettings>): Promise<void> {
    await this.settingsRepo.saveSettings(partial);
    const updated = await this.settingsRepo.getSettings();
    this.settings.set(updated);
    this.applyTheme(updated.theme);
  }

  async applyTheme(theme: 'dark' | 'light' | 'system'): Promise<void> {
    if (typeof document !== 'undefined') {
      let isLight = theme === 'light';
      if (theme === 'system' && typeof window !== 'undefined' && window.matchMedia) {
        isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      }
      document.body.classList.toggle('light-theme', isLight);
      document.documentElement.classList.toggle('light-theme', isLight);

      if (Capacitor.isNativePlatform()) {
        try {
          if (isLight) {
            await StatusBar.setStyle({ style: Style.Light });
            await StatusBar.setBackgroundColor({ color: '#f8fafc' });
          } else {
            await StatusBar.setStyle({ style: Style.Dark });
            await StatusBar.setBackgroundColor({ color: '#090d16' });
          }
        } catch {
          // Ignored on unsupported platforms
        }
      }
    }
  }
}
