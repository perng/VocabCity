import type { Exhibit, RootPiece } from "./types";

export type ClassicGameMode = "quest" | "restore" | "step";
export type ExtraGameMode = "family" | "market" | "memory";
export type GameMode = ClassicGameMode | ExtraGameMode;
export const GAME_TITLES: Record<GameMode, string> = {
  quest: "Curator’s Quest", restore: "Restore the Labels", step: "Listen and Step",
  family: "Build a Word Family", market: "Market Missions", memory: "Memory Walk",
};
export const PASSPORT_KEY = "vocabhall.passport.v1";
export type Stamp = { mode: GameMode; room: string; earnedAt: string };
export type GameRound = { target: Exhibit; choices: Exhibit[] };
export type SceneGame = {
  mode: GameMode;
  room: number;
  exhibits: Exhibit[];
  restored: string[];
  enabled: boolean;
  conceal?: boolean;
  actors?: { id: string; name: string; color: string; active: boolean; complete: boolean }[];
  onAnswer: (id: string) => void;
};
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function makeRounds(pool: Exhibit[], checked: string[], revisit: string[] = [], notAsked: string[] = []): GameRound[] {
  const unique = [...new Map(pool.map(e => [e.id, e])).values()];
  // Words to revisit come first, then unchecked words, then the rest; words in notAsked
  // may still appear as wrong choices but are never the question (unless nothing else is left).
  const askable = unique.filter(e => !notAsked.includes(e.id)).length >= 3 ? unique.filter(e => !notAsked.includes(e.id)) : unique;
  const again = askable.filter(e => revisit.includes(e.id));
  const rest = askable.filter(e => !revisit.includes(e.id));
  const targets = [
    ...shuffle(again),
    ...shuffle(rest.filter(e => !checked.includes(e.id))),
    ...shuffle(rest.filter(e => checked.includes(e.id))),
  ].slice(0, 3);
  return targets.map(target => ({ target, choices: shuffle([target, ...shuffle(unique.filter(e => e.id !== target.id)).slice(0, 3)]) }));
}
export function readPassport(): Stamp[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(PASSPORT_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((s): s is Stamp => s && Object.hasOwn(GAME_TITLES, s.mode) && typeof s.room === "string" && typeof s.earnedAt === "string");
  } catch { return []; }
}

export function familyPieces(exhibit: Exhibit, room: number): RootPiece[] | null {
  const pieces = exhibit.families?.find(f => f.room === room)?.pieces;
  // Only use reviewed, reconstructable splits; never guess a word's morphology.
  return pieces && pieces.length >= 2 && pieces.length <= 5 &&
    pieces.map(p => p.joined).join("").toLowerCase() === exhibit.word.toLowerCase() ? pieces : null;
}
export type WordTile = { key: string; piece: RootPiece };
export type FamilyRound = GameRound & { pieces: RootPiece[]; tiles: WordTile[] };
export function makeFamilyRounds(pool: Exhibit[], room: number, checked: string[], revisit: string[] = []): FamilyRound[] {
  const eligible = pool.filter(e => familyPieces(e, room));
  return makeRounds(eligible, checked, revisit).map(round => {
    const pieces = familyPieces(round.target, room)!;
    const extras = [...new Map(eligible.flatMap(e => familyPieces(e, room)!)
      .filter(p => !pieces.some(own => own.joined === p.joined)).map(p => [p.joined, p])).values()];
    return { ...round, pieces, tiles: shuffle([...pieces, ...shuffle(extras).slice(0, 2)]
      .map((piece, i) => ({ key: `${round.target.id}:${i}`, piece }))) };
  });
}
export function assembleWord(tiles: WordTile[]): string { return tiles.map(tile => tile.piece.joined).join(""); }

