import { Milestone } from "lucide-react";

// Shared by every learner-facing header that should carry the OFP's own
// identity instead of Jalon's — the public token pages (recueil des
// besoins, satisfaction, activation) and the authenticated Sidebar when
// viewed by a LEARNER. Falls back to the same Milestone-mark-in-a-box
// used everywhere else in the product when the org hasn't set a logo/color,
// so an OFP that hasn't configured branding sees no visible change.
export function BrandedLogo({
  name,
  logoUrl,
  brandColor,
  size = 28,
  iconSize = 16,
}: {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  size?: number;
  iconSize?: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name}
          style={{ width: size, height: size }}
          className="rounded-md object-contain shrink-0"
        />
      ) : (
        <div
          className={`rounded-md flex items-center justify-center shrink-0 ${brandColor ? "" : "bg-seal"}`}
          style={{ width: size, height: size, backgroundColor: brandColor || undefined }}
        >
          <Milestone size={iconSize} className="text-ink" strokeWidth={2.4} />
        </div>
      )}
      <div className="font-display text-lg text-ink">{name}</div>
    </div>
  );
}
