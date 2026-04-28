export type TransactionType = "income" | "expense";

export type Transaction = {
  id: number;
  occurred_at: string;
  amount_cents: number;
  type: TransactionType;
  category: string;
  account: string;
  note: string;
  created_at: string;
  updated_at: string;
};

export type ListFiltersPayload = {
  from?: string;
  to?: string;
  type?: TransactionType;
  category?: string;
  account?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export type UpdateTransactionPatchPayload = {
  occurred_at?: string;
  amount_cents?: number;
  type?: TransactionType;
  category?: string;
  account?: string;
  note?: string;
};

export type StatsSummary = {
  total_income_cents: number;
  total_expense_cents: number;
  net_cents: number;
  tx_count: number;
};

export type DailyPoint = {
  date: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
};

export type CategoryPoint = {
  category: string;
  total_cents: number;
  count: number;
};

export type AccountPoint = {
  account: string;
  total_cents: number;
  count: number;
};

export type StorageInfo = {
  db_path: string;
  backup_dir: string;
  export_dir: string;
  last_backup_date: string | null;
};

export type BackupResult = {
  backup_path: string;
  backup_date: string;
  created: boolean;
};

export type ExportResult = {
  path: string;
  row_count: number;
};

export type CountResult = {
  total: number;
};

export type SuggestionOption = {
  value: string;
  count: number;
  last_used_at: string;
};

export type FormSuggestions = {
  categories: SuggestionOption[];
  accounts: SuggestionOption[];
  combinations: QuickEntryCombination[];
};

export type QuickEntryCombination = {
  type: TransactionType;
  category: string;
  account: string;
  count: number;
  last_used_at: string;
};

export type DailySummary = {
  date: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
  count: number;
};

export type BackupEntry = {
  file_name: string;
  path: string;
  size_bytes: number;
  modified_at: string;
};

export type RestoreResult = {
  restored_from: string;
  safety_backup_path: string;
};

export type MetricComparison = {
  current: number;
  previous: number;
  delta: number;
  delta_ratio: number | null;
};

export type StatsComparison = {
  previous_from: string;
  previous_to: string;
  expense: MetricComparison;
  tx_count: MetricComparison;
};

export type FormDefaults = {
  defaultType: TransactionType | "";
  defaultCategory: string;
  defaultAccount: string;
};
