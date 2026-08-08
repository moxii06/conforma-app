import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext, can } from "@/lib/tenant";
import { reviseDocument } from "@/lib/ai";
import { CATEGORY_LABELS } from "@/lib/documentCategories";

// L'assistant de rédaction de l'écran de création.
//
// Ne persiste RIEN. La proposition remonte au navigateur, s'affiche dans la
// prévisualisation, et l'organisme l'accepte ou la refuse. Même acceptée,
// elle ne devient un document qu'après un « Enregistrer le brouillon »
// explicite. C'est la règle de tout le fichier ai.ts : une sortie d'IA est
// une suggestion qu'un humain relit, jamais une écriture directe — et sur
// un contrat, c'est le seul compromis acceptable.

const schema = z.object({
  bodyText: z.string().min(1).max(200_000),
  instruction: z.string().min(1).max(2000),
  category: z.string().max(60).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional(),
});

export async function POST(request: Request) {
  const auth = await getSessionContext();
  if (!auth) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (can(auth.roles, "dossiers") === "none" && can(auth.roles, "toolkit") === "none") {
    return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Champs invalides." }, { status: 400 });

  try {
    const revision = await reviseDocument({
      bodyText: parsed.data.bodyText,
      instruction: parsed.data.instruction,
      history: parsed.data.history,
      documentKind: CATEGORY_LABELS[parsed.data.category ?? ""] ?? "document administratif",
    });
    return NextResponse.json(revision);
  } catch (e) {
    const brut = e instanceof Error ? e.message : "";
    // Les ennuis de facturation ou de quota sont ceux de JALON, pas de
    // l'organisme. Lui renvoyer « You exceeded your current quota, check
    // your plan and billing details » l'enverrait vérifier un abonnement
    // OpenAI qu'il n'a pas. Il a seulement besoin de savoir que la
    // fonction est indisponible et que son document est intact.
    const interne = /quota|billing|rate limit|insufficient_quota|api key|token/i.test(brut);
    return NextResponse.json(
      {
        error: interne
          ? "Rédaction assistée momentanément indisponible. Votre document n'a pas été modifié — réessayez plus tard ou rédigez la clause à la main."
          : brut || "Échec de la rédaction assistée.",
      },
      { status: 502 },
    );
  }
}
