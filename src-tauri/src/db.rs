use crate::models::{
    BackupResult, CategoryPoint, DailyPoint, ExportFilters, ExportResult, ListFilters,
    NewTransaction, StatsFilters, StatsSummary, StorageInfo, Transaction, UpdateTransactionPatch,
};
use chrono::{DateTime, Datelike, Local, TimeZone, Utc};
use rusqlite::{params, params_from_iter, types::Value, Connection, Row};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Default)]
struct LocalSettings {
    last_backup_date: Option<String>,
}

pub fn resolve_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = resolve_app_data_dir(app)?;
    Ok(data_dir.join("ledger.sqlite"))
}

pub fn resolve_app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data directory: {e}"))?;
    fs::create_dir_all(&data_dir).map_err(|e| {
        format!(
            "failed to create app data directory {}: {e}",
            data_dir.display()
        )
    })?;
    Ok(data_dir)
}

pub fn ensure_runtime_dirs(app_data_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(backup_dir_path(app_data_dir))
        .map_err(|e| format!("failed to create backup directory: {e}"))?;
    fs::create_dir_all(export_dir_path(app_data_dir))
        .map_err(|e| format!("failed to create export directory: {e}"))?;
    Ok(())
}

pub fn init_db(db_path: &Path) -> Result<(), String> {
    let conn = open_connection(db_path)?;
    conn.execute_batch(
        "
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurred_at TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        category TEXT NOT NULL,
        account TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_occurred_at
      ON transactions(occurred_at DESC, id DESC);
      ",
    )
    .map_err(|e| format!("failed to initialize schema: {e}"))?;
    Ok(())
}

pub fn add_transaction(db_path: &Path, input: NewTransaction) -> Result<Transaction, String> {
    validate_new_transaction(&input)?;
    let conn = open_connection(db_path)?;
    let now_iso = Utc::now().to_rfc3339();

    conn.execute(
        "
      INSERT INTO transactions (
        occurred_at, amount_cents, type, category, account, note, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ",
        params![
            input.occurred_at,
            input.amount_cents,
            input.tx_type,
            input.category,
            input.account,
            input.note,
            now_iso,
            now_iso
        ],
    )
    .map_err(|e| format!("failed to insert transaction: {e}"))?;

    let id = conn.last_insert_rowid();
    get_transaction_by_id(&conn, id)
}

pub fn list_transactions(db_path: &Path, filters: ListFilters) -> Result<Vec<Transaction>, String> {
    validate_filters(&filters)?;
    let conn = open_connection(db_path)?;
    let effective_limit = filters.limit.unwrap_or(200).clamp(1, 1000) as i64;
    let mut sql = String::from(
        "
      SELECT id, occurred_at, amount_cents, type, category, account, note, created_at, updated_at
      FROM transactions
      WHERE 1 = 1
    ",
    );
    let mut bind_values: Vec<Value> = Vec::new();

    if let Some(from) = filters.from {
        sql.push_str(" AND occurred_at >= ?");
        bind_values.push(Value::Text(from));
    }

    if let Some(to) = filters.to {
        sql.push_str(" AND occurred_at <= ?");
        bind_values.push(Value::Text(to));
    }

    if let Some(tx_type) = filters.tx_type {
        sql.push_str(" AND type = ?");
        bind_values.push(Value::Text(tx_type));
    }

    if let Some(category) = filters.category {
        sql.push_str(" AND category = ?");
        bind_values.push(Value::Text(category));
    }

    if let Some(q) = filters.q {
        let like_value = format!("%{}%", q);
        sql.push_str(" AND (note LIKE ? OR category LIKE ? OR account LIKE ?)");
        bind_values.push(Value::Text(like_value.clone()));
        bind_values.push(Value::Text(like_value.clone()));
        bind_values.push(Value::Text(like_value));
    }

    sql.push_str(" ORDER BY occurred_at DESC, id DESC LIMIT ?");
    bind_values.push(Value::Integer(effective_limit));

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("failed to prepare list query: {e}"))?;

    let rows = stmt
        .query_map(params_from_iter(bind_values), row_to_transaction)
        .map_err(|e| format!("failed to execute list query: {e}"))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("failed to read list row: {e}"))?);
    }
    Ok(items)
}

