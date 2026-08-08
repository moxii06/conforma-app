import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, can, canAccessSecureReports } from "@/lib/tenant";
import { uploadSupportProof, deleteModuleFile } from "@/lib/storage";
import { streamStoredFile } from "@/lib/blobStream";
import type { SupportKind } from "@/lib/supportRequests";

/**
 * La pièce justificative d'un traitement — Complaint/SecureReport
 * `proofFileUrl` + `proofFileName`.
 *
 * La note écrite existait déjà (`resolutionNotes` / `escalationNotes`) ; ce
 * qui manquait, c'est le document qui la prouve : le courrier de réponse
 * envoyé, le compte rendu d'entretien, l'attestation. Un auditeur Qualiopi qui
 * demande « montrez-moi comment cette réclamation a été traitée » n'attend pas
 * une phrase saisie dans un champ.
 *
 * Une seule route pour les deux familles parce que la mécanique est
 * strictement la même — seuls le contrôle d'accès et la table changent, et
 * les deux tiennent en une ligne chacun. Le magasin est privé (voir
 * lib/storage.ts) : l'URL du blob n'ouvre rien toute seule, la lecture passe
 * par le GET ci-dessous qui revérifie les droits.
 */

// 10 Mo : un compte rendu ou un courrier scanné, pas une vidéo.
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

function estKindValide(valeur: string): valeur is SupportKind {
  return valeur === "complaints" || valeur === "secure-reports";
}

type Autorisation =
  | { erreur: NextResponse }
  | {
      erreur?: undefined;
      kind: SupportKind;
      organizationId: string;
      record: { id: string; proofFileUrl: string | null; proofFileName: string | null };
    };

/**
 * Contrôle d'accès + relecture de l'enregistrement.
 *
 * L'identifiant vient du navigateur : la demande est systématiquement relue
 * depuis la base avec `organizationId`, jamais tenue pour acquise. Les deux
 * portes sont exactement celles des écrans qui affichent déjà ces demandes —
 * `dossiers` pour les réclamations, canAccessSecureReports pour le canal
 * confidentiel.
 */
async function autoriser(kindBrut: string, id: string): Promise<Autorisation> {
  if (!estKindValide(kindBrut)) {
    return { erreur: NextResponse.json({ error: "Type de demande inconnu." }, { status: 404 }) };
  }
  const session = await getSessionContext();
  if (!session) return { erreur: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };

  const autorise =
    kindBrut === "complaints" ? can(session.roles, "dossiers") !== "none" : canAccessSecureReports(session.roles);
  if (!autorise) {
    return { erreur: NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 }) };
  }

  const select = { id: true, proofFileUrl: true, proofFileName: true } as const;
  const record =
    kindBrut === "complaints"
      ? await prisma.complaint.findFirst({ where: { id, organizationId: session.organizationId }, select })
      : await prisma.secureReport.findFirst({ where: { id, organizationId: session.organizationId }, select });
  if (!record) return { erreur: NextResponse.json({ error: "Demande introuvable." }, { status: 404 }) };

  return { kind: kindBrut, organizationId: session.organizationId, record };
}

async function enregistrerPreuve(
  kind: SupportKind,
  id: string,
  data: { proofFileUrl: string | null; proofFileName: string | null },
) {
  if (kind === "complaints") await prisma.complaint.update({ where: { id }, data });
  else await prisma.secureReport.update({ where: { id }, data });
}

export async function GET(_request: Request, props: { params: Promise<{ kind: string; id: string }> }) {
  const params = await props.params;
  const acces = await autoriser(params.kind, params.id);
  if (acces.erreur) return acces.erreur;
  if (!acces.record.proofFileUrl) {
    return NextResponse.json({ error: "Aucune preuve de traitement." }, { status: 404 });
  }
  return streamStoredFile(acces.record.proofFileUrl, {
    downloadName: acces.record.proofFileName ?? "preuve-de-traitement",
  });
}

export async function POST(request: Request, props: { params: Promise<{ kind: string; id: string }> }) {
  const params = await props.params;
  const acces = await autoriser(params.kind, params.id);
  if (acces.erreur) return acces.erreur;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (10 Mo maximum)." }, { status: 400 });
  }

  let uploaded: { url: string; fileName: string };
  try {
    uploaded = await uploadSupportProof({
      organizationId: acces.organizationId,
      kind: acces.kind,
      itemId: acces.record.id,
      file,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur d'upload." }, { status: 502 });
  }

  // Le remplacement efface l'ancien fichier : une preuve corrigée ne doit pas
  // laisser derrière elle une version que plus aucun écran ne montre mais que
  // le magasin conserve indéfiniment.
  const ancien = acces.record.proofFileUrl;
  await enregistrerPreuve(acces.kind, acces.record.id, {
    proofFileUrl: uploaded.url,
    proofFileName: uploaded.fileName,
  });
  if (ancien) await deleteModuleFile(ancien);

  return NextResponse.json({ proofFileUrl: uploaded.url, proofFileName: uploaded.fileName }, { status: 201 });
}

export async function DELETE(_request: Request, props: { params: Promise<{ kind: string; id: string }> }) {
  const params = await props.params;
  const acces = await autoriser(params.kind, params.id);
  if (acces.erreur) return acces.erreur;

  const ancien = acces.record.proofFileUrl;
  await enregistrerPreuve(acces.kind, acces.record.id, { proofFileUrl: null, proofFileName: null });
  if (ancien) await deleteModuleFile(ancien);

  return NextResponse.json({ ok: true });
}
