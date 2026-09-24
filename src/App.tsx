import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Flame,
  Heart,
  Images,
  RotateCcw,
  Mail,
  Star,
  Bell,
  BellOff,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Expand,
  Footprints,
  Gamepad2,
  Headphones,
  HelpCircle,
  Map,
  MessageCircle,
  Maximize2,
  Moon,
  Mouse,
  MoveUpRight,
  Pause,
  Play,
  Search,
  Landmark,
  Sparkles,
  Sprout,
  Sun,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import collection from "./collection.json";
import { MuseumGames } from "./MuseumGames";
import { ResidentQuiz } from "./ResidentQuiz";
import { RESIDENTS, nearbyResident, type Resident } from "./residents";
import { readPassport } from "./games";
import { Museum, exhibitPlacements, familyIn, registerFamilySizes, type Pose } from "./museum";
import {
  CATHEDRAL_SQUARE,
  CITY,
  CITY_ROADS,
  DISTRICTS,
  ENTRY,
  GALLERY_COUNT,
  MAP_HEIGHT,
  MAP_WIDTH,
  OLD_TOWN,
  OUTER_EDGE,
  ROOT_ROOM,
  ROOT_START,
  SQUARE_INDEX,
  STREETS_INDEX,
  districtFor,
  isRootRoom,
  mapPoint,
  rootRoomTransform,
} from "./layout";
import { assetUrl, partOfSpeech, type Exhibit, type ExhibitDetails, type HouseKind, type Room } from "./types";
import { translate, useLocale } from "./i18n";
import { useExhibitAudio } from "./useExhibitAudio";
import { YouglishPlayer, YouTubeLogo } from "./YouglishPlayer";
import { playSfx, setSfxEnabled, useSfxEnabled } from "./sfx";
import { Soundscape } from "./soundscape";
import { sendPostcard } from "./postcard";
import { Celebrations, announce, celebrate } from "./Celebrations";
import { recordMiss, recordRight, useReviewIds } from "./review";
import { labelChoices, readLabels, saveLabels, todaysLabels, type LostLabels } from "./labels";
import { styleMilestone, styleOf, styleSets } from "./album";
import { favourFound, favourWords, readFavours, saveFavours, type FavourBook } from "./favours";
import { WALK_SIZE, dayKey, readDaily, saveDaily, streak, todaysWalk, type DailyWalk } from "./daily";
import { newlyComplete, placeProgress, roomWordIds, roomsOf, type PlaceState } from "./progress";
const exhibits = collection.exhibits as Exhibit[];
const rooms = collection.rooms as Room[];
if (rooms.length !== GALLERY_COUNT) throw new Error(`Expected ${GALLERY_COUNT} rooms in the collection, found ${rooms.length}.`);
registerFamilySizes(rooms);
const destinationFor = (index: number): Room => (index === SQUARE_INDEX ? CATHEDRAL_SQUARE : index === STREETS_INDEX ? OLD_TOWN : rooms[index]);
const LANDMARKS: [number, string][] = [[1, "Harbour Quay"], [0, "Gate Square"], [3, "The Corso"], [4, "City Park"], [12, "Market Square"], [SQUARE_INDEX, "Cathedral Square"], [5, "Cathedral"], [STREETS_INDEX, "The Old Town"], [14, "Lighthouse Mole"]];
const houses = rooms.map((room, index) => ({ room, index })).filter(({ room }) => room.house);
const HOUSE_SECTIONS: [HouseKind, string, string][] = [
  ["root", "ROOT FAMILY HOUSES", "One Latin or Greek root per house, with the words it built."],
  ["theme", "THEME HOUSES", "Words that belong to one topic, from Handy 990's theme maps."],
  ["family", "WORD FAMILY HOUSES", "One stem in several forms: verb, noun, adjective side by side."],
  ["level", "LEVEL LANES", "Every other word above level 30, six to a house in alphabetical order."],
];
const ROOM_WORDS = roomWordIds(exhibits, rooms.length);
// Round numbers of discovered words worth a banner.
const WORD_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 1500, 2000];
// The wind only starts taking labels once a visitor has settled in.
const LOST_LABELS_AFTER = 12;
const STYLE_SETS = styleSets(exhibits);
const placeLabel = (index: number, locale: string) => {
  const room = rooms[index];
  return room.house ? `${room.house.display}` : translate(districtFor(index).landmark, locale);
};
function roomStates(visited: string[], checked: string[]) {
  const seen = new Set(visited), learned = new Set(checked);
  return ROOM_WORDS.map((ids) => placeProgress(ids, seen, learned));
}
// Celebrate a place the moment its last painting is opened or its last word is learned.
function celebratePlaces(done: number[], kind: "explored" | "mastered", locale: string) {
  if (!done.length) return;
  const index = done[0], house = Boolean(rooms[index].house);
  const title = translate(kind === "mastered" ? (house ? "House mastered!" : "Landmark mastered!") : (house ? "House explored!" : "Landmark explored!"), locale);
  const detail = `${placeLabel(index, locale)} · ${ROOM_WORDS[index].length} ${translate(kind === "mastered" ? "words learned" : "words discovered", locale)}`;
  setTimeout(() => { playSfx("complete"); celebrate("confetti"); announce(title, detail); }, kind === "explored" ? 900 : 250);
}
const fill = (text: string) => text.replace("{n}", String(exhibits.length)).replace("{houses}", String(houses.length));
// Root rooms also show words whose home is a thematic gallery or another family.
const roomExhibits = (room: number) => exhibits.filter((e) => e.room === room || e.families?.some((family) => family.room === room));
const familyOf = (exhibit: Exhibit, room: number) => roomExhibits(room).filter((e) => e.id !== exhibit.id);
const nextRootRoom = (room: number) => (room === STREETS_INDEX ? ROOT_START : room === GALLERY_COUNT - 1 ? SQUARE_INDEX : room + 1);
// Landmarks in walking order, from the quay to the Old Town.
const DISTRICT_ORDER = [1, 14, 11, 0, 8, 6, 3, 7, 4, 9, 12, 10, 2, 5, 13];
const nextDistrict = (room: number) => {
  const at = DISTRICT_ORDER.indexOf(room);
  return at < 0 || at === DISTRICT_ORDER.length - 1 ? STREETS_INDEX : DISTRICT_ORDER[at + 1];
};
const wordClip = (exhibit: Exhibit) => ({
  key: "word",
  url: exhibit.audio,
  text: exhibit.word,
});
const languages = [
  { id: "", name: "English only" },
  { id: "zh_TW", name: "繁體中文" },
  { id: "ja_JP", name: "日本語" },
  { id: "ko_KR", name: "한국어" },
  { id: "vi_VN", name: "Tiếng Việt" },
  { id: "th_TH", name: "ภาษาไทย" },
];
const validIds = new Set(exhibits.map((e) => e.id));
// The lucide Map icon shadows the global Map in this file.
const EXHIBIT_BY_ID = new globalThis.Map(exhibits.map((e) => [e.id, e] as const));
function loadProgress(key: string): string[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(data)
      ? data.filter(
          (x): x is string => typeof x === "string" && validIds.has(x),
        )
      : [];
  } catch {
    return [];
  }
}
function useProgress(key: string) {
  const [value, setValue] = useState<string[]>(() => loadProgress(key));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Browsing remains available without storage. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
function Dialog({
  children,
  className = "",
  label,
  onClose,
  resetKey,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onClose: () => void;
  resetKey?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    ref.current?.scrollTo(0, 0);
  }, [resetKey]);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
function LearnedCheckbox({
  exhibit,
  checked,
  onChange,
}: {
  exhibit: Exhibit;
  checked: boolean;
  onChange: () => void;
}) {
  const { t } = useLocale();
  return (
    <label
      className="learned-checkbox"
      title={t(
        checked
          ? "Uncheck to bring back the glow"
          : "Check to settle the glowing frame",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={`${t("Learned")}: ${exhibit.word}`}
      />
      <span aria-hidden="true">
        <Check size={19} strokeWidth={2.5} />
      </span>
    </label>
  );
}
function MuseumLogo() {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path
        d="M5 12 18 5l13 7M7 29h22M9 15v10m9-10v10m9-10v10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M5 32h26"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
const PLACE_STROKE: Record<PlaceState, [string, number]> = { new: ["#a5ac99", .5], started: ["#a5ac99", .5], explored: ["#d9a22e", 1.4], mastered: ["#b8871f", 2] };
function FloorPlan({ pose, compact = false, states, targets = [] }: { pose: Pose; compact?: boolean; states: ReturnType<typeof roomStates>; targets?: string[] }) {
  const { t } = useLocale();
  const follow = mapPoint(pose.x, pose.z);
  const viewBox = compact
    ? `${Math.max(0, Math.min(MAP_WIDTH - 124, follow.x - 62))} ${Math.max(0, Math.min(MAP_HEIGHT - 110, follow.y - 55))} 124 110`
    : `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;
  const origin = mapPoint(0, 0);
  const c = CITY;
  const box = (b: { x0: number; x1: number; z0: number; z1: number }, fill: string, key: string, rx = 0) => (
    <rect key={key} x={b.x0} y={b.z0} width={b.x1 - b.x0} height={b.z1 - b.z0} rx={rx} fill={fill} stroke="#a5ac99" strokeWidth=".7" />
  );
  return <svg viewBox={viewBox} aria-label={t("City map")}>
    <g transform={`translate(${origin.x} ${origin.y})`}>
      <rect x={-MAP_WIDTH} y={c.seaEdge} width={MAP_WIDTH * 2} height={400} fill="#bcd5d8" />
      <rect x={-c.wallX - 3} y={c.wallNorth - 3} width={c.wallX * 2 + 6} height={c.wallSouth - c.wallNorth + 6} fill="#efe9db" stroke="#9a8a66" strokeWidth="2" />
      <rect x={-c.wallX} y={c.wallNorth} width={c.wallX * 2} height={c.promenade.z0 - c.wallNorth} fill="#d9e0ca" />
      <rect x={-c.wallX} y={c.quay.north} width={c.wallX * 2} height={c.quay.south - c.quay.north} fill="#e3d9c3" />
      {box(c.mole, "#e3d9c3", "mole")}
      <circle cx={c.lighthouse.x} cy={c.lighthouse.z} r="3" fill="#f4efe3" stroke="#b8453a" strokeWidth="1.2" />
      {box({ x0: -c.gate.halfWidth, x1: c.gate.halfWidth, z0: c.gate.z0, z1: c.gate.z1 }, "#f1edde", "gate")}
      {box({ x0: -c.corso.arcade, x1: c.corso.arcade, z0: c.corso.z0, z1: c.corso.z1 }, "#f1edde", "corso")}
      {box({ x0: -c.cathedralSquare.x, x1: c.cathedralSquare.x, z0: c.cathedralSquare.z0, z1: c.cathedralSquare.z1 }, pose.room === SQUARE_INDEX ? "#d8cfb2" : "#f1edde", "csq")}
      {[-1, 1].map((side) => box({ x0: side < 0 ? -c.sideLanes.x1 : c.sideLanes.x0, x1: side < 0 ? -c.sideLanes.x0 : c.sideLanes.x1, z0: c.sideLanes.z0, z1: c.sideLanes.z1 }, "#f1edde", `lane-${side}`))}
      {box({ x0: -c.wallX, x1: c.wallX, z0: c.promenade.z0, z1: c.promenade.z1 }, pose.room === STREETS_INDEX ? "#d8cfb2" : "#f1edde", "promenade")}
      {box({ x0: -c.canal.street, x1: c.canal.street, z0: c.canal.z0, z1: c.canal.z1 }, "#f1edde", "canalstreet")}
      <rect x={-c.canal.x} y={c.canal.z0} width={c.canal.x * 2} height={c.canal.z1 - c.canal.z0} fill="#9fbdb4" />
      {CITY_ROADS.filter(road => road.id !== "avenue-0").map(road => <polyline key={road.id} points={road.points.map(p => `${p.x},${p.z}`).join(" ")} fill="none" stroke="#f1edde" strokeWidth={road.halfWidth * 2} strokeLinejoin="round" />)}
      {[-1, 1].map((side) => <rect key={`walk-${side}`} x={side < 0 ? -c.wallX + 1 : OUTER_EDGE} y={c.wallNorth + 1} width={c.wallX - OUTER_EDGE - 1} height={c.promenade.z1 - c.wallNorth - 1} fill="#ebe4d2" />)}
      {rooms.map((room, i) => {
        if (room.house) {
          const h = rootRoomTransform(i);
          return <g key={room.id}>
            <rect transform={`rotate(${-h.yaw * 180 / Math.PI} ${h.x} ${h.z})`} x={h.x - ROOT_ROOM.width / 2} y={h.z - ROOT_ROOM.depth / 2} width={ROOT_ROOM.width} height={ROOT_ROOM.depth} fill={states[i].state === "mastered" ? "#ecd08a" : pose.room === i ? `${room.color}99` : `${room.color}30`} stroke={PLACE_STROKE[states[i].state][0]} strokeWidth={PLACE_STROKE[states[i].state][1]} data-state={states[i].state} />
            {!compact && <text x={h.x} y={h.z + 2} textAnchor="middle" fill="#52604c" fontSize={room.house.display.length > 8 ? 3.2 : 5.5} fontStyle="italic">{room.house.display.length > 18 ? room.house.display.slice(0, 17) + "…" : room.house.display}</text>}
          </g>;
        }
        const d = districtFor(i);
        return <g key={room.id}>
          {box(d.box, states[i].state === "mastered" ? "#ecd08a" : pose.room === i ? `${room.color}99` : `${room.color}30`, room.id, d.indoor ? 0 : 3)}
          {(states[i].state === "explored" || states[i].state === "mastered") && <rect x={d.box.x0} y={d.box.z0} width={d.box.x1 - d.box.x0} height={d.box.z1 - d.box.z0} rx={d.indoor ? 0 : 3} fill="none" stroke={PLACE_STROKE[states[i].state][0]} strokeWidth={PLACE_STROKE[states[i].state][1] * 1.5} />}
          <text x={(d.box.x0 + d.box.x1) / 2} y={(d.box.z0 + d.box.z1) / 2 + 2.5} textAnchor="middle" fill="#52604c" fontSize="7">{String(i + 1).padStart(2, "0")}</text>
        </g>;
      })}
      <circle cx={c.square.fountain.x} cy={c.square.fountain.z} r="3" fill="none" stroke="#ad986b" />
      <circle cx="0" cy="-130" r="9" fill="none" stroke="#8c9a8a" strokeWidth="1.5" />
      <rect x={c.bellTower.x - 3} y={c.bellTower.z - 3} width="6" height="6" fill="#e2d3b4" stroke="#9a8a66" />
      <circle cx={c.observatory.x} cy={c.observatory.z} r="7" fill="#dfe5d3" stroke="#9ead8d" />
      {!compact && <>
        <text x="0" y={c.seaEdge + 14} textAnchor="middle" fill="#5f8d92" fontSize="8" letterSpacing="2">{t("THE SEA")}</text>
        <text x="0" y={c.promenade.z1 + 26} textAnchor="middle" fill="#718166" fontSize="7">{t("CATHEDRAL SQUARE")}</text>
        <text x="0" y={c.promenade.z0 - 6} textAnchor="middle" fill="#718166" fontSize="7">{t("THE OLD TOWN")}</text>
        <text x="0" y={c.observatory.z + 2} textAnchor="middle" fill="#657571" fontSize="5">{t("OBSERVATORY")}</text>
      </>}
      {exhibits.flatMap(e => exhibitPlacements(e).map(p => <rect key={`${e.id}-${p.area}`} x={p.x-1.2} y={p.z-1.2} width="2.4" height="2.4" rx=".5" fill={rooms[e.room].color} />))}
      {targets.flatMap(id => { const e = EXHIBIT_BY_ID.get(id); return e ? exhibitPlacements(e).map(p => <path key={`walk-${id}-${p.area}`} className="walk-target"
        transform={`translate(${p.x} ${p.z}) scale(${compact ? 1 : 1.6})`} d="M0-4 1.2-1.3 4-1.2 1.8.7 2.5 3.6 0 2 -2.5 3.6 -1.8.7 -4-1.2 -1.2-1.3Z" fill="#e0a92c" stroke="#fff7e2" strokeWidth=".6" />) : []; })}
    </g>
    {RESIDENTS.map(npc => { const point = mapPoint(npc.x, npc.z); return <g key={npc.id} transform={`translate(${point.x} ${point.y})`}>
      <title>{npc.name} · {t(npc.role)}</title><circle r={compact ? 2.4 : 3.5} fill={npc.color} stroke="#fff7e2" strokeWidth="1" />
    </g>; })}
    <g data-world-x={pose.x.toFixed(2)} data-world-z={pose.z.toFixed(2)} transform={`translate(${follow.x},${follow.y}) rotate(${(-pose.yaw * 180) / Math.PI})`}>
      <path d="M0-10-5 0H5Z" fill="#56765b" opacity=".25" />
      <circle r="3" fill="#345d47" stroke="#faf9f2" strokeWidth="1.3" />
    </g>
  </svg>;
}
function MiniMap({ pose, onOpen, states, targets }: { pose: Pose; onOpen: () => void; states: ReturnType<typeof roomStates>; targets: string[] }) {
  const { t } = useLocale();
  return <button className="minimap" onClick={onOpen} aria-label={t("Open museum floor map")}>
    <span className="map-label">{t("YOUR LITTLE WORLD")}<Expand size={12} /></span>
    <FloorPlan pose={pose} compact states={states} targets={targets} />
    <span className="map-current"><span />{pose.room === SQUARE_INDEX || pose.room === STREETS_INDEX ? t(destinationFor(pose.room).name) : isRootRoom(pose.room) ? `${t("Root room")} · ${rooms[pose.room].house!.display}` : t(districtFor(pose.room).landmark)}</span>
  </button>;
}
function Ring({ value, total }: { value: number; total: number }) {
  return <svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="12" fill="none" stroke="#d1d1be" strokeWidth="2" />
    <circle cx="16" cy="16" r="12" fill="none" stroke="#56735c" strokeWidth="2" strokeLinecap="round"
      strokeDasharray={`${total ? (value / total) * 75.4 : 0} 75.4`} transform="rotate(-90 16 16)" />
  </svg>;
}
// The place you stand in is a goal you can finish; the whole city stays in view below it.
function ProgressCard({ room, visited, checked, states, onJournal }: { room: number; visited: string[]; checked: string[]; states: ReturnType<typeof roomStates>; onJournal: () => void }) {
  const { t, locale } = useLocale();
  const place = room >= 0 && room < rooms.length ? states[room] : null;
  const seen = new Set(visited), learned = new Set(checked);
  const explored = states.filter((p) => p.state === "explored" || p.state === "mastered").length;
  return <div className="visit-progress" data-state={place?.state ?? "city"}>
    {place ? <button className="place-progress" onClick={onJournal} aria-label={`${t("Your city journal")}: ${placeLabel(room, locale)} ${place.discovered} / ${place.total}`}>
      <Ring value={place.discovered} total={place.total} />
      <div>
        <small className="place-name">{rooms[room].house ? `${t(rooms[room].house!.kind === "root" ? "Root house" : "Townhouse")} · ${placeLabel(room, locale)}` : placeLabel(room, locale)}</small>
        <strong>{place.discovered}<span> / {place.total}</span></strong>
        <small>{t(place.state === "mastered" ? "every word learned" : place.state === "explored" ? "explored · check words to master" : "discovered here")}</small>
        <span className="word-dots" role="img" aria-label={`${place.discovered} / ${place.total} ${t("discovered")}, ${place.learned} ${t("learned")}`}>
          {ROOM_WORDS[room].map((id) => <i key={id} data-state={learned.has(id) ? "learned" : seen.has(id) ? "seen" : "new"} />)}
        </span>
      </div>
      {(place.state === "explored" || place.state === "mastered") && <Trophy className="place-badge" size={17} />}
    </button> : null}
    <button className="city-progress" onClick={onJournal} aria-label={`${t("Your city journal")}: ${visited.length} / ${exhibits.length} ${t("words discovered")}`}>
      <span className="progress-flower"><Sparkles size={15} /></span>
      <div>
        <strong className="city-count">{visited.length}<span> / {exhibits.length}</span></strong>
        <small>{t("words discovered")} · {explored} {t("places explored")}</small>
      </div>
      {!place && <Ring value={visited.length} total={exhibits.length} />}
    </button>
  </div>;
}
function DirectionPad({
  onMove,
}: {
  onMove: (
    direction: "forward" | "back" | "left" | "right",
    active: boolean,
  ) => void;
}) {
  const { t } = useLocale();
  const directions = [
    { id: "forward" as const, Icon: ArrowUp, label: t("Walk forward") },
    { id: "left" as const, Icon: ArrowLeft, label: t("Walk left") },
    { id: "back" as const, Icon: ArrowDown, label: t("Walk backward") },
    { id: "right" as const, Icon: ArrowRight, label: t("Walk right") },
  ];
  return (
    <div className="direction-pad" aria-label={t("Walking controls")}>
      {directions.map(({ id, Icon, label }) => (
        <button
          key={id}
          className={`move-${id}`}
          aria-label={label}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            onMove(id, true);
          }}
          onPointerUp={() => onMove(id, false)}
          onPointerCancel={() => onMove(id, false)}
          onLostPointerCapture={() => onMove(id, false)}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              onMove(id, true);
            }
          }}
          onKeyUp={() => onMove(id, false)}
          onBlur={() => onMove(id, false)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
export default function App() {
  const { locale, setLocale, t } = useLocale();
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const hostRef = useRef<HTMLDivElement>(null);
  const museum = useRef<Museum | null>(null);
  const ambienceRef = useRef<AudioContext | null>(null);
  const soundscapeRef = useRef<Soundscape | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pose, setPose] = useState<Pose>({
    ...ENTRY,
    room: 1,
  });
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const [intro, setIntro] = useState(true);
  const [gamesRoom, setGamesRoom] = useState<number | null>(null);
  const [gamesPlaying, setGamesPlaying] = useState(false);
  const [gameAudio, setGameAudio] = useState(false);
  const [resident, setResident] = useState<Resident | null>(null);
  const [selected, setSelected] = useState<Exhibit | null>(null);
  const [details, setDetails] = useState<(ExhibitDetails & { id: string }) | null>(null);
  const [selectedArea, setSelectedArea] = useState(0);
  const [videoExhibit, setVideoExhibit] = useState<Exhibit | null>(null);
  const [artworkExhibit, setArtworkExhibit] = useState<Exhibit | null>(null);
  const [hovered, setHovered] = useState<Exhibit | null>(null);
  const [hoverAction, setHoverAction] = useState<"open" | "check" | "video">(
    "open",
  );
  const [modal, setModal] = useState<"map" | "collection" | "help" | "walk" | "album" | "journal" | null>(
    null,
  );
  const [visited, setVisited] = useProgress("vocabhall.visited.v1");
  const [saved, setSaved] = useProgress("vocabhall.saved.v1");
  const [checked, setChecked] = useProgress("vocabhall.learned.v1");
  const checkedRef = useRef(checked);
  checkedRef.current = checked;
  const states = useMemo(() => roomStates(visited, checked), [visited, checked]);
  const [walk, setWalk] = useState<DailyWalk>(() => todaysWalk(readDaily(validIds), exhibits, visited, checked));
  const walkRef = useRef(walk);
  walkRef.current = walk;
  useEffect(() => { saveDaily(walk); }, [walk]);
  // A new day brings a new walk, even if the tab stayed open overnight.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && walkRef.current.day !== dayKey())
        setWalk(todaysWalk(walkRef.current, exhibits, visitedRef.current, checkedRef.current));
      if (document.visibilityState === "visible" && labelsRef.current.day !== dayKey())
        setLabels(todaysLabels(labelsRef.current, exhibits, ROOT_START, checkedRef.current, dayKey()));
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  const [favours, setFavours] = useState<FavourBook>(() => readFavours(RESIDENTS, validIds));
  const favoursRef = useRef(favours);
  favoursRef.current = favours;
  useEffect(() => { saveFavours(favours); }, [favours]);
  const askFavour = (npc: Resident, exclude: string[]) => {
    const entry = favours[npc.id] ?? { level: 0, active: null, asked: [] };
    const ids = favourWords(npc, exhibits, checked, entry.asked, exclude);
    setFavours({ ...favours, [npc.id]: { ...entry, active: { ids, found: [] }, asked: [...new Set([...entry.asked, ...ids])] } });
  };
  const handOver = (npc: Resident) => {
    const entry = favours[npc.id];
    if (!entry || !favourFound(entry.active)) return;
    setFavours({ ...favours, [npc.id]: { ...entry, level: entry.level + 1, active: null } });
    museum.current?.cheerResident(npc.id);
  };
  const walkTargets = walk.ids.filter((id) => !walk.found.includes(id));
  const visitedSet = useMemo(() => new Set(visited), [visited]);
  const stylesComplete = STYLE_SETS.filter((set) => set.ids.every((id) => visitedSet.has(id))).length;
  const walkStreak = streak(walk.completed, walk.day);
  const visitedRef = useRef(visited);
  visitedRef.current = visited;
  const sfx = useSfxEnabled();
  const toggleChecked = useCallback(
    (exhibit: Exhibit) => {
      if (!checkedRef.current.includes(exhibit.id)) {
        playSfx("learned");
        celebrate("spark");
        celebratePlaces(newlyComplete(roomsOf(exhibit), ROOM_WORDS, new Set(checkedRef.current), exhibit.id), "mastered", localeRef.current);
      }
      setChecked((current) =>
        current.includes(exhibit.id)
          ? current.filter((id) => id !== exhibit.id)
          : [...current, exhibit.id],
      );
    },
    [setChecked],
  );
  const [evening, setEvening] = useState(false);
  const [ambient, setAmbient] = useState(false);
  const [tour, setTour] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState("");
  const [postcardBusy, setPostcardBusy] = useState(false);
  const revisit = useReviewIds();
  const [roomTransition, setRoomTransition] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const roomTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }, []);
  const playback = useExhibitAudio(selected?.id, showToast);
  const openExhibit = useCallback(
    (exhibit: Exhibit, area = exhibit.room) => {
      setIntro(false);
      setSelected(exhibit);
      setSelectedArea(area);
      setModal(null);
      // Play inside the opening gesture so mobile browsers allow pronunciation.
      void playback.start([wordClip(exhibit)]);
      const today = walkRef.current;
      if (today.ids.includes(exhibit.id) && !today.found.includes(exhibit.id)) {
        const found = [...today.found, exhibit.id];
        const done = found.length === today.ids.length;
        const completed = done && !today.completed.includes(today.day) ? [...today.completed, today.day] : today.completed;
        const next = { ...today, found, completed };
        walkRef.current = next;
        setWalk(next);
        const l = localeRef.current;
        setTimeout(() => {
          if (done) {
            playSfx("complete"); celebrate("confetti");
            const days = streak(completed, today.day);
            announce(translate("Today's walk is complete!", l), `${days} ${translate(days === 1 ? "day in a row" : "days in a row", l)}`);
          } else {
            playSfx("correct"); celebrate("spark");
            announce(translate("A star for today's walk!", l), `${found.length} / ${today.ids.length} ${translate("found", l)}`);
          }
        }, 700);
      }
      for (const npc of RESIDENTS) {
        const book = favoursRef.current, favour = book[npc.id]?.active;
        if (!favour?.ids.includes(exhibit.id) || favour.found.includes(exhibit.id)) continue;
        const found = [...favour.found, exhibit.id];
        const next = { ...book, [npc.id]: { ...book[npc.id], active: { ...favour, found } } };
        favoursRef.current = next;
        setFavours(next);
        const l = localeRef.current;
        setTimeout(() => {
          playSfx("correct"); celebrate("spark");
          announce(found.length === favour.ids.length ? `${translate("Bring them back to", l)} ${npc.name}` : `${npc.name}: ${translate("That's one for me!", l)}`,
            `${found.length} / ${favour.ids.length} ${translate("found", l)}`);
        }, 800);
      }
      if (!visitedRef.current.includes(exhibit.id)) {
        const style = styleOf(STYLE_SETS, exhibit.id);
        const milestone = styleMilestone(style, new Set(visitedRef.current), exhibit.id);
        if (style && (milestone === "complete" || (milestone === "first" && style.rare))) {
          const l = localeRef.current, name = l === "zh_TW" ? style.mediumZh : style.medium;
          const found = style.ids.filter((id) => id === exhibit.id || visitedRef.current.includes(id)).length;
          setTimeout(() => {
            if (milestone === "complete") { playSfx("complete"); celebrate("confetti"); }
            else { playSfx("learned"); celebrate("spark"); }
            announce(translate(milestone === "complete" ? "Style complete!" : "A new style for your album", l), `${name} · ${found} / ${style.ids.length}`);
          }, 1000);
        }
        const count = visitedRef.current.length + 1, l = localeRef.current;
        if (WORD_MILESTONES.includes(count) || count === exhibits.length)
          setTimeout(() => { playSfx("complete"); celebrate("confetti"); announce(`${count} ${translate("words discovered", l)}${l === "zh_TW" ? "！" : "!"}`, translate(count === exhibits.length ? "Every word in the city. Bravo!" : "Keep wandering. The city has more to show you.", l)); }, 1200);
        playSfx("discover");
        celebratePlaces(newlyComplete(roomsOf(exhibit), ROOM_WORDS, new Set(visitedRef.current), exhibit.id), "explored", localeRef.current);
      }
      setVisited((current) =>
        current.includes(exhibit.id) ? current : [...current, exhibit.id],
      );
    },
    [setVisited, playback.start],
  );
  // Lost labels: paintings clicked in the city may first ask for their missing word.
  const [labels, setLabels] = useState<LostLabels>(() => todaysLabels(readLabels(validIds), exhibits, ROOT_START, checked, dayKey()));
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  useEffect(() => { saveLabels(labels); }, [labels]);
  const lostNow = visited.length >= LOST_LABELS_AFTER ? labels.ids.filter((id) => !labels.restored.includes(id)) : [];
  const lostRef = useRef(lostNow);
  lostRef.current = lostNow;
  const [labelQuiz, setLabelQuiz] = useState<{ exhibit: Exhibit; area: number; wrong: string[] } | null>(null);
  const sceneSelect = useCallback((exhibit: Exhibit, area?: number) => {
    if (lostRef.current.includes(exhibit.id)) {
      setIntro(false);
      setLabelQuiz({ exhibit, area: area ?? exhibit.room, wrong: [] });
      return;
    }
    openExhibit(exhibit, area);
  }, [openExhibit]);
  const restoreLabel = (choice: Exhibit) => {
    if (!labelQuiz) return;
    if (choice.id !== labelQuiz.exhibit.id) {
      playSfx("wrong"); recordMiss(labelQuiz.exhibit.id);
      setLabelQuiz({ ...labelQuiz, wrong: [...labelQuiz.wrong, choice.id] });
      return;
    }
    if (!labelQuiz.wrong.length) recordRight(choice.id);
    const today = labelsRef.current;
    const next = { ...today, restored: [...today.restored, choice.id], total: today.total + 1 };
    labelsRef.current = next;
    setLabels(next);
    setLabelQuiz(null);
    playSfx("correct"); celebrate("confetti");
    announce(t("Label restored!"), `${next.restored.length} / ${next.ids.length} ${t("lost labels found today")}`, true);
    openExhibit(choice, labelQuiz.area);
  };
  useEffect(() => {
    let live = true;
    void Promise.allSettled([
      document.fonts.load('400 24px "DM Sans"'),
      document.fonts.load('400 40px "Cormorant Garamond"'),
    ]).then(() => {
      if (!live || !hostRef.current) return;
      try {
        museum.current = new Museum(hostRef.current, {
          exhibits,
          rooms,
          checked: checkedRef.current,
          onToggleChecked: toggleChecked,
          onVideo: setVideoExhibit,
          locale: localeRef.current,
          onSelect: sceneSelect,
          onHover: (exhibit, action = "open") => {
            setHovered(exhibit);
            setHoverAction(action);
          },
          onMove: setPose,
          onResident: setResident,
          onReady: () => setReady(true),
          onError: setError,
        });
      } catch (failure) {
        console.error(failure);
        setError(
          "This browser could not start the 3D gallery. You can still explore every word in the Collection. Try a browser with WebGL enabled for the walkable museum.",
        );
        setReady(true);
      }
    });
    return () => {
      live = false;
      museum.current?.dispose();
      museum.current = null;
    };
  }, [sceneSelect, toggleChecked]);
  useEffect(() => {
    museum.current?.setBlocked(
      Boolean(resident || selected || modal || videoExhibit || artworkExhibit || labelQuiz || (gamesRoom !== null && !gamesPlaying)),
      Boolean(resident),
    );
  }, [resident, selected, modal, videoExhibit, artworkExhibit, labelQuiz, ready, gamesRoom, gamesPlaying]);
  const encountersEnabled = ready && !error && !intro && !resident && !selected && !modal && !videoExhibit && !artworkExhibit && !labelQuiz && gamesRoom === null;
  const nearby = encountersEnabled ? nearbyResident(pose) : null;
  useEffect(() => { museum.current?.setResidentsEnabled(encountersEnabled); }, [encountersEnabled]);
  useEffect(() => { if (resident) playback.stop(); }, [resident, playback.stop]);
  const closeResident = () => { setResident(null); hostRef.current?.querySelector("canvas")?.focus(); };
  useEffect(() => {
    if (selected || modal || videoExhibit || artworkExhibit) setGamesRoom(null);
  }, [selected, modal, videoExhibit, artworkExhibit]);
  useEffect(() => {
    museum.current?.setChecked(checked);
  }, [checked, ready]);
  const friendshipKey = RESIDENTS.map((npc) => favours[npc.id]?.level ?? 0).join();
  useEffect(() => {
    museum.current?.setFriendship(Object.fromEntries(RESIDENTS.map((npc) => [npc.id, favours[npc.id]?.level ?? 0])));
  }, [friendshipKey, ready]);
  useEffect(() => {
    museum.current?.setLostLabels(lostNow);
  }, [lostNow.join(), ready]);
  useEffect(() => {
    museum.current?.setWalkTargets(walkTargets);
  }, [walkTargets.join(), ready]);
  const placeStateList = states.map((place) => place.state).join();
  useEffect(() => {
    museum.current?.setPlaceStates(states.map((place) => place.state));
    // Only resend when a place changes state, not on every discovery.
  }, [placeStateList, ready]);
  useEffect(() => {
    if (videoExhibit) playback.stop();
  }, [videoExhibit, playback.stop]);
  // Flashcard details (senses, collocations, pronunciation symbols) load on demand.
  useEffect(() => {
    if (!selected) return;
    const id = selected.id;
    if (details?.id === id) return;
    let live = true;
    fetch(assetUrl(`data/exhibits/${id}.json`))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: ExhibitDetails) => { if (live) setDetails({ ...data, id }); })
      .catch(() => { if (live) setDetails({ id, ipa: "", kk: "", synonyms: [], senses: [], collocations: [] }); });
    return () => { live = false; };
  }, [selected, details?.id]);
  const current = details?.id === selected?.id ? details : null;
  useEffect(() => {
    museum.current?.setLocale(locale);
  }, [locale, ready]);
  useEffect(() => {
    museum.current?.setEvening(evening);
  }, [evening, ready]);
  useEffect(() => {
    soundscapeRef.current?.setVolume(videoExhibit ? 0 : playback.active || gameAudio ? 0.25 : 0.9);
  }, [playback.active, videoExhibit, gameAudio]);
  useEffect(() => { soundscapeRef.current?.setPosition(pose); }, [pose]);
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(roomTimer.current);
      soundscapeRef.current?.dispose();
      void ambienceRef.current?.close();
    },
    [],
  );
  const navigateRoom = (room: number) => {
    setGamesRoom(null);
    setIntro(false);
    setModal(null);
    setSelected(null);
    setHovered(null);
    setRoomTransition(true);
    museum.current?.goToRoom(room);
    clearTimeout(roomTimer.current);
    roomTimer.current = setTimeout(() => setRoomTransition(false), 350);
  };
  const visit = (exhibit: Exhibit, preferredArea?: number) => {
    // Start speech while the click still has browser audio permission, before building a distant room.
    openExhibit(exhibit, preferredArea ?? exhibit.room);
    const area = museum.current?.goToExhibit(exhibit, preferredArea);
    if (area !== undefined) setSelectedArea(area);
  };
  const filteredRoom = /^room-/.test(filter) ? Number(filter.slice(5)) : undefined;
  const toggleSaved = (exhibit: Exhibit) => {
    const exists = saved.includes(exhibit.id);
    setSaved((current) =>
      exists
        ? current.filter((id) => id !== exhibit.id)
        : [...current, exhibit.id],
    );
    showToast(
      exists
        ? locale === "zh_TW"
          ? `已將「${exhibit.word}」移出收藏`
          : `“${exhibit.word}” removed from your collection`
        : locale === "zh_TW"
          ? `已收藏「${exhibit.word}」`
          : `“${exhibit.word}” saved to your collection`,
    );
  };
  const exampleClip = (exhibit: Exhibit) => ({
    key: "example",
    url: exhibit.exampleAudio,
    text: exhibit.example,
  });
  const toggleAmbience = async () => {
    try {
      if (!ambienceRef.current) {
        const ctx = new AudioContext();
        ambienceRef.current = ctx;
        soundscapeRef.current = new Soundscape(ctx);
        soundscapeRef.current.setPosition(poseRef.current);
      }
      if (ambient) await ambienceRef.current.suspend();
      else await ambienceRef.current.resume();
      setAmbient(!ambient);
    } catch {
      showToast(t("Ambient sound is unavailable in this browser."));
    }
  };
  const nextExhibit = (delta: number) => {
    const index = selected
      ? exhibits.findIndex((e) => e.id === selected.id)
      : -1;
    if (tour && delta === 1 && index === exhibits.length - 1) {
      setTour(false);
      navigateRoom(0);
      showToast(t("All words discovered. Keep your curiosity close."));
      return;
    }
    visit(exhibits[(index + delta + exhibits.length) % exhibits.length]);
  };
  const startTour = () => {
    setTour(true);
    visit(exhibits[0]);
  };
  // Continue the tour from the first painting not yet seen where the visitor stands.
  const tourFromHere = () => {
    const here = pose.room < rooms.length ? ROOM_WORDS[pose.room].map((id) => EXHIBIT_BY_ID.get(id)!) : [];
    const next = here.find((e) => !visitedSet.has(e.id)) ?? exhibits.find((e) => !visitedSet.has(e.id)) ?? exhibits[0];
    setTour(true);
    visit(next, pose.room < rooms.length ? pose.room : undefined);
  };
  const closeExhibit = () => {
    setSelected(null);
    setTour(false);
  };
  const filtered = exhibits.filter(
    (e) =>
      (filter !== "saved" || saved.includes(e.id)) &&
      (filter !== "revisit" || revisit.includes(e.id)) &&
      (!/^room-/.test(filter) || e.room === Number(filter.slice(5)) || e.families?.some((family) => family.room === Number(filter.slice(5)))) &&
      `${e.word} ${e.definition} ${Object.values(e.translations).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const launchGames = () => {
    playback.stop(); setSelected(null); setModal(null); setTour(false); setIntro(false);
    setGamesRoom(isRootRoom(pose.room) ? pose.room : ROOT_START);
  };
  const currentRoom = destinationFor(pose.room);
  return (
    <div className={`app-shell ${gamesPlaying ? "is-gaming" : ""}`}>
      <Celebrations />
      <header className="site-header">
        <button
          className="brand"
          onClick={() => {
            setSelected(null);
            setModal(null);
            setIntro(true);
            setGamesRoom(null);
            museum.current?.goToGate();
          }}
          aria-label={t("Vocab City harbour")}
        >
          <MuseumLogo />
          <span>
            vocab<span className="brand-italic">hall</span>
            <small>{t("A CITY OF WORDS")}</small>
          </span>
        </button>
        <nav className="main-nav" aria-label={t("Main navigation")}>
          <button
            className={modal !== "collection" && modal !== "album" ? "active" : ""}
            onClick={() => {
              setModal(null);
              setSelected(null);
            }}
          >
            {t("The museum")}
          </button>
          <button
            className={modal === "collection" ? "active" : ""}
            onClick={() => {
              setFilter("all");
              setModal("collection");
            }}
          >
            {t("The collection")}
            <span>{exhibits.length}</span>
          </button>
          <button
            className={`album-tab ${modal === "album" ? "active" : ""}`}
            onClick={() => setModal("album")}
          >
            {t("Album")}
            <span>{stylesComplete} / {STYLE_SETS.length}</span>
          </button>
        </nav>
        <div className="header-actions">
          <button className="games-launch" onClick={launchGames} disabled={!ready || !!error} aria-label={t("Museum games")}><Gamepad2 size={20} /><span>{t("Games")}</span></button>
          <button
            className="language-button"
            aria-label={
              locale === "zh_TW" ? "Switch to English" : "切換繁體中文"
            }
            onClick={() => setLocale(locale === "zh_TW" ? "" : "zh_TW")}
          >
            {locale === "zh_TW" ? "繁中" : "EN"}
          </button>
          <span className="open-label">
            <i />
            {t("ALWAYS OPEN")}
          </span>
          <button
            className="icon-button"
            onClick={() => setEvening(!evening)}
            aria-label={
              evening ? t("Switch to daylight") : t("Switch to evening light")
            }
            title={evening ? t("Daylight") : t("Evening light")}
          >
            {evening ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className="icon-button"
            onClick={() => setModal("help")}
            aria-label={t("How to explore")}
          >
            <HelpCircle size={19} />
          </button>
          <button className="icon-button album-nav" onClick={() => setModal("album")} aria-label={`${t("Album")}: ${stylesComplete} / ${STYLE_SETS.length}`}>
            <Images size={18} />
          </button>
          <span className="header-divider" />
          <button
            className="saved-nav"
            onClick={() => {
              setFilter("saved");
              setModal("collection");
            }}
          >
            <Bookmark size={17} />
            <span>{t("My words")}</span>
            <b>{saved.length}</b>
          </button>
        </div>
      </header>

      <main className="museum-stage" aria-label={t("City")}>
        <div
          ref={hostRef}
          className={`scene ${roomTransition ? "room-transition" : ""}`}
        />
        <div className="vignette" />
        {!ready && (
          <div className="loading">
            <MuseumLogo />
            <p>{t("Preparing your museum…")}</p>
            <span>{t("A little wonder awaits.")}</span>
          </div>
        )}
        <div className="gallery-heading">
          <span className="eyebrow">{t("THE CITY OF WORDS")}</span>
          <button onClick={() => setModal("map")}>
            <span className={`gallery-number ${isRootRoom(pose.room) ? "is-root" : ""}`}>
              {pose.room === SQUARE_INDEX ? (
                <Landmark size={27} />
              ) : pose.room === STREETS_INDEX ? (
                <Sprout size={27} />
              ) : isRootRoom(pose.room) ? (
                rooms[pose.room].house!.display
              ) : (
                String(pose.room + 1).padStart(2, "0")
              )}
            </span>
            <span>
              <small>{t("YOU ARE WANDERING THROUGH")}</small>
              <strong>{t(currentRoom.name)}</strong>
            </span>
            <ChevronDown size={16} />
          </button>
        </div>
        <div className="hud-right">
        <ProgressCard room={pose.room} visited={visited} checked={checked} states={states} onJournal={() => setModal("journal")} />
        {!intro && <button className="walk-chip" data-complete={walk.found.length === walk.ids.length} onClick={() => setModal("walk")}
          aria-label={`${t("Today's walk")}: ${walk.found.length} / ${walk.ids.length}`}>
          <Star size={15} fill={walk.found.length === walk.ids.length ? "currentColor" : "none"} />
          <span>{t("Today's walk")}</span>
          <b>{walk.found.length} / {walk.ids.length}</b>
          {walkStreak > 0 && <em title={t("days in a row")}><Flame size={13} />{walkStreak}</em>}
        </button>}
        {!intro && <div className="favour-chips">{RESIDENTS.filter((npc) => favours[npc.id]?.active).map((npc) => {
          const favour = favours[npc.id].active!, done = favourFound(favour);
          return <button key={npc.id} className="favour-chip" data-ready={done} style={{ "--resident-color": npc.color } as React.CSSProperties}
            onClick={() => { setModal(null); setSelected(null); setIntro(false); museum.current?.visitResident(npc.id); hostRef.current?.querySelector("canvas")?.focus(); }}
            aria-label={`${t("Favour for")} ${npc.name}: ${favour.found.length} / ${favour.ids.length}${done ? `. ${t("Bring them back to")} ${npc.name}` : ""}`}>
            <Heart size={14} fill={done ? "currentColor" : "none"} /><span>{npc.name}</span><b>{favour.found.length} / {favour.ids.length}</b>
          </button>;
        })}</div>}
        </div>

        {intro && ready && !error && (
          <section className="welcome-card">
            <div className="mascot-greeting">
              <img src={assetUrl("mascot/welcome.webp")} alt={t("Handy 990 mascot waving hello")} />
              <span className="welcome-tag">{t("YOUR LITTLE MUSEUM GUIDE")}</span>
            </div>
            <h1>{t("Hello! Welcome to Vocab City.")}</h1>
            <p>{fill(t("Step through the sea gate. Discover {n} words on the quay, in the squares, under the arcades, in the cathedral, the park and the market, and in {houses} townhouses of the Old Town."))}</p>
            <button
              className="primary-button"
              onClick={() => {
                setIntro(false);
                hostRef.current?.querySelector("canvas")?.focus();
              }}
            >
              {t("Start exploring")}
              <ArrowRight size={17} />
            </button>
            <button className="text-button" onClick={startTour}>
              <Headphones size={15} />
              {t("Take a guided tour")}
              <span>{exhibits.length} {t("stops")}</span>
            </button>
            <button className="text-button" onClick={() => { setIntro(false); setModal("walk"); }}><Star size={16} />{t("Today's walk")}<span>{WALK_SIZE} {t("paintings to find")}</span></button>
            <button className="text-button" onClick={launchGames}><Gamepad2 size={17} />{t("Play with words")}<ArrowRight size={15} /></button>
            <button className="welcome-news" onClick={() => setModal("help")}>
              <Sparkles size={14} /><span><b>{t("New in the city")}</b> {t("A daily walk, neighbours' favours, lost labels, an art album, postcards and a glowing evening.")}</span>
            </button>
            <div className="welcome-footnote">
              <span>15 {t("LANDMARKS")} · {houses.length} √</span>
              <span>{t("A WORLD TO WANDER. WORDS TO DISCOVER.")}</span>
            </div>
          </section>
        )}
        {!intro && (
          <div className="explore-note">
            <span className="eyebrow">{t("TAKE YOUR TIME")}</span>
            <p>{t(currentRoom.subtitle)}</p>
            <div className="explore-links">
              <button onClick={tourFromHere}>
                <Play size={12} />
                {t("Tour from here")}
              </button>
              <button onClick={() => navigateRoom(pose.room === SQUARE_INDEX ? 0 : SQUARE_INDEX)}>
                {pose.room === SQUARE_INDEX ? <ArrowLeft size={13} /> : <Landmark size={13} />}
                {t(pose.room === SQUARE_INDEX ? "Back to the Gate Square" : "Visit the Cathedral Square")}
              </button>
              <button onClick={() => navigateRoom(isRootRoom(pose.room) || pose.room === STREETS_INDEX ? 1 : STREETS_INDEX)}>
                <Sprout size={13} />
                {t(isRootRoom(pose.room) || pose.room === STREETS_INDEX ? "Back to the harbour" : "Visit the Old Town")}
              </button>
            </div>
          </div>
        )}
        {hovered && !selected && !modal && !videoExhibit && (
          <div className="art-hover">
            <span>{t("DISCOVER THIS WORD")}</span>
            <strong>{lostNow.includes(hovered.id) ? t("A label blew away!") : hovered.word}</strong>
            <span>
              {t(
                hoverAction === "video"
                  ? "Watch video examples"
                  : hoverAction === "check"
                    ? checked.includes(hovered.id)
                      ? "Uncheck to bring back the glow"
                      : "Check to settle the glowing frame"
                    : "Click to take a closer look",
              )}
              <MoveUpRight size={13} />
            </span>
          </div>
        )}
        {!isRootRoom(pose.room) && pose.room !== STREETS_INDEX && !intro && (
          <button className="next-place-link" onClick={() => navigateRoom(nextDistrict(pose.room))}>
            <Landmark size={16} />
            <span>{t("Next stop")} · {t(destinationFor(nextDistrict(pose.room)).name)}</span>
            <ArrowRight size={15} />
          </button>
        )}
        {(isRootRoom(pose.room) || pose.room === STREETS_INDEX) && !intro && (
          <button className="next-place-link" onClick={() => navigateRoom(nextRootRoom(pose.room))}>
            <Sprout size={16} />
            <span>{t(nextRootRoom(pose.room) === SQUARE_INDEX ? "Back to the square" : "Next house")} · {t(destinationFor(nextRootRoom(pose.room)).name)}</span>
            <ArrowRight size={15} />
          </button>
        )}
        <MiniMap pose={pose} onOpen={() => setModal("map")} states={states} targets={walkTargets} />
        <div className="bottom-controls">
          <div className="walk-help">
            <span className="key-group">
              <kbd>W</kbd>
              <span>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd>
              </span>
            </span>
            <span>{t("Hold W to accelerate")}</span>
          </div>
          <span className="control-divider" />
          <div className="look-help">
            <Mouse size={20} />
            <span>{t("Drag to look")}</span>
          </div>
          <span className="control-divider" />
          <button onClick={() => setModal("map")}>
            <Map size={18} />
            <span>{t("Floor map")}</span>
          </button>
          <span className="control-divider" />
          <button
            onClick={() => void toggleAmbience()}
            aria-pressed={ambient}
            aria-label={ambient ? t("Mute ambience") : t("Play ambience")}
          >
            {ambient ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span>
              {t("Ambience")}{" "}
              {ambient ? t("on") : t("off")}
            </span>
          </button>
          <span className="control-divider" />
          <button
            onClick={() => { setSfxEnabled(!sfx); if (!sfx) setTimeout(() => playSfx("tap")); }}
            aria-pressed={sfx}
            aria-label={sfx ? t("Turn off sound effects") : t("Turn on sound effects")}
          >
            {sfx ? <Bell size={17} /> : <BellOff size={17} />}
            <span>
              {t("Effects")}{" "}
              {sfx ? t("on") : t("off")}
            </span>
          </button>
        </div>
        <DirectionPad
          onMove={(direction, active) =>
            museum.current?.setMovement(direction, active)
          }
        />
        <span className="source-credit">
          {t("WORDS FROM HANDY 990 · ART BY VOCAB CITY")}
        </span>
        {gamesRoom !== null && <MuseumGames museum={museum} roomIndex={gamesRoom} room={rooms[gamesRoom]} pool={roomExhibits(gamesRoom)} rooms={rooms} exhibits={exhibits} checked={checked}
          onClose={() => { setGamesRoom(null); hostRef.current?.querySelector("canvas")?.focus(); }} onPlayingChange={setGamesPlaying} onAudioChange={setGameAudio} />}
        {nearby && <button className="resident-invite" onClick={() => setResident(nearby)} aria-label={`${t("Talk to")} ${nearby.name}`}>
          <MessageCircle size={23} /><span><strong>{t("Talk to")} {nearby.name}</strong><small>{t(nearby.role)} · {t("Three quick vocabulary questions")}</small></span><ArrowRight size={17} />
        </button>}
        {error && (
          <div className="error-banner" role="alert">
            <p>{t(error)}</p>
            <button
              onClick={() => {
                setFilter("all");
                setModal("collection");
              }}
            >
              {t("Browse the collection")}
              <ArrowRight size={15} />
            </button>
            <button
              className="icon-button"
              onClick={() => setError("")}
              aria-label={t("Dismiss message")}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </main>

      {resident && <Dialog className="resident-dialog" label={`${t("Vocab chat")}: ${resident.name}`} onClose={closeResident}>
        <ResidentQuiz key={resident.id} resident={resident} exhibits={exhibits} checked={checked} onClose={closeResident} onAudioChange={setGameAudio}
          friendship={favours[resident.id]} onAskFavour={(exclude) => askFavour(resident, exclude)} onHandOver={() => handOver(resident)} />
      </Dialog>}
      {selected && (
        <Dialog
          className="exhibit-dialog"
          label={`${locale === "zh_TW" ? "單字展品" : "Vocabulary exhibit"}: ${selected.word}`}
          onClose={closeExhibit}
          resetKey={selected.id}
        >
          <div className="exhibit-sheet">
            <div className="sheet-top">
              <span className="eyebrow">
                {isRootRoom(selectedArea)
                  ? `${t(rooms[selectedArea].house!.kind === "root" ? "ROOT FAMILY" : "TOWNHOUSE")} · ${rooms[selectedArea].house!.display}`
                  : t(districtFor(selectedArea).landmark).toUpperCase()}{" "}
                <span className="dot-separator">/</span>
                {t("EXHIBIT")}{" "}
                {String(exhibits.indexOf(selected) + 1).padStart(2, "0")}
              </span>
              <button
                className="icon-button"
                onClick={closeExhibit}
                aria-label={t("Close exhibit")}
              >
                <X size={20} />
              </button>
            </div>
            <div
              className="exhibit-art learning-frame"
              data-checked={checked.includes(selected.id)}
            >
              <div
                className="headword-banner"
                data-long-word={selected.word.length > 11}
              >
                <LearnedCheckbox
                  exhibit={selected}
                  checked={checked.includes(selected.id)}
                  onChange={() => toggleChecked(selected)}
                />
                <h2>{selected.word}</h2>
                <button
                  className={`pronounce-button ${playback.active === "word" ? "playing" : ""}`}
                  aria-label={
                    playback.active === "word"
                      ? t("Stop playback")
                      : `${t("Listen to word")}: ${selected.word}`
                  }
                  onClick={() => void playback.play([wordClip(selected)])}
                >
                  {playback.active === "word" ? (
                    <Pause size={19} />
                  ) : (
                    <Volume2 size={19} />
                  )}
                </button>
              </div>
              <button
                className="artwork-zoom"
                aria-label={`${t("View artwork")}: ${selected.word}`}
                onClick={() => setArtworkExhibit(selected)}
              >
                <img
                  src={assetUrl(selected.image)}
                  alt={
                    selected.artwork
                      ? locale === "zh_TW"
                        ? selected.artwork.titleZh
                        : selected.artwork.title
                      : selected.word
                  }
                />
                <span>
                  <Expand size={15} />
                  {t("View artwork")}
                </span>
              </button>
              {selected.artwork && (
                <div className="artwork-caption">
                  <strong>
                    {locale === "zh_TW"
                      ? selected.artwork.titleZh
                      : selected.artwork.title}
                  </strong>
                  <small>
                    {locale === "zh_TW"
                      ? selected.artwork.mediumZh
                      : selected.artwork.medium}
                  </small>
                </div>
              )}
              <div className="art-caption-row">
                <button
                  className="watch-video-button"
                  onClick={() => setVideoExhibit(selected)}
                  aria-label={`${t("Watch video examples")}: ${selected.word}`}
                  title={t("Watch video examples")}
                >
                  <YouTubeLogo />
                </button>
                <span className="art-edition">
                  {t(
                    checked.includes(selected.id)
                      ? "LEARNED · GLOW SETTLED"
                      : "CHECK THE BOX TO SETTLE THE GLOW",
                  )}
                </span>
              </div>
              <button
                className={`save-art icon-button ${saved.includes(selected.id) ? "is-saved" : ""}`}
                onClick={() => toggleSaved(selected)}
                aria-label={
                  saved.includes(selected.id)
                    ? t("Remove saved word")
                    : t("Save word")
                }
                aria-pressed={saved.includes(selected.id)}
              >
                <Bookmark
                  size={19}
                  fill={saved.includes(selected.id) ? "currentColor" : "none"}
                />
              </button>
            </div>
            <div className="exhibit-copy">
              <div className="word-meta">
                <span>{t(partOfSpeech(selected.pos))}</span>
                <span>{current?.ipa ? `/${current.ipa}/` : "…"}</span>
                <span className="audio-accent">US</span>
              </div>
              <section
                className="audio-guide"
                aria-label={t("Listen & remember")}
              >
                <div className="audio-guide-heading">
                  <span>
                    <Headphones size={14} />
                    {t("Listen & remember")}
                  </span>
                  <label>
                    <select
                      aria-label={t("Playback speed")}
                      value={playback.rate}
                      onChange={(e) => playback.setRate(Number(e.target.value))}
                    >
                      <option value={0.75}>0.75×</option>
                      <option value={1}>1×</option>
                      <option value={1.25}>1.25×</option>
                    </select>
                  </label>
                </div>
                <div className="audio-actions">
                  <button
                    className={playback.active === "word" ? "active" : ""}
                    aria-pressed={playback.active === "word"}
                    onClick={() => void playback.play([wordClip(selected)])}
                  >
                    {playback.active === "word" ? (
                      <Pause size={14} />
                    ) : (
                      <Volume2 size={14} />
                    )}{" "}
                    {t("Listen to word")}
                  </button>
                  <button
                    className={playback.active === "example" ? "active" : ""}
                    aria-pressed={playback.active === "example"}
                    onClick={() => void playback.play([exampleClip(selected)])}
                  >
                    {playback.active === "example" ? (
                      <Pause size={14} />
                    ) : (
                      <Play size={14} />
                    )}{" "}
                    {t("Listen to sentence")}
                  </button>
                  <button
                    className={`play-all ${playback.sequence ? "active" : ""}`}
                    aria-pressed={playback.sequence}
                    onClick={() =>
                      void playback.play(
                        [wordClip(selected), exampleClip(selected)],
                        true,
                      )
                    }
                  >
                    {playback.sequence ? (
                      <Pause size={14} />
                    ) : (
                      <Headphones size={14} />
                    )}{" "}
                    {t(playback.sequence ? t("Stop playback") : t("Play all"))}
                  </button>
                </div>
                <div className="audio-status">
                  <span role="status">
                    {t(
                      playback.active === "word"
                        ? t("Listening to word")
                        : playback.active
                          ? t("Listening to sentence")
                          : t("Original US recordings"),
                    )}
                  </span>
                  <span>
                    {playback.active
                      ? `${Math.floor(playback.time)} / ${Math.ceil(playback.duration)} s`
                      : t("Word, then example")}
                  </span>
                </div>
                <progress
                  aria-label={t("Playback progress")}
                  max={playback.duration || 1}
                  value={playback.time}
                />
              </section>
              <p className="definition">{selected.definition}</p>
              <label className="translation-select">
                <BookOpen size={14} />
                <select
                  aria-label={t("Translation language")}
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                >
                  {languages.map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </label>
              {locale && (
                <div className="translation">
                  <strong>{selected.translations[locale]}</strong>
                  <p>{selected.definitionTranslations[locale]}</p>
                </div>
              )}
              <div
                className={`example-block ${playback.active === "example" ? "is-listening" : ""}`}
              >
                <div className="sentence-heading">
                  <span className="eyebrow">{t("A WORD IN THE WORLD")}</span>
                  <button
                    aria-label={`${t("Listen to sentence")}: ${selected.word}`}
                    onClick={() => void playback.play([exampleClip(selected)])}
                  >
                    {playback.active === "example" ? (
                      <Pause size={15} />
                    ) : (
                      <Volume2 size={15} />
                    )}
                  </button>
                </div>
                <p>“{selected.example}”</p>
                {locale && (
                  <small>{selected.exampleTranslations[locale]}</small>
                )}
              </div>
              {current && current.collocations.length > 0 && (
                <div className="collocations">
                  <span className="eyebrow">{t("OFTEN FOUND WITH")}</span>
                  <div>
                    {current.collocations.slice(0, 3).map((phrase) => (
                      <span key={phrase.text}>{phrase.text}</span>
                    ))}
                  </div>
                </div>
              )}
              {current && current.synonyms.length > 0 && (
                <p className="related">
                  <span>{t("Related words")}</span>
                  {current.synonyms.join(" · ")}
                </p>
              )}
              {selected.families?.map((family) => (
                <section className="root-family" aria-label={`${t("Word roots")}: ${family.root}`} key={family.room}>
                  <span className="eyebrow">{t("WORD ROOTS")}</span>
                  <div className="root-pieces">
                    {family.pieces.map((piece, i) => (
                      <span key={i} className={i === family.rootIndex ? "is-root" : ""}>
                        <b>{piece.surface}</b>
                        <small>{(locale && piece.translations[locale]) || piece.gloss}</small>
                      </span>
                    ))}
                  </div>
                  <p>
                    <em>{rooms[family.room].root!.display}</em> ·{" "}
                    {(locale && rooms[family.room].root!.translations[locale]) || rooms[family.room].root!.meaning} ·{" "}
                    {rooms[family.room].root!.origin}
                  </p>
                  {familyOf(selected, family.room).length > 0 && (
                    <div className="root-links">
                      <span>{t("Same root")}</span>
                      {familyOf(selected, family.room).map((relative) => (
                        <button key={relative.id} onClick={() => visit(relative)}>
                          {relative.word}
                          <MoveUpRight size={11} />
                        </button>
                      ))}
                      {family.room !== selectedArea && (
                        <button className="root-room-link" onClick={() => navigateRoom(family.room)}>
                          {t("Visit the room")}
                          <ArrowRight size={11} />
                        </button>
                      )}
                    </div>
                  )}
                </section>
              ))}
              {current && current.senses.length > 1 && (
                <details className="more-meanings">
                  <summary>
                    {locale === "zh_TW"
                      ? `還有 ${current.senses.length - 1} 個意思`
                      : `${current.senses.length - 1} more meanings`}
                    <ChevronDown size={14} />
                  </summary>
                  {current.senses.slice(1).map((sense, i) => (
                    <div key={i}>
                      <span>{t(partOfSpeech(sense.pos))}</span>
                      <p>{sense.gloss}</p>
                      {locale && sense.translations?.[locale] && (
                        <small>{sense.translations[locale]}</small>
                      )}
                      {sense.example && (
                        <>
                          <blockquote>{sense.example}</blockquote>
                          <button
                            className="sense-audio"
                            aria-pressed={playback.active === `sense-${i + 1}`}
                            onClick={() =>
                              void playback.play([
                                {
                                  key: `sense-${i + 1}`,
                                  url: sense.audio,
                                  text: sense.example!,
                                },
                              ])
                            }
                          >
                            {playback.active === `sense-${i + 1}` ? (
                              <Pause size={13} />
                            ) : (
                              <Volume2 size={13} />
                            )}{" "}
                            {t("Listen to sentence")}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </details>
              )}
              <button
                className={`save-word-button ${saved.includes(selected.id) ? "is-saved" : ""}`}
                onClick={() => toggleSaved(selected)}
              >
                {saved.includes(selected.id) ? (
                  <Check size={16} />
                ) : (
                  <Bookmark size={16} />
                )}{" "}
                {saved.includes(selected.id)
                  ? t("Saved to my words")
                  : t("Keep this word")}
              </button>
              <button
                className="postcard-button"
                disabled={postcardBusy}
                onClick={async () => {
                  setPostcardBusy(true);
                  try {
                    const place = selectedArea < rooms.length ? (rooms[selectedArea].house ? rooms[selectedArea].house!.display : translate(districtFor(selectedArea).landmark, "")) : "Vocab City";
                    const result = await sendPostcard(selected, place, (locale && selected.translations[locale]) || "", locale);
                    if (result !== "cancelled") { playSfx("stamp"); announce(t("A postcard from Vocab City!"), t(result === "shared" ? "Sent on its way." : "Saved as an image."), true); }
                  } catch {
                    announce(t("The postcard could not be made."), t("Please try again."), true);
                  } finally { setPostcardBusy(false); }
                }}
              >
                <Mail size={16} /> {t("Send a postcard")}
              </button>
            </div>
            <footer className="exhibit-footer">
              <button
                className="icon-button"
                aria-label={t("Previous exhibit")}
                onClick={() => nextExhibit(-1)}
              >
                <ChevronLeft size={20} />
              </button>
              <span>
                {tour ? t("YOUR GUIDED TOUR") : t("CONTINUE YOUR DISCOVERY")}
                <small>
                  {exhibits.indexOf(selected) + 1} / {exhibits.length}{" "}
                  {locale === "zh_TW" ? "個單字" : "words"}
                </small>
              </span>
              <button className="next-exhibit" onClick={() => nextExhibit(1)}>
                {tour && exhibits.indexOf(selected) === exhibits.length - 1
                  ? t("Finish tour")
                  : t("Next")}{" "}
                <ArrowRight size={17} />
              </button>
            </footer>
          </div>
        </Dialog>
      )}

      {modal === "collection" && (
        <Dialog
          className="collection-dialog"
          label={t("The vocabulary collection")}
          onClose={() => setModal(null)}
        >
          <section className="collection-sheet">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{t("WORDS WORTH KEEPING")}</span>
                <h2>
                  {t("The collection")}
                  <span>.</span>
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label={t("Close collection")}
              >
                <X size={21} />
              </button>
            </div>
            <p className="collection-description">
              {t("Little discoveries from your time in the museum.")}
            </p>
            <div className="collection-toolbar">
              <div className="collection-filters">
                <button
                  className={filter === "all" ? "active" : ""}
                  onClick={() => setFilter("all")}
                >
                  {t("All exhibits")}
                  <span>{exhibits.length}</span>
                </button>
                <button
                  className={filter === "saved" ? "active" : ""}
                  onClick={() => setFilter("saved")}
                >
                  <Bookmark size={14} />
                  {t("My words")}
                  <span>{saved.length}</span>
                </button>
                <button
                  className={filter === "revisit" ? "active" : ""}
                  onClick={() => setFilter("revisit")}
                  title={t("Words you missed in a chat or a game. Answer each one right on two different days to clear it.")}
                >
                  <RotateCcw size={14} />
                  {t("To revisit")}
                  <span>{revisit.length}</span>
                </button>
                <select
                  aria-label={t("Filter by gallery")}
                  value={filter.startsWith("room-") ? filter : ""}
                  onChange={(e) => setFilter(e.target.value || "all")}
                >
                  <option value="">{t("All galleries")}</option>
                  {rooms.map((room, i) => (
                    <option key={room.id} value={`room-${i}`}>
                      {t(room.name)}
                    </option>
                  ))}
                </select>
              </div>
              <label className="search-box">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("Find a word\u2026")}
                  aria-label={t("Search vocabulary")}
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label={t("Clear search")}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
            </div>
            <div className="collection-grid">
              {filtered.map((exhibit) => (
                <article
                  className="collection-card learning-frame"
                  data-checked={checked.includes(exhibit.id)}
                  key={exhibit.id}
                >
                  <div className="collection-heading headword-banner">
                    <LearnedCheckbox
                      exhibit={exhibit}
                      checked={checked.includes(exhibit.id)}
                      onChange={() => toggleChecked(exhibit)}
                    />
                    <button
                      className="collection-word"
                      onClick={() => visit(exhibit, filteredRoom)}
                      data-long-word={exhibit.word.length > 11}
                    >
                      {exhibit.word}
                    </button>
                  </div>
                  <button
                    className="collection-art"
                    onClick={() => visit(exhibit, filteredRoom)}
                  >
                    <img src={assetUrl(exhibit.image)} alt={exhibit.word} loading="lazy" />
                    <span>
                      {t("Discover")}
                      <MoveUpRight size={14} />
                    </span>
                  </button>
                  <div className="collection-card-copy">
                    <div className="collection-caption-row">
                      <button
                        className="collection-video-button"
                        onClick={() => setVideoExhibit(exhibit)}
                        aria-label={`${t("Watch video examples")}: ${exhibit.word}`}
                        title={t("Watch video examples")}
                      >
                        <YouTubeLogo />
                      </button>
                      <span className="eyebrow">
                        {t(rooms[exhibit.room].name)}
                      </span>
                    </div>
                    <p>
                      {exhibit.definitionTranslations[locale] ||
                        exhibit.definition}
                    </p>
                    <button
                      className={`icon-button collection-bookmark ${saved.includes(exhibit.id) ? "is-saved" : ""}`}
                      aria-label={`${saved.includes(exhibit.id) ? t("Unsave") : t("Save")} ${exhibit.word}`}
                      aria-pressed={saved.includes(exhibit.id)}
                      onClick={() => toggleSaved(exhibit)}
                    >
                      <Bookmark
                        size={17}
                        fill={
                          saved.includes(exhibit.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!filtered.length && (
              <div className="empty-collection">
                <Bookmark size={30} />
                <h3>
                  {query
                    ? t("No words found.")
                    : t("Make a little room for wonder.")}
                </h3>
                <p>
                  {query
                    ? t("Try another word or a different gallery.")
                    : t(
                        "Save a word from any exhibit and find it here whenever you like.",
                      )}
                </p>
                <button
                  className="primary-button"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  {t("Explore all exhibits")}
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
            <footer className="collection-footer">
              {fill(t("{n} words from Handy 990, with original AI-created museum artwork."))}
              <span>
                {visited.length}
                {t("discovered \u00B7")}
                {saved.length}
                {t("saved on this device")}
              </span>
            </footer>
          </section>
        </Dialog>
      )}

      {labelQuiz && (
        <Dialog className="label-dialog" label={t("A label blew away!")} onClose={() => setLabelQuiz(null)}>
          <section>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{t("LOST AND FOUND")}</span>
                <h2>{t("A label blew away!")}</h2>
              </div>
              <button className="icon-button" onClick={() => setLabelQuiz(null)} aria-label={t("Close")}><X size={21} /></button>
            </div>
            <p>{t("The wind took this painting's word. Which one belongs to it?")}</p>
            <img className="label-art" src={assetUrl(labelQuiz.exhibit.image)} alt={t("The painting without its label")} />
            <div className="label-choices">
              {labelChoices(labelQuiz.exhibit, exhibits, labels.day).map((choice) => <button key={choice.id} disabled={labelQuiz.wrong.includes(choice.id)}
                data-wrong={labelQuiz.wrong.includes(choice.id)} onClick={() => restoreLabel(choice)}>{choice.word}</button>)}
            </div>
            {labelQuiz.wrong.length > 0 && <p className="label-hint" role="status">{t("Not this one. Here is its meaning:")} <span lang="en">{labelQuiz.exhibit.definition}</span></p>}
          </section>
        </Dialog>
      )}

      {modal === "journal" && (() => {
        const explored = states.filter((p) => p.state === "explored" || p.state === "mastered").length;
        const mastered = states.filter((p) => p.state === "mastered").length;
        const friends = RESIDENTS.reduce((sum, npc) => sum + (favours[npc.id]?.level ?? 0), 0);
        const stamps = readPassport().length;
        const nearlyPlaces = states.map((p, i) => ({ p, i })).filter(({ p }) => p.state === "started" && p.total - p.discovered <= 2)
          .sort((a, b) => (a.p.total - a.p.discovered) - (b.p.total - b.p.discovered)).slice(0, 3);
        const nearlyStyles = STYLE_SETS.filter((set) => set.rare && set.ids.filter((id) => !visitedSet.has(id)).length === 1).slice(0, 3);
        const tiles: [string, string | number, string][] = [
          [t("words discovered"), visited.length, `/ ${exhibits.length}`],
          [t("words learned"), checked.length, `/ ${exhibits.length}`],
          [t("places explored"), explored, `/ ${rooms.length}`],
          [t("places mastered"), mastered, `/ ${rooms.length}`],
          [t("styles complete"), stylesComplete, `/ ${STYLE_SETS.length}`],
          [t("passport stamps"), stamps, ""],
          [t("friendship hearts"), friends, ""],
          [t("days in a row"), walkStreak, ""],
          [t("labels restored"), labels.total, ""],
        ];
        return <Dialog className="journal-dialog" label={t("Your city journal")} onClose={() => setModal(null)}>
          <section>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{t("EVERYTHING YOU HAVE GATHERED")}</span>
                <h2>{t("Your city journal")}<span>.</span></h2>
              </div>
              <button className="icon-button" onClick={() => setModal(null)} aria-label={t("Close journal")}><X size={21} /></button>
            </div>
            <div className="journal-tiles">{tiles.map(([label, value, total]) => <div key={label}><strong>{value}<small>{total}</small></strong><span>{label}</span></div>)}</div>
            <div className="journal-links">
              <button className="text-button" onClick={() => setModal("album")}><Images size={15} />{t("The collector's album")}<ArrowRight size={14} /></button>
              <button className="text-button" onClick={() => setModal("walk")}><Star size={15} />{t("Today's walk")}<ArrowRight size={14} /></button>
              {revisit.length > 0 && <button className="text-button" onClick={() => { setFilter("revisit"); setModal("collection"); }}><RotateCcw size={15} />{t("To revisit")} · {revisit.length}<ArrowRight size={14} /></button>}
            </div>
            {(nearlyPlaces.length > 0 || nearlyStyles.length > 0 || walk.found.length < walk.ids.length) && <>
              <h3>{t("Almost there")}</h3>
              <ul className="journal-goals">
                {walk.found.length < walk.ids.length && <li><Star size={16} /><span>{t("Today's walk")} · {walk.ids.length - walk.found.length} {t("paintings to find")}</span>
                  <button onClick={() => setModal("walk")}>{t("Open")}<ArrowRight size={14} /></button></li>}
                {nearlyPlaces.map(({ p, i }) => <li key={i}><Trophy size={16} /><span>{rooms[i].house ? `${t(rooms[i].house!.kind === "root" ? "Root house" : "Townhouse")} ` : ""}{placeLabel(i, locale)} · {p.total - p.discovered} {t(p.total - p.discovered === 1 ? "painting left to explore" : "paintings left to explore")}</span>
                  <button disabled={!ready || Boolean(error)} onClick={() => navigateRoom(i)}>{t("Take me there")}<ArrowRight size={14} /></button></li>)}
                {nearlyStyles.map((set) => { const missing = EXHIBIT_BY_ID.get(set.ids.find((id) => !visitedSet.has(id))!)!;
                  return <li key={set.key}><Images size={16} /><span>{locale === "zh_TW" ? set.mediumZh : set.medium} · {t("one painting from complete")}</span>
                    <button disabled={!ready || Boolean(error)} onClick={() => navigateRoom(missing.room)}>{t("Take me nearby")}<ArrowRight size={14} /></button></li>; })}
              </ul>
            </>}
          </section>
        </Dialog>;
      })()}

      {modal === "album" && (
        <Dialog className="album-dialog" label={t("The collector's album")} onClose={() => setModal(null)}>
          <section>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{t("EVERY STYLE IN THE CITY")}</span>
                <h2>{t("The collector's album")}<span>.</span></h2>
              </div>
              <button className="icon-button" onClick={() => setModal(null)} aria-label={t("Close album")}><X size={21} /></button>
            </div>
            <p>{t("Each painting in the city belongs to an art style. Open a painting to add it to your album. Rare styles hang only a few times across the city: tap an empty frame to walk to its neighbourhood.")}</p>
            <div className="album-summary"><strong>{stylesComplete} / {STYLE_SETS.length}</strong><span>{t("styles complete")}</span></div>
            {([true, false] as const).map((rare) => <section key={String(rare)} className="album-section" aria-label={t(rare ? "Rare styles" : "Painted series")}>
              <h3>{t(rare ? "Rare styles" : "Painted series")}</h3>
              <div className={`album-grid ${rare ? "is-rare" : ""}`}>
                {STYLE_SETS.filter((set) => set.rare === rare).map((set) => {
                  const found = set.ids.filter((id) => visitedSet.has(id));
                  const shown = rare ? set.ids : found.slice(0, 8);
                  return <article key={set.key} className="album-set" data-complete={found.length === set.ids.length}>
                    <header><strong>{locale === "zh_TW" ? set.mediumZh : set.medium}{set.ids.length === 1 && <em>{t("One of a kind")}</em>}</strong><span>{found.length} / {set.ids.length}</span></header>
                    {!rare && <progress max={set.ids.length} value={found.length} aria-label={`${found.length} / ${set.ids.length}`} />}
                    <div className="album-frames">{shown.map((id) => {
                      const exhibit = EXHIBIT_BY_ID.get(id)!;
                      return visitedSet.has(id)
                        ? <button key={id} className="album-frame" onClick={() => visit(exhibit)} aria-label={exhibit.word}><img src={assetUrl(exhibit.image)} alt="" loading="lazy" /></button>
                        : <button key={id} className="album-frame is-empty" disabled={!ready || Boolean(error)} onClick={() => navigateRoom(exhibit.room)}
                          aria-label={`${t("Undiscovered painting")} · ${isRootRoom(exhibit.room) ? rooms[exhibit.room].house!.display : t(districtFor(exhibit.room).landmark)}`}>?</button>;
                    })}</div>
                  </article>;
                })}
              </div>
            </section>)}
          </section>
        </Dialog>
      )}

      {modal === "walk" && (
        <Dialog className="walk-dialog" label={t("Today's walk")} onClose={() => setModal(null)}>
          <section>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{t("A NEW LITTLE ROUTE EVERY DAY")}</span>
                <h2>{t("Today's walk")}<span>.</span></h2>
              </div>
              <button className="icon-button" onClick={() => setModal(null)} aria-label={t("Close today's walk")}><X size={21} /></button>
            </div>
            <p>{t("Five paintings hang close together somewhere in the city. Walk to each one and open it. Gold stars float above them, and the map marks where they are.")}</p>
            <div className="walk-summary">
              <strong>{walk.found.length} / {walk.ids.length}</strong><span>{t("found today")}</span>
              <em><Flame size={16} />{walkStreak ? `${walkStreak} ${t(walkStreak === 1 ? "day in a row" : "days in a row")}` : t("Start a streak today")}</em>
            </div>
            <ol className="walk-list">
              {walk.ids.map((id, i) => {
                const exhibit = EXHIBIT_BY_ID.get(id)!;
                const found = walk.found.includes(id);
                const place = isRootRoom(exhibit.room) ? rooms[exhibit.room].house!.display : t(districtFor(exhibit.room).landmark);
                return <li key={id} data-found={found}>
                  <img src={assetUrl(exhibit.image)} alt="" />
                  <div>
                    <span className="eyebrow">{String(i + 1).padStart(2, "0")} · {place}</span>
                    <strong>{found ? exhibit.word : t("A painting to find")}</strong>
                    <small>{found ? (exhibit.translations[locale] || exhibit.definition) : t("Look for the gold star above it.")}</small>
                  </div>
                  {found ? <button className="walk-open" onClick={() => visit(exhibit)}><Check size={16} />{t("Open")}</button>
                    : <button className="walk-go" disabled={!ready || Boolean(error)} onClick={() => navigateRoom(exhibit.room)}>{t("Take me nearby")}<ArrowRight size={15} /></button>}
                </li>;
              })}
            </ol>
            <p className="walk-note">{t("Finish every walk to keep your streak. A new route appears tomorrow.")}</p>
            {revisit.length > 0 && <button className="text-button revisit-link" onClick={() => { setFilter("revisit"); setModal("collection"); }}>
              <RotateCcw size={15} />{t("To revisit")} · {revisit.length}<small>{t("Chats and games ask these first.")}</small><ArrowRight size={15} />
            </button>}
            {visited.length >= LOST_LABELS_AFTER && <div className="lost-summary">
              <strong>{labels.restored.length} / {labels.ids.length}</strong>
              <span>{t("Lost labels restored today. The wind blew one word off a painting in every landmark and in a few Old Town houses: look for a banner showing ? ? ?")}</span>
            </div>}
          </section>
        </Dialog>
      )}

      {modal === "map" && (
        <Dialog
          className="map-dialog"
          label={t("Museum floor map")}
          onClose={() => setModal(null)}
        >
          <section>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{t("FIND YOUR NEXT DISCOVERY")}</span>
                <h2>{t("A world of words.")}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label={t("Close floor map")}
              >
                <X size={21} />
              </button>
            </div>
            <p>
              {t(
                "One walled city, many places to learn. Quay and mole, squares and arcades, park and market, cathedral, palazzo, guildhall and cistern.",
              )}{" "}
              {fill(t("Beyond the Cathedral Square, the Old Town's canal lanes hold {houses} townhouses: root families, theme houses, word families and level lanes."))}
            </p>
            <div className="expanded-floorplan"><FloorPlan pose={pose} states={states} targets={walkTargets} /></div>
            <p className="map-legend"><span data-state="explored" />{t("Explored: every painting opened")}<span data-state="mastered" />{t("Mastered: every word learned")}</p>
            <section className="resident-directory" aria-label={t("City neighbours")}>
              <h3>{t("City neighbours")}</h3><p>{t("Find a neighbour for three vocabulary questions. Walk up and say hello.")}</p>
              <div>{RESIDENTS.map(npc => <button key={npc.id} disabled={!ready || Boolean(error)} onClick={() => {
                setIntro(false); setModal(null); setTour(false); setHovered(null);
                museum.current?.visitResident(npc.id);
                hostRef.current?.querySelector("canvas")?.focus();
              }}><strong>{npc.name} · {t(npc.role)}</strong><small>{t(npc.location)}</small></button>)}</div>
            </section>
            <div className="wing-shortcuts">
              {LANDMARKS.map(([index, label]) => <button key={index} onClick={() => navigateRoom(index)}>{t(label)}<ArrowRight size={14} /></button>)}
            </div>
            <div className="room-list">
              {[...rooms.map((room, i) => [room, i] as const).filter(([room]) => !room.house), [CATHEDRAL_SQUARE, SQUARE_INDEX] as const, [OLD_TOWN, STREETS_INDEX] as const].map(([room, i]) => (
                <button
                  key={room.id}
                  className={pose.room === i ? "current" : ""}
                  data-state={i < rooms.length ? states[i].state : undefined}
                  onClick={() => navigateRoom(i)}
                >
                  <span
                    className="room-preview"
                    style={{ background: `${room.color}18` }}
                  >
                    {i === SQUARE_INDEX ? (
                      <Landmark className="garden-preview-icon" size={49} strokeWidth={1} />
                    ) : i === STREETS_INDEX ? (
                      <Sprout className="garden-preview-icon" size={49} strokeWidth={1} />
                    ) : (
                      <img src={assetUrl((roomExhibits(i).find((e) => e.room === i) ?? roomExhibits(i)[0]).image)} alt="" />
                    )}
                    <b>{i === SQUARE_INDEX ? "✚" : i === STREETS_INDEX ? "√" : String(i + 1).padStart(2, "0")}</b>
                  </span>
                  <span className="room-info">
                    <span className="eyebrow">
                      {pose.room === i
                        ? t("YOU ARE HERE")
                        : i === SQUARE_INDEX || i === STREETS_INDEX ? t("LANDMARK")
                        : `${t(districtFor(i).landmark)} · ${t(districtFor(i).indoor ? "INDOORS" : "OPEN AIR")}`}
                    </span>
                    <strong>{t(room.name)}</strong>
                    <small>{t(room.subtitle)}</small>
                    <span className="room-count">
                      {i === SQUARE_INDEX ? t("Statue, cathedral, palazzo, guildhall") : i === STREETS_INDEX ? fill(t("{houses} townhouses along the canal lanes")) : (
                        <>
                          {roomExhibits(i).filter((e) => visited.includes(e.id)).length}{" "}
                          {t(`/ ${roomExhibits(i).length} discovered`)}
                        </>
                      )}
                    </span>
                  </span>
                  <ArrowRight size={20} />
                </button>
              ))}
            </div>
            {HOUSE_SECTIONS.map(([kind, title, blurb]) => (
              <div key={kind}>
                <div className="root-grid-heading">
                  <span className="eyebrow">{t(title)} · {houses.filter(({ room }) => room.house!.kind === kind).length}</span>
                  <p>{t(blurb)}</p>
                </div>
                <div className="root-grid" aria-label={t(title)}>
                  {houses.filter(({ room }) => room.house!.kind === kind).map(({ room, index }) => (
                    <button key={room.id} className={pose.room === index ? "current" : ""} data-state={states[index].state} style={{ borderColor: `${room.color}66` }} onClick={() => navigateRoom(index)}>
                      <em>{room.house!.display}</em>
                      <small>{(locale && room.house!.translations[locale]) || room.house!.note}</small>
                      <span>{roomExhibits(index).filter((e) => visited.includes(e.id)).length} / {roomExhibits(index).length}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button className="text-button" onClick={startTour}>
              <Headphones size={16} />
              {t("Show me around")}
              <ArrowRight size={15} />
            </button>
          </section>
        </Dialog>
      )}

      {modal === "help" && (
        <Dialog
          className="help-dialog"
          label={t("How to explore the museum")}
          onClose={() => setModal(null)}
        >
          <section>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{t("MAKE YOURSELF AT HOME")}</span>
                <h2>
                  {t("A little guide")}
                  <br />
                  {t("to getting lost.")}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label={t("Close guide")}
              >
                <X size={21} />
              </button>
            </div>
            <p>
              {t(
                "There\u2019s no right route. Follow whatever catches your eye.",
              )}
            </p>
            <div className="help-items">
              <div>
                <Footprints />
                <span>
                  <strong>{t("Wander at your own pace")}</strong>
                  <p>
                    {t(
                      "Use W A S D to walk. Hold W to gradually accelerate; release it to return to walking speed. Arrow keys and on-screen forward controls work too. Shift gives an immediate speed boost.",
                    )}
                  </p>
                </span>
              </div>
              <div>
                <Mouse />
                <span>
                  <strong>{t("Take a look around")}</strong>
                  <p>
                    {t(
                      "Click and drag to look in any direction. On a touch screen, swipe across the gallery.",
                    )}
                  </p>
                </span>
              </div>
              <div>
                <Maximize2 />
                <span>
                  <strong>{t("Get to know a word")}</strong>
                  <p>
                    {t(
                      "Click any painting to read its meanings and examples, hear its pronunciation, and see translations.",
                    )}
                  </p>
                </span>
              </div>
              <div>
                <Bookmark />
                <span>
                  <strong>{t("Bring a little wonder home")}</strong>
                  <p>
                    {t(
                      "Save your favorite words to My words. Your discoveries stay in this browser on this device.",
                    )}
                  </p>
                </span>
              </div>
              <div>
                <Compass />
                <span>
                  <strong>{t("Let curiosity be your guide")}</strong>
                  <p>
                    {fill(t("Start on the harbour quay, pass the sea gate, follow the Corso to the Cathedral Square, and wander the Old Town's canal lanes. The map reaches every landmark; the guided tour visits all {n} exhibits."))}
                  </p>
                </span>
              </div>
              <div>
                <Trophy />
                <span>
                  <strong>{t("Finish a place, light a lantern")}</strong>
                  <p>{t("Open every painting in a landmark or house to explore it, then learn all its words to master it. Explored houses light their door lanterns; mastered ones earn gold stars.")}</p>
                </span>
              </div>
              <div>
                <Star />
                <span>
                  <strong>{t("A walk, some favours and lost labels")}</strong>
                  <p>{t("Each day brings five paintings to find and a few labels blown off by the wind. Neighbours ask for favours: find paintings by their meaning and bring them back.")}</p>
                </span>
              </div>
              <div>
                <Images />
                <span>
                  <strong>{t("Fill your album, send a postcard")}</strong>
                  <p>{t("Every painting joins the album of art styles when you open it. Send any word home as a postcard, and try the evening light to see your learned words glow.")}</p>
                </span>
              </div>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setModal(null);
                setIntro(false);
              }}
            >
              {t("I\u2019m ready to wander")}
              <ArrowRight size={17} />
            </button>
          </section>
        </Dialog>
      )}
      {artworkExhibit && (
        <Dialog
          className="artwork-dialog"
          label={`${t("Artwork")}: ${artworkExhibit.word}`}
          onClose={() => setArtworkExhibit(null)}
        >
          <header className="artwork-view-heading">
            <div>
              <span className="eyebrow">{artworkExhibit.word}</span>
              <h2>
                {artworkExhibit.artwork
                  ? locale === "zh_TW"
                    ? artworkExhibit.artwork.titleZh
                    : artworkExhibit.artwork.title
                  : artworkExhibit.word}
              </h2>
            </div>
            <button
              className="icon-button"
              aria-label={t("Close artwork")}
              onClick={() => setArtworkExhibit(null)}
            >
              <X size={22} />
            </button>
          </header>
          <img
            src={assetUrl(artworkExhibit.image)}
            alt={
              artworkExhibit.artwork
                ? locale === "zh_TW"
                  ? artworkExhibit.artwork.titleZh
                  : artworkExhibit.artwork.title
                : artworkExhibit.word
            }
          />
          {artworkExhibit.artwork && (
            <footer>
              <span>
                {locale === "zh_TW"
                  ? artworkExhibit.artwork.mediumZh
                  : artworkExhibit.artwork.medium}{" "}
                ·{" "}
                {locale === "zh_TW"
                  ? artworkExhibit.artwork.seriesZh
                  : artworkExhibit.artwork.series}
              </span>
              <small>
                {t("AI-created original artwork")} ·{" "}
                {artworkExhibit.artwork.width} × {artworkExhibit.artwork.height}
              </small>
            </footer>
          )}
        </Dialog>
      )}
      {videoExhibit && (
        <Dialog
          className="video-dialog"
          label={`${t("Video examples")}: ${videoExhibit.word}`}
          onClose={() => setVideoExhibit(null)}
        >
          <header className="video-heading">
            <div>
              <span className="eyebrow">{t("HEAR IT IN THE REAL WORLD")}</span>
              <h2>
                <YouTubeLogo />
                {videoExhibit.word}
              </h2>
            </div>
            <button
              className="icon-button"
              onClick={() => setVideoExhibit(null)}
              aria-label={t("Close video")}
            >
              <X size={22} />
            </button>
          </header>
          <YouglishPlayer key={videoExhibit.id} word={videoExhibit.word} />
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {t(toast)}
        </div>
      )}
    </div>
  );
}
