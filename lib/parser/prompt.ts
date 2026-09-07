// Промпт LLM-парсера. LLM ТІЛЬКИ парсить текст у справи.
// НЕ оцінює тривалості, НЕ розкладає час — це робить solver (1.4).

export const SYSTEM_INSTRUCTION = `Ти — парсер списку справ. На вхід: сирий текст справ на день (українською або російською, брудний, як пише втомлена людина) і сьогоднішня дата.

Витягни окремі справи. Для кожної справи поверни:
- "title": коротка назва справи (без часу й дати всередині назви, без слів на кшталт "зранку"/"ввечері" — вони йдуть в time_hint, не в title).
- "fixed_time": якщо в тексті вказано конкретний час початку — рядок "HH:MM" (24-годинний). Діапазон ("з 10 до 11") → бери час початку ("10:00"). "13.30", "о 9" тощо → нормалізуй до "HH:MM". Якщо часу нема — null.
- "deadline": якщо справа має кінцевий ДЕНЬ ("до пʼятниці", "оплатити до 8-го", "до понеділка", "до 10 вересня") — рядок "YYYY-MM-DD". Відносні терміни переводь відносно сьогоднішньої дати. Якщо терміну нема — null.
  ВАЖЛИВО: "до 15", "до вечора", "до обіду", "до кінця дня" — це НЕ deadline, це просто вказівка на час ПРОТЯГОМ сьогодні без точної години початку. Якщо нема точної календарної дати чи дня тижня — став deadline: null (і fixed_time теж null, якщо точної години "HH:MM" немає).
- "time_hint": ОДНЕ з "morning" / "afternoon" / "evening" / null. Став НЕ null ТІЛЬКИ якщо в тексті ПРЯМО написано розмиту вказівку часу доби без точної години ("зранку", "вранці" → morning; "вдень", "після обіду" → afternoon; "ввечері", "на ніч", "перед сном" → evening).
  КРИТИЧНО ВАЖЛИВО: якщо такого слова в тексті НЕМА — став null, навіть якщо справа "звучить" як вечірня чи ранкова за своєю природою (напр. "почитати дитині книжку" без слова "ввечері" → time_hint: null, а не "evening" — не вгадуй за змістом, лише за буквальним текстом).

Жорсткі правила:
- НЕ оцінюй тривалість. Поля тривалості не існує.
- НЕ вигадуй справ, яких нема в тексті. НЕ об'єднуй різні справи в одну.
- Розрізняй fixed_time (конкретний час сьогодні) і deadline (кінцева дата, календарний день). Одна справа може мати щось одне, обидва, або нічого.
- deadline тільки для реальної календарної дати/дня тижня. Розмита вказівка часу доби без дати — це не deadline.
- time_hint — тільки якщо слово буквально є в тексті. Ніколи не вгадуй час доби із самої суті справи.
- Поверни ТІЛЬКИ JSON виду {"tasks":[...]}. Без markdown, без пояснень, без преамбули.`;

type Turn = { role: "user" | "model"; text: string };

// Few-shot: брудний двомовний ввід → чистий JSON за схемою.
const FEW_SHOT: Turn[] = [
  {
    role: "user",
    text: 'today: 2026-09-05\nтренування, забрати старшого о 15:00, зняти відео, вечеря',
  },
  {
    role: "model",
    text: JSON.stringify({
      tasks: [
        { title: "тренування", fixed_time: null, deadline: null, time_hint: null },
        { title: "забрати старшого", fixed_time: "15:00", deadline: null, time_hint: null },
        { title: "зняти відео", fixed_time: null, deadline: null, time_hint: null },
        { title: "вечеря", fixed_time: null, deadline: null, time_hint: null },
      ],
    }),
  },
  {
    role: "user",
    text: 'today: 2026-09-05\nоплатить садик до понедельника, забрать младшего в 13.30, приготовить ужин',
  },
  {
    role: "model",
    text: JSON.stringify({
      tasks: [
        { title: "оплатить садик", fixed_time: null, deadline: "2026-09-07", time_hint: null },
        { title: "забрать младшего", fixed_time: "13:30", deadline: null, time_hint: null },
        { title: "приготовить ужин", fixed_time: null, deadline: null, time_hint: null },
      ],
    }),
  },
  {
    role: "user",
    text: 'today: 2026-09-05\nзустріч з 10 до 11, записати дитину до лікаря до 10 вересня, прибирання',
  },
  {
    role: "model",
    text: JSON.stringify({
      tasks: [
        { title: "зустріч", fixed_time: "10:00", deadline: null, time_hint: null },
        { title: "записати дитину до лікаря", fixed_time: null, deadline: "2026-09-10", time_hint: null },
        { title: "прибирання", fixed_time: null, deadline: null, time_hint: null },
      ],
    }),
  },
  {
    // "до 15" — розмитий час протягом сьогодні, НЕ дедлайн (нема календарної дати).
    role: "user",
    text: 'today: 2026-09-06\nдо 15 треба доробити презентацію клієнту, купити продукти',
  },
  {
    role: "model",
    text: JSON.stringify({
      tasks: [
        { title: "доробити презентацію клієнту", fixed_time: null, deadline: null, time_hint: null },
        { title: "купити продукти", fixed_time: null, deadline: null, time_hint: null },
      ],
    }),
  },
  {
    // Явний маркер "ввечері" → time_hint, але НЕ в title. "почитати дитині книжку" без
    // маркера → null, попри те що це "звучить" як вечірня справа (не вгадуємо за змістом).
    role: "user",
    text: 'today: 2026-09-06\nввечері треба щось приготувати, почитати дитині книжку, вранці зробити зарядку',
  },
  {
    role: "model",
    text: JSON.stringify({
      tasks: [
        { title: "щось приготувати", fixed_time: null, deadline: null, time_hint: "evening" },
        { title: "почитати дитині книжку", fixed_time: null, deadline: null, time_hint: null },
        { title: "зробити зарядку", fixed_time: null, deadline: null, time_hint: "morning" },
      ],
    }),
  },
];

// Збирає contents для generateContent: few-shot + реальний ввід останнім user-турном.
export function buildContents(text: string, today: string) {
  const turns: Turn[] = [...FEW_SHOT, { role: "user", text: `today: ${today}\n${text}` }];
  return turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
}
