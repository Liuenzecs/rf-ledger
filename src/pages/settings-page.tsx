import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage, type AppLanguage } from "@/lib/language";
import { tauriInvoke, tauriSaveFile } from "@/lib/tauri";
import { useToast } from "@/lib/toast";

type StorageInfo = {
  db_path: string;
  backup_dir: string;
  export_dir: string;
  last_backup_date: string | null;
};

type BackupResult = {
  backup_path: string;
  backup_date: string;
  created: boolean;
};

type ExportResult = {
  path: string;
  row_count: number;
};

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

export function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const { pushToast } = useToast();
  const isZh = language === "zh";

  const text = useMemo(
    () =>
      ({
        title: isZh ? "\u8bbe\u7f6e" : "Settings",
        description: isZh
          ? "\u5e94\u7528\u504f\u597d\u3001\u6570\u636e\u5b58\u50a8\u4e0e\u5bfc\u51fa\u7ba1\u7406\u3002"
          : "Preferences, local storage and export management.",
        languageTitle: isZh ? "\u8bed\u8a00" : "Language",
        languageDesc: isZh
          ? "\u9ed8\u8ba4\u4e3a\u4e2d\u6587\uff0c\u5207\u6362\u540e\u7acb\u5373\u751f\u6548\u3002"
          : "Default language is Chinese. Changes apply immediately.",
        storageTitle: isZh ? "\u5b58\u50a8\u4fe1\u606f" : "Storage Info",
        storageDesc: isZh
          ? "\u4ee5\u4e0b\u8def\u5f84\u4ec5\u8bfb\u663e\u793a\uff0c\u6570\u636e\u4fdd\u5b58\u5728\u672c\u673a App Data\u3002"
          : "Read-only paths in local app data directory.",
        dbPath: isZh ? "\u6570\u636e\u5e93\u8def\u5f84" : "Database Path",
        backupDir: isZh ? "\u5907\u4efd\u76ee\u5f55" : "Backup Directory",
        exportDir: isZh ? "\u5bfc\u51fa\u76ee\u5f55" : "Export Directory",
        lastBackup: isZh ? "\u6700\u8fd1\u5907\u4efd\u65e5\u671f" : "Last Backup Date",
        noBackup: isZh ? "\u6682\u65e0" : "N/A",
        refreshInfo: isZh ? "\u5237\u65b0\u4fe1\u606f" : "Refresh Info",
        backupTitle: isZh ? "\u5907\u4efd\u4e0e\u5bfc\u51fa" : "Backup & Export",
        backupDesc: isZh
          ? "\u652f\u6301\u624b\u52a8\u5907\u4efd\u6570\u636e\u5e93\uff0c\u5e76\u6309\u65f6\u95f4\u8303\u56f4\u5bfc\u51fa CSV\u3002"
          : "Manual backup and CSV export by selected date range.",
        backupNow: isZh ? "\u7acb\u5373\u5907\u4efd" : "Backup Now",
        backupOk: isZh ? "\u5907\u4efd\u6210\u529f" : "Backup completed",
        backupSkipped: isZh ? "\u4eca\u65e5\u5df2\u5907\u4efd" : "Already backed up today",
        backupFail: isZh ? "\u5907\u4efd\u5931\u8d25" : "Backup failed",
        rangePreset: isZh ? "\u65f6\u95f4\u8303\u56f4" : "Range",
        thisMonth: isZh ? "\u672c\u6708" : "This Month",
        last30: isZh ? "\u8fd130\u5929" : "Last 30 Days",
        custom: isZh ? "\u81ea\u5b9a\u4e49" : "Custom",
        from: isZh ? "\u5f00\u59cb" : "From",
        to: isZh ? "\u7ed3\u675f" : "To",
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
        loading: isZh ? "\u52a0\u8f7d\u4e2d..." : "Loading..."
      }) as const,
    [isZh]
  );

  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);

  const initialMonth = getMonthRange();
  const [rangePreset, setRangePreset] = useState<ExportRangePreset>("month");
  const [fromInput, setFromInput] = useState(initialMonth.from);
  const [toInput, setToInput] = useState(initialMonth.to);
  const [exportPath, setExportPath] = useState("");

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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

  useEffect(() => {
    void loadStorageInfo();
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
        variant: "success"
      });
      await loadStorageInfo();
    } catch (error) {
      pushToast({ title: text.backupFail, description: String(error), variant: "error" });
    } finally {
      setIsBackingUp(false);
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
        variant: "success"
      });
      setExportPath(result.path);
    } catch (error) {
      pushToast({ title: text.exportFail, description: String(error), variant: "error" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <PageShell>
      <PageHeader title={text.title} description={text.description} />

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.languageTitle}</CardTitle>
          <CardDescription>{text.languageDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-6 pt-0">
          <Select
            value={language}
            onChange={(event) => setLanguage(event.target.value as AppLanguage)}
            className="max-w-xs"
          >
            <option value="zh">\u4e2d\u6587</option>
            <option value="en">English</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.storageTitle}</CardTitle>
          <CardDescription>{text.storageDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-6 pt-0">
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
                <Input value={storage.backup_dir} readOnly />
              </div>
              <div className="grid gap-2 text-sm">
                <p className="text-muted-foreground">{text.exportDir}</p>
                <Input value={storage.export_dir} readOnly />
              </div>
              <div className="grid gap-2 text-sm">
                <p className="text-muted-foreground">{text.lastBackup}</p>
                <Input value={storage.last_backup_date || text.noBackup} readOnly />
              </div>
              <Button variant="outline" onClick={() => void loadStorageInfo()}>
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
    </PageShell>
  );
}
