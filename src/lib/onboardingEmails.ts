import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail, isBrevoConfigured } from "@/lib/brevo";

// ---------------------------------------------------------------------------
// Séquence d'onboarding d'essai (activation) — le marketing PROPRE de Jalon,
// pas les relances qu'un OF envoie à ses clients (celles-là vivent dans
// automationRules.ts). L'émetteur est donc "Jalon", pas le nom de l'organisme.
//
// Objectif : transformer un inscrit en essai en utilisateur RÉELLEMENT actif
// (créer une formation, planifier une session, voir ses preuves Qualiopi se
// remplir) avant la fin des 14 jours. Messages honnêtes et non trompeurs :
// aucune promesse d'obtention/maintien de Qualiopi, de financement ou de
// réussite d'audit — uniquement ce que l'outil aide concrètement à faire.
//
// IDEMPOTENCE SANS ÉTAT EN BASE : le cron (/api/cron/automation-rules) tourne
// exactement une fois par 24 h. `elapsedDays = floor((now - createdAt)/24h)`
// augmente donc d'exactement +1 à chaque exécution : chaque `dayOffset` est
// atteint par une seule exécution. Un envoi "au jour-J exact" suffit donc à
// garantir un envoi unique par étape, sans colonne de suivi ni migration.
// (Limite connue : un déclenchement manuel répété du cron le même jour, ou une
// interruption prolongée du cron, peut dupliquer/omettre un envoi. Si un jour
// une garantie plus forte est requise, ajouter un champ `onboardingStage` sur
// Subscription et suivre l'étape explicitement.)
// ---------------------------------------------------------------------------

export type OnboardingContext = {
  firstName: string;
  orgName: string;
  baseUrl: string;
};

type OnboardingStep = {
  dayOffset: number; // jours après l'inscription (0 = jour de l'inscription)
  subject: (c: OnboardingContext) => string;
  // Corps HTML riche + version texte (part alternative exigée par Brevo).
  intro: (c: OnboardingContext) => string;
  cta: { label: string; path: string } | null;
  outro: (c: OnboardingContext) => string;
};

const TRIAL_DAYS = 14;

// Enveloppe HTML minimale, styles inline (compatibilité clients mail).
function wrapHtml(c: OnboardingContext, bodyHtml: string, cta: OnboardingStep["cta"]): string {
  const button = cta
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${c.baseUrl}${cta.path}" style="display:inline-block;background:#1C2B3A;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:6px;">${cta.label}</a>
       </td></tr>`
    : "";
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F5EF;padding:24px 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#222;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #D9D2C4;border-radius:10px;">
        <tr><td style="padding:24px 28px 8px;">
          <div style="font-size:18px;font-weight:700;color:#1C2B3A;letter-spacing:.5px;">Jalon</div>
        </td></tr>
        <tr><td style="padding:4px 28px 20px;font-size:14px;line-height:1.6;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>${bodyHtml}</td></tr>${button}</table>
        </td></tr>
        <tr><td style="padding:14px 28px 22px;border-top:1px solid #EDDFC6;font-size:11.5px;color:#5A6672;line-height:1.5;">
          Vous recevez cet email parce que vous avez ouvert un essai gratuit de Jalon (${c.orgName}).
          Une question&nbsp;? Répondez simplement à ce message, une vraie personne vous lira.
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

function toText(c: OnboardingContext, intro: string, cta: OnboardingStep["cta"], outro: string): string {
  const parts = [intro.replace(/<[^>]+>/g, "")];
  if (cta) parts.push(`${cta.label} : ${c.baseUrl}${cta.path}`);
  parts.push(outro.replace(/<[^>]+>/g, ""));
  parts.push(`\n— L'équipe Jalon\nUne question ? Répondez à cet email.`);
  return parts.join("\n\n");
}

