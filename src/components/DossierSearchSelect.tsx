"use client";

import { useEffect, useState } from "react";

export type DossierHit = { id: string; label: string };

/**
 * Choisir un dossier de formation sans charger les 8 000 autres.
 *
 * Remplace les `<select>` natifs qui listaient tous les dossiers de
 * l'organisme (audit S7, P1 n°6). Deux modes, selon ce que l'écran sait :
 *
 *  - `contactId` fourni : les dossiers de cette personne sont chargés
 *    d'emblée et présentés tels quels. Une facture est adressée à un client
 *    précis, et son dossier lié lui appartient forcément — inutile de faire
 *    chercher dans toute la base ce qui tient en une à trois lignes.
 *  - sinon : recherche libre débouncée, à partir de deux caractères.
 *
 * Le champ reste facultatif partout où il est utilisé : « Sans dossier lié »
 * est une réponse valable, pas un état d'attente.
 */
export function DossierSearchSelect({
  contactId,
  value,
  onChange,
  emptyLabel = "Sans dossier lié",
}: {
  contactId?: string;
  value: string;
  onChange: (id: string) => void;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DossierHit[]>([]);
  const [chargement, setChargement] = useState(false);
  const [choisi, setChoisi] = useState<DossierHit | null>(null);

  // Mode « dossiers de ce contact » : une seule requête au changement de
  // client, pas une par frappe.
  useEffect(() => {
    if (!contactId) {
      setResults([]);
      return;
    }
    let annule = false;
    setChargement(true);
    fetch(`/api/dossiers/search?contactId=${encodeURIComponent(contactId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!annule) setResults(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!annule) setResults([]);
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [contactId]);

  // Mode recherche libre.
  useEffect(() => {
    if (contactId) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setChargement(true);
      const res = await fetch(`/api/dossiers/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json().catch(() => []);
      setChargement(false);
      setResults(Array.isArray(data) ? data : []);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, contactId]);

  // Le dossier retenu cesse d'exister dès qu'on change de client : le garder
  // afficherait le nom de quelqu'un d'autre sur la facture en cours.
  useEffect(() => {
    setChoisi(null);
    onChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  const champClass =
    "w-full min-w-0 border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-seal";

  if (contactId) {
    if (chargement) return <div className="text-[12px] text-slate py-1.5">Chargement des dossiers…</div>;
    if (results.length === 0) {
      return <div className="text-[12px] text-slate py-1.5">Ce client n&apos;a aucun dossier de formation en cours.</div>;
    }
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={champClass}>
        <option value="">{emptyLabel}</option>
        {results.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
    );
  }

  if (choisi) {
    return (
      <div className="flex items-center gap-2 border border-line rounded-md px-2.5 py-1.5 bg-mist text-[12.5px]">
        <span className="text-ink truncate">{choisi.label}</span>
        <button
          type="button"
          onClick={() => {
            setChoisi(null);
            onChange("");
          }}
          className="ml-auto shrink-0 text-[11.5px] text-slate hover:text-ink underline"
        >
          Changer
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un apprenant ou une formation…"
        className={champClass}
      />
      {query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-line rounded-md shadow-sm max-h-52 overflow-y-auto">
          {chargement && <div className="px-2.5 py-1.5 text-[11.5px] text-slate">Recherche…</div>}
          {!chargement && results.length === 0 && (
            <div className="px-2.5 py-1.5 text-[11.5px] text-slate">Aucun dossier trouvé.</div>
          )}
          {results.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setChoisi(d);
                onChange(d.id);
                setQuery("");
                setResults([]);
              }}
              className="w-full text-left px-2.5 py-1.5 text-[12.5px] text-ink hover:bg-linen"
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
