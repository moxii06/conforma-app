"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { DashboardTask } from "@/lib/dashboardTasks";

function taskKey(t: DashboardTask) {
  return `${t.kind}-${t.id}`;
}

// "Tout effacer" only dismisses items from this bell's dropdown (a personal,
// per-browser "I've seen this" — stored client-side, nothing server-side to
// migrate). It does NOT resolve the underlying issue, so the dashboard's own
// À faire widget (the authoritative list staff act on) is unaffected —
// dismissing here just quiets the bell until a *new* task shows up.
export function NotificationBell({ tasks, userId }: { tasks: DashboardTask[]; userId: string }) {
  const [open, setOpen] = useState(false);
  const [clearedKeys, setClearedKeys] = useState<Set<string>>(new Set());
  const storageKey = `conforma:notifications:cleared:${userId}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setClearedKeys(new Set(JSON.parse(raw)));
    } catch {
      // Ignore malformed/unavailable storage — worst case, nothing starts cleared.
    }
  }, [storageKey]);

  const visibleTasks = tasks.filter((t) => !clearedKeys.has(taskKey(t)));
  const overdueCount = visibleTasks.filter((t) => t.overdue).length;

  function clearAll() {
    const next = new Set(clearedKeys);
    tasks.forEach((t) => next.add(taskKey(t)));
    setClearedKeys(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    } catch {
      // Best-effort — the in-memory state still reflects the clear this session.
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-md text-white/80 hover:bg-ink-soft hover:text-white"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {visibleTasks.length > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${
              overdueCount > 0 ? "bg-rust text-white" : "bg-seal text-ink"
            }`}
          >
            {visibleTasks.length > 9 ? "9+" : visibleTasks.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 z-20 w-80 bg-white border border-line rounded-card shadow-lg py-2">
            <div className="flex items-center justify-between px-3.5 py-1.5">
              <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">
                À faire ({visibleTasks.length})
              </div>
              {visibleTasks.length > 0 && (
                <button type="button" onClick={clearAll} className="text-[11px] text-slate hover:text-ink underline decoration-line">
                  Tout effacer
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {visibleTasks.slice(0, 8).map((t) => (
                <Link
                  key={taskKey(t)}
                  href={t.href}
                  onClick={() => setOpen(false)}
                  className="flex flex-col gap-0.5 px-3.5 py-2 hover:bg-[#EFEDE7]"
                >
                  <div className="text-[12px] text-ink font-medium">{t.contactName}</div>
                  <div className="text-[11.5px] text-slate">
                    {t.overdue && <span className="text-rust font-medium">En retard — </span>}
                    {t.label}
                  </div>
                </Link>
              ))}
              {visibleTasks.length === 0 && <div className="px-3.5 py-3 text-[12px] text-slate">Rien à faire pour le moment.</div>}
            </div>
            <div className="px-3.5 pt-1.5 border-t border-line mt-1">
              <Link href="/dashboard" onClick={() => setOpen(false)} className="text-[11.5px] text-ink underline decoration-line hover:decoration-ink">
                Voir tout sur le tableau de bord
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
