import { Brain, Compass, Footprints, Sprout, Store, Tag } from "lucide-react";
import { GAME_TITLES, type GameMode, type Stamp } from "./games";
import { useLocale } from "./i18n";
import type { Room } from "./types";

// The explorer passport as a little book of ink stamps, one per game and room.
const INK: Record<GameMode, string> = { quest: "#56735c", restore: "#b8601f", step: "#3f6b8a", family: "#6d7f3a", market: "#a8453a", memory: "#6f5c86" };
const ICONS = { quest: Compass, restore: Tag, step: Footprints, family: Sprout, market: Store, memory: Brain };

export function PassportStamps({ stamps, rooms }: { stamps: Stamp[]; rooms: Room[] }) {
  const { t, locale } = useLocale();
  if (!stamps.length) return <p className="passport-empty">{t("No stamps yet. Finish any museum game to earn your first one.")}</p>;
  return <ol className="passport-stamps">
    {[...stamps].sort((a, b) => b.earnedAt.localeCompare(a.earnedAt)).map((stamp, i) => {
      const Icon = ICONS[stamp.mode], room = rooms.find((r) => r.id === stamp.room);
      const date = new Date(stamp.earnedAt);
      return <li key={`${stamp.mode}-${stamp.room}`} style={{ "--ink": INK[stamp.mode], "--tilt": `${((i * 37) % 17) - 8}deg` } as React.CSSProperties}>
        <span className="passport-stamp" aria-hidden="true">
          <Icon size={26} strokeWidth={1.6} />
          <b>{Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(locale ? locale.replace("_", "-") : "en", { month: "short", day: "numeric" })}</b>
        </span>
        <strong>{t(GAME_TITLES[stamp.mode])}</strong>
        <small>{room ? (room.house ? room.house.display : t(room.name)) : stamp.room}</small>
      </li>;
    })}
  </ol>;
}
