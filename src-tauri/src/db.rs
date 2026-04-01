use crate::models::{
    AccountPoint, BackupEntry, BackupResult, CategoryPoint, CountResult, DailyPoint, DailySummary,
    ExportFilters, ExportResult, FormSuggestions, ListFilters, MetricComparison, NewTransaction,
    QuickEntryCombination, RestoreResult, StatsComparison, StatsFilters, StatsSummary, StorageInfo,
    SuggestionOption, Transaction, UpdateTransactionPatch,
};
use chrono::{DateTime, Datelike, Local, TimeZone, Utc};
use rusqlite::{params, params_from_iter, types::Value, Connection, Row};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;
use tauri_plugin_opener::open_path as open_path_in_shell;

const SUGGESTION_LIMIT: i64 = 50;
const QUICK_ENTRY_LIMIT: i64 = 6;

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
    let effective_offset = filters.offset.unwrap_or(0) as i64;
    let mut sql = String::from(
        "
      SELECT id, occurred_at, amount_cents, type, category, account, note, created_at, updated_at
      FROM transactions
      WHERE 1 = 1
    ",
    );
    let mut bind_values: Vec<Value> = Vec::new();

    append_list_filter_clauses(&mut sql, &mut bind_values, &filters);

    sql.push_str(" ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?");
    bind_values.push(Value::Integer(effective_limit));
    bind_values.push(Value::Integer(effective_offset));

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

pub fn count_transactions(db_path: &Path, filters: ListFilters) -> Result<CountResult, String> {
    validate_filters(&filters)?;
    let conn = open_connection(db_path)?;
    let mut sql = String::from(
        "
      SELECT COUNT(*)
      FROM transactions
      WHERE 1 = 1
    ",
    );
    let mut bind_values: Vec<Value> = Vec::new();

    append_list_filter_clauses(&mut sql, &mut bind_values, &filters);

    let total = conn
        .query_row(&sql, params_from_iter(bind_values), |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|e| format!("failed to count transactions: {e}"))?;

    Ok(CountResult { total })
}

pub fn get_form_suggestions(db_path: &Path) -> Result<FormSuggestions, String> {
    let conn = open_connection(db_path)?;
    Ok(FormSuggestions {
        categories: load_suggestion_options(&conn, "category")?,
        accounts: load_suggestion_options(&conn, "account")?,
        combinations: load_quick_entry_combinations(&conn)?,
    })
}

pub fn list_daily_summaries(
    db_path: &Path,
    filters: ListFilters,
) -> Result<Vec<DailySummary>, String> {
    validate_filters(&filters)?;
    let conn = open_connection(db_path)?;
    let mut sql = String::from(
        "
      SELECT
        date(datetime(occurred_at), 'localtime') AS day_local,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
        COALESCE(COUNT(*), 0) AS tx_count
      FROM transactions
      WHERE 1 = 1
    ",
    );
    let mut bind_values: Vec<Value> = Vec::new();

    append_list_filter_clauses(&mut sql, &mut bind_values, &filters);
    sql.push_str(" GROUP BY day_local ORDER BY day_local DESC");

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("failed to prepare daily summary query: {e}"))?;

    let rows = stmt
        .query_map(params_from_iter(bind_values), |row| {
            let income_cents: i64 = row.get(1)?;
            let expense_cents: i64 = row.get(2)?;
            Ok(DailySummary {
                date: row.get(0)?,
                income_cents,
                expense_cents,
                net_cents: income_cents - expense_cents,
                count: row.get(3)?,
            })
        })
        .map_err(|e| format!("failed to run daily summary query: {e}"))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("failed to read daily summary row: {e}"))?);
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
    load_summary_for_range(&conn, &from_iso, &to_iso)
}

