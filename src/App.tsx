import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Expand,
  Footprints,
  Headphones,
  HelpCircle,
  Map,
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
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import collection from "./collection.json";
import { Museum, exhibitPlacements, familyIn, registerFamilySizes, type Pose } from "./museum";
import {
  CATHEDRAL_SQUARE,
  CITY,
  DISTRICTS,
  ENTRY,
  GALLERY_COUNT,
  LANE_HALF,
  LANE_ZS,
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
import { useLocale } from "./i18n";
import { useExhibitAudio } from "./useExhibitAudio";
import { YouglishPlayer, YouTubeLogo } from "./YouglishPlayer";
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
function FloorPlan({ pose, compact = false }: { pose: Pose; compact?: boolean }) {
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
      {LANE_ZS.map((lz) => <rect key={lz} x={-c.wallX + 1} y={lz - LANE_HALF} width={c.wallX * 2 - 2} height={LANE_HALF * 2} fill="#f1edde" />)}
      {[-1, 1].map((side) => <rect key={`walk-${side}`} x={side < 0 ? -c.wallX + 1 : OUTER_EDGE} y={c.wallNorth + 1} width={c.wallX - OUTER_EDGE - 1} height={c.promenade.z1 - c.wallNorth - 1} fill="#ebe4d2" />)}
      {rooms.map((room, i) => {
        if (room.house) {
          const h = rootRoomTransform(i);
          return <g key={room.id}>
            <rect x={h.x - ROOT_ROOM.width / 2} y={h.z - ROOT_ROOM.depth / 2} width={ROOT_ROOM.width} height={ROOT_ROOM.depth} fill={pose.room === i ? `${room.color}99` : `${room.color}30`} stroke="#a5ac99" strokeWidth=".5" />
            {!compact && <text x={h.x} y={h.z + 2} textAnchor="middle" fill="#52604c" fontSize={room.house.display.length > 8 ? 3.2 : 5.5} fontStyle="italic">{room.house.display.length > 18 ? room.house.display.slice(0, 17) + "…" : room.house.display}</text>}
          </g>;
        }
        const d = districtFor(i);
        return <g key={room.id}>
          {box(d.box, pose.room === i ? `${room.color}99` : `${room.color}30`, room.id, d.indoor ? 0 : 3)}
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
    </g>
    <g data-world-x={pose.x.toFixed(2)} data-world-z={pose.z.toFixed(2)} transform={`translate(${follow.x},${follow.y}) rotate(${(-pose.yaw * 180) / Math.PI})`}>
      <path d="M0-10-5 0H5Z" fill="#56765b" opacity=".25" />
      <circle r="3" fill="#345d47" stroke="#faf9f2" strokeWidth="1.3" />
    </g>
  </svg>;
}
function MiniMap({ pose, onOpen }: { pose: Pose; onOpen: () => void }) {
  const { t } = useLocale();
  return <button className="minimap" onClick={onOpen} aria-label={t("Open museum floor map")}>
    <span className="map-label">{t("YOUR LITTLE WORLD")}<Expand size={12} /></span>
    <FloorPlan pose={pose} compact />
    <span className="map-current"><span />{pose.room === SQUARE_INDEX || pose.room === STREETS_INDEX ? t(destinationFor(pose.room).name) : isRootRoom(pose.room) ? `${t("Root room")} · ${rooms[pose.room].house!.display}` : t(districtFor(pose.room).landmark)}</span>
  </button>;
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
  const ambienceGainRef = useRef<GainNode | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pose, setPose] = useState<Pose>({
    ...ENTRY,
    room: 1,
  });
  const [intro, setIntro] = useState(true);
  const [selected, setSelected] = useState<Exhibit | null>(null);
  const [details, setDetails] = useState<(ExhibitDetails & { id: string }) | null>(null);
  const [selectedArea, setSelectedArea] = useState(0);
  const [videoExhibit, setVideoExhibit] = useState<Exhibit | null>(null);
  const [artworkExhibit, setArtworkExhibit] = useState<Exhibit | null>(null);
  const [hovered, setHovered] = useState<Exhibit | null>(null);
  const [hoverAction, setHoverAction] = useState<"open" | "check" | "video">(
    "open",
  );
  const [modal, setModal] = useState<"map" | "collection" | "help" | null>(
    null,
  );
  const [visited, setVisited] = useProgress("vocabhall.visited.v1");
  const [saved, setSaved] = useProgress("vocabhall.saved.v1");
  const [checked, setChecked] = useProgress("vocabhall.learned.v1");
  const checkedRef = useRef(checked);
  checkedRef.current = checked;
  const toggleChecked = useCallback(
    (exhibit: Exhibit) => {
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
      setVisited((current) =>
        current.includes(exhibit.id) ? current : [...current, exhibit.id],
      );
    },
    [setVisited, playback.start],
  );
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
          onSelect: openExhibit,
          onHover: (exhibit, action = "open") => {
            setHovered(exhibit);
            setHoverAction(action);
          },
          onMove: setPose,
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
  }, [openExhibit, toggleChecked]);
  useEffect(() => {
    museum.current?.setBlocked(
      Boolean(selected || modal || videoExhibit || artworkExhibit),
    );
  }, [selected, modal, videoExhibit, artworkExhibit, ready]);
  useEffect(() => {
    museum.current?.setChecked(checked);
  }, [checked, ready]);
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
    if (ambienceRef.current && ambienceGainRef.current)
      ambienceGainRef.current.gain.setTargetAtTime(
        videoExhibit ? 0 : playback.active ? 0.007 : 0.028,
        ambienceRef.current.currentTime,
        0.2,
      );
  }, [playback.active, videoExhibit]);
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(roomTimer.current);
      void ambienceRef.current?.close();
    },
    [],
  );
  const navigateRoom = (room: number) => {
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
    const area = museum.current?.goToExhibit(exhibit, preferredArea);
    openExhibit(exhibit, area);
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
        const master = ctx.createGain();
        ambienceGainRef.current = master;
        master.gain.value = 0.028;
        master.connect(ctx.destination);
        [130.81, 196, 261.63, 329.63].forEach((frequency, i) => {
          const oscillator = ctx.createOscillator(),
            gain = ctx.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          oscillator.detune.value = i % 2 ? 3 : -3;
          gain.gain.value = 0.23;
          oscillator.connect(gain);
          gain.connect(master);
          oscillator.start();
          const lfo = ctx.createOscillator(),
            lfoGain = ctx.createGain();
          lfo.frequency.value = 0.07 + i * 0.023;
          lfoGain.gain.value = 0.12;
          lfo.connect(lfoGain);
          lfoGain.connect(gain.gain);
          lfo.start();
        });
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
  const closeExhibit = () => {
    setSelected(null);
    setTour(false);
  };
  const filtered = exhibits.filter(
    (e) =>
      (filter !== "saved" || saved.includes(e.id)) &&
      (!/^room-/.test(filter) || e.room === Number(filter.slice(5)) || e.families?.some((family) => family.room === Number(filter.slice(5)))) &&
      `${e.word} ${e.definition} ${Object.values(e.translations).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const currentRoom = destinationFor(pose.room);
  return (
    <div className="app-shell">
      <header className="site-header">
        <button
          className="brand"
          onClick={() => {
            setSelected(null);
            setModal(null);
            setIntro(true);
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
            className={modal !== "collection" ? "active" : ""}
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
        </nav>
        <div className="header-actions">
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
        <div className="visit-progress">
          <span className="progress-flower">
            <Sparkles size={16} />
          </span>
          <div>
            <strong>
              {visited.length}
              <span> / {exhibits.length}</span>
            </strong>
            <small>{t("words discovered")}</small>
          </div>
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="#d1d1be"
              strokeWidth="2"
            />
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="#56735c"
              strokeWidth="2"
              strokeDasharray={`${(visited.length / exhibits.length) * 75.4} 75.4`}
              transform="rotate(-90 16 16)"
            />
          </svg>
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
              <button onClick={startTour}>
                <Play size={12} />
                {t("Guided tour")}
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
            <strong>{hovered.word}</strong>
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
        <MiniMap pose={pose} onOpen={() => setModal("map")} />
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
            <span>{t("Move around")}</span>
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
              {t("Ambience")}
              {ambient ? t("on") : t("off")}
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
            <div className="expanded-floorplan"><FloorPlan pose={pose} /></div>
            <div className="wing-shortcuts">
              {LANDMARKS.map(([index, label]) => <button key={index} onClick={() => navigateRoom(index)}>{t(label)}<ArrowRight size={14} /></button>)}
            </div>
            <div className="room-list">
              {[...rooms.map((room, i) => [room, i] as const).filter(([room]) => !room.house), [CATHEDRAL_SQUARE, SQUARE_INDEX] as const, [OLD_TOWN, STREETS_INDEX] as const].map(([room, i]) => (
                <button
                  key={room.id}
                  className={pose.room === i ? "current" : ""}
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
                    <button key={room.id} className={pose.room === index ? "current" : ""} style={{ borderColor: `${room.color}66` }} onClick={() => navigateRoom(index)}>
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
                      "Use W A S D to walk. Arrow keys move forward, backward, and turn. Hold Shift to walk faster, or use the on-screen arrows.",
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