// La séquence. dayOffset 0 = email de bienvenue envoyé à l'inscription
// (sendWelcomeEmail, depuis /api/signup) ; les suivants partent du cron.
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    dayOffset: 0,
    subject: (c) => `Bienvenue sur Jalon, ${c.firstName} 👋`,
    intro: (c) =>
      `<p style="margin:0 0 12px;">Bonjour ${c.firstName},</p>
       <p style="margin:0 0 12px;">Votre espace <strong>${c.orgName}</strong> est prêt. Vous avez ${TRIAL_DAYS} jours pour tout tester, sans carte bancaire.</p>
       <p style="margin:0 0 12px;">Le meilleur point de départ&nbsp;: <strong>créer ou importer une première formation</strong>. Tout le reste (sessions, dossiers, preuves Qualiopi) se construit ensuite à partir de là.</p>`,
    cta: { label: "Créer ma première formation", path: "/formations" },
    outro: () => `<p style="margin:12px 0 0;">Je reviens vers vous demain avec l'étape suivante.</p>`,
  },
  {
    dayOffset: 1,
    subject: () => `L'étape qui fait tout comprendre (2 min)`,
    intro: (c) =>
      `<p style="margin:0 0 12px;">Bonjour ${c.firstName},</p>
       <p style="margin:0 0 12px;">Pour voir Jalon "en action", planifiez une <strong>première session</strong> et inscrivez-y un apprenant (même fictif). Vous verrez son <strong>dossier se remplir tout seul</strong>&nbsp;: parcours, convocation, documents.</p>
       <p style="margin:0 0 12px;">C'est ce qui alimente ensuite, sans ressaisie, votre BPF et vos preuves Qualiopi.</p>`,
    cta: { label: "Planifier une session", path: "/planning" },
    outro: () => "",
  },
  {
    dayOffset: 3,
    subject: () => `Vos preuves Qualiopi, sans les reconstituer la veille`,
    intro: (c) =>
      `<p style="margin:0 0 12px;">Bonjour ${c.firstName},</p>
       <p style="margin:0 0 12px;">Dans Jalon, les <strong>32 indicateurs Qualiopi</strong> se suivent en continu&nbsp;: à mesure que vous gérez vos sessions et vos dossiers, les preuves attendues se rattachent au bon indicateur.</p>
       <p style="margin:0 0 12px;">Jetez un œil à votre tableau Qualiopi pour voir où vous en êtes.</p>
       <p style="margin:0 0 12px;font-size:12.5px;color:#5A6672;">Jalon aide à centraliser et préparer vos preuves — il ne garantit ni l'obtention ni le maintien de la certification, qui restent du ressort de votre auditeur.</p>`,
    cta: { label: "Voir mon suivi Qualiopi", path: "/qualiopi" },
    outro: () => "",
  },
  {
    dayOffset: 7,
    subject: (c) => `Mi-parcours : 3 réglages qui changent tout, ${c.firstName}`,
    intro: (c) =>
      `<p style="margin:0 0 12px;">Bonjour ${c.firstName},</p>
       <p style="margin:0 0 10px;">Il vous reste une semaine d'essai. Trois réglages rapides pour en tirer le maximum&nbsp;:</p>
       <ul style="margin:0 0 12px;padding-left:18px;">
         <li style="margin-bottom:6px;">Invitez vos formateurs / collègues (chacun son espace et ses droits).</li>
         <li style="margin-bottom:6px;">Connectez votre boîte mail pour centraliser les échanges dans les dossiers.</li>
         <li style="margin-bottom:6px;">Adaptez vos modèles de documents (convention, convocation, évaluations).</li>
       </ul>`,
    cta: { label: "Inviter mon équipe", path: "/team" },
    outro: () =>
      `<p style="margin:10px 0 0;font-size:12.5px;color:#5A6672;">Connexion boîte mail et intégrations&nbsp;: rubrique "Intégrations" de votre espace.</p>`,
  },
  {
    dayOffset: 10,
    subject: () => `Une question sur votre configuration ?`,
    intro: (c) =>
      `<p style="margin:0 0 12px;">Bonjour ${c.firstName},</p>
       <p style="margin:0 0 12px;">Plus que quelques jours d'essai. Si un point bloque (import de vos formations, paramétrage Qualiopi, RGPD…), on peut en parler&nbsp;: <strong>répondez à cet email</strong> et on cale un court échange ou une démo ciblée.</p>
       <p style="margin:0 0 12px;">Objectif&nbsp;: que vous décidiez en connaissance de cause, pas à moitié configuré.</p>`,
    cta: null,
    outro: () => "",
  },
  {
    dayOffset: 13,
    subject: () => `Votre essai Jalon se termine demain`,
    intro: (c) =>
      `<p style="margin:0 0 12px;">Bonjour ${c.firstName},</p>
       <p style="margin:0 0 12px;">Votre essai gratuit se termine demain. Si Jalon vous fait gagner du temps sur le suivi de vos apprenants et la préparation de vos preuves, vous pouvez choisir votre offre depuis votre espace&nbsp;— sans engagement, résiliable à tout moment.</p>
       <p style="margin:0 0 12px;">Vos données restent en place&nbsp;: vous ne repartez pas de zéro.</p>`,
    cta: { label: "Choisir mon offre", path: "/abonnement" },
    outro: (c) =>
      `<p style="margin:12px 0 0;">Pas encore décidé ? Répondez à cet email, on répond à vos questions sans pression.</p>`,
  },
];

