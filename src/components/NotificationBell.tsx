"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { DashboardTask } from "@/lib/dashboardTasks";

function taskKey(t: DashboardTask) {
  return `${t.kind}-${t.id}`;
}

// "Tout effacer" marque les tâches visibles comme vues pour CET utilisateur
// (NotificationDismissal, côté serveur — partagé entre ses appareils, plus
// prisonnier d'un seul navigateur : audit S6, finding M5). Ça ne résout pas
// le sujet sous-jacent, donc le widget "À faire" du tableau de bord (la
// liste faisant autorité pour agir) n'est pas affecté — effacer ici ne fait
// que taire la cloche jusqu'à ce qu'une *nouvelle* tâche apparaisse.
export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  // La liste n'arrive plus en props du serveur : elle était calculée dans la
  // Sidebar, donc dans le layout partagé, donc sur chaque page — une
  // quinzaine de requêtes par navigation pour un compteur. Récupérée après
  // le rendu, la page ne l'attend plus.
  //
  // Et elle n'arrive plus en entier : le serveur ne renvoie que les huit
  // tâches réellement affichées et les décomptes (audit « 4 000
  // apprenants » — 3,5 Mo de JSON par page mesurés avant). Le filtrage des
  // tâches déjà vues se fait donc côté serveur, plus ici.
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [count, setCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  // Le décompte est plafonné côté serveur : sans ce drapeau, la cloche
  // annoncerait « 200 » là où il y en a des milliers.
  const [tronquee, setTronquee] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : { tasks: [], count: 0, overdueCount: 0 }))
      .then((data) => {
        if (cancelled) return;
        setTasks(data.tasks ?? []);
        setCount(data.count ?? 0);
        setOverdueCount(data.overdueCount ?? 0);
        setTronquee(Boolean(data.tronquee));
      })
      // Silencieux : une cloche vide est un défaut acceptable, un écran
      // d'erreur sur toutes les pages ne l'est pas.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function clearAll() {
    // Vidage optimiste : le serveur recalcule lui-même ce qu'il y a à
    // masquer, on n'a plus rien à lui envoyer.
    setTasks([]);
    setCount(0);
    setOverdueCount(0);
    setTronquee(false);
    fetch("/api/notifications/clear", { method: "POST" })
      // Best-effort — l'état en mémoire reflète déjà l'effacement pour
      // cette session ; un échec réseau les fera juste réapparaître au
      // prochain chargement plutôt que de bloquer le clic.
      .catch(() => {});
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-md text-white/80 hover:bg-ink-soft hover:text-white"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {count > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${
              overdueCount > 0 ? "bg-rust text-white" : "bg-seal text-ink"
            }`}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 z-20 w-80 bg-white border border-line rounded-card shadow-lg py-2">
            <div className="flex items-center justify-between px-3.5 py-1.5">
              <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">
                À faire ({count}{tronquee ? "+" : ""})
              </div>
              {count > 0 && (
                <button type="button" onClick={clearAll} className="text-[11px] text-slate hover:text-ink underline decoration-line">
                  Tout effacer
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {tasks.map((t) => (
                <Link
                  key={taskKey(t)}
                  href={t.href}
                  onClick={() => setOpen(false)}
                  className="flex flex-col gap-0.5 px-3.5 py-2 hover:bg-linen"
                >
                  <div className="text-[12px] text-ink font-medium">{t.contactName}</div>
                  <div className="text-[11.5px] text-slate">
                    {t.overdue && <span className="text-rust font-medium">En retard — </span>}
                    {t.label}
                  </div>
                </Link>
              ))}
              {count === 0 && <div className="px-3.5 py-3 text-[12px] text-slate">Rien à faire pour le moment.</div>}
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