pub fn update_transaction(
    db_path: &Path,
    id: i64,
    patch: UpdateTransactionPatch,
) -> Result<Transaction, String> {
    if id <= 0 {
        return Err("id must be a positive integer".to_string());
    }
    if is_empty_patch(&patch) {
        return Err("patch must include at least one field to update".to_string());
    }

    let conn = open_connection(db_path)?;
    let current = get_transaction_by_id(&conn, id)?;

    let merged = NewTransaction {
        occurred_at: patch.occurred_at.unwrap_or(current.occurred_at),
        amount_cents: patch.amount_cents.unwrap_or(current.amount_cents),
        tx_type: patch.tx_type.unwrap_or(current.tx_type),
        category: patch.category.unwrap_or(current.category),
        account: patch.account.unwrap_or(current.account),
        note: patch.note.unwrap_or(current.note),
    };
    validate_new_transaction(&merged)?;

    let now_iso = Utc::now().to_rfc3339();
    let changed = conn
        .execute(
            "
      UPDATE transactions
      SET occurred_at = ?1,
          amount_cents = ?2,
          type = ?3,
          category = ?4,
          account = ?5,
          note = ?6,
          updated_at = ?7
      WHERE id = ?8
      ",
            params![
                merged.occurred_at,
                merged.amount_cents,
                merged.tx_type,
                merged.category,
                merged.account,
                merged.note,
                now_iso,
                id
            ],
        )
        .map_err(|e| format!("failed to update transaction: {e}"))?;

    if changed == 0 {
        return Err(format!("transaction id {} not found", id));
    }

    get_transaction_by_id(&conn, id)
}

pub fn delete_transaction(db_path: &Path, id: i64) -> Result<bool, String> {
    if id <= 0 {
        return Err("id must be a positive integer".to_string());
    }
    let conn = open_connection(db_path)?;
    let changed = conn
        .execute("DELETE FROM transactions WHERE id = ?1", params![id])
        .map_err(|e| format!("failed to delete transaction: {e}"))?;
    Ok(changed > 0)
}

pub fn stats_summary(db_path: &Path, filters: StatsFilters) -> Result<StatsSummary, String> {
    let conn = open_connection(db_path)?;
    let (from_iso, to_iso) = resolve_stats_range(filters.from, filters.to)?;
    let mut stmt = conn
    .prepare(
      "
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS total_income_cents,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS total_expense_cents,
        COALESCE(COUNT(*), 0) AS tx_count
      FROM transactions
      WHERE datetime(occurred_at) >= datetime(?1)
        AND datetime(occurred_at) <= datetime(?2)
      ",
    )
    .map_err(|e| format!("failed to prepare stats_summary query: {e}"))?;

    let summary = stmt
        .query_row(params![from_iso, to_iso], |row| {
            let income: i64 = row.get(0)?;
            let expense: i64 = row.get(1)?;
            let tx_count: i64 = row.get(2)?;
            Ok(StatsSummary {
                total_income_cents: income,
                total_expense_cents: expense,
                net_cents: income - expense,
                tx_count,
            })
        })
        .map_err(|e| format!("failed to run stats_summary query: {e}"))?;

    Ok(summary)
}

pub fn stats_daily(db_path: &Path, filters: StatsFilters) -> Result<Vec<DailyPoint>, String> {
    let conn = open_connection(db_path)?;
    let (from_iso, to_iso) = resolve_stats_range(filters.from, filters.to)?;

    // occurred_at is stored as RFC3339. We apply range filtering in UTC with datetime()
    // and group by local day via date(..., 'localtime') for UI-facing calendar buckets.
    let mut stmt = conn
        .prepare(
            "
      SELECT
        date(datetime(occurred_at), 'localtime') AS day_local,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents
      FROM transactions
      WHERE datetime(occurred_at) >= datetime(?1)
        AND datetime(occurred_at) <= datetime(?2)
      GROUP BY day_local
      ORDER BY day_local ASC
      ",
        )
        .map_err(|e| format!("failed to prepare stats_daily query: {e}"))?;

    let rows = stmt
        .query_map(params![from_iso, to_iso], |row| {
            let income: i64 = row.get(1)?;
            let expense: i64 = row.get(2)?;
            Ok(DailyPoint {
                date: row.get(0)?,
                income_cents: income,
                expense_cents: expense,
                net_cents: income - expense,
            })
        })
        .map_err(|e| format!("failed to run stats_daily query: {e}"))?;

    let mut points = Vec::new();
    for row in rows {
        points.push(row.map_err(|e| format!("failed to read stats_daily row: {e}"))?);
    }
    Ok(points)
}

