#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod models;

use models::{
    BackupResult, CategoryPoint, DailyPoint, ExportFilters, ExportResult, ListFilters,
    NewTransaction, StatsFilters, StatsSummary, StorageInfo, Transaction, UpdateTransactionPatch,
};
use std::path::PathBuf;
use tauri::{Manager, State};

struct AppState {
    db_path: PathBuf,
    app_data_dir: PathBuf,
}

#[tauri::command]
fn add_transaction(
    state: State<'_, AppState>,
    payload: NewTransaction,
) -> Result<Transaction, String> {
    db::add_transaction(&state.db_path, payload)
}

#[tauri::command]
fn list_transactions(
    state: State<'_, AppState>,
    filters: Option<ListFilters>,
) -> Result<Vec<Transaction>, String> {
    db::list_transactions(&state.db_path, filters.unwrap_or_default())
}

#[tauri::command]
fn update_transaction(
    state: State<'_, AppState>,
    id: i64,
    patch: UpdateTransactionPatch,
) -> Result<Transaction, String> {
    db::update_transaction(&state.db_path, id, patch)
}

#[tauri::command]
fn delete_transaction(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    db::delete_transaction(&state.db_path, id)
}

#[tauri::command]
fn stats_summary(
    state: State<'_, AppState>,
    filters: Option<StatsFilters>,
) -> Result<StatsSummary, String> {
    db::stats_summary(&state.db_path, filters.unwrap_or_default())
}

#[tauri::command]
fn stats_daily(
    state: State<'_, AppState>,
    filters: Option<StatsFilters>,
) -> Result<Vec<DailyPoint>, String> {
    db::stats_daily(&state.db_path, filters.unwrap_or_default())
}

#[tauri::command]
fn stats_by_category(
    state: State<'_, AppState>,
    filters: Option<StatsFilters>,
) -> Result<Vec<CategoryPoint>, String> {
    db::stats_by_category(&state.db_path, filters.unwrap_or_default())
}

#[tauri::command]
fn backup_db(state: State<'_, AppState>) -> Result<BackupResult, String> {
    db::backup_db(&state.db_path, &state.app_data_dir)
}

#[tauri::command]
fn export_csv(
    state: State<'_, AppState>,
    filters: Option<ExportFilters>,
    path: String,
) -> Result<ExportResult, String> {
    db::export_csv(&state.db_path, filters.unwrap_or_default(), path)
}

#[tauri::command]
fn get_storage_info(state: State<'_, AppState>) -> Result<StorageInfo, String> {
    db::storage_info(&state.db_path, &state.app_data_dir)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = db::resolve_db_path(app.handle()).map_err(|e| {
                std::io::Error::other(format!("database path initialization failed: {e}"))
            })?;
            let app_data_dir = db::resolve_app_data_dir(app.handle()).map_err(|e| {
                std::io::Error::other(format!("app data directory initialization failed: {e}"))
            })?;
            db::ensure_runtime_dirs(&app_data_dir).map_err(|e| {
                std::io::Error::other(format!("runtime directories initialization failed: {e}"))
            })?;

            db::init_db(&db_path)
                .map_err(|e| std::io::Error::other(format!("schema initialization failed: {e}")))?;

            if let Err(error) = db::maybe_auto_backup(&db_path, &app_data_dir) {
                eprintln!("automatic backup skipped with error: {error}");
            }

            app.manage(AppState {
                db_path,
                app_data_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_transaction,
            list_transactions,
            update_transaction,
            delete_transaction,
            stats_summary,
            stats_daily,
            stats_by_category,
            backup_db,
            export_csv,
            get_storage_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
