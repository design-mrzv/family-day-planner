import { describe, it, expect } from "vitest";
import { isEmailAllowed } from "./allowlist";

describe("isEmailAllowed", () => {
  it("пускає всіх, коли список не заданий — хибна конфігурація не замикає вхід", () => {
    expect(isEmailAllowed("anyone@example.com", undefined)).toBe(true);
  });

  it("пускає всіх, коли список порожній або з самих пробілів", () => {
    expect(isEmailAllowed("anyone@example.com", "")).toBe(true);
    expect(isEmailAllowed("anyone@example.com", "   ")).toBe(true);
    expect(isEmailAllowed("anyone@example.com", " , , ")).toBe(true);
  });

  it("пускає адресу зі списку", () => {
    expect(isEmailAllowed("me@example.com", "me@example.com")).toBe(true);
  });

  it("не пускає адресу поза списком", () => {
    expect(isEmailAllowed("stranger@example.com", "me@example.com")).toBe(false);
  });

  it("ігнорує регістр — пошта регістронезалежна", () => {
    expect(isEmailAllowed("Me@Example.COM", "me@example.com")).toBe(true);
    expect(isEmailAllowed("me@example.com", "ME@EXAMPLE.COM")).toBe(true);
  });

  it("терпить пробіли й порожні елементи у списку", () => {
    expect(isEmailAllowed("second@example.com", " first@example.com ,, second@example.com ")).toBe(
      true,
    );
  });

  it("не плутає схожі адреси — звірка повна, не за підрядком", () => {
    expect(isEmailAllowed("evil-me@example.com", "me@example.com")).toBe(false);
    expect(isEmailAllowed("me@example.com.attacker.net", "me@example.com")).toBe(false);
  });
});