export type MarketMission = {
  word: string; name: string; role: string; color: string; request: string; translation: string;
  choices: { word: string; reply: string; feedback?: string }[];
  thanks: string; thanksTranslation: string;
};
// Short conversations authored for the existing market exhibits. Requests use browser
// speech; each earned word and its original example use the collection's recordings.
export const MARKET_MISSIONS: MarketMission[] = [
  { word: "texture", name: "Mina", role: "The baker", color: "#b77b50",
    request: "Both loaves taste good, but one is soft and the other is crunchy. What should I describe on the little signs?",
    translation: "這兩款麵包都很好吃，但一款柔軟，另一款酥脆。小立牌上該介紹什麼呢？",
    choices: [
      { word: "texture", reply: "Describe the texture of each loaf." },
      { word: "mineral", reply: "List the minerals in each loaf.", feedback: "Minerals tell us about nutrients. I want customers to imagine how the bread feels." },
      { word: "structure", reply: "Describe the structure of the bakery.", feedback: "That describes the building. My customers are choosing between the two loaves." },
    ], thanks: "Perfect. Soft or crunchy: now my customers can choose their favourite texture!",
    thanksTranslation: "太好了！柔軟或酥脆，客人現在能選擇喜歡的口感了！" },
  { word: "durable", name: "Theo", role: "The furniture maker", color: "#67866b",
    request: "I am making stools for a busy café. People will use them every day for years. Which kind of material should I choose?",
    translation: "我要幫一家生意很好的咖啡店做凳子，每天都有人坐，希望能用好幾年。該選哪種材料呢？",
    choices: [
      { word: "durable", reply: "Choose a durable material." },
      { word: "surface", reply: "Choose any material with a shiny surface.", feedback: "A shiny surface looks nice, but it does not tell me whether the stool will last." },
      { word: "texture", reply: "Choose any material with a soft texture.", feedback: "A soft texture can feel comfortable. I also need something that will resist years of wear." },
    ], thanks: "That is what I need. A durable stool can welcome café visitors for years.",
    thanksTranslation: "就是這個！耐用的凳子可以陪伴咖啡店的客人好多年。" },
  { word: "surface", name: "Jun", role: "The potter", color: "#778aa0",
    request: "This bowl has a scratch on the outside. Where should I apply the new glaze to cover it?",
    translation: "這個碗的外面有一道刮痕，新的釉料應該塗在哪裡才能蓋住呢？",
    choices: [
      { word: "surface", reply: "Apply it to the outer surface." },
      { word: "structure", reply: "Change the whole structure of the bowl.", feedback: "The bowl's shape is fine. Only its outside layer needs attention." },
      { word: "mineral", reply: "Add a mineral to the clay inside.", feedback: "The bowl is already made. I need to cover a mark on the outside." },
    ], thanks: "The surface is smooth again. This little bowl is ready for its new home.",
    thanksTranslation: "表面又光滑了！這個小碗準備好迎接新主人了。" },
  { word: "mineral", name: "Rosa", role: "The greengrocer", color: "#8f76a8",
    request: "A customer wants spinach because it has lots of iron. What should my little sign say iron is?",
    translation: "有位客人想買菠菜，因為它含有很多鐵。我的小立牌上該怎麼介紹鐵呢？",
    choices: [
      { word: "mineral", reply: "Iron is a mineral the body needs." },
      { word: "texture", reply: "Iron gives spinach its texture.", feedback: "Texture is how food feels. Iron is something inside the food that helps the body." },
      { word: "formation", reply: "Iron is the formation of spinach.", feedback: "Formation is how something is made. I need the name for a natural substance from the earth." },
    ], thanks: "Yes! A mineral from the earth, right there in a leaf. My customers will love that.",
    thanksTranslation: "沒錯！來自大地的礦物質，就藏在一片葉子裡。客人一定會喜歡。" },
  { word: "formation", name: "Omar", role: "The stonemason", color: "#8a8468",
    request: "Children ask me how this striped stone got its layers over millions of years. What should I explain to them?",
    translation: "孩子們問我，這塊有條紋的石頭是怎麼在幾百萬年裡形成一層層的。我該跟他們解釋什麼呢？",
    choices: [
      { word: "formation", reply: "Explain the stone's formation." },
      { word: "durable", reply: "Explain that the stone is durable.", feedback: "It is strong, yes, but they want to know how the layers were made." },
      { word: "surface", reply: "Explain the stone's surface.", feedback: "The surface is only the outside. The layers tell the story of how the stone was made." },
    ], thanks: "Perfect. Layer by layer, the formation of a stone is a very slow story.",
    thanksTranslation: "太好了。一層又一層，石頭的形成是一個很慢很慢的故事。" },
  { word: "structure", name: "Lina", role: "The toy builder", color: "#c2735a",
    request: "My wooden tower keeps falling over. Should I look at how the pieces fit together, or at the paint?",
    translation: "我的木頭塔一直倒下來。我該檢查積木怎麼組合，還是看看油漆呢？",
    choices: [
      { word: "structure", reply: "Look at the tower's structure." },
      { word: "texture", reply: "Change the texture of the paint.", feedback: "Rough or smooth paint will not hold the tower up. It is how the pieces fit together." },
      { word: "mineral", reply: "Add a mineral to the wood.", feedback: "The wood is fine. The problem is how the pieces are arranged." },
    ], thanks: "You are right! With a stronger structure, my tower stands tall.",
    thanksTranslation: "你說得對！結構更穩固之後，我的塔站得好高。" },
];
export const MARKET_KEY = "vocabhall.market.v1";
export const MARKET_ROUND = 3;
/** Three missions per visit, those not yet solved first, in their authored order. */
export function marketMissions(): MarketMission[] {
  let solved: string[] = [];
  try { const data = JSON.parse(localStorage.getItem(MARKET_KEY) || "[]"); if (Array.isArray(data)) solved = data.filter((w): w is string => typeof w === "string"); } catch { /* start fresh */ }
  return [...MARKET_MISSIONS.filter((m) => !solved.includes(m.word)), ...MARKET_MISSIONS.filter((m) => solved.includes(m.word))].slice(0, MARKET_ROUND);
}
export function markMissionSolved(word: string) {
  try {
    const data = JSON.parse(localStorage.getItem(MARKET_KEY) || "[]");
    const solved = Array.isArray(data) ? data.filter((w): w is string => typeof w === "string") : [];
    // Once every mission is solved, start the rotation again.
    const next = solved.includes(word) ? solved : [...solved, word];
    localStorage.setItem(MARKET_KEY, JSON.stringify(next.length >= MARKET_MISSIONS.length ? [] : next));
  } catch { /* The rotation simply restarts. */ }
}

export function memorySentence(exhibit: Exhibit): string | null {
  const escaped = exhibit.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = new RegExp(`\\b${escaped}\\b`, "gi");
  return word.test(exhibit.example) ? exhibit.example.replace(word, "________") : null;
}
export function addStamp(stamps: Stamp[], stamp: Stamp): Stamp[] {
  return stamps.some(s => s.mode === stamp.mode && s.room === stamp.room) ? stamps : [...stamps, stamp];
}
