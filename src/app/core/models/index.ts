export type ObligationType = 'MONEY' | 'ITEM' | 'COMMITMENT' | 'DEPOSIT' | 'OTHER';

export type ObligationDirection = 'LENT' | 'BORROWED';

export type ObligationStatus = 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';

export type ItemStatus = 'ACTIVE' | 'DUE' | 'OVERDUE' | 'RETURNED';

export type CommitmentStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';

export type ReminderType = 'ON_DUE_DATE' | 'ONE_DAY_BEFORE' | 'AFTER_DUE_DATE' | 'CUSTOM';

export type ActivityEventType =
  | 'OBLIGATION_CREATED'
  | 'PAYMENT_RECORDED'
  | 'ITEM_BORROWED'
  | 'ITEM_RETURNED'
  | 'DUE_DATE_CHANGED'
  | 'REMINDER_CREATED'
  | 'OBLIGATION_COMPLETED'
  | 'SETTLEMENT_CREATED'
  | 'PERSON_ARCHIVED'
  | 'PERSON_CREATED'
  | 'PERSON_UPDATED';

export interface Person {
  id: string;
  name: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
  isArchived: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface Obligation {
  id: string;
  personId: string;
  type: ObligationType;
  direction: ObligationDirection; // LENT: you lent to them (they owe you); BORROWED: you borrowed from them (you owe them)
  title: string;
  description?: string;
  amount: number; // 0 for ITEM/COMMITMENT if not applicable
  currency: string;
  status: ObligationStatus;
  dueDate?: string; // ISO 8601
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface MoneyTransaction {
  id: string;
  obligationId: string;
  originalAmount: number;
  remainingAmount: number;
  currency: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  obligationId: string;
  personId: string;
  amount: number;
  notes?: string;
  paymentDate: string;
  createdAt: string;
}

export interface Item {
  id: string;
  obligationId: string;
  personId: string;
  name: string;
  description?: string;
  borrowedAt: string;
  expectedReturnDate?: string;
  returnedAt?: string;
  status: ItemStatus;
  createdAt: string;
}

export interface Commitment {
  id: string;
  obligationId: string;
  personId: string;
  title: string;
  description?: string;
  dueDate?: string;
  status: CommitmentStatus;
  completedAt?: string;
  createdAt: string;
}

export interface Settlement {
  id: string;
  personId: string;
  settledAmount: number;
  direction: ObligationDirection; // direction of net settlement
  notes?: string;
  settledAt: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  obligationId: string;
  personId: string;
  reminderType: ReminderType;
  reminderDate: string;
  isNotified: boolean;
  createdAt: string;
}

export interface Activity {
  id: string;
  personId: string;
  personName?: string;
  obligationId?: string;
  eventType: ActivityEventType;
  description: string;
  metadataJson?: string;
  createdAt: string;
}

export interface AppSettings {
  currencySymbol: string;
  theme: 'dark' | 'light' | 'system';
  isAppLockEnabled: boolean;
  pinHash?: string;
  salt?: string;
  autoLockTimeout: 'immediately' | '1m' | '5m' | '15m' | 'never';
  isBiometricEnabled: boolean;
  hasCompletedOnboarding: boolean;
  upiId?: string;
  userName?: string;
}

export interface ObligationWithDetails extends Obligation {
  personName: string;
  remainingAmount: number;
  payments: Payment[];
  itemDetails?: Item;
  commitmentDetails?: Commitment;
}

export interface PersonBalanceSummary {
  personId: string;
  personName: string;
  totalOwedToYou: number; // they owe you
  totalYouOwe: number;    // you owe them
  netBalance: number;     // positive: they owe you, negative: you owe them
  activeObligationsCount: number;
  activeItemsCount: number;
  hasOverdue: boolean;
}

export interface DashboardSummary {
  totalOwedToYou: number;
  totalYouOwe: number;
  netPosition: number;
  peopleCountOwed: number;
  peopleCountOwing: number;
  activeItemsOwedCount: number;
  activeItemsOwingCount: number;
  overdueCount: number;
  dueSoonCount: number;
}
