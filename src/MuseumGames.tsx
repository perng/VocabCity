import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, Footprints, Headphones, Lightbulb, MapPin, RotateCcw, Stamp as StampIcon, Tag, Volume2, X, Sprout, Store, Brain } from "lucide-react";
import type { Museum } from "./museum";
import type { Exhibit, Room } from "./types";
import { assetUrl } from "./types";
import { useLocale } from "./i18n";
import { useExhibitAudio } from "./useExhibitAudio";
import { addStamp, familyPieces, GAME_TITLES, makeRounds, PASSPORT_KEY, readPassport, shuffle, type ClassicGameMode, type ExtraGameMode, type GameMode, type GameRound } from "./games";
import { MoreMuseumGames } from "./MoreMuseumGames";
import { ROOT_START } from "./layout";
import "./games.css";

type Session = { mode: ClassicGameMode; rounds: GameRound[]; paintings: Exhibit[]; index: number; solved: string[]; done: boolean };
const gameIcons = { quest: Compass, restore: Tag, step: Footprints, family: Sprout, market: Store, memory: Brain };
const descriptions: Record<GameMode, string> = {
  quest: "Follow a meaning clue. Find its painting and become the curator’s assistant.",
  restore: "A few paintings have lost their labels. Carry each word back to its artwork.",
  step: "Listen closely, then walk onto the matching word tile. Your feet are the answer.",
  family: "Join word parts at the workbench, then find the painting your new word belongs to.",
  market: "Meet the baker, the furniture maker, and the potter. A few words can make their day.",
  memory: "Meet three paintings, then remember their words, sounds, and sentences. Missed words return for another look.",
};

