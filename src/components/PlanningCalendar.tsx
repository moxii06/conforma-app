import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  addMonths,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";

type SessionItem = { id: string; startsAt: Date; courseTitle: string };

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function PlanningCalendar({ month, sessions }: { month: Date; sessions: SessionItem[] }) {
  const monthStart = startOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const prevMonth = format(subMonths(monthStart, 1), "yyyy-MM");
  const nextMonth = format(addMonths(monthStart, 1), "yyyy-MM");

  return (
    <div className="bg-white border border-line rounded-card p-4">
      <div className="flex items-center justify-between mb-3.5">
        <div className="text-[14px] font-semibold text-ink capitalize">{format(monthStart, "MMMM yyyy", { locale: fr })}</div>
        <div className="flex items-center gap-2 text-[12.5px]">
          <Link href={`/planning?tab=calendrier&month=${prevMonth}`} className="text-slate hover:text-ink px-2 py-1">
            ← Précédent
          </Link>
          <Link href={`/planning?tab=calendrier&month=${format(new Date(), "yyyy-MM")}`} className="text-slate hover:text-ink px-2 py-1">
            Aujourd&apos;hui
          </Link>
          <Link href={`/planning?tab=calendrier&month=${nextMonth}`} className="text-slate hover:text-ink px-2 py-1">
            Suivant →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-line border border-line rounded-md overflow-hidden text-[11px]">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-[#F1EFE8] text-slate font-semibold uppercase tracking-wide px-2 py-1.5 text-center">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const inMonth = isSameMonth(day, monthStart);
          const daySessions = sessions.filter((s) => isSameDay(s.startsAt, day));
          return (
            <div key={day.toISOString()} className={`bg-white min-h-[76px] p-1.5 flex flex-col gap-1 ${inMonth ? "" : "bg-[#FBFAF7]"}`}>
              <div className={`text-[10.5px] ${inMonth ? "text-ink" : "text-[#C9C4B5]"}`}>{format(day, "d")}</div>
              {daySessions.slice(0, 3).map((s) => (
                <Link
                  key={s.id}
                  href={`/planning/${s.id}`}
                  className="bg-[#EFE9DA] text-ink rounded px-1 py-0.5 truncate hover:bg-seal hover:text-white"
                  title={s.courseTitle}
                >
                  {format(s.startsAt, "HH:mm")} {s.courseTitle}
                </Link>
              ))}
              {daySessions.length > 3 && <div className="text-[10px] text-slate">+{daySessions.length - 3} de plus</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