async function sendStep(step: OnboardingStep, ctx: OnboardingContext, to: string, toName?: string): Promise<boolean> {
  const intro = step.intro(ctx);
  const outro = step.outro(ctx);
  const html = wrapHtml(ctx, intro + outro, step.cta);
  try {
    await sendTransactionalEmail({
      to,
      toName,
      subject: step.subject(ctx),
      text: toText(ctx, intro, step.cta, outro),
      html,
      senderName: "Jalon",
    });
    return true;
  } catch {
    // Non-fatal, même logique que les autres envois Brevo de l'app.
    return false;
  }
}

function firstNameOf(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}

// Envoi immédiat de l'email de bienvenue (J0), appelé depuis /api/signup.
export async function sendWelcomeEmail(
  baseUrl: string,
  admin: { email: string; name: string | null; orgName: string }
): Promise<boolean> {
  if (!isBrevoConfigured()) return false;
  const ctx: OnboardingContext = { firstName: firstNameOf(admin.name), orgName: admin.orgName, baseUrl };
  return sendStep(ONBOARDING_STEPS[0], ctx, admin.email, admin.name ?? undefined);
}

// Passe quotidienne : envoie l'étape dont le dayOffset correspond exactement
// au nombre de jours écoulés depuis l'inscription. Appelée par le cron.
export async function runTrialOnboarding(baseUrl: string): Promise<number> {
  if (!isBrevoConfigured()) return 0;

  const now = Date.now();
  const subs = await prisma.subscription.findMany({
    where: { status: "trialing" },
    include: {
      organization: {
        include: {
          users: { where: { role: Role.ADMIN_OF }, orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
    },
  });

  let sent = 0;
  for (const sub of subs) {
    const admin = sub.organization.users[0];
    if (!admin?.email) continue;

    const elapsedDays = Math.floor((now - sub.createdAt.getTime()) / (24 * 3600 * 1000));
    // J0 est envoyé à l'inscription, pas ici (dayOffset > 0 uniquement).
    const step = ONBOARDING_STEPS.find((s) => s.dayOffset > 0 && s.dayOffset === elapsedDays);
    if (!step) continue;

    const ctx: OnboardingContext = {
      firstName: firstNameOf(admin.name),
      orgName: sub.organization.name,
      baseUrl,
    };
    if (await sendStep(step, ctx, admin.email, admin.name ?? undefined)) sent++;
  }
  return sent;
}
