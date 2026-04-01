# RF Ledger

A local-first desktop bookkeeping app built with Tauri + React.

---

## English

### Features

- Local-first and fully offline architecture.
- SQLite local storage managed by Rust/Tauri backend.
- Add transaction workflow with date-first entry, optional time precision, history suggestions, and
  recent quick combos.
- List page with backend pagination, URL-synced filters, daily grouping, undo delete, and density
  toggle.
- Dashboard with backend SQL aggregation, comparison summary, category drilldown, and payment method
  drilldown.
- Automatic daily backup, manual backup, backup restore, and folder shortcuts.
- CSV export (UTF-8 BOM, Excel-friendly).
- Chinese/English language switch with persisted preference.
- Independent display currency setting for CNY / USD.

### Screenshots

> Placeholders below. Replace with real screenshots after publishing.

- ![Add Page](./docs/screenshots/add-page.png)
- ![List Page](./docs/screenshots/list-page.png)
- ![Dashboard Page](./docs/screenshots/dashboard-page.png)
- ![Settings Page](./docs/screenshots/settings-page.png)

### Download

- Preferred: download binaries from GitHub Releases:
  - `https://github.com/Liuenzecs/rf-ledger/releases`
- If no release is available yet, build locally:

```bash
npm install
npm run tauri:build
```

The Windows executable will be generated at:

`src-tauri/target/release/rf-ledger.exe`

### Data Storage

- Database location strategy:
  - `app_data_dir()/ledger.sqlite`
- On Windows, the default app data directory is usually:
  - `%APPDATA%\\com.realfeeling.rfledger`
- Backups and exports are stored under:
  - `%APPDATA%\\com.realfeeling.rfledger\\backups`
  - `%APPDATA%\\com.realfeeling.rfledger\\exports`
- You can view exact paths, open folders, and restore backups from the Settings page.

### Development

```bash
npm install
npm run tauri:dev
```

Build release executable:

```bash
npm run tauri:build
```

### Tech Stack

- Tauri 2 (Rust backend)
- React + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- SQLite (rusqlite)
- Recharts

---

## 中文

### 功能特性

- Local-first 架构，完全离线可用。
- 使用 Rust/Tauri 后端管理 SQLite 本地数据。
- 新增交易采用“日期优先”，时间精度可选，并支持历史类别/支付方式建议与最近常用组合。
- 列表页支持后端分页、URL 同步筛选、按日分组、撤销删除和密度切换。
- 看板页统计由后端 SQL 聚合并可视化，包含环比摘要、类别钻取和支付方式钻取。
- 支持自动每日备份、手动备份、备份恢复和目录快捷打开。
- 支持 CSV 导出（UTF-8 BOM，Excel 打开不乱码）。
- 支持中英文切换，语言设置可持久化。
- 支持独立的显示货币设置（CNY / USD）。

### 截图

> 以下为占位图，发布前可替换为真实截图。

- ![新增页](./docs/screenshots/add-page.png)
- ![列表页](./docs/screenshots/list-page.png)
- ![看板页](./docs/screenshots/dashboard-page.png)
- ![设置页](./docs/screenshots/settings-page.png)

### 下载

- 推荐从 GitHub Releases 下载已构建版本：
  - `https://github.com/Liuenzecs/rf-ledger/releases`
- 如果暂未发布 Release，可本地构建：

```bash
npm install
npm run tauri:build
```

Windows 可执行文件默认输出位置：

`src-tauri/target/release/rf-ledger.exe`

### 数据存储

- 数据库策略：
  - `app_data_dir()/ledger.sqlite`
- 在 Windows 下，默认目录通常为：
  - `%APPDATA%\\com.realfeeling.rfledger`
- 备份与导出目录：
  - `%APPDATA%\\com.realfeeling.rfledger\\backups`
  - `%APPDATA%\\com.realfeeling.rfledger\\exports`
- 应用内可在 Settings 页面查看实际路径、打开目录并恢复备份。

### 开发说明

```bash
npm install
npm run tauri:dev
```

构建发布版：

```bash
npm run tauri:build
```

### 技术栈

- Tauri 2（Rust 后端）
- React + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- SQLite（rusqlite）
- Recharts
