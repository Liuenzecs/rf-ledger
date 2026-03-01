# Contributing

Thanks for your interest in contributing to RF Ledger.

## Development Setup

1. Install dependencies:

```bash
npm install
```

2. Start desktop development mode:

```bash
npm run tauri:dev
```

3. Build production executable:

```bash
npm run tauri:build
```

## Code Style

Before opening a pull request, run:

```bash
npm run format
npm run format:check
npm run build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features
```

## Commit Guidelines

- Keep commits small and focused.
- Avoid mixing feature changes with formatting-only changes.
- Do not commit generated artifacts or local database files.