pub fn stats_daily(db_path: &Path, filters: StatsFilters) -> Result<Vec<DailyPoint>, String> {
    let conn = open_connection(db_path)?;
    let (from_iso, to_iso) = resolve_stats_range(filters.from, filters.to)?;

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
    let tx_type = resolve_stats_tx_type(filters.tx_type)?;

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

pub fn stats_by_account(
    db_path: &Path,
    filters: StatsFilters,
) -> Result<Vec<AccountPoint>, String> {
    let conn = open_connection(db_path)?;
    let (from_iso, to_iso) = resolve_stats_range(filters.from, filters.to)?;
    let top_n = filters.top_n.unwrap_or(10).clamp(1, 100) as i64;
    let tx_type = resolve_stats_tx_type(filters.tx_type)?;

    let mut stmt = conn
        .prepare(
            "
      SELECT
        account,
        COALESCE(SUM(amount_cents), 0) AS total_cents,
        COALESCE(COUNT(*), 0) AS tx_count
      FROM transactions
      WHERE datetime(occurred_at) >= datetime(?1)
        AND datetime(occurred_at) <= datetime(?2)
        AND type = ?3
      GROUP BY account
      ORDER BY total_cents DESC, tx_count DESC, account ASC
      LIMIT ?4
      ",
        )
        .map_err(|e| format!("failed to prepare stats_by_account query: {e}"))?;

    let rows = stmt
        .query_map(params![from_iso, to_iso, tx_type, top_n], |row| {
            Ok(AccountPoint {
                account: row.get(0)?,
                total_cents: row.get(1)?,
                count: row.get(2)?,
            })
        })
        .map_err(|e| format!("failed to run stats_by_account query: {e}"))?;

    let mut points = Vec::new();
    for row in rows {
        points.push(row.map_err(|e| format!("failed to read stats_by_account row: {e}"))?);
    }
    Ok(points)
}

pub fn stats_comparison(db_path: &Path, filters: StatsFilters) -> Result<StatsComparison, String> {
    let conn = open_connection(db_path)?;
    let (current_from, current_to) = resolve_stats_range_datetimes(filters.from, filters.to)?;
    let current_from_iso = current_from.to_rfc3339();
    let current_to_iso = current_to.to_rfc3339();

    let current_summary = load_summary_for_range(&conn, &current_from_iso, &current_to_iso)?;

    let current_span = current_to.signed_duration_since(current_from);
    let previous_to = current_from - chrono::Duration::milliseconds(1);
    let previous_from = previous_to - current_span;
    let previous_from_iso = previous_from.to_rfc3339();
    let previous_to_iso = previous_to.to_rfc3339();

    let previous_summary = load_summary_for_range(&conn, &previous_from_iso, &previous_to_iso)?;

    Ok(StatsComparison {
        previous_from: previous_from_iso,
        previous_to: previous_to_iso,
        expense: build_metric_comparison(
            current_summary.total_expense_cents,
            previous_summary.total_expense_cents,
        ),
        tx_count: build_metric_comparison(current_summary.tx_count, previous_summary.tx_count),
    })
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

pub fn list_backups(app_data_dir: &Path) -> Result<Vec<BackupEntry>, String> {
    ensure_runtime_dirs(app_data_dir)?;
    let backup_dir = backup_dir_path(app_data_dir);
    let mut backups = Vec::new();

    let entries = fs::read_dir(&backup_dir).map_err(|e| {
        format!(
            "failed to read backup directory {}: {e}",
            backup_dir.display()
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("failed to read backup entry: {e}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|value| value.to_str()) != Some("sqlite") {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("failed to read backup metadata {}: {e}", path.display()))?;
        let modified = metadata.modified().map_err(|e| {
            format!(
                "failed to read backup modified time {}: {e}",
                path.display()
            )
        })?;
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| format!("backup file name is invalid UTF-8: {}", path.display()))?;

        backups.push(BackupEntry {
            file_name: file_name.to_string(),
            path: path.to_string_lossy().to_string(),
            size_bytes: metadata.len(),
            modified_at: DateTime::<Utc>::from(modified).to_rfc3339(),
        });
    }

    backups.sort_by(|left, right| {
        right
            .modified_at
            .cmp(&left.modified_at)
            .then(left.file_name.cmp(&right.file_name))
    });

    Ok(backups)
}

pub fn restore_backup(
    db_path: &Path,
    app_data_dir: &Path,
    file_name: &str,
) -> Result<RestoreResult, String> {
    ensure_runtime_dirs(app_data_dir)?;
    if !db_path.exists() {
        return Err(format!(
            "database file does not exist: {}",
            db_path.display()
        ));
    }

    let backup_dir = backup_dir_path(app_data_dir);
    let backup_path = resolve_backup_path(&backup_dir, file_name)?;
    if !backup_path.exists() {
        return Err(format!("backup file not found: {}", backup_path.display()));
    }

    let safety_backup_path = create_pre_restore_backup(db_path, &backup_dir)?;
    fs::copy(&backup_path, db_path).map_err(|e| {
        format!(
            "failed to restore backup {} to {}: {e}",
            backup_path.display(),
            db_path.display()
        )
    })?;

    Ok(RestoreResult {
        restored_from: backup_path.to_string_lossy().to_string(),
        safety_backup_path: safety_backup_path.to_string_lossy().to_string(),
    })
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

pub fn open_backup_dir(app_data_dir: &Path) -> Result<bool, String> {
    ensure_runtime_dirs(app_data_dir)?;
    open_directory(&backup_dir_path(app_data_dir))
}

pub fn open_export_dir(app_data_dir: &Path) -> Result<bool, String> {
    ensure_runtime_dirs(app_data_dir)?;
    open_directory(&export_dir_path(app_data_dir))
}

fn open_connection(db_path: &Path) -> Result<Connection, String> {
    Connection::open(db_path)
        .map_err(|e| format!("failed to open database {}: {e}", db_path.display()))
}

fn append_list_filter_clauses(
    sql: &mut String,
    bind_values: &mut Vec<Value>,
    filters: &ListFilters,
) {
    if let Some(from) = &filters.from {
        sql.push_str(" AND occurred_at >= ?");
        bind_values.push(Value::Text(from.clone()));
    }

    if let Some(to) = &filters.to {
        sql.push_str(" AND occurred_at <= ?");
        bind_values.push(Value::Text(to.clone()));
    }

    if let Some(tx_type) = &filters.tx_type {
        sql.push_str(" AND type = ?");
        bind_values.push(Value::Text(tx_type.clone()));
    }

    if let Some(category) = &filters.category {
        sql.push_str(" AND category = ?");
        bind_values.push(Value::Text(category.clone()));
    }

    if let Some(account) = &filters.account {
        sql.push_str(" AND account = ?");
        bind_values.push(Value::Text(account.clone()));
    }

    if let Some(q) = &filters.q {
        let like_value = format!("%{}%", q);
        sql.push_str(" AND (note LIKE ? OR category LIKE ? OR account LIKE ?)");
        bind_values.push(Value::Text(like_value.clone()));
        bind_values.push(Value::Text(like_value.clone()));
        bind_values.push(Value::Text(like_value));
    }
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
    let mut parsed_from = None;
    let mut parsed_to = None;

    if let Some(from) = &filters.from {
        let value =
            DateTime::parse_from_rfc3339(from).map_err(|_| "from must be RFC3339".to_string())?;
        parsed_from = Some(value);
    }
    if let Some(to) = &filters.to {
        let value =
            DateTime::parse_from_rfc3339(to).map_err(|_| "to must be RFC3339".to_string())?;
        parsed_to = Some(value);
    }
    if let (Some(from), Some(to)) = (parsed_from, parsed_to) {
        if from > to {
            return Err("from must be earlier than or equal to to".to_string());
        }
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
    if let Some(account) = &filters.account {
        if account.trim().is_empty() {
            return Err("account filter cannot be empty".to_string());
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
    let (from_utc, to_utc) = resolve_stats_range_datetimes(from, to)?;
    Ok((from_utc.to_rfc3339(), to_utc.to_rfc3339()))
}

fn resolve_stats_range_datetimes(
    from: Option<String>,
    to: Option<String>,
) -> Result<(DateTime<Utc>, DateTime<Utc>), String> {
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

    Ok((from_utc, to_utc))
}

fn resolve_stats_tx_type(tx_type: Option<String>) -> Result<String, String> {
    match tx_type {
        Some(value) => {
            if value != "income" && value != "expense" {
                return Err("type filter must be either 'income' or 'expense'".to_string());
            }
            Ok(value)
        }
        None => Ok("expense".to_string()),
    }
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

fn load_suggestion_options(
    conn: &Connection,
    column: &str,
) -> Result<Vec<SuggestionOption>, String> {
    let column_name = match column {
        "category" => "category",
        "account" => "account",
        _ => return Err(format!("unsupported suggestion column: {column}")),
    };
    let sql = format!(
        "
      SELECT
        {column_name} AS value,
        COUNT(*) AS tx_count,
        MAX(occurred_at) AS last_used_at
      FROM transactions
      WHERE TRIM({column_name}) <> ''
      GROUP BY {column_name}
      ORDER BY MAX(datetime(occurred_at)) DESC, tx_count DESC, value ASC
      LIMIT ?1
      "
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("failed to prepare {column_name} suggestion query: {e}"))?;

    let rows = stmt
        .query_map(params![SUGGESTION_LIMIT], |row| {
            Ok(SuggestionOption {
                value: row.get(0)?,
                count: row.get(1)?,
                last_used_at: row.get(2)?,
            })
        })
        .map_err(|e| format!("failed to run {column_name} suggestion query: {e}"))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("failed to read {column_name} suggestion row: {e}"))?);
    }
    Ok(items)
}

fn load_quick_entry_combinations(conn: &Connection) -> Result<Vec<QuickEntryCombination>, String> {
    let mut stmt = conn
        .prepare(
            "
      SELECT
        type,
        category,
        account,
        COUNT(*) AS tx_count,
        MAX(occurred_at) AS last_used_at
      FROM transactions
      WHERE TRIM(category) <> ''
        AND TRIM(account) <> ''
      GROUP BY type, category, account
      ORDER BY MAX(datetime(occurred_at)) DESC, tx_count DESC, type ASC, category ASC, account ASC
      LIMIT ?1
      ",
        )
        .map_err(|e| format!("failed to prepare quick entry combination query: {e}"))?;

    let rows = stmt
        .query_map(params![QUICK_ENTRY_LIMIT], |row| {
            Ok(QuickEntryCombination {
                tx_type: row.get(0)?,
                category: row.get(1)?,
                account: row.get(2)?,
                count: row.get(3)?,
                last_used_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("failed to run quick entry combination query: {e}"))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("failed to read quick entry combination row: {e}"))?);
    }
    Ok(items)
}

fn load_summary_for_range(
    conn: &Connection,
    from_iso: &str,
    to_iso: &str,
) -> Result<StatsSummary, String> {
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

    stmt.query_row(params![from_iso, to_iso], |row| {
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
    .map_err(|e| format!("failed to run stats_summary query: {e}"))
}

fn build_metric_comparison(current: i64, previous: i64) -> MetricComparison {
    let delta = current - previous;
    let delta_ratio = if previous == 0 {
        None
    } else {
        Some(delta as f64 / previous as f64)
    };

    MetricComparison {
        current,
        previous,
        delta,
        delta_ratio,
    }
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

fn resolve_backup_path(backup_dir: &Path, file_name: &str) -> Result<PathBuf, String> {
    if file_name.trim().is_empty() {
        return Err("backup file name cannot be empty".to_string());
    }
    if file_name.contains('/') || file_name.contains('\\') {
        return Err("backup file name must not contain path separators".to_string());
    }
    if !file_name.ends_with(".sqlite") {
        return Err("backup file must end with .sqlite".to_string());
    }
    Ok(backup_dir.join(file_name))
}

fn create_pre_restore_backup(db_path: &Path, backup_dir: &Path) -> Result<PathBuf, String> {
    let file_name = format!(
        "pre-restore-{}.sqlite",
        Local::now().format("%Y-%m-%d-%H%M%S")
    );
    let safety_backup_path = backup_dir.join(file_name);
    fs::copy(db_path, &safety_backup_path).map_err(|e| {
        format!(
            "failed to create pre-restore backup {}: {e}",
            safety_backup_path.display()
        )
    })?;
    Ok(safety_backup_path)
}

fn open_directory(path: &Path) -> Result<bool, String> {
    open_path_in_shell(path, None::<&str>)
        .map_err(|e| format!("failed to open path {}: {e}", path.display()))?;
    Ok(true)
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
