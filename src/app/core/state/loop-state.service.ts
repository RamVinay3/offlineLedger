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
} from '../models';

export type FilterCategory = 'ALL' | 'MONEY' | 'ITEMS' | 'COMMITMENTS' | 'DUE' | 'OVERDUE' | 'COMPLETED';

@Injectable({
  providedIn: 'root',
})
export class LoopStateService {
  // --- Raw Signals ---
  readonly isLoading = signal<boolean>(true);
  readonly people = signal<Person[]>([]);
  readonly obligations = signal<ObligationWithDetails[]>([]);
  readonly activities = signal<Activity[]>([]);
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

      if (ob.type === 'MONEY' && !isCompleted) {
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

        if (ob.type === 'MONEY' && !isCompleted) {
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

        if (ob.type === 'COMMITMENT' && !isCompleted) {
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
          return ob.type === 'COMMITMENT' && (query.length > 0 ? true : isActive);
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
    const [people, obligations, activities, settings] = await Promise.all([
      this.personRepo.getAll(true),
      this.obligationRepo.getAllWithDetails(),
      this.activityRepo.getTimeline({ limit: 100 }),
      this.settingsRepo.getSettings(),
    ]);

    this.people.set(people);
    this.obligations.set(obligations);
    this.activities.set(activities);
    this.settings.set(settings);
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

  async updateDueDate(obligationId: string, newDueDate: string): Promise<void> {
    await this.obligationRepo.updateDueDate(obligationId, newDueDate);
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
        } catch (e) {
          // Ignored on unsupported platforms
        }
      }
    }
  }
}
