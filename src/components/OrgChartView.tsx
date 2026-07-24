import type { OrgChartGroups } from "@/lib/orgChart";

// Pure presentational box-grouping layout — shared by the live
// "Organigramme" tab and the read-only archived-snapshot page, so an old
// snapshot renders exactly like the live view did at capture time.
export function OrgChartView({ organizationName, groups }: { organizationName: string; groups: OrgChartGroups }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="text-[13.5px] font-semibold text-ink px-4 py-2 border-2 border-ink rounded-md">{organizationName}</div>
      <div className="w-px h-5 bg-line" />

      <div className="text-[11px] text-slate uppercase tracking-wide font-semibold">Équipe interne</div>
      {groups.roleGroups.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-4 w-full">
          {groups.roleGroups.map((g) => (
            <div key={g.key} className="bg-[#FAF9F6] border border-line rounded-md p-3 min-w-[180px] flex flex-col gap-1.5">
              <div className="text-[11.5px] font-semibold text-ink">
                {g.label} <span className="text-slate font-normal">({g.people.length})</span>
              </div>
              {g.people.map((p) => (
                <div key={p.id} className="text-[12px] text-ink">
                  {p.name}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-slate">Aucun membre.</div>
      )}

      <div className="w-full border-t border-line my-1" />

      <div className="text-[11px] text-slate uppercase tracking-wide font-semibold">Sous-traitants & prestataires</div>
      {groups.typeGroups.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-4 w-full">
          {groups.typeGroups.map((g) => (
            <div key={g.key} className="bg-[#FAF9F6] border border-line rounded-md p-3 min-w-[180px] flex flex-col gap-1.5">
              <div className="text-[11.5px] font-semibold text-ink">
                {g.label} <span className="text-slate font-normal">({g.people.length})</span>
              </div>
              {g.people.map((p) => (
                <div key={p.id} className="text-[12px] text-ink">
                  {p.name}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-slate">Aucun sous-traitant enregistré.</div>
      )}
    </div>
  );
}
