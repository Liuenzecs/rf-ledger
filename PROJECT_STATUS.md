# PROJECT_STATUS.md

## 当前阶段

- 阶段：P5 录入快捷、列表洞察与看板联动
- 状态：已完成
- 更新时间：2026-04-01
- 当前目标：完成最近常用组合、列表分组与撤销删除、看板环比与图表钻取的实现与验收。

## 本轮已完成

### 1. 偏好与金额显示

- 前端偏好层已从“仅语言”升级为“应用偏好”，统一持久化 `language` 与 `displayCurrency`。
- `displayCurrency` 当前支持 `CNY` / `USD`，只影响展示格式，不影响数据库中的 `amount_cents`。
- 统计卡片、列表页、看板页等金额展示已统一改为读取 `displayCurrency`。
- Toast 已支持更紧凑的关闭样式，并支持可选复制动作，路径类提示可直接复制。

### 2. 新增页与快捷录入

- `get_form_suggestions` 已扩展为同时返回最近常用组合。
- 最近常用组合按 `(type, category, account)` 聚合，默认返回前 `6` 条。
- 新增页底部提示区已改成可点击的“最近常用组合”卡片。
- 点击卡片会回填 `type + category + payment method`，不改动当前日期、金额与备注。
- 回填后会把焦点移回金额输入框，方便连续录入。

### 3. 列表页筛选、分组与撤销删除

- 列表页已把已应用筛选与页码改为 URL query 驱动，支持
  `from`、`to`、`type`、`category`、`account`、`q`、`page`。
- 列表筛选已新增显式 `account` 精确过滤，不再需要用 `q` 代替支付方式筛选。
- 列表顶部已新增“当前筛选标签”区，支持单独移除和整体重置。
- 已新增后端 `list_daily_summaries`，列表可按日期分组并展示当日收入 / 支出 / 净值 / 笔数小计。
- 删除已改为“直接隐藏 + 5 秒可撤销 + 超时后真正删库”。
- 在撤销窗口内切换筛选、翻页或从看板钻取时，列表仍会按当前视图正确刷新。

### 4. 看板页环比与图表钻取

- 看板已新增“环比摘要”区块，对比上一等长时间区间。
- 第一版环比只展示“支出金额”和“交易笔数”。
- 后端已新增 `stats_comparison`，返回上一周期范围与对比指标。
- 类别 Top 10 与支付方式 Top 10 图表已支持点击钻取到列表页。
- 钻取会带上同一时间范围与准确筛选条件，方便直接查看明细。

### 5. 设置页与备份恢复

- 语言设置与货币设置已分开展示。
- 存储信息区已支持打开备份目录与导出目录。
- 后端通过 `tauri-plugin-opener` 执行打开目录。
- 已新增 `list_backups`，只列出备份目录中的 `.sqlite` 文件并按最新优先排序。
- 已新增恢复备份流程：恢复前自动生成 `pre-restore` 安全备份，恢复后调用 `restart_app` 重启应用。

### 6. 文档与工程

- `README.md` 已补充显示货币、历史建议项、备份恢复、目录打开与账户统计说明。
- `AGENTS.md`、`PROJECT_STATUS.md`、`DECISIONS.md` 已改为中文维护。
- Tauri 相关 schema / capability 生成文件已随插件与命令变更一并纳入当前改动。

## 本轮改动文件

### 前端共享层

- `src/lib/language.tsx`
- `src/lib/toast.tsx`
- `src/lib/ledger-types.ts`
- `src/lib/form-suggestions.ts`
- `src/components/empty-state.tsx`
- `src/components/page-header.tsx`
- `src/components/stat-cards.tsx`
- `src/components/suggestion-input.tsx`

### 页面层

- `src/pages/add-page.tsx`
- `src/pages/list-page.tsx`
- `src/pages/dashboard-page.tsx`

### Rust / Tauri 后端

- `src-tauri/src/models.rs`
- `src-tauri/src/db.rs`
- `src-tauri/src/main.rs`

### 文档

- `README.md`
- `AGENTS.md`
- `PROJECT_STATUS.md`
- `DECISIONS.md`

## 公共接口与类型更新

- `ListFilters` 新增 `account?: string` 的前端/后端对应精确筛选能力
- `FormSuggestions` 新增 `combinations`
- 新增命令：`list_daily_summaries`、`stats_comparison`
- 新增类型：`QuickEntryCombination`、`DailySummary`、`MetricComparison`、`StatsComparison`

## 验证结果

- `npm run format:check`：已通过
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`：已通过
- `npm run build`：已通过
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features`：已通过

## 下一阶段

- 进入用户手工验收阶段。
- 重点验证最近常用组合、列表 URL 恢复、按日分组小计、撤销删除、看板环比与图表钻取链路。
