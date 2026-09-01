export type Currency = "EUR" | "HUF" | "USD" | "INR" | "GBP" | "CZK";

export const CURRENCIES: Currency[] = ["EUR", "HUF", "USD", "INR", "GBP", "CZK"];

export type Category =
  | "food"
  | "drinks"
  | "transport"
  | "stay"
  | "activities"
  | "shopping"
  | "groceries"
  | "other";

export const CATEGORY_EMOJI: Record<Category, string> = {
  food: "🍽️",
  drinks: "🍻",
  transport: "🚕",
  stay: "🏨",
  activities: "🎭",
  shopping: "🛍️",
  groceries: "🛒",
  other: "📦",
};

export const CATEGORIES: Category[] = [
  "food",
  "drinks",
  "transport",
  "stay",
  "activities",
  "shopping",
  "groceries",
  "other",
];

export const MEMBER_COLORS = [
  "#6C5CE7",
  "#00B894",
  "#E17055",
  "#0984E3",
  "#FDCB6E",
  "#E84393",
  "#00CEC9",
  "#D63031",
];

export interface Member {
  id: string;
  name: string;
  color: string;
}

export interface Group {
  id: string;
  name: string;
  currency: Currency;
  members: Member[];
  createdAt: string;
}

export interface Split {
  memberId: string;
  amountMinor?: number;
  percentage?: number;
}

export type SplitType = "equal" | "percentage" | "exact";

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amountMinor: number;
  currency: Currency;
  paidBy: string;
  splitType: SplitType;
  splits: Split[];
  category: Category;
  date: string;
  createdAt: string;
  updatedAt: string;
  note?: string;
}

export interface Settlement {
  id: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  currency: Currency;
  date: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  groupId: string;
  message: string;
  createdAt: string;
}

export interface GroupData {
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
  activity: ActivityEvent[];
}

export interface BalanceResult {
  nets: Record<string, number>; // memberId -> net minor units (positive = owed, negative = owes)
  transactions: SettlementPlan[];
  mixedCurrencies: boolean;
  currencies: Currency[];
}

export interface SettlementPlan {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
}
