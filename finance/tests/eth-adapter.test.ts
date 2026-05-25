import { describe, it, expect } from "vitest";
import { hexWeiToEth } from "@/lib/bank/crypto/eth";

describe("hexWeiToEth", () => {
  it("converts 0 to 0", () => {
    expect(hexWeiToEth("0x0").toString()).toBe("0");
  });

  it("converts 1 ETH worth of wei", () => {
    // 1 ETH = 1e18 wei = 0xDE0B6B3A7640000
    expect(hexWeiToEth("0xDE0B6B3A7640000").toFixed(0)).toBe("1");
  });

  it("preserves sub-ETH precision (0.0001 ETH = 1e14 wei = 0x5af3107a4000)", () => {
    const eth = hexWeiToEth("0x5af3107a4000");
    expect(eth.toFixed(4)).toBe("0.0001");
  });

  it("handles very large balances without overflow (BigInt path)", () => {
    // 1,000,000 ETH in wei
    const wei = (10n ** 24n).toString(16);
    expect(hexWeiToEth("0x" + wei).toFixed(0)).toBe("1000000");
  });

  it("throws on garbage input", () => {
    expect(() => hexWeiToEth("")).toThrow();
    expect(() => hexWeiToEth("not-hex")).toThrow();
  });
});
