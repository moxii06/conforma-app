import { describe, expect, it } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  extractBearerToken,
  hasScope,
  isKeyUsable,
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
} from "./apiKeys";

// This module decides whether an unauthenticated HTTP call gets to read a
// tenant's data. Every case below is a way that decision could go wrong.

describe("generateApiKey", () => {
  it("never returns the same key twice", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateApiKey().plain));
    expect(keys.size).toBe(200);
  });

  it("produces a hash that matches the plain key, and a prefix that is only a fragment", () => {
    const k = generateApiKey();
    expect(k.hash).toBe(hashApiKey(k.plain));
    expect(k.plain.startsWith(k.prefix)).toBe(true);
    // The stored prefix must not be enough to reconstruct the key.
    expect(k.prefix.length).toBeLessThan(k.plain.length);
  });

  it("does not store the key itself anywhere in the hash", () => {
    const k = generateApiKey();
    expect(k.hash).not.toContain(k.plain);
  });
});

describe("extractBearerToken", () => {
  it("accepts a well-formed header", () => {
    const k = generateApiKey();
    expect(extractBearerToken(`Bearer ${k.plain}`)).toBe(k.plain);
  });

  it("is case-insensitive on the scheme and tolerates surrounding spaces", () => {
    const k = generateApiKey();
    expect(extractBearerToken(`  bearer   ${k.plain}  `)).toBe(k.plain);
  });

  it("refuses anything malformed rather than guessing", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    // A token that isn't one of ours — no point hitting the database for it.
    expect(extractBearerToken("Bearer sk_live_something_else")).toBeNull();
  });
});

describe("hasScope", () => {
  it("requires the scope to be granted explicitly", () => {
    expect(hasScope(["read:dossiers"], "read:dossiers")).toBe(true);
    expect(hasScope(["read:dossiers"], "read:invoices")).toBe(false);
  });

  it("grants nothing to a key with no scopes", () => {
    expect(hasScope([], "read:contacts")).toBe(false);
  });
});

describe("isKeyUsable", () => {
  it("rejects a revoked key", () => {
    expect(isKeyUsable({ revokedAt: null })).toBe(true);
    expect(isKeyUsable({ revokedAt: new Date("2026-01-01") })).toBe(false);
  });
});

describe("webhook signatures", () => {
  it("verifies a signature produced with the same secret", () => {
    const secret = generateWebhookSecret();
    const payload = JSON.stringify({ event: "invoice.paid", id: "inv_1" });
    expect(verifyWebhookSignature(payload, secret, signWebhookPayload(payload, secret))).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    const payload = JSON.stringify({ event: "invoice.paid" });
    const signature = signWebhookPayload(payload, generateWebhookSecret());
    expect(verifyWebhookSignature(payload, generateWebhookSecret(), signature)).toBe(false);
  });

  it("rejects a tampered payload — the whole point of signing", () => {
    const secret = generateWebhookSecret();
    const signature = signWebhookPayload(JSON.stringify({ amount: 100 }), secret);
    expect(verifyWebhookSignature(JSON.stringify({ amount: 999999 }), secret, signature)).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    const secret = generateWebhookSecret();
    const payload = "{}";
    expect(verifyWebhookSignature(payload, secret, "")).toBe(false);
    expect(verifyWebhookSignature(payload, secret, "trop-court")).toBe(false);
  });
});
