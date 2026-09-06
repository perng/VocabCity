import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import dictionary from "./zh-TW.json";

export const translate = (text: string, locale: string) =>
  locale === "zh_TW"
    ? (dictionary as Record<string, string>)[text] || text
    : text;
type LocaleContextValue = {
  locale: string;
  setLocale: (locale: string) => void;
  t: (text: string) => string;
};
const LocaleContext = createContext<LocaleContextValue | null>(null);
const supported = new Set(["", "zh_TW", "ja_JP", "ko_KR", "vi_VN", "th_TH"]);
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(() => {
    try {
      const saved = localStorage.getItem("vocabhall.locale.v1");
      return saved !== null && supported.has(saved) ? saved : "zh_TW";
    } catch {
      return "zh_TW";
    }
  });
  useEffect(() => {
    document.documentElement.lang =
      locale === "zh_TW" ? "zh-Hant-TW" : locale.replace("_", "-") || "en";
    document.title =
      locale === "zh_TW"
        ? "Vocab Hall — 單字博物館"
        : "Vocab Hall — A museum for your mind";
    try {
      localStorage.setItem("vocabhall.locale.v1", locale);
    } catch {
      /* Preferences remain usable without storage. */
    }
  }, [locale]);
  const value = useMemo(
    () => ({ locale, setLocale, t: (text: string) => translate(text, locale) }),
    [locale],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("LocaleProvider is required");
  return value;
}
