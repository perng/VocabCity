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
  Trees,
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
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import collection from "./collection.json";
import { Museum, exhibitPlacements, type Pose } from "./museum";
import {
  ENTRY,
  GARDEN,
  GARDEN_INDEX,
  OUTDOOR_DISPLAYS,
  mapPoint,
} from "./layout";
import { assetUrl, partOfSpeech, type Exhibit } from "./types";
import { useLocale } from "./i18n";
import { useExhibitAudio } from "./useExhibitAudio";
import { YouglishPlayer, YouTubeLogo } from "./YouglishPlayer";
const exhibits = collection.exhibits as Exhibit[];
const rooms = collection.rooms;
const destinations = [...rooms, GARDEN];
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
function MiniMap({ pose, onOpen }: { pose: Pose; onOpen: () => void }) {
  const { t } = useLocale();
  return (
    <button
      className="minimap"
      onClick={onOpen}
      aria-label={t("Open museum floor map")}
    >
      <span className="map-label">
        {t("YOUR LITTLE WORLD")}
        <Expand size={12} />
      </span>
      <svg viewBox="0 0 154 206" aria-hidden="true">
        <rect
          x="39.5"
          y="30.5"
          width="75"
          height="55"
          rx="2"
          fill={pose.room === GARDEN_INDEX ? "#ccdabf" : "#dfe5d3"}
          stroke="#a8b49a"
        />
        <path d="M72 31h10v55H72z M40 66h74v5H40z" fill="#f1edde" />
        <rect x="86" y="55" width="11.5" height="20" fill="#9fbdb4" rx="1" />
        <path d="M52 55h11v16H52z" fill="#b8b096" />
        {[44, 109].map((x) =>
          [39, 52, 76].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#97ae80" />
          )),
        )}
        <text x="77" y="21" textAnchor="middle" fill="#718166" fontSize="8">
          {t("GARDEN")}
        </text>
        <rect x="62" y="85.5" width="30" height="105" fill="#eae7dd" />
        {[2, 1, 0].map((r, i) => (
          <g key={r}>
            <rect
              x="63"
              y={86 + i * 35}
              width="28"
              height="34"
              fill={pose.room === r ? "#d2dbc9" : "#eae7dd"}
            />
            <text
              x="47"
              y={106 + i * 35}
              fill="#868b78"
              fontSize="8"
              fontFamily="DM Sans"
            >
              0{r + 1}
            </text>
            {i > 0 && (
              <path
                d={`M63 ${85.5 + i * 35}h28`}
                stroke="#c2c3b2"
                strokeDasharray="2 3"
              />
            )}
          </g>
        ))}
        <path
          d="M62 85.5v105h30v-105 M72 86v104m10-104v104"
          fill="none"
          stroke="#b7b8a5"
          strokeWidth="1"
        />
        {exhibits.flatMap((e) =>
          exhibitPlacements(e).map((p) => {
            const point = mapPoint(p.x, p.z);
            return (
              <rect
                key={`${e.id}-${p.area}`}
                x={point.x - 1.5}
                y={point.y - 1.5}
                width="3"
                height="3"
                rx=".5"
                fill={rooms[e.room].color}
              />
            );
          }),
        )}
        <g
          data-world-x={pose.x.toFixed(2)}
          data-world-z={pose.z.toFixed(2)}
          transform={`translate(${mapPoint(pose.x, pose.z).x},${mapPoint(pose.x, pose.z).y}) rotate(${(-pose.yaw * 180) / Math.PI})`}
        >
          <path d="M0-12-6 0H6Z" fill="#56765b" opacity=".2" />
          <circle r="3.5" fill="#345d47" stroke="#faf9f2" strokeWidth="1.5" />
        </g>
        <text
          x="77"
          y="202"
          textAnchor="middle"
          fill="#868b78"
          fontSize="8"
          letterSpacing="2"
        >
          {t("ENTRANCE")}
        </text>
      </svg>
      <span className="map-current">
        <span />
        {pose.room === GARDEN_INDEX
          ? t("Garden")
          : `${t("Gallery")} ${String(pose.room + 1).padStart(2, "0")}`}
      </span>
    </button>
  );
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
    room: 0,
  });
  const [intro, setIntro] = useState(true);
  const [selected, setSelected] = useState<Exhibit | null>(null);
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
      setVisited((current) =>
        current.includes(exhibit.id) ? current : [...current, exhibit.id],
      );
    },
    [setVisited],
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
      } catch {
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
  const visit = (exhibit: Exhibit) => {
    const area = museum.current?.goToExhibit(exhibit);
    openExhibit(exhibit, area);
  };
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
  const wordClip = (exhibit: Exhibit) => ({
    key: "word",
    url: exhibit.audio,
    text: exhibit.word,
  });
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
      showToast(t("All 18 words discovered. Keep your curiosity close."));
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
      (!/^room-/.test(filter) || e.room === Number(filter.slice(5))) &&
      `${e.word} ${e.definition} ${Object.values(e.translations).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const currentRoom = destinations[pose.room];
  return (
    <div className="app-shell">
      <header className="site-header">
        <button
          className="brand"
          onClick={() => {
            setSelected(null);
            setModal(null);
            navigateRoom(0);
          }}
          aria-label={t("Vocab Hall entrance")}
        >
          <MuseumLogo />
          <span>
            vocab<span className="brand-italic">hall</span>
            <small>{t("A MUSEUM FOR YOUR MIND")}</small>
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
            <span>18</span>
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

      <main className="museum-stage" aria-label={t("Museum")}>
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
          <span className="eyebrow">{t("THE PERMANENT COLLECTION")}</span>
          <button onClick={() => setModal("map")}>
            <span className="gallery-number">
              {pose.room === GARDEN_INDEX ? (
                <Trees size={27} />
              ) : (
                `0${pose.room + 1}`
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
              <span> / 18</span>
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
              strokeDasharray={`${(visited.length / 18) * 75.4} 75.4`}
              transform="rotate(-90 16 16)"
            />
          </svg>
        </div>

        {intro && ready && !error && (
          <section className="welcome-card">
            <span className="welcome-tag">
              <span />
              {t("A SPACE TO SLOW DOWN")}
            </span>
            <h1>
              {t("Let curiosity")}
              <br />
              {t("lead the")}
              <em>{t("way.")}</em>
            </h1>
            <p>
              {t("A gallery of words. A world of meaning.")}
              <br />
              {t("Wander, discover, and make them yours.")}
            </p>
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
              <span>{t("18 stops")}</span>
            </button>
            <div className="welcome-footnote">
              <span>01 — 03 + ♧</span>
              <span>{t("THREE GRAND HALLS. ONE OPEN GARDEN.")}</span>
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
              <button
                onClick={() =>
                  navigateRoom(pose.room === GARDEN_INDEX ? 2 : GARDEN_INDEX)
                }
              >
                {pose.room === GARDEN_INDEX ? (
                  <ArrowLeft size={13} />
                ) : (
                  <Trees size={13} />
                )}
                {t(
                  pose.room === GARDEN_INDEX
                    ? "Back to the halls"
                    : "Visit the garden",
                )}
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
        {pose.room === GARDEN_INDEX &&
          !intro &&
          !selected &&
          !modal &&
          !videoExhibit && (
            <details
              className="garden-exhibits"
              aria-label={t("Outdoor exhibits")}
            >
              <summary>
                {t("WORDS IN THE GARDEN")} <ChevronDown size={14} />
              </summary>
              <div className="garden-word-list">
                {OUTDOOR_DISPLAYS.map(({ word }) => (
                  <button
                    key={word}
                    onClick={() =>
                      visit(exhibits.find((exhibit) => exhibit.word === word)!)
                    }
                  >
                    {word}
                    <MoveUpRight size={12} />
                  </button>
                ))}
              </div>
            </details>
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
          {t("WORDS FROM HANDY 990 · ART BY VOCAB HALL")}
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
                {selectedArea === GARDEN_INDEX
                  ? t("Garden")
                  : `${t("GALLERY 0")}${selectedArea + 1}`}{" "}
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
                <span>/{selected.ipa}/</span>
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
              {selected.collocations.length > 0 && (
                <div className="collocations">
                  <span className="eyebrow">{t("OFTEN FOUND WITH")}</span>
                  <div>
                    {selected.collocations.slice(0, 3).map((phrase) => (
                      <span key={phrase.text}>{phrase.text}</span>
                    ))}
                  </div>
                </div>
              )}
              {selected.synonyms.length > 0 && (
                <p className="related">
                  <span>{t("Related words")}</span>
                  {selected.synonyms.join(" · ")}
                </p>
              )}
              {selected.senses.length > 1 && (
                <details className="more-meanings">
                  <summary>
                    {locale === "zh_TW"
                      ? `還有 ${selected.senses.length - 1} 個意思`
                      : `${selected.senses.length - 1} more meanings`}
                    <ChevronDown size={14} />
                  </summary>
                  {selected.senses.slice(1).map((sense, i) => (
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
                  <span>18</span>
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
                      onClick={() => visit(exhibit)}
                      data-long-word={exhibit.word.length > 11}
                    >
                      {exhibit.word}
                    </button>
                  </div>
                  <button
                    className="collection-art"
                    onClick={() => visit(exhibit)}
                  >
                    <img src={assetUrl(exhibit.image)} alt={exhibit.word} />
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
              {t(
                "18 words from Handy 990, with original AI-created museum artwork.",
              )}
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
                "Three spacious halls, one long promenade, and a garden under open skies. Walk freely between them or choose where to begin.",
              )}
            </p>
            <div className="room-list">
              {destinations.map((room, i) => (
                <button
                  key={room.id}
                  className={pose.room === i ? "current" : ""}
                  onClick={() => navigateRoom(i)}
                >
                  <span
                    className="room-preview"
                    style={{ background: `${room.color}18` }}
                  >
                    {i === GARDEN_INDEX ? (
                      <Trees
                        className="garden-preview-icon"
                        size={49}
                        strokeWidth={1}
                      />
                    ) : (
                      <img src={assetUrl(exhibits[i * 6].image)} alt="" />
                    )}
                    <b>{i === GARDEN_INDEX ? "♧" : `0${i + 1}`}</b>
                  </span>
                  <span className="room-info">
                    <span className="eyebrow">
                      {pose.room === i
                        ? t("YOU ARE HERE")
                        : i === GARDEN_INDEX
                          ? t("OUTDOORS")
                          : `${t("Gallery")} 0${i + 1}`}
                    </span>
                    <strong>{t(room.name)}</strong>
                    <small>{t(room.subtitle)}</small>
                    <span className="room-count">
                      {i === GARDEN_INDEX ? (
                        t("6 outdoor exhibits · garden curiosities")
                      ) : (
                        <>
                          {
                            exhibits.filter(
                              (e) => e.room === i && visited.includes(e.id),
                            ).length
                          }{" "}
                          {t("/ 6 discovered")}
                        </>
                      )}
                    </span>
                  </span>
                  <ArrowRight size={20} />
                </button>
              ))}
            </div>
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
                    {t(
                      "Follow the wide central promenade through all three halls and into the garden. The floor map lets you jump to any hall or the garden; the guided tour visits all 18 exhibits.",
                    )}
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
