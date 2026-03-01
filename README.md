# RF Ledger

A local-first desktop bookkeeping application built with Tauri + React.

---

## 🇬🇧 English

### Overview

RF Ledger is a modern, local-only desktop bookkeeping application.

It stores all data locally using SQLite and runs fully offline.
No cloud sync, no remote server, no external APIs.

### Features

- Local-only data storage (SQLite)
- Modern UI (Tailwind + shadcn/ui)
- Income / Expense tracking
- Filterable transaction list
- Statistics dashboard
- CSV export
- Automatic backup

### Tech Stack

- Vite + React + TypeScript
- TailwindCSS
- shadcn/ui
- Tauri
- SQLite

### Development

Install dependencies:

```bash
npm install
```

Run development mode:

```bash
npm run tauri dev
```

Build production executable:

```bash
npm run tauri build
```

### Data Storage

The database is stored in the system app data directory.

Automatic backups are created periodically.

---

## 🇨🇳 中文说明

### 项目简介

RF Ledger 是一个本地优先（Local-first）的桌面记账应用。

所有数据使用 SQLite 本地存储，完全离线运行。
不使用云端，不依赖远程服务器，不调用外部 API。

### 功能特性

- 本地数据存储（SQLite）
- 现代化界面设计（Tailwind + shadcn/ui）
- 收入 / 支出记录
- 支持筛选的账单列表
- 统计仪表盘
- CSV 导出
- 自动备份

### 技术栈

- Vite + React + TypeScript
- TailwindCSS
- shadcn/ui
- Tauri
- SQLite

### 开发运行

安装依赖：

```bash
npm install
```

开发模式运行：

```bash
npm run tauri dev
```

构建生产版本：

```bash
npm run tauri build
```

### 数据存储说明

数据库文件存储在系统应用数据目录中。

系统会定期自动生成备份文件。