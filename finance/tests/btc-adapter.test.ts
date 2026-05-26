/**
 * BTC adapter input classification.
 *
 * The original bug: pasting an xpub into the adapter hit /api/address/{xpub},
 * which 404s (xpub isn't an address) and our code returned 0. HD-wallet users
 * saw quantity 0 forever even with funded wallets. The fix needs:
 *   - xpub-shaped inputs route to the xpub endpoint, not the address endpoint
 *   - private-key shapes (xprv/yprv/zprv) are REFUSED — defence in depth
 *   - plain addresses keep the old code path
 */
import { describe, it, expect } from "vitest";
import { isExtendedPublicKey, isExtendedPrivateKey } from "@/lib/bank/crypto/btc";

describe("BTC input classifiers", () => {
  describe("isExtendedPublicKey", () => {
    it("accepts xpub (legacy P2PKH)", () => {
      expect(isExtendedPublicKey(
        "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz",
      )).toBe(true);
    });
    it("accepts ypub (P2SH-wrapped segwit)", () => {
      expect(isExtendedPublicKey(
        "ypub6Ww3ibxVfGzLrAH1PNcjyAWenMTbbAosGNB6VvmSEgytSER9azLDWCxoJwW7Ke7icmizBMXrzBx9979FfaHxHcrArf3zbeJJJUZPf663zsP",
      )).toBe(true);
    });
    it("accepts zpub (native segwit / bech32)", () => {
      expect(isExtendedPublicKey(
        "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs",
      )).toBe(true);
    });
    it("accepts Zpub multisig prefix", () => {
      // Capital Z is the multisig native-segwit variant — mempool supports it.
      expect(isExtendedPublicKey(
        "Zpub75dvNkn6dpsKXPbgjMq6kpd1cnxxAaaWodvi2Pj4dKr3eX7vKsW7H3PVjQDdrkD3iWzShnE5JZcvTRGNUz9tFsm4QqxAhBLrLB5ME5x9C5w",
      )).toBe(true);
    });
    it("rejects a plain bech32 address", () => {
      expect(isExtendedPublicKey("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe(false);
    });
    it("rejects a legacy P2PKH address", () => {
      expect(isExtendedPublicKey("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe(false);
    });
    it("rejects an xprv (private key)", () => {
      expect(isExtendedPublicKey(
        "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi",
      )).toBe(false);
    });
    it("rejects empty / short garbage", () => {
      expect(isExtendedPublicKey("")).toBe(false);
      expect(isExtendedPublicKey("xpub")).toBe(false);
      expect(isExtendedPublicKey("xpub" + "z".repeat(80))).toBe(false); // too short
    });
  });

  describe("isExtendedPrivateKey", () => {
    it("flags xprv / yprv / zprv", () => {
      expect(isExtendedPrivateKey(
        "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi",
      )).toBe(true);
      expect(isExtendedPrivateKey(
        "yprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi",
      )).toBe(true);
      expect(isExtendedPrivateKey(
        "zprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi",
      )).toBe(true);
    });
    it("does NOT flag xpub variants", () => {
      expect(isExtendedPrivateKey(
        "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz",
      )).toBe(false);
    });
    it("does NOT flag plain addresses", () => {
      expect(isExtendedPrivateKey("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe(false);
    });
  });
});