pub fn stats_by_category(
    db_path: &Path,
    filters: StatsFilters,
) -> Result<Vec<CategoryPoint>, String> {
    let conn = open_connection(db_path)?;
    let (from_iso, to_iso) = resolve_stats_range(filters.from, filters.to)?;
    let top_n = filters.top_n.unwrap_or(10).clamp(1, 100) as i64;
    let tx_type = match filters.tx_type {
        Some(v) => {
            if v != "income" && v != "expense" {
                return Err("type filter must be either 'income' or 'expense'".to_string());
            }
            v
        }
        None => "expense".to_string(),
    };

    let mut stmt = conn
        .prepare(
            "
      SELECT
        category,
        COALESCE(SUM(amount_cents), 0) AS total_cents,
        COALESCE(COUNT(*), 0) AS tx_count
      FROM transactions
      WHERE datetime(occurred_at) >= datetime(?1)
        AND datetime(occurred_at) <= datetime(?2)
        AND type = ?3
      GROUP BY category
      ORDER BY total_cents DESC, tx_count DESC, category ASC
      LIMIT ?4
      ",
        )
        .map_err(|e| format!("failed to prepare stats_by_category query: {e}"))?;

    let rows = stmt
        .query_map(params![from_iso, to_iso, tx_type, top_n], |row| {
            Ok(CategoryPoint {
                category: row.get(0)?,
                total_cents: row.get(1)?,
                count: row.get(2)?,
            })
        })
        .map_err(|e| format!("failed to run stats_by_category query: {e}"))?;

    let mut points = Vec::new();
    for row in rows {
        points.push(row.map_err(|e| format!("failed to read stats_by_category row: {e}"))?);
    }
    Ok(points)
}

pub fn backup_db(db_path: &Path, app_data_dir: &Path) -> Result<BackupResult, String> {
    if !db_path.exists() {
        return Err(format!(
            "database file does not exist: {}",
            db_path.display()
        ));
    }

    let backup_dir = backup_dir_path(app_data_dir);
    fs::create_dir_all(&backup_dir).map_err(|e| {
        format!(
            "failed to create backup directory {}: {e}",
            backup_dir.display()
        )
    })?;

    let settings_path = settings_file_path(app_data_dir);
    let mut settings = load_settings(&settings_path)?;

    let backup_date = Local::now().format("%Y-%m-%d").to_string();
    let backup_path = backup_dir.join(format!("{}-ledger.sqlite", backup_date));

    if settings.last_backup_date.as_deref() == Some(&backup_date) && backup_path.exists() {
        return Ok(BackupResult {
            backup_path: backup_path.to_string_lossy().to_string(),
            backup_date,
            created: false,
        });
    }

    if !backup_path.exists() {
        fs::copy(db_path, &backup_path)
            .map_err(|e| format!("failed to copy database to {}: {e}", backup_path.display()))?;
    }

    settings.last_backup_date = Some(backup_date.clone());
    save_settings(&settings_path, &settings)?;

    Ok(BackupResult {
        backup_path: backup_path.to_string_lossy().to_string(),
        backup_date,
        created: true,
    })
}

pub fn maybe_auto_backup(
    db_path: &Path,
    app_data_dir: &Path,
) -> Result<Option<BackupResult>, String> {
    let result = backup_db(db_path, app_data_dir)?;
    if result.created {
        Ok(Some(result))
    } else {
        Ok(None)
    }
}

