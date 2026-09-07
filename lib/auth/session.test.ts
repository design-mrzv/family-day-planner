import { describe, it, expect, beforeAll } from "vitest";
import { signSession, verifySession } from "./session";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-not-for-production-use-only-in-vitest";
});

describe("session", () => {
  it("підписаний токен верифікується і повертає той самий userId", async () => {
    const token = await signSession("user-123");
    const result = await verifySession(token);
    expect(result).toEqual({ userId: "user-123" });
  });

  it("сміттєвий токен → null", async () => {
    expect(await verifySession("не.токен.зовсім")).toBeNull();
  });

  it("порожній рядок → null", async () => {
    expect(await verifySession("")).toBeNull();
  });

  it("токен, підписаний іншим секретом → null", async () => {
    const token = await signSession("user-123");
    process.env.AUTH_SECRET = "інший-секрет-зовсім-не-такий-як-перший";
    expect(await verifySession(token)).toBeNull();
    process.env.AUTH_SECRET = "test-secret-not-for-production-use-only-in-vitest";
  });
});
