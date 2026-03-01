use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct Transaction {
    pub id: i64,
    pub occurred_at: String,
    pub amount_cents: i64,
    #[serde(rename = "type")]
    pub tx_type: String,
    pub category: String,
    pub account: String,
    pub note: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewTransaction {
    pub occurred_at: String,
    pub amount_cents: i64,
    #[serde(rename = "type")]
    pub tx_type: String,
    pub category: String,
    pub account: String,
    pub note: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ListFilters {
    pub from: Option<String>,
    pub to: Option<String>,
    #[serde(rename = "type")]
    pub tx_type: Option<String>,
    pub category: Option<String>,
    pub q: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTransactionPatch {
    pub occurred_at: Option<String>,
    pub amount_cents: Option<i64>,
    #[serde(rename = "type")]
    pub tx_type: Option<String>,
    pub category: Option<String>,
    pub account: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct StatsFilters {
    pub from: Option<String>,
    pub to: Option<String>,
    #[serde(rename = "type")]
    pub tx_type: Option<String>,
    pub top_n: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ExportFilters {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatsSummary {
    pub total_income_cents: i64,
    pub total_expense_cents: i64,
    pub net_cents: i64,
    pub tx_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyPoint {
    pub date: String,
    pub income_cents: i64,
    pub expense_cents: i64,
    pub net_cents: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryPoint {
    pub category: String,
    pub total_cents: i64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupResult {
    pub backup_path: String,
    pub backup_date: String,
    pub created: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportResult {
    pub path: String,
    pub row_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct StorageInfo {
    pub db_path: String,
    pub backup_dir: String,
    pub export_dir: String,
    pub last_backup_date: Option<String>,
}
