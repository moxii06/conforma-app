import { describe, it, expect } from "vitest";
import { formatInvoiceReference } from "@/lib/invoiceNumberFormat";

// L'aperçu de l'écran de réglage et la référence réellement posée sur la
// facture passent par cette fonction : si elles divergeaient, l'organisme
// réglerait sa numérotation sur un exemple qui ment.
describe("formatInvoiceReference", () => {
  it("complète sur trois chiffres", () => {
    expect(formatInvoiceReference("FAC-2026-", 47)).toBe("FAC-2026-047");
    expect(formatInvoiceReference("FAC-2026-", 1)).toBe("FAC-2026-001");
  });

  it("ne tronque pas au-delà de trois chiffres", () => {
    expect(formatInvoiceReference("FAC-", 1234)).toBe("FAC-1234");
  });

  it("reprend le préfixe tel quel, séparateur compris ou non", () => {
    expect(formatInvoiceReference("2026/F", 8)).toBe("2026/F008");
    expect(formatInvoiceReference("F", 8)).toBe("F008");
    // Préfixe vide : l'API le refuse (il repasse en automatique), mais la
    // fonction reste totale plutôt que de renvoyer NaN ou undefined.
    expect(formatInvoiceReference("", 8)).toBe("008");
  });
});
