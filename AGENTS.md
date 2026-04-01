# AGENTS.md

## 目的

本文档面向参与 RF
Ledger 的人类开发者与 AI 代理，用于快速说明仓库边界、架构约束、协作默认规则，以及当前已经落地的关键能力。

## 项目定位

- RF Ledger 是一个本地优先、完全离线的桌面记账应用。
- 当前技术栈为 `Tauri 2 + Rust + SQLite + React + TypeScript + Vite + Tailwind CSS + shadcn/ui`。
- 这是桌面应用，不是 Web SaaS，也不依赖云端服务。

## 建议阅读顺序

1. `README.md`
2. `PROJECT_SPEC.md`
3. `PROJECT_STATUS.md`
4. `DECISIONS.md`
5. `CONTRIBUTING.md`

如需修改代码，再继续阅读：

- 前端入口：`src/main.tsx`、`src/App.tsx`
- 页面：`src/pages/*`
- 通用组件：`src/components/*`
- Tauri 命令入口：`src-tauri/src/main.rs`
- 数据库实现：`src-tauri/src/db.rs`
- 数据模型：`src-tauri/src/models.rs`

## 关键架构边界

- 前端不直接访问数据库。
- 前端数据读写统一经由 Tauri `invoke()` 命令。
- 统计聚合必须在后端 SQL 完成，不能在前端手工汇总替代。
- 数据库文件必须位于 `app_data_dir()`，不能落在仓库目录中。
- 当前范围内不做云同步、不接远程 API、不引入外部后端。

## 数据约束

- 金额统一使用 `amount_cents`，只存整数分。
- 禁止把金额持久化为浮点数。
- 时间统一使用 RFC3339 / ISO 8601 字符串。
- `transactions.type` 仅允许 `income` 或 `expense`。
- 当前 `account` 字段同时承担“账户 / 支付方式”语义。
- CSV 导出使用 UTF-8 BOM，以兼容 Excel。

## 前端协作约束

- 路由当前使用 `HashRouter`，不要随意改回 Browser Router。
- 优先复用 `PageShell`、`PageHeader`、`StatCards`、`EmptyState` 与 `components/ui/*`。
- 视觉方向保持冷静、克制、数据导向，不引入夸张动效和新的视觉体系。
- 样式优先走 Tailwind token，不堆大量内联样式与任意值。
- 中英文文案仍以页面内联为主，新增页面或新增交互要同步补齐双语。
- 显示货币与语言已经拆分，所有金额展示必须读取 `displayCurrency`，不能再通过语言推断货币。
- 历史建议输入当前统一采用原生 `input + datalist`，避免引入重型依赖。

## Rust / Tauri 协作约束

- 新增数据能力时，优先沿用 `models.rs -> db.rs -> main.rs command` 这条路径。
- 命令参数与返回结构要保持字段名稳定，避免无必要变更前端协议。
- 备份恢复、导出和打开目录相关逻辑统一放在 Rust 侧处理。
- 打开目录通过 `tauri-plugin-opener` 由后端命令封装，不直接在前端调用插件 API。
- `src-tauri/gen/schemas/*`
  属于生成产物，不应手工编辑；若因插件或 capability 变化而变更，需要在说明中写清原因。

## 当前高频能力

- 新增页支持历史类别与支付方式建议输入，以及最近常用组合快捷回填。
- 列表页使用后端分页，支持 URL 同步筛选、按日分组、当日小计、撤销删除与舒适 / 紧凑密度切换。
- 看板页支持每日趋势、环比摘要、支出类别 Top 10、支付方式 Top 10，并支持图表钻取到列表页。
- 设置页支持语言、显示货币、打开备份/导出目录、备份恢复、CSV 导出。
- Toast 支持路径复制动作，适合备份、导出、恢复等场景。

## 推荐工作流

1. 先判断改动属于前端页面、共享组件还是 Rust 后端。
2. 先看现有实现，再决定复用还是扩展。
3. 涉及数据结构变化时，优先保证后端模型与数据库约束一致。
4. 涉及 UI 调整时，优先保持现有布局和设计语言连续。
5. 完成后至少执行一轮格式化、构建与静态检查，再更新文档。

## 默认验证命令

```bash
npm run build
npm run format:check
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features
```

桌面联调：

```bash
npm run tauri:dev
```

## 文档维护约定

- 项目阶段与本轮交付状态变化时，优先更新 `PROJECT_STATUS.md`。
- 长期约束、关键取舍变化时，优先更新 `DECISIONS.md`。
- 仓库级协作规范变化时，再更新本文档。
