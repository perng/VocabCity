export interface Sense {
  audio?: string | null;
  pos: string;
  gloss: string;
  synonyms?: string[];
  example?: string | null;
  translations?: Record<string, string>;
}
export interface RootPiece {
  surface: string;
  joined: string;
  meaningId: string;
  gloss: string;
  translations: Record<string, string>;
  display: string | null;
}
// A word's place in a root-family room, with the reviewed morphological split.
export interface RootFamily {
  room: number;
  slot: number;
  root: string;
  pieces: RootPiece[];
  rootIndex: number;
}
export interface RootInfo {
  id: string;
  display: string;
  meaning: string;
  translations: Record<string, string>;
  origin: string;
  words: string[];
}
export type HouseKind = "root" | "theme" | "family" | "level";
// Every townhouse in the Old Town: what its banner says and which words hang inside.
export interface HouseInfo {
  kind: HouseKind;
  display: string;
  translations: Record<string, string>;
  note: string;
  words: string[];
}
export interface Room {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  root?: RootInfo;
  house?: HouseInfo;
}
// Fields that load with the flashcard rather than the city.
export interface ExhibitDetails {
  ipa: string;
  kk: string;
  synonyms: string[];
  senses: Sense[];
  collocations: { text: string; translations?: Record<string, string> }[];
  originalImage?: string;
}
export interface Exhibit {
  id: string;
  word: string;
  room: number;
  slot: number;
  pos: string;
  definition: string;
  example: string;
  level: number | null;
  translations: Record<string, string>;
  definitionTranslations: Record<string, string>;
  exampleTranslations: Record<string, string>;
  image: string;
  artwork?: {
    title: string;
    titleZh: string;
    series: string;
    seriesZh: string;
    medium: string;
    mediumZh: string;
    style: string;
    width: number;
    height: number;
    provenance: string;
  };
  audio: string | null;
  exampleAudio: string | null;
  families?: RootFamily[];
}
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const partOfSpeech = (pos: string) =>
  ({
    n: "noun",
    v: "verb",
    adj: "adjective",
    adv: "adverb",
    prep: "preposition",
  })[pos] || pos;
