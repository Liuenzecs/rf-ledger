import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  BackupEntry,
  BackupResult,
  ExportResult,
  RestoreResult,
  StorageInfo
} from "@/lib/ledger-types";
import { useLanguage, type AppLanguage, type DisplayCurrency } from "@/lib/language";
import { tauriInvoke, tauriSaveFile } from "@/lib/tauri";
import { useToast } from "@/lib/toast";

type ExportRangePreset = "month" | "last30" | "custom";

function toDatetimeLocalInput(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function getMonthRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { from: toDatetimeLocalInput(start), to: toDatetimeLocalInput(now) };
}

function getLast30Range(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: toDatetimeLocalInput(start), to: toDatetimeLocalInput(now) };
}

function buildDefaultExportFilePath(exportDir: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${exportDir}/${yyyy}-${mm}-${dd}-${hh}${mi}-ledger.csv`;
}

function formatLocalDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(locale);
}

function formatBytes(value: number, locale: string): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024)} KB`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    value / (1024 * 1024)
  )} MB`;
}

export function SettingsPage() {
  const { language, setLanguage, displayCurrency, setDisplayCurrency, locale } = useLanguage();
  const { pushToast } = useToast();
  const isZh = language === "zh";

  const text = useMemo(
    () =>
      ({
        title: isZh ? "\u8bbe\u7f6e" : "Settings",
        description: isZh
          ? "\u5e94\u7528\u504f\u597d\u3001\u672c\u5730\u5b58\u50a8\u3001\u5907\u4efd\u4e0e\u5bfc\u51fa\u7ba1\u7406\u3002"
          : "Preferences, local storage, backup and export management.",
        preferencesTitle: isZh ? "\u5e94\u7528\u504f\u597d" : "Preferences",
        preferencesDesc: isZh
          ? "\u8bed\u8a00\u4e0e\u8d27\u5e01\u663e\u793a\u90fd\u4f1a\u4fdd\u5b58\u5230\u672c\u5730\u3002"
          : "Language and currency display are persisted locally.",
        languageTitle: isZh ? "\u8bed\u8a00" : "Language",
        currencyTitle: isZh ? "\u663e\u793a\u8d27\u5e01" : "Display Currency",
        currencyDesc: isZh
          ? "\u4ec5\u5f71\u54cd\u91d1\u989d\u663e\u793a\uff0c\u4e0d\u4f1a\u6539\u53d8\u5e95\u5c42 amount_cents \u5b58\u50a8\u3002"
          : "Affects display only, not the stored amount_cents value.",
        storageTitle: isZh ? "\u5b58\u50a8\u4fe1\u606f" : "Storage Info",
        storageDesc: isZh
          ? "\u4ee5\u4e0b\u8def\u5f84\u4ec5\u8bfb\u663e\u793a\uff0c\u6570\u636e\u4fdd\u5b58\u5728\u672c\u673a App Data\u3002"
          : "Read-only paths in the local app data directory.",
        dbPath: isZh ? "\u6570\u636e\u5e93\u8def\u5f84" : "Database Path",
        backupDir: isZh ? "\u5907\u4efd\u76ee\u5f55" : "Backup Directory",
        exportDir: isZh ? "\u5bfc\u51fa\u76ee\u5f55" : "Export Directory",
        lastBackup: isZh ? "\u6700\u8fd1\u5907\u4efd\u65e5\u671f" : "Last Backup Date",
        noBackup: isZh ? "\u6682\u65e0" : "N/A",
        refreshInfo: isZh ? "\u5237\u65b0\u4fe1\u606f" : "Refresh Info",
        openFolder: isZh ? "\u6253\u5f00\u76ee\u5f55" : "Open Folder",
        backupTitle: isZh ? "\u5907\u4efd\u4e0e\u5bfc\u51fa" : "Backup & Export",
        backupDesc: isZh
          ? "\u652f\u6301\u624b\u52a8\u5907\u4efd\u6570\u636e\u5e93\uff0c\u5e76\u6309\u65f6\u95f4\u8303\u56f4\u5bfc\u51fa CSV\u3002"
          : "Manual backup and CSV export by selected date range.",
        backupNow: isZh ? "\u7acb\u5373\u5907\u4efd" : "Backup Now",
        backupOk: isZh ? "\u5907\u4efd\u6210\u529f" : "Backup completed",
        backupSkipped: isZh ? "\u4eca\u65e5\u5df2\u5907\u4efd" : "Already backed up today",
        backupFail: isZh ? "\u5907\u4efd\u5931\u8d25" : "Backup failed",
        thisMonth: isZh ? "\u672c\u6708" : "This Month",
        last30: isZh ? "\u8fd130\u5929" : "Last 30 Days",
        custom: isZh ? "\u81ea\u5b9a\u4e49" : "Custom",
        savePath: isZh ? "\u4fdd\u5b58\u8def\u5f84" : "Save Path",
        choosePath: isZh ? "\u9009\u62e9\u4fdd\u5b58\u4f4d\u7f6e" : "Choose Save Location",
        dialogFallback: isZh
          ? "\u5f53\u524d\u73af\u5883\u672a\u542f\u7528\u6587\u4ef6\u5bf9\u8bdd\u6846\uff0c\u5df2\u56de\u9000\u5230\u9ed8\u8ba4\u5bfc\u51fa\u8def\u5f84\u3002"
          : "File dialog unavailable. Falling back to default export path.",
        invalidRange: isZh
          ? "\u5bfc\u51fa\u65f6\u95f4\u8303\u56f4\u65e0\u6548\u3002"
          : "Invalid export date range.",
        exportBtn: isZh ? "\u5bfc\u51fa CSV" : "Export CSV",
        exporting: isZh ? "\u5bfc\u51fa\u4e2d..." : "Exporting...",
        exportOk: isZh ? "\u5bfc\u51fa\u6210\u529f" : "Export completed",
        exportFail: isZh ? "\u5bfc\u51fa\u5931\u8d25" : "Export failed",
        loading: isZh ? "\u52a0\u8f7d\u4e2d..." : "Loading...",
        backupListTitle: isZh ? "\u6062\u590d\u5907\u4efd" : "Restore Backup",
        backupListDesc: isZh
          ? "\u4ece\u5907\u4efd\u76ee\u5f55\u9009\u62e9\u4e00\u4e2a SQLite \u5907\u4efd\u8986\u76d6\u5f53\u524d\u6570\u636e\u5e93\uff0c\u6062\u590d\u6210\u529f\u540e\u5e94\u7528\u4f1a\u91cd\u542f\u3002"
          : "Choose a SQLite backup to replace the current database. The app restarts after restore.",
        noBackupsTitle: isZh
          ? "\u6682\u65e0\u53ef\u6062\u590d\u7684\u5907\u4efd"
          : "No backups to restore",
        noBackupsDesc: isZh
          ? "\u53ef\u4ee5\u5148\u624b\u52a8\u5907\u4efd\u4e00\u6b21\uff0c\u6216\u7b49\u5f85\u6bcf\u65e5\u81ea\u52a8\u5907\u4efd\u3002"
          : "Create a backup first or wait for the daily auto backup.",
        restoreCta: isZh ? "\u5148\u5907\u4efd\u4e00\u6b21" : "Create A Backup",
        selectBackup: isZh ? "\u9009\u62e9\u5907\u4efd" : "Select Backup",
        restoreBtn: isZh ? "\u6062\u590d\u8be5\u5907\u4efd" : "Restore Backup",
        restoreConfirmTitle: isZh ? "\u786e\u8ba4\u6062\u590d\u5907\u4efd" : "Confirm Restore",
        restoreConfirmDesc: (name: string) =>
          isZh
            ? `\u5373\u5c06\u4f7f\u7528 ${name} \u8986\u76d6\u5f53\u524d\u6570\u636e\u5e93\uff0c\u4e14\u4f1a\u5148\u751f\u6210\u4e00\u4efd pre-restore \u5b89\u5168\u5907\u4efd\u3002\u6062\u590d\u540e\u5e94\u7528\u5c06\u91cd\u542f\u3002`
            : `This will replace the current database with ${name}. A pre-restore safety backup will be created before the app restarts.`,
        restoring: isZh ? "\u6062\u590d\u4e2d..." : "Restoring...",
        restoreFail: isZh ? "\u6062\u590d\u5931\u8d25" : "Restore failed",
        restoreSuccess: isZh
          ? "\u6062\u590d\u6210\u529f\uff0c\u5e94\u7528\u5373\u5c06\u91cd\u542f"
          : "Restore completed, restarting app",
        modifiedAt: isZh ? "\u4fee\u6539\u65f6\u95f4" : "Modified",
        fileSize: isZh ? "\u6587\u4ef6\u5927\u5c0f" : "File Size",
        selectedBackupPath: isZh ? "\u5907\u4efd\u8def\u5f84" : "Backup Path",
        loadBackupsFail: isZh
          ? "\u5907\u4efd\u5217\u8868\u52a0\u8f7d\u5931\u8d25"
          : "Failed to load backups"
      }) as const,
    [isZh]
  );

  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState("");
  const [pendingRestoreFile, setPendingRestoreFile] = useState<string | null>(null);

  const initialMonth = getMonthRange();
  const [rangePreset, setRangePreset] = useState<ExportRangePreset>("month");
  const [fromInput, setFromInput] = useState(initialMonth.from);
  const [toInput, setToInput] = useState(initialMonth.to);
  const [exportPath, setExportPath] = useState("");

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const selectedBackup = useMemo(
    () => backups.find((item) => item.file_name === selectedBackupFile) ?? null,
    [backups, selectedBackupFile]
  );

  const loadStorageInfo = async () => {
    setIsLoadingStorage(true);
    try {
      const info = await tauriInvoke<StorageInfo>("get_storage_info");
      setStorage(info);
      if (!exportPath) {
        setExportPath(buildDefaultExportFilePath(info.export_dir));
      }
    } catch (error) {
      pushToast({ title: text.loading, description: String(error), variant: "error" });
    } finally {
      setIsLoadingStorage(false);
    }
  };

  const loadBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const nextBackups = await tauriInvoke<BackupEntry[]>("list_backups");
      setBackups(nextBackups);
      setSelectedBackupFile((prev) => {
        if (nextBackups.length === 0) {
          return "";
        }
        if (prev && nextBackups.some((item) => item.file_name === prev)) {
          return prev;
        }
        return nextBackups[0].file_name;
      });
    } catch (error) {
      pushToast({
        title: text.loadBackupsFail,
        description: String(error),
        variant: "error"
      });
    } finally {
      setIsLoadingBackups(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadStorageInfo(), loadBackups()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (rangePreset === "month") {
      const range = getMonthRange();
      setFromInput(range.from);
      setToInput(range.to);
      return;
    }
    if (rangePreset === "last30") {
      const range = getLast30Range();
      setFromInput(range.from);
      setToInput(range.to);
    }
  }, [rangePreset]);

  const handleBackupNow = async () => {
    setIsBackingUp(true);
    try {
      const result = await tauriInvoke<BackupResult>("backup_db");
      pushToast({
        title: result.created ? text.backupOk : text.backupSkipped,
        description: result.backup_path,
        variant: "success",
        copyText: result.backup_path
      });
      await Promise.all([loadStorageInfo(), loadBackups()]);
    } catch (error) {
      pushToast({ title: text.backupFail, description: String(error), variant: "error" });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleOpenBackupDir = async () => {
    try {
      await tauriInvoke<boolean>("open_backup_dir");
    } catch (error) {
      pushToast({ title: text.backupFail, description: String(error), variant: "error" });
    }
  };

  const handleOpenExportDir = async () => {
    try {
      await tauriInvoke<boolean>("open_export_dir");
    } catch (error) {
      pushToast({ title: text.exportFail, description: String(error), variant: "error" });
    }
  };

  const handleChoosePath = async () => {
    if (!storage) {
      return;
    }

    const suggested = exportPath || buildDefaultExportFilePath(storage.export_dir);
    const selected = await tauriSaveFile(suggested);
    if (!selected) {
      setExportPath(suggested);
      pushToast({ title: text.choosePath, description: text.dialogFallback, variant: "info" });
      return;
    }

    setExportPath(selected);
  };

  const handleExportCsv = async () => {
    if (!storage) {
      return;
    }

    const fromIso = datetimeLocalToIso(fromInput);
    const toIso = datetimeLocalToIso(toInput);
    if (!fromIso || !toIso || new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      pushToast({ title: text.exportFail, description: text.invalidRange, variant: "error" });
      return;
    }

    const path = exportPath || buildDefaultExportFilePath(storage.export_dir);
    setIsExporting(true);

    try {
      const result = await tauriInvoke<ExportResult>("export_csv", {
        filters: {
          from: fromIso,
          to: toIso
        },
        path
      });

      pushToast({
        title: text.exportOk,
        description: `${result.path} (${result.row_count})`,
        variant: "success",
        copyText: result.path
      });
      setExportPath(result.path);
    } catch (error) {
      pushToast({ title: text.exportFail, description: String(error), variant: "error" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreFile) {
      return;
    }

    setIsRestoring(true);
    try {
      const result = await tauriInvoke<RestoreResult>("restore_backup", {
        file_name: pendingRestoreFile
      });
      pushToast({
        title: text.restoreSuccess,
        description: result.safety_backup_path,
        variant: "info",
        copyText: result.safety_backup_path
      });
      setPendingRestoreFile(null);
      await tauriInvoke<boolean>("restart_app");
    } catch (error) {
      pushToast({ title: text.restoreFail, description: String(error), variant: "error" });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <PageShell>
      <PageHeader title={text.title} description={text.description} />

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.preferencesTitle}</CardTitle>
          <CardDescription>{text.preferencesDesc}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-6 pt-0 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{text.languageTitle}</p>
            <Select
              value={language}
              onChange={(event) => setLanguage(event.target.value as AppLanguage)}
            >
              <option value="zh">\u4e2d\u6587</option>
              <option value="en">English</option>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{text.currencyTitle}</p>
            <Select
              value={displayCurrency}
              onChange={(event) => setDisplayCurrency(event.target.value as DisplayCurrency)}
            >
              <option value="CNY">CNY</option>
              <option value="USD">USD</option>
            </Select>
            <p className="text-xs text-muted-foreground">{text.currencyDesc}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.storageTitle}</CardTitle>
          <CardDescription>{text.storageDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-0">
          {isLoadingStorage || !storage ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="grid gap-2 text-sm">
                <p className="text-muted-foreground">{text.dbPath}</p>
                <Input value={storage.db_path} readOnly />
              </div>
              <div className="grid gap-2 text-sm">
                <p className="text-muted-foreground">{text.backupDir}</p>
                <div className="flex gap-2">
                  <Input value={storage.backup_dir} readOnly />
                  <Button variant="outline" onClick={() => void handleOpenBackupDir()}>
                    {text.openFolder}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 text-sm">
                <p className="text-muted-foreground">{text.exportDir}</p>
                <div className="flex gap-2">
                  <Input value={storage.export_dir} readOnly />
                  <Button variant="outline" onClick={() => void handleOpenExportDir()}>
                    {text.openFolder}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 text-sm">
                <p className="text-muted-foreground">{text.lastBackup}</p>
                <Input value={storage.last_backup_date || text.noBackup} readOnly />
              </div>
              <Button
                variant="outline"
                onClick={() => void Promise.all([loadStorageInfo(), loadBackups()])}
              >
                {text.refreshInfo}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.backupTitle}</CardTitle>
          <CardDescription>{text.backupDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-0">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleBackupNow()} disabled={isBackingUp}>
              {isBackingUp ? text.loading : text.backupNow}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <Select
              value={rangePreset}
              onChange={(event) => setRangePreset(event.target.value as ExportRangePreset)}
            >
              <option value="month">{text.thisMonth}</option>
              <option value="last30">{text.last30}</option>
              <option value="custom">{text.custom}</option>
            </Select>
            <Input
              type="datetime-local"
              value={fromInput}
              onChange={(event) => {
                setRangePreset("custom");
                setFromInput(event.target.value);
              }}
            />
            <Input
              type="datetime-local"
              value={toInput}
              onChange={(event) => {
                setRangePreset("custom");
                setToInput(event.target.value);
              }}
            />
            <Button variant="outline" onClick={() => void handleChoosePath()}>
              {text.choosePath}
            </Button>
            <Button onClick={() => void handleExportCsv()} disabled={isExporting}>
              {isExporting ? text.exporting : text.exportBtn}
            </Button>
          </div>

          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">{text.savePath}</p>
            <Input value={exportPath} onChange={(event) => setExportPath(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.backupListTitle}</CardTitle>
          <CardDescription>{text.backupListDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-0">
          {isLoadingBackups ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : backups.length === 0 ? (
            <EmptyState
              title={text.noBackupsTitle}
              description={text.noBackupsDesc}
              ctaLabel={text.restoreCta}
              onCtaClick={() => void handleBackupNow()}
            />
          ) : (
            <>
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">{text.selectBackup}</p>
                <Select
                  value={selectedBackupFile}
                  onChange={(event) => setSelectedBackupFile(event.target.value)}
                >
                  {backups.map((backup) => (
                    <option key={backup.file_name} value={backup.file_name}>
                      {backup.file_name}
                    </option>
                  ))}
                </Select>
              </div>

              {selectedBackup ? (
                <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
                  <div className="grid gap-2 text-sm">
                    <p className="text-muted-foreground">{text.selectedBackupPath}</p>
                    <Input value={selectedBackup.path} readOnly />
                  </div>
                  <div className="grid gap-3 text-sm md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-muted-foreground">{text.modifiedAt}</p>
                      <p>{formatLocalDateTime(selectedBackup.modified_at, locale)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">{text.fileSize}</p>
                      <p>{formatBytes(selectedBackup.size_bytes, locale)}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setPendingRestoreFile(selectedBackupFile)}
                  disabled={!selectedBackup}
                >
                  {text.restoreBtn}
                </Button>
                <Button variant="outline" onClick={() => void handleOpenBackupDir()}>
                  {text.openFolder}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={pendingRestoreFile !== null}
        onOpenChange={(open) => (!open ? setPendingRestoreFile(null) : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.restoreConfirmTitle}</DialogTitle>
            <DialogDescription>
              {pendingRestoreFile ? text.restoreConfirmDesc(pendingRestoreFile) : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedBackup ? (
            <div className="grid gap-2 text-sm">
              <p className="text-muted-foreground">{text.selectedBackupPath}</p>
              <p>{selectedBackup.path}</p>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {isZh ? "\u53d6\u6d88" : "Cancel"}
              </Button>
            </DialogClose>
            <Button onClick={() => void handleConfirmRestore()} disabled={isRestoring}>
              {isRestoring ? text.restoring : text.restoreBtn}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