pub fn export_csv(
    db_path: &Path,
    filters: ExportFilters,
    path: String,
) -> Result<ExportResult, String> {
    let conn = open_connection(db_path)?;
    validate_export_filters(&filters)?;

    let output_path = PathBuf::from(path);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "failed to create export directory {}: {e}",
                parent.display()
            )
        })?;
    }

    let mut sql = String::from(
        "
      SELECT occurred_at, type, amount_cents, category, account, note, created_at, updated_at
      FROM transactions
      WHERE 1 = 1
    ",
    );
    let mut bind_values: Vec<Value> = Vec::new();

    if let Some(from) = filters.from {
        sql.push_str(" AND datetime(occurred_at) >= datetime(?)");
        bind_values.push(Value::Text(from));
    }

    if let Some(to) = filters.to {
        sql.push_str(" AND datetime(occurred_at) <= datetime(?)");
        bind_values.push(Value::Text(to));
    }

    sql.push_str(" ORDER BY occurred_at DESC, id DESC");

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("failed to prepare export query: {e}"))?;

    let rows = stmt
        .query_map(params_from_iter(bind_values), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
            ))
        })
        .map_err(|e| format!("failed to run export query: {e}"))?;

    let mut csv_body =
        String::from("occurred_at,type,amount_cents,category,account,note,created_at,updated_at\n");
    let mut row_count = 0usize;

    for row in rows {
        let (occurred_at, tx_type, amount_cents, category, account, note, created_at, updated_at) =
            row.map_err(|e| format!("failed to read export row: {e}"))?;

        let record = [
            escape_csv_field(&occurred_at),
            escape_csv_field(&tx_type),
            amount_cents.to_string(),
            escape_csv_field(&category),
            escape_csv_field(&account),
            escape_csv_field(&note),
            escape_csv_field(&created_at),
            escape_csv_field(&updated_at),
        ]
        .join(",");

        csv_body.push_str(&record);
        csv_body.push('\n');
        row_count += 1;
    }

    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(csv_body.as_bytes());

    fs::write(&output_path, bytes)
        .map_err(|e| format!("failed to write csv file {}: {e}", output_path.display()))?;

    Ok(ExportResult {
        path: output_path.to_string_lossy().to_string(),
        row_count,
    })
}

pub fn storage_info(db_path: &Path, app_data_dir: &Path) -> Result<StorageInfo, String> {
    let settings_path = settings_file_path(app_data_dir);
    let settings = load_settings(&settings_path)?;

    Ok(StorageInfo {
        db_path: db_path.to_string_lossy().to_string(),
        backup_dir: backup_dir_path(app_data_dir).to_string_lossy().to_string(),
        export_dir: export_dir_path(app_data_dir).to_string_lossy().to_string(),
        last_backup_date: settings.last_backup_date,
    })
}

fn open_connection(db_path: &Path) -> Result<Connection, String> {
    Connection::open(db_path)
        .map_err(|e| format!("failed to open database {}: {e}", db_path.display()))
}

fn validate_new_transaction(input: &NewTransaction) -> Result<(), String> {
    DateTime::parse_from_rfc3339(&input.occurred_at)
        .map_err(|_| "occurred_at must be a valid ISO 8601 timestamp (RFC3339)".to_string())?;

    if input.tx_type != "income" && input.tx_type != "expense" {
        return Err("type must be either 'income' or 'expense'".to_string());
    }

    if input.amount_cents == 0 {
        return Err("amount_cents cannot be 0".to_string());
    }

    if input.category.trim().is_empty() {
        return Err("category cannot be empty".to_string());
    }

    if input.account.trim().is_empty() {
        return Err("account cannot be empty".to_string());
    }

    Ok(())
}

fn get_transaction_by_id(conn: &Connection, id: i64) -> Result<Transaction, String> {
    let mut stmt = conn
        .prepare(
            "
      SELECT id, occurred_at, amount_cents, type, category, account, note, created_at, updated_at
      FROM transactions
      WHERE id = ?1
      ",
        )
        .map_err(|e| format!("failed to prepare get query: {e}"))?;

    stmt.query_row(params![id], row_to_transaction)
        .map_err(|e| format!("failed to fetch inserted transaction: {e}"))
}

