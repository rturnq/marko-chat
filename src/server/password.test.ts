import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

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

  it("stores an encoded argon2id hash, with its salt and settings", async () => {
    expect(await hashPassword("x")).toMatch(
      /^\$argon2id\$v=19\$m=4096,t=1,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
    );
  });

  it("matches composed and decomposed characters alike", async () => {
    const hash = await hashPassword("café");
    expect(await verifyPassword("café", hash)).toBe(true);
  });

  it("never verifies without a hash", async () => {
    expect(await verifyPassword("", undefined)).toBe(false);
    expect(await verifyPassword("", null)).toBe(false);
    expect(await verifyPassword("anything", "not a hash")).toBe(false);
  });
});
