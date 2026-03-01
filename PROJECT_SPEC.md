# RF Ledger – Project Specification

---

## 1. Project Goal

RF Ledger is a local-only desktop bookkeeping application built with:

- Vite + React + TypeScript
- TailwindCSS
- shadcn/ui
- Tauri (Rust backend)
- SQLite (local database)

The application must:

- Run fully offline
- Store all data locally
- Be packaged as a desktop executable
- Have a modern, minimal, professional UI

No cloud sync.  
No remote server.  
No external APIs.

---

## 2. Architecture

### 2.1 Frontend

- React SPA
- All data access through Tauri `invoke()`
- No direct database logic in frontend
- No statistical aggregation in frontend

### 2.2 Backend

- Tauri Rust commands
- SQLite database
- SQL-based aggregation for statistics
- Automatic database initialization on startup

### 2.3 Database Location

- Stored in Tauri app data directory
- Must NOT be stored inside project folder
- Daily automatic backup required

---

## 3. Database Schema

### 3.1 Table: transactions

- id INTEGER PRIMARY KEY AUTOINCREMENT
- occurred_at TEXT (ISO 8601)
- amount_cents INTEGER (must store cents only)
- type TEXT ("income" | "expense")
- category TEXT
- account TEXT
- note TEXT
- created_at TEXT
- updated_at TEXT

### 3.2 Data Rules

- Amount must always be stored in cents (integer).
- Floating-point storage is strictly forbidden.
- Time must be stored in ISO 8601 string format.
- All statistical aggregation must be done via SQL.

---

## 4. Backend Commands

Required commands:

- add_transaction
- list_transactions
- update_transaction
- delete_transaction
- stats_daily
- stats_by_category
- export_csv
- backup_db

Statistics must be calculated using SQL aggregation.

Frontend must NOT compute statistics manually.

---

## 5. UI System

The UI must strictly follow this design system.  
Do not introduce new visual styles without explicit instruction.

---

### 5.1 Design Principles

- Minimal
- Professional
- Calm
- Data-focused
- No playful elements
- No exaggerated visuals

Avoid:

- High saturation neon colors
- Excessive gradients
- Large cartoonish radius
- Heavy animations

---

### 5.2 Layout System

- Maximum width: 1200px
- Centered content
- Generous horizontal padding
- Structured vertical spacing

Page structure:

- Header (title + filters)
- Stat Cards
- Main Chart
- Secondary Chart / Table

---

### 5.3 Spacing System

Use consistent spacing scale:

- Component padding: p-4
- Card padding: p-6
- Section spacing: space-y-6
- Small element spacing: gap-2 / gap-3

No arbitrary spacing values allowed.

---

### 5.4 Radius & Shadow

- Border radius: rounded-xl
- Shadow: shadow-sm only

Avoid:

- rounded-full
- rounded-3xl
- shadow-2xl
- dramatic elevation

---

### 5.5 Color System

Base colors:

- Background: bg-background
- Card: bg-card
- Primary text: text-foreground
- Secondary text: text-muted-foreground

Income:

- text-emerald-600
- bg-emerald-50

Expense:

- text-rose-600
- bg-rose-50

No raw hex colors.
No bright red or bright green.

---

### 5.6 Typography

- Page title: text-2xl font-semibold
- Card title: text-lg font-medium
- Body text: text-sm / text-base

Avoid oversized typography.

---

### 5.7 Component Standards

All UI must use:

- shadcn/ui components
- Card layout structure
- Proper Button variants
- Consistent Dialog usage

Avoid:

- Inline styles
- Raw unstructured div nesting
- Unstyled HTML elements

---

### 5.8 Table Standards

- Hover state required
- Amount right-aligned
- Date left-aligned
- Income and expense visually distinguishable
- Action buttons use ghost variant

---

### 5.9 Chart Guidelines

- Limited color palette
- No more than 3–4 colors per chart
- Income: emerald
- Expense: rose
- Net value: slate

Charts must remain clean and readable.

---

### 5.10 Interaction Rules

Allowed:

- Subtle hover effects
- Smooth fade transitions

Not allowed:

- Bounce animations
- Rotations
- Flashy transitions

---

## 6. Code Constraints

- Use strict TypeScript
- Avoid `any` unless unavoidable
- Separate components and pages
- Keep logic modular
- Do not introduce unnecessary dependencies
- Do not generate unplanned features

---

## 7. Milestone Plan

1. M0 – Project scaffold  
2. M1 – Database & basic CRUD  
3. M2 – Add page  
4. M3 – List page  
5. M4 – Stats backend  
6. M5 – Dashboard UI  
7. M6 – UX polish  
8. M7 – Backup & export  
9. M8 – Production build  

---

When generating code:

- Strictly follow this specification.
- Do not change architecture without explicit instruction.
- Do not refactor structure unless requested.