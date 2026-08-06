"use client";

import { useMemo, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { contientImagesDistantes, retablirImagesDistantes } from "@/lib/emailHtml";

// Le corps d'un e-mail reçu, tel qu'il a été envoyé.
//
// Rendu dans une iframe `sandbox` VIDE : pas d'allow-scripts, pas
// d'allow-same-origin, pas d'allow-forms. Trois raisons, dans cet ordre :
//
//  1. Rien ne s'exécute. Le HTML a déjà été assaini au stockage
//     (lib/emailHtml.ts), mais il vient d'inconnus et s'affiche chez un
//     organisme connecté à ses données clients : une seule barrière ne suffit
//     pas pour ça.
//  2. Le CSS de l'e-mail reste chez lui. Une feuille de style d'e-mail pose
//     volontiers `body { margin:0 }` ou des largeurs fixes ; injectée dans la
//     page, elle déformerait l'application autour.
//  3. Réciproquement, nos styles ne déforment pas l'e-mail — il s'affiche
//     comme dans une vraie messagerie, ce qui est tout l'objet.
//
// Le prix à payer : une iframe ne se redimensionne pas toute seule sur son
// contenu, et sans allow-same-origin on ne peut pas mesurer ce contenu depuis
// l'extérieur. D'où une hauteur fixe avec défilement interne, comme le volet
// de lecture d'un client de messagerie.
export function EmailBodyView({
  html,
  texte,
  className = "",
}: {
  html: string | null;
  texte: string | null;
  className?: string;
}) {
  const [imagesAffichees, setImagesAffichees] = useState(false);

  const aDesImages = useMemo(() => (html ? contientImagesDistantes(html) : false), [html]);
  const document = useMemo(() => {
    if (!html) return null;
    const corps = imagesAffichees ? retablirImagesDistantes(html) : html;
    // Le squelette autour du corps : encodage explicite (sans quoi un e-mail
    // en latin-1 affiche « Vérif » en « V?rif ») et une base typographique
    // pour les messages qui n'apportent aucun style — sinon le navigateur
    // rendrait du Times 16px au milieu de l'application.
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body{margin:0;padding:0;background:#fff;}
  body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;word-break:break-word;}
  /* Un e-mail bâti pour 600 px de large ne doit pas imposer une barre de
     défilement horizontale dans un volet plus étroit. */
  img,table{max-width:100%;}
  img{height:auto;}
  a{color:#0b5cad;}
</style></head><body>${corps}</body></html>`;
  }, [html, imagesAffichees]);

  // Pas de version HTML — un message en texte seul, ou une ligne composée
  // ici. On garde ses retours à la ligne plutôt que de fabriquer du faux HTML.
  if (!document) {
    return (
      <div className={`text-[12.5px] text-ink leading-relaxed whitespace-pre-wrap ${className}`}>{texte ?? ""}</div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Le bandeau ne ment pas sur la raison : ce n'est pas de la lenteur,
          c'est que charger ces images préviendrait l'expéditeur que le message
          a été ouvert, avec l'heure et l'adresse IP. */}
      {aDesImages && !imagesAffichees && (
        <div className="flex items-center gap-2 flex-wrap border border-line rounded-md bg-mist px-2.5 py-1.5">
          <ImageIcon size={13} className="text-slate shrink-0" />
          <span className="text-[11.5px] text-slate flex-1 min-w-0">
            Images bloquées — les charger signalerait à l&apos;expéditeur que vous avez ouvert ce message.
          </span>
          <button
            type="button"
            onClick={() => setImagesAffichees(true)}
            className="shrink-0 text-[11.5px] font-medium text-ink underline decoration-line hover:decoration-ink"
          >
            Afficher les images
          </button>
        </div>
      )}
      <iframe
        // Le changement de clé force un rechargement propre au lieu d'un
        // srcDoc réécrit sur une page déjà rendue.
        key={imagesAffichees ? "avec-images" : "sans-images"}
        srcDoc={document}
        sandbox=""
        title="Contenu du message"
        className="w-full h-[420px] border border-line rounded-md bg-white"
      />
    </div>
  );
}
