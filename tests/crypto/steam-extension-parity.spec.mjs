// Smoke test: extension Steam Guard code must match the web app's, byte-for-byte.
//
// Regression guard for the bug where the extension treated `otp_type: "steam"`
// as a plain 6-digit TOTP and thus filled the wrong code into the page.
//
// We reimport the web-app generator and mirror the extension's exact routine
// (copied from extension/src/background.ts). If they diverge for any T-slot
// this test fails loudly.

import { describe, it, expect } from "vitest";
import * as OTPAuth from "otpauth";
import { generateCode as webGenerate } from "../../src/lib/vault-accounts.ts";

const STEAM_ALPHABET = "23456789BCDFGHJKMNPQRTVWXY";
const STEAM_PERIOD = 30;

// Mirror of extension/src/background.ts::generateSteamCode
function extGenerateSteam(secretBase32, at) {
  const hotp = new OTPAuth.HOTP({
    algorithm: "SHA1",
    digits: 10,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  const T = Math.floor(at / 1000 / STEAM_PERIOD);
  let value = Number.parseInt(hotp.generate({ counter: T }), 10);
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += STEAM_ALPHABET[value % STEAM_ALPHABET.length];
    value = Math.floor(value / STEAM_ALPHABET.length);
  }
  return out;
}

const secrets = [
  "JBSWY3DPEHPK3PXP",
  "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  "KRSXG5CTMVRXEZLU",
];

describe("Steam OTP parity — extension vs web", () => {
  for (const secret of secrets) {
    it(`matches for secret ${secret}`, () => {
      // Sample several time slots (past, present, future) so we cover
      // multiple T counters, not just whatever slot we happen to be in.
      const now = Date.now();
      for (const offset of [-90_000, -30_000, 0, 30_000, 90_000, 3_600_000]) {
        const at = now + offset;
        const web = webGenerate(
          {
            id: "x",
            issuer: "Steam",
            label: "test",
            secret,
            algorithm: "SHA1",
            digits: 5,
            period: STEAM_PERIOD,
            otp_type: "steam",
          },
          at,
        );
        const ext = extGenerateSteam(secret, at);
        expect(ext).toBe(web);
        expect(ext).toMatch(/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/);
      }
    });
  }

  it("is deterministic within the same 30s slot", () => {
    const secret = secrets[0];
    const t = 1_800_000_000_000;
    expect(extGenerateSteam(secret, t)).toBe(extGenerateSteam(secret, t + 5_000));
  });
});
