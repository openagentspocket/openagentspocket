import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { privacyPage } from "../src/privacy.js";

describe("privacy policy", () => {
  test("discloses update checks in both languages", async () => {
    const html = await privacyPage({ PRIVACY_CONTACT: "privacy@example.com" }).text();
    assert.match(html, /<h2>App updates<\/h2>/);
    assert.match(html, /<h2>Actualizaciones de la app<\/h2>/);
    assert.match(html, /does not log or store any of it/);
    assert.match(html, /no registra ni guarda nada/);
    assert.match(html, /Last updated 2026-11-14/);
  });
});