export function MuseumGames({ museum, roomIndex, room, pool, rooms, exhibits, checked, onClose, onPlayingChange, onAudioChange }: {
  museum: RefObject<Museum | null>; roomIndex: number; room: Room; pool: Exhibit[]; checked: string[];
  rooms: Room[]; exhibits: Exhibit[];
  onClose: () => void; onPlayingChange: (playing: boolean) => void; onAudioChange: (active: boolean) => void;
}) {
  const { t, locale } = useLocale();
  const [session, setSession] = useState<Session | null>(null);
  const [extraMode, setExtraMode] = useState<ExtraGameMode | null>(null);
  const [extraPlaying, setExtraPlaying] = useState(true);
  const [hint, setHint] = useState(false);
  const [alternatives, setAlternatives] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [audioError, setAudioError] = useState("");
  const [passport, setPassport] = useState(readPassport);
  const [storageNote, setStorageNote] = useState(false);
  const locked = useRef(false);
  const modal = useRef<HTMLDialogElement>(null);
  const playback = useExhibitAudio("museum-games", useCallback((message: string) => setAudioError(message), []));
  const playing = extraMode ? extraPlaying : !!session && !session.done;
  const round = session?.rounds[session.index];
  const correct = !!round && !!session?.solved.includes(round.target.id);
  const gameRoom = (mode: GameMode) => mode === "market" ? rooms.findIndex(r => r.id === "market")
    : mode === "family" && !pool.some(e => familyPieces(e, roomIndex)) ? ROOT_START : roomIndex;
  const modes = Object.keys(GAME_TITLES) as GameMode[];
  const completeCount = modes.filter(mode => passport.some(s => s.mode === mode && s.room === rooms[gameRoom(mode)].id)).length;
  const wordAudio = (e: Exhibit) => ({ key: "game-word", text: e.word, url: e.audio });
  const clue = (e: Exhibit) => e.definitionTranslations[locale] || e.translations[locale] || e.definition;

  useEffect(() => { onPlayingChange(playing); }, [playing, onPlayingChange]);
  useEffect(() => { onAudioChange(!!playback.active); }, [playback.active, onAudioChange]);
  useEffect(() => () => { museum.current?.setGame(null); onPlayingChange(false); onAudioChange(false); }, [museum, onPlayingChange, onAudioChange]);
  useEffect(() => {
    if (playing || extraMode) return;
    const dialog = modal.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [playing, session?.done, extraMode]);

  const answer = (id: string) => {
    if (!session || session.done || !round || locked.current) return;
    if (id !== round.target.id) {
      setFeedback(session.mode === "restore" && !session.paintings.some(e => e.id === id)
        ? "Choose one of the numbered paintings."
        : "Not quite. Try another one, or ask for a hint.");
      return;
    }
    locked.current = true;
    setFeedback(""); setHint(false);
    setSession({ ...session, solved: [...session.solved, id] });
    void playback.start([wordAudio(round.target)]);
  };
  // The scene keeps one callback while React supplies its current round and score.
  const answerRef = useRef(answer); answerRef.current = answer;
  useEffect(() => {
    if (extraMode) return;
    if (!session || session.done) { museum.current?.setGame(null); return; }
    museum.current?.setGame({
      mode: session.mode, room: roomIndex,
      exhibits: session.mode === "step" ? session.rounds[session.index].choices : session.paintings,
      restored: session.mode === "step" ? (correct ? [session.rounds[session.index].target.id] : []) : session.solved, enabled: !correct,
      onAnswer: id => answerRef.current(id),
    });
    return () => museum.current?.setGame(null);
  }, [museum, roomIndex, session?.mode, session?.index, session?.solved.length, session?.done, locale, correct, extraMode]);

  const start = (mode: GameMode) => {
    playback.stop(); setAudioError(""); setFeedback(""); setHint(false); setAlternatives(false); locked.current = false;
    if (mode === "family" || mode === "market" || mode === "memory") {
      setSession(null); setExtraPlaying(true); setExtraMode(mode); return;
    }
    const rounds = makeRounds(pool, checked);
    if (!rounds.length) return;
    const next = { mode, rounds, paintings: mode === "restore" ? shuffle(rounds.map(r => r.target)) : pool, index: 0, solved: [], done: false };
    // Claim audio permission inside the gesture before loading the playroom.
    if (mode !== "quest") void playback.start([wordAudio(rounds[0].target)]);
    museum.current?.setGame(null);
    museum.current?.resetGamePosition(roomIndex, mode === "step");
    setSession(next);
  };
  const leave = () => {
    playback.stop(); museum.current?.setGame(null); onClose();
  };
  const backToGames = () => {
    playback.stop(); museum.current?.setGame(null); setSession(null); setAudioError("");
  };
  const next = () => {
    if (!session || !correct) return;
    playback.stop();
    if (session.index === session.rounds.length - 1) {
      const updated = addStamp(passport, { mode: session.mode, room: room.id, earnedAt: new Date().toISOString() });
      setPassport(updated);
      try { localStorage.setItem(PASSPORT_KEY, JSON.stringify(updated)); } catch { setStorageNote(true); }
      setSession({ ...session, done: true });
      return;
    }
    const index = session.index + 1;
    locked.current = false; setFeedback(""); setHint(false); setAlternatives(false); setAudioError("");
    setSession({ ...session, index });
    if (session.mode !== "quest") void playback.start([wordAudio(session.rounds[index].target)]);
    if (session.mode === "step") museum.current?.resetGamePosition(roomIndex, true);
  };
  useEffect(() => {
    if (!playing || extraMode) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); playback.stop(); onClose(); } };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [playing, extraMode, onClose, playback.stop]);
  const showPaintings = () => setAlternatives(v => !v);
  const focusRoom = () => { museum.current?.resetGamePosition(roomIndex, session?.mode === "step"); };

  if (extraMode) {
    const destination = gameRoom(extraMode);
    return <MoreMuseumGames key={extraMode} mode={extraMode} museum={museum} roomIndex={destination} room={rooms[destination]}
      pool={destination === roomIndex ? pool : exhibits.filter(e => e.room === destination || e.families?.some(f => f.room === destination))}
      checked={checked} onClose={onClose} onBack={() => setExtraMode(null)} onStamp={setPassport}
      onPlayingChange={setExtraPlaying} onAudioChange={onAudioChange} />;
  }

  if (!playing) return <dialog ref={modal} className="games-dialog" aria-label={t("Museum games")}
    onCancel={event => { event.preventDefault(); leave(); }}>
    <button className="icon-button games-close" onClick={leave} aria-label={t("Close games")}><X size={20} /></button>
    {session?.done ? <div className="games-complete">
      <div className="passport-seal"><StampIcon size={36} /><span>{t("WORD EXPLORER")}</span></div>
      <span className="eyebrow">{t("A LITTLE DISCOVERY, WELL EARNED")}</span>
      <h1>{t("A stamp for your curiosity.")}</h1>
      <p>{t(GAME_TITLES[session.mode])} · {t(room.name)}</p>
      <div className="games-review">{session.rounds.map(({ target }) => <div key={target.id}>
        <img src={assetUrl(target.image)} alt="" />
        <div><strong>{target.word}</strong><span>{clue(target)}</span></div>
        <button className="icon-button" onClick={() => void playback.start([wordAudio(target)])} aria-label={`${t("Listen to word")}: ${target.word}`}><Volume2 size={18} /></button>
      </div>)}</div>
      <p className="passport-note">{t("Your passport")}: {passport.length} {t("stamps")} · {t("One stamp per game in each room.")}</p>
      {storageNote && <p role="status">{t("This browser could not save your stamp. You can keep playing.")}</p>}
      <div className="games-result-actions"><button className="primary-button" onClick={backToGames}>{t("Try another game")}<ArrowRight size={17} /></button>
      <button className="text-button" onClick={leave}>{t("Keep wandering")}</button></div>
    </div> : <>
      <div className="games-intro">
        <img src={assetUrl("mascot/welcome.webp")} alt={t("Your little museum guide")} />
        <div><span className="eyebrow">{t("THE PLAYFUL SIDE OF THE MUSEUM")}</span><h1>{t("A little play. A lasting word.")}</h1>
        <p>{t("Take a two-minute detour. No timer, no lost lives. Just a few words to make your own.")}</p></div>
      </div>
      <div className="games-location"><MapPin size={16} /><span>{t("Your playroom")}<strong>{t(room.name)}</strong></span><small>{pool.length} {t("words nearby")}</small></div>
      <div className="game-menu">{modes.map((mode, index) => {
        const destination = gameRoom(mode);
        const Icon = gameIcons[mode], earned = passport.some(s => s.mode === mode && s.room === rooms[destination].id);
        return <button key={mode} className={`game-menu-card game-menu-${mode}`} onClick={() => start(mode)} aria-label={t(GAME_TITLES[mode])}>
          <span className="game-card-index">0{index + 1}{earned && <Check size={16} />}</span>
          <Icon size={32} strokeWidth={1.3} /><h2>{t(GAME_TITLES[mode])}</h2><p>{t(descriptions[mode])}</p>
          {(mode === "market" || destination !== roomIndex) && <small className="game-card-location"><MapPin size={12} />{t(rooms[destination].name)}</small>}
          <span className="game-card-go">{t("Let’s play")} <ArrowRight size={18} /></span>
        </button>;
      })}</div>
      <div className="games-passport"><StampIcon size={24} /><span><strong>{t("Your explorer passport")}</strong><small>{t("Collect a stamp from every game and every room.")}</small></span>
        <b>{completeCount} / 6</b><small>{passport.length} {t("stamps in total")}</small></div>
      <p className="games-footnote">{t("Play in any Old Town house. Word building uses a root house; market missions take you to the square. Elsewhere, start in the port courtyard.")}</p>
    </>}
    {audioError && <p className="game-audio-error" role="alert">{t(audioError)}</p>}
  </dialog>;

  if (!session || !round) return null;
  const target = round.target;
  return <section className={`game-overlay game-${session.mode}`} aria-label={t(GAME_TITLES[session.mode])}>
    <div className="game-topbar">
      <button className="game-back" onClick={backToGames} aria-label={t("Back to games")}><ArrowLeft size={17} /><span>{t("Games")}</span></button>
      <div><strong>{t(GAME_TITLES[session.mode])}</strong><small>{t(room.name)}</small></div>
      <div className="game-rounds" aria-label={`${session.solved.length} / ${session.rounds.length}`}>
        {session.rounds.map((r, i) => <span key={r.target.id} data-complete={session.solved.includes(r.target.id)} data-current={i === session.index}>{session.solved.includes(r.target.id) ? <Check size={14} /> : i + 1}</span>)}
      </div><button className="icon-button" onClick={leave} aria-label={t("End game")}><X size={19} /></button>
    </div>
    <div className="game-prompt" data-correct={correct} aria-live="polite">
      <span className="eyebrow">{t(correct ? "A WORD TO KEEP WITH YOU" : session.mode === "step" ? "LISTEN · WALK · DISCOVER" : session.mode === "restore" ? "A LABEL LOOKING FOR ITS PAINTING" : "YOUR CURATOR’S CLUE")}</span>
      {correct ? <>
        <h2><Check size={25} />{target.word}</h2><p>{clue(target)}</p>
        <button className="game-example" onClick={() => void playback.start([{ key: "game-example", text: target.example, url: target.exampleAudio }])}><Volume2 size={16} /><span>{target.example}</span></button>
        <button className="primary-button" onClick={next}>{t(session.index === session.rounds.length - 1 ? "Collect my stamp" : "Next word")}<ArrowRight size={18} /></button>
      </> : <>
        {session.mode === "quest" ? <h2 className="game-clue">{clue(target)}</h2> : session.mode === "restore" ? <button className="loose-label" draggable
          onDragStart={event => { event.dataTransfer.setData("text/plain", target.id); event.dataTransfer.effectAllowed = "move"; }}
          onClick={() => void playback.start([wordAudio(target)])} aria-label={`${t("Carry label")}: ${target.word}`}><Tag size={20} /><span>{target.word}</span><Volume2 size={17} /></button>
          : <button className="game-listen" onClick={() => void playback.start([wordAudio(target)])} aria-label={t("Play the clue")}><Headphones size={28} /><span>{t(playback.active ? "Listening…" : "Listen again")}</span></button>}
        {session.mode === "quest" && pool.filter(e => clue(e) === clue(target)).length > 1 && <p>{target.word.length} {t("letters")}</p>}
        <p className="game-instruction">{t(session.mode === "step" ? "Stand on a word tile for a moment, or tap a tile to answer." : session.mode === "restore" ? "Drag this label onto a numbered painting, or simply click that painting." : "Look around this room. Click the painting that matches the clue.")}</p>
        {feedback && <p className="game-feedback" role="status">{t(feedback)}</p>}
        {hint && <p className="game-hint" role="status">{session.mode === "step" ? clue(target) : session.mode === "restore" ? clue(target) : `${t("Starts with")} ${target.word[0].toUpperCase()} · ${target.word.length} ${t("letters")}`}</p>}
        <div className="game-tools"><button onClick={() => setHint(v => !v)} aria-expanded={hint}><Lightbulb size={15} />{t("Hint")}</button>
          <button onClick={focusRoom}><RotateCcw size={14} />{t("Starting point")}</button>
          <button onClick={showPaintings} aria-expanded={alternatives}>{t(session.mode === "step" ? "Answer buttons" : "Nearby paintings")}</button></div>
      </>}
      {audioError && <p className="game-audio-error" role="alert">{t(audioError)}</p>}
    </div>
    {alternatives && !correct && <div className={`game-answer-tray ${session.mode === "step" ? "tile-answer-tray" : ""}`} aria-label={t("Choose an answer")}>
      {(session.mode === "step" ? round.choices : session.paintings).map((e, i) => <button key={e.id} disabled={session.mode === "restore" && session.solved.includes(e.id)} onClick={() => answer(e.id)} aria-label={session.mode === "step" ? e.word : `${t("Painting")} ${i + 1}`}>
        {session.mode !== "step" && <img src={assetUrl(e.image)} alt="" />}<span>{String(i + 1).padStart(2, "0")}</span>
        {session.mode === "step" && <strong>{e.word}</strong>}
        {session.mode === "restore" && session.solved.includes(e.id) && <Check size={16} />}
      </button>)}
    </div>}
  </section>;
}
