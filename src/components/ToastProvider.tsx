"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

type ToastType = "success" | "error";
type Toast = { id: number; type: ToastType; message: string };

const ToastContext = createContext<{ show: (type: ToastType, message: string) => void } | null>(null);

// Every "Enregistré" / "Échec de l'envoi" feedback in the app goes through
// here instead of a local `saved` boolean, so it survives a redirect or a
// dialog closing right after the action that triggered it — the two things
// a panel-local message can't do (audit S6, finding E1).
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (type: ToastType, message: string) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-card border px-3.5 py-3 shadow-lg bg-white ${
              t.type === "success" ? "border-sage/30" : "border-rust/30"
            }`}
          >
            {t.type === "success" ? (
              <CheckCircle2 size={16} className="text-sage shrink-0 mt-0.5" />
            ) : (
              <XCircle size={16} className="text-rust shrink-0 mt-0.5" />
            )}
            <span className="text-[13px] text-ink leading-snug flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Fermer"
              className="text-slate hover:text-ink shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return {
    success: (message: string) => ctx.show("success", message),
    error: (message: string) => ctx.show("error", message),
  };
}
