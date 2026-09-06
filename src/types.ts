export interface Sense {
  audio?: string | null;
  pos: string;
  gloss: string;
  synonyms?: string[];
  example?: string | null;
  translations?: Record<string, string>;
}
export interface Exhibit {
  id: string;
  word: string;
  room: number;
  slot: number;
  ipa: string;
  kk: string;
  pos: string;
  definition: string;
  example: string;
  level: number | null;
  translations: Record<string, string>;
  definitionTranslations: Record<string, string>;
  exampleTranslations: Record<string, string>;
  synonyms: string[];
  senses: Sense[];
  collocations: { text: string; translations?: Record<string, string> }[];
  image: string;
  originalImage?: string;
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
