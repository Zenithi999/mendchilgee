// ═══════════════════════════════════════════════════════════════
// Pixel ornaments a letter can hang on the tree as.
// Ids must match public.tree_decor_ok() in the letter_trees migration.
//
// Art: rows of equal length, "." = empty. Shared letters:
//   K outline  W white  A main  B shade  H highlight  C cap (gold)
//   R red  G green  Y yellow  O orange  N brown
// ═══════════════════════════════════════════════════════════════

const BASE = {
  K: "#1d1208",
  W: "#ffffff",
  C: "#e8c547",
  R: "#e2231a",
  G: "#1f9d55",
  Y: "#ffd23f",
  O: "#ff8a00",
  N: "#9c5a2b",
};

const BALL = [
  "..KCK..",
  ".KAAAK.",
  "KAHAAAK",
  "KHAAAAK",
  "KAAAABK",
  "KAAABBK",
  ".KBBBK.",
  "..KKK..",
];

const BULB = [
  "..KKK..",
  "..KCK..",
  ".KAAAK.",
  "KAHAAAK",
  "KAHAAAK",
  "KAAAABK",
  ".KAABK.",
  "..KBK..",
  "...K...",
];

const CANDY = [
  "..KKKK.",
  ".KRWWRK",
  "KWK..KW",
  "KRK..KR",
  ".K...KW",
  ".....KR",
  ".....KW",
  ".....KR",
  "......K",
];

const STAR = [
  "...K...",
  "..KYK..",
  "KKKHKKK",
  "KYHYYYK",
  ".KYYYK.",
  ".KYKYK.",
  "KYK.KYK",
  "KK...KK",
];

const BELL = [
  "...C...",
  "..KKK..",
  ".KYYYK.",
  ".KHYYK.",
  ".KHYYK.",
  "KYYYYOK",
  "KKKKKKK",
  "...N...",
];

const SNOWFLAKE = [
  "W..A..W",
  ".W.A.W.",
  "..WAW..",
  "AAAHAAA",
  "..WAW..",
  ".W.A.W.",
  "W..A..W",
];

const GIFT = [
  ".R...R.",
  "..RKR..",
  "KKKRKKK",
  "KAARAAK",
  "KRRRRRK",
  "KAARABK",
  "KBBRBBK",
  "KKKKKKK",
];

const SOCK = [
  ".KKKKK.",
  ".KWWWK.",
  ".KWWWK.",
  ".KRRRK.",
  ".KRHRK.",
  ".KRRRKK",
  "KRRRRRK",
  "KRRRRRK",
  ".KKKKK.",
];

const HEART = [
  ".KK.KK.",
  "KAHKAAK",
  "KHAAAAK",
  "KAAAABK",
  ".KAABK.",
  "..KBK..",
  "...K...",
];

const SNOWMAN = [
  "..KKK..",
  "..KKK..",
  ".KKKKK.",
  "..WWW..",
  ".WKWKW.",
  ".WWOWW.",
  "..RRR..",
  ".WWKWW.",
  "WWWWWWW",
  ".WWKWW.",
];

const COOKIE = [
  "..KKK..",
  ".KNNNK.",
  ".KWNWK.",
  "KKNNNKK",
  "KNNRNNK",
  ".KNWNK.",
  ".KNKNK.",
  ".KK.KK.",
];

const MOON = [
  "..KKK..",
  ".KYYK..",
  "KYHK...",
  "KYHK.Y.",
  "KYYK...",
  ".KYYK..",
  "..KKK..",
];

export const DECORS = [
  { id: "ball-red", name: "Улаан бөмбөг", art: BALL, colors: { A: "#e53935", B: "#9f1c1c", H: "#ffb4a8" }, glow: "#ff5a4e" },
  { id: "ball-blue", name: "Цэнхэр бөмбөг", art: BALL, colors: { A: "#2f6fe0", B: "#173f8f", H: "#a9c8ff" }, glow: "#5fa0ff" },
  { id: "ball-green", name: "Ногоон бөмбөг", art: BALL, colors: { A: "#43c050", B: "#1e7a2a", H: "#b9f5bd" }, glow: "#6cff7a" },
  { id: "ball-gold", name: "Алтан бөмбөг", art: BALL, colors: { A: "#f2c230", B: "#b07d10", H: "#fff3b8" }, glow: "#ffd84a" },
  { id: "bulb-red", name: "Улаан гэрэл", art: BULB, colors: { A: "#ff4757", B: "#b3122e", H: "#ffd0d5" }, glow: "#ff4757" },
  { id: "bulb-blue", name: "Цэнхэр гэрэл", art: BULB, colors: { A: "#3ec5ff", B: "#1478b8", H: "#d6f4ff" }, glow: "#3ec5ff" },
  { id: "candy", name: "Чихэр саваа", art: CANDY, colors: {}, glow: "#ff8fa3" },
  { id: "star", name: "Од", art: STAR, colors: { H: "#fff8d0" }, glow: "#ffe14d" },
  { id: "bell", name: "Хонх", art: BELL, colors: { H: "#fff3b8" }, glow: "#ffd23f" },
  { id: "snowflake", name: "Цасан ширхэг", art: SNOWFLAKE, colors: { A: "#bfefff", H: "#ffffff" }, glow: "#a8ecff" },
  { id: "gift", name: "Бэлэг", art: GIFT, colors: { A: "#2fbf71", B: "#18804a" }, glow: "#6cff9c" },
  { id: "sock", name: "Оймс", art: SOCK, colors: { H: "#ff8a80" }, glow: "#ff6b6b" },
  { id: "heart", name: "Зүрх", art: HEART, colors: { A: "#ff4f9a", B: "#b3125e", H: "#ffc4de" }, glow: "#ff6fb5" },
  { id: "snowman", name: "Цасан хүн", art: SNOWMAN, colors: {}, glow: "#e8fbff" },
  { id: "cookie", name: "Жигнэмэг хүн", art: COOKIE, colors: {}, glow: "#ffb067" },
  { id: "moon", name: "Сар", art: MOON, colors: { H: "#fff3b8" }, glow: "#ffe58a" },
];

export const DECOR_BY_ID = Object.fromEntries(DECORS.map((d) => [d.id, d]));

/** Merge consecutive same-colour pixels in a row into one rect (fewer DOM nodes). */
export function artToRects(art, colors = {}) {
  const pal = { ...BASE, ...colors };
  const rects = [];
  art.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !pal[ch]) { x++; continue; }
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      rects.push({ x, y, w: end - x, fill: pal[ch] });
      x = end;
    }
  });
  return rects;
}

export const artSize = (art) => ({ w: art[0].length, h: art.length });
