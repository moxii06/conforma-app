// Helping staff find which OPCO an employer reports to.
//
// OPCO membership follows the convention collective (IDCC), not the NAF
// code — the only authoritative SIRET→OPCO source is France Compétences'
// table, exposed through their "Quel est mon OPCO" tool. History matters
// here: CFA DOCK's old keyless JSON API (the one every ed-tech integration
// used) was shut down and its site now redirects to the France Compétences
// tool, whose data carries an explicit reuse restriction (article R. 6123-35
// du code du travail): automated reuse requires signing their free licence
// first. Until Jalon holds that licence, we do NOT query the tool
// programmatically — we hand staff a link to the official page plus the
// SIRET to check, which is exactly the usage the tool is built for.
//
// If the licence gets signed one day, this file is where the automatic
// lookup plugs back in, behind the same normalizeSiret gate.

export const OFFICIAL_OPCO_TOOL_URL = "https://quel-est-mon-opco.francecompetences.fr/";

/** Strips formatting and validates the shape: exactly 14 digits. */
export function normalizeSiret(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 14 ? digits : null;
}
