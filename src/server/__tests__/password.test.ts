import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password";

describe("passwords", () => {
  it("verifies the password it hashed", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong horse", hash)).toBe(false);
  });

  it("salts each hash", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same"),
      hashPassword("same"),
    ]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });

  it("stores an encoded scrypt hash, with its salt and settings", async () => {
    expect(await hashPassword("x")).toMatch(
      /^\$scrypt\$ln=12,r=8,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
  });

  it("verifies with the settings stored in the hash", async () => {
    const hash = (await hashPassword("correct horse")).replace(
      "ln=12",
      "ln=11",
    );
    expect(await verifyPassword("correct horse", hash)).toBe(false);
  });

  it("matches composed and decomposed characters alike", async () => {
    const hash = await hashPassword("café");
    expect(await verifyPassword("café", hash)).toBe(true);
  });

  it("never verifies without a hash", async () => {
    expect(await verifyPassword("", undefined)).toBe(false);
    expect(await verifyPassword("", null)).toBe(false);
    expect(await verifyPassword("anything", "not a hash")).toBe(false);
    expect(await verifyPassword("", "$scrypt$ln=12,r=8,p=1$AAAA$A")).toBe(
      false,
    );
  });
});
