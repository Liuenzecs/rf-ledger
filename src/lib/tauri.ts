import { invoke } from "@tauri-apps/api/core";

type DialogSaveOptions = {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  title?: string;
};

type DialogSaveFn = (options?: DialogSaveOptions) => Promise<string | null>;

function inTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const win = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(win.__TAURI__ || win.__TAURI_INTERNALS__);
}

export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauriRuntime()) {
    throw new Error("Tauri runtime is not available. Please launch with `npm run tauri dev`.");
  }
  return invoke<T>(cmd, args ?? {});
}

export async function tauriSaveFile(defaultPath: string): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const win = window as Window & {
    __TAURI__?: {
      dialog?: {
        save?: DialogSaveFn;
      };
    };
    __TAURI_INTERNALS__?: {
      plugins?: {
        dialog?: {
          save?: DialogSaveFn;
        };
      };
    };
  };

  const saveFn = win.__TAURI__?.dialog?.save ?? win.__TAURI_INTERNALS__?.plugins?.dialog?.save;
  if (typeof saveFn !== "function") {
    return null;
  }

  return saveFn({
    defaultPath,
    title: "Export CSV",
    filters: [{ name: "CSV", extensions: ["csv"] }]
  });
}
