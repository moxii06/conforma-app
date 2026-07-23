"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { DashboardTask } from "@/lib/dashboardTasks";

export function NotificationBell({ tasks }: { tasks: DashboardTask[] }) {
  const [open, setOpen] = useState(false);
  const overdueCount = tasks.filter((t) => t.overdue).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-md text-white/80 hover:bg-ink-soft hover:text-white"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {tasks.length > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${
              overdueCount > 0 ? "bg-rust text-white" : "bg-seal text-ink"
            }`}
          >
            {tasks.length > 9 ? "9+" : tasks.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 z-20 w-80 bg-white border border-line rounded-card shadow-lg py-2">
            <div className="px-3.5 py-1.5 text-[11.5px] font-semibold text-slate uppercase tracking-wide">
              À faire ({tasks.length})
            </div>
            <div className="max-h-80 overflow-y-auto">
              {tasks.slice(0, 8).map((t) => (
                <Link
                  key={`${t.kind}-${t.id}`}
                  href={t.href}
                  onClick={() => setOpen(false)}
                  className="flex flex-col gap-0.5 px-3.5 py-2 hover:bg-[#FAF8F2]"
                >
                  <div className="text-[12px] text-ink font-medium">{t.contactName}</div>
                  <div className="text-[11.5px] text-slate">
                    {t.overdue && <span className="text-rust font-medium">En retard — </span>}
                    {t.label}
                  </div>
                </Link>
              ))}
              {tasks.length === 0 && <div className="px-3.5 py-3 text-[12px] text-slate">Rien à faire pour le moment.</div>}
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
