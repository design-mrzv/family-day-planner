import { describe, it, expect } from "vitest";
import { validateOutput, extractJson } from "./validate";

const ok = (tasks: unknown) => JSON.stringify({ tasks });

describe("extractJson", () => {
  it("парсить чистий JSON", () => {
    expect(extractJson('{"tasks":[]}')).toEqual({ tasks: [] });
  });

  it("зрізає markdown-огорожу ```json", () => {
    expect(extractJson('```json\n{"tasks":[]}\n```')).toEqual({ tasks: [] });
  });

  it("кидає на не-JSON", () => {
    expect(() => extractJson("це не json")).toThrow();
  });
});

describe("validateOutput", () => {
  it("приймає валідний вивід з усіма варіантами полів", () => {
    const parsed = validateOutput(
      ok([
        { title: "тренування", fixed_time: null, deadline: null, time_hint: null },
        { title: "забрати старшого", fixed_time: "15:00", deadline: null, time_hint: null },
        { title: "оплатити садок", fixed_time: null, deadline: "2026-09-08", time_hint: null },
        { title: "щось приготувати", fixed_time: null, deadline: null, time_hint: "evening" },
      ]),
    );
    expect(parsed.tasks).toHaveLength(4);
    expect(parsed.tasks[1].fixed_time).toBe("15:00");
    expect(parsed.tasks[3].time_hint).toBe("evening");
  });

  it("відхиляє невалідне значення time_hint", () => {
    expect(() =>
      validateOutput(
        ok([{ title: "х", fixed_time: null, deadline: null, time_hint: "night" }]),
      ),
    ).toThrow();
  });

  it("відхиляє відсутнє поле time_hint (strict-схема вимагає його явно)", () => {
    expect(() =>
      validateOutput(ok([{ title: "х", fixed_time: null, deadline: null }])),
    ).toThrow();
  });

  it("приймає порожній список справ", () => {
    expect(validateOutput(ok([])).tasks).toEqual([]);
  });

  it("відхиляє зайве поле duration (LLM не оцінює час)", () => {
    expect(() =>
      validateOutput(ok([{ title: "вечеря", fixed_time: null, deadline: null, duration: 40 }])),
    ).toThrow();
  });

  it("відхиляє відсутнє обовʼязкове поле", () => {
    expect(() => validateOutput(ok([{ title: "вечеря", fixed_time: null }]))).toThrow();
  });

  it("відхиляє порожній/пробільний title", () => {
    expect(() => validateOutput(ok([{ title: "   ", fixed_time: null, deadline: null }]))).toThrow();
  });

  it.each(["9:00", "25:00", "15.00", "3pm", "08:60"])(
    "відхиляє невалідний fixed_time: %s",
    (bad) => {
      expect(() =>
        validateOutput(ok([{ title: "х", fixed_time: bad, deadline: null }])),
      ).toThrow();
    },
  );

  it.each(["2026-9-8", "08-09-2026", "2026/09/08", "завтра"])(
    "відхиляє невалідний deadline: %s",
    (bad) => {
      expect(() =>
        validateOutput(ok([{ title: "х", fixed_time: null, deadline: bad }])),
      ).toThrow();
    },
  );

  it("відхиляє битий JSON", () => {
    expect(() => validateOutput("{ tasks: [")).toThrow();
  });

  it("відхиляє tasks не-масив", () => {
    expect(() => validateOutput('{"tasks":"nope"}')).toThrow();
  });
});