fn validate_filters(filters: &ListFilters) -> Result<(), String> {
    if let Some(from) = &filters.from {
        DateTime::parse_from_rfc3339(from).map_err(|_| "from must be RFC3339".to_string())?;
    }
    if let Some(to) = &filters.to {
        DateTime::parse_from_rfc3339(to).map_err(|_| "to must be RFC3339".to_string())?;
    }
    if let Some(tx_type) = &filters.tx_type {
        if tx_type != "income" && tx_type != "expense" {
            return Err("type filter must be either 'income' or 'expense'".to_string());
        }
    }
    if let Some(category) = &filters.category {
        if category.trim().is_empty() {
            return Err("category filter cannot be empty".to_string());
        }
    }
    if let Some(q) = &filters.q {
        if q.trim().is_empty() {
            return Err("q filter cannot be empty".to_string());
        }
    }
    Ok(())
}

fn resolve_stats_range(
    from: Option<String>,
    to: Option<String>,
) -> Result<(String, String), String> {
    // Default range uses local calendar month [month_start_local_00:00, now_local],
    // converted to UTC RFC3339 for SQL datetime comparisons.
    let now_local = Local::now();
    let month_start_local = Local
        .with_ymd_and_hms(now_local.year(), now_local.month(), 1, 0, 0, 0)
        .single()
        .ok_or_else(|| "failed to determine local month start".to_string())?;

    let from_utc = if let Some(from_raw) = from {
        DateTime::parse_from_rfc3339(&from_raw)
            .map_err(|_| "from must be RFC3339".to_string())?
            .to_utc()
    } else {
        month_start_local.with_timezone(&Utc)
    };

    let to_utc = if let Some(to_raw) = to {
        DateTime::parse_from_rfc3339(&to_raw)
            .map_err(|_| "to must be RFC3339".to_string())?
            .to_utc()
    } else {
        now_local.with_timezone(&Utc)
    };

    if from_utc > to_utc {
        return Err("from must be earlier than or equal to to".to_string());
    }

    Ok((from_utc.to_rfc3339(), to_utc.to_rfc3339()))
}

fn validate_export_filters(filters: &ExportFilters) -> Result<(), String> {
    if let Some(from) = &filters.from {
        DateTime::parse_from_rfc3339(from).map_err(|_| "from must be RFC3339".to_string())?;
    }
    if let Some(to) = &filters.to {
        DateTime::parse_from_rfc3339(to).map_err(|_| "to must be RFC3339".to_string())?;
    }

    if let (Some(from), Some(to)) = (&filters.from, &filters.to) {
        let from_dt =
            DateTime::parse_from_rfc3339(from).map_err(|_| "from must be RFC3339".to_string())?;
        let to_dt =
            DateTime::parse_from_rfc3339(to).map_err(|_| "to must be RFC3339".to_string())?;
        if from_dt > to_dt {
            return Err("from must be earlier than or equal to to".to_string());
        }
    }

    Ok(())
}

fn backup_dir_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("backups")
}

fn export_dir_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("exports")
}

fn settings_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("settings.json")
}

fn load_settings(path: &Path) -> Result<LocalSettings, String> {
    if !path.exists() {
        return Ok(LocalSettings::default());
    }

    let content = fs::read_to_string(path)
        .map_err(|e| format!("failed to read settings file {}: {e}", path.display()))?;
    serde_json::from_str::<LocalSettings>(&content)
        .map_err(|e| format!("failed to parse settings file {}: {e}", path.display()))
}

fn save_settings(path: &Path, settings: &LocalSettings) -> Result<(), String> {
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("failed to serialize settings: {e}"))?;
    fs::write(path, content)
        .map_err(|e| format!("failed to write settings file {}: {e}", path.display()))
}

fn escape_csv_field(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn is_empty_patch(patch: &UpdateTransactionPatch) -> bool {
    patch.occurred_at.is_none()
        && patch.amount_cents.is_none()
        && patch.tx_type.is_none()
        && patch.category.is_none()
        && patch.account.is_none()
        && patch.note.is_none()
}

fn row_to_transaction(row: &Row<'_>) -> rusqlite::Result<Transaction> {
    Ok(Transaction {
        id: row.get(0)?,
        occurred_at: row.get(1)?,
        amount_cents: row.get(2)?,
        tx_type: row.get(3)?,
        category: row.get(4)?,
        account: row.get(5)?,
        note: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}
