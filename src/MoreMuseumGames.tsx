import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, Lightbulb, MapPin, RotateCcw, Stamp, Volume2, X } from "lucide-react";
import type { Museum } from "./museum";
import { assetUrl, type Exhibit, type Room } from "./types";
import { useLocale } from "./i18n";
import { useExhibitAudio } from "./useExhibitAudio";
import { addStamp, assembleWord, GAME_TITLES, makeFamilyRounds, makeRounds, MARKET_MISSIONS, memorySentence, PASSPORT_KEY, readPassport, shuffle,
  type ExtraGameMode, type FamilyRound, type GameRound, type MarketMission, type Stamp as PassportStamp, type WordTile } from "./games";

type Round = GameRound & { family?: FamilyRound; mission?: MarketMission };
export function MoreMuseumGames({ mode, museum, roomIndex, room, pool, checked, onClose, onBack, onStamp, onPlayingChange, onAudioChange }: {
  mode: ExtraGameMode; museum: RefObject<Museum | null>; roomIndex: number; room: Room; pool: Exhibit[]; checked: string[];
  onClose: () => void; onBack: () => void; onStamp: (stamps: PassportStamp[]) => void;
  onPlayingChange: (playing: boolean) => void; onAudioChange: (active: boolean) => void;
}) {
  const { t, locale } = useLocale();
  const [rounds] = useState<Round[]>(() => mode === "family"
    ? makeFamilyRounds(pool, roomIndex, checked).map(family => ({ ...family, family }))
    : mode === "market" ? MARKET_MISSIONS.flatMap(mission => {
      const target = pool.find(e => e.word === mission.word);
      return target ? [{ target, mission: { ...mission, choices: shuffle(mission.choices) }, choices: [] }] : [];
    }) : makeRounds(pool, checked));
  const [queue, setQueue] = useState(() => rounds.map((_, i) => i));
  const [cursor, setCursor] = useState(0);
  const [solved, setSolved] = useState<string[]>([]);
  const [phase, setPhase] = useState<"study" | "recall">(mode === "memory" ? "study" : "recall");
  const [studying, setStudying] = useState(0);
  const [tiles, setTiles] = useState<WordTile[]>([]);
  const [built, setBuilt] = useState(false);
  const [talking, setTalking] = useState(false);
  const [result, setResult] = useState<"correct" | "retry" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [hint, setHint] = useState(false);
  const [alternatives, setAlternatives] = useState(false);
  const [done, setDone] = useState(false);
  const [storageNote, setStorageNote] = useState(false);
  const [audioError, setAudioError] = useState("");
  const lock = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const playback = useExhibitAudio("more-museum-games", useCallback((message: string) => setAudioError(message), []));
  const round = rounds[queue[cursor]], target = round?.target, mission = round?.mission;
  const clue = (e: Exhibit) => e.definitionTranslations[locale] || e.translations[locale] || e.definition;
  const wordAudio = (e: Exhibit) => ({ key: "game-word", text: e.word, url: e.audio });
  const listen = (e: Exhibit) => { setAudioError(""); void playback.start([wordAudio(e)]); };
  const finishReady = cursor === queue.length - 1 && solved.length === rounds.length;
  const memoryKind = queue[cursor] % 3;
  const meaningQuestion = memoryKind === 1 && new Set(round?.choices.map(clue)).size === round?.choices.length;

  useEffect(() => { museum.current?.resetGamePosition(roomIndex); }, [museum, roomIndex]);
  useEffect(() => { onPlayingChange(!done); }, [done, onPlayingChange]);
  useEffect(() => { onAudioChange(!!playback.active); }, [playback.active, onAudioChange]);
  useEffect(() => () => { museum.current?.setGame(null); onAudioChange(false); }, [museum, onAudioChange]);
  useEffect(() => {
    if (!done) return;
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, [done]);

  const answer = (id: string) => {
    if (!target || lock.current || done || phase === "study") return;
    if (id !== target.id) {
      if (mode !== "memory") { setFeedback("Not quite. Try another one, or ask for a hint."); return; }
      // A missed word is recalled again after the other words, rather than counted as mastered.
      if (!queue.slice(cursor + 1).includes(queue[cursor])) setQueue([...queue, queue[cursor]]);
      lock.current = true; setResult("retry"); listen(target); return;
    }
    lock.current = true; setResult("correct"); setFeedback(""); setHint(false);
    setSolved(previous => previous.includes(id) ? previous : [...previous, id]);
    listen(target);
  };
  const meet = () => {
    if (!mission || result) return;
    setAudioError(""); setFeedback(""); setTalking(true);
    void playback.start([{ key: "game-request", text: mission.request }]);
    museum.current?.visitGameNeighbour(mission.word);
  };
  const study = (index: number) => {
    setStudying(index); listen(rounds[index].target);
    museum.current?.goToExhibit(rounds[index].target, roomIndex);
  };
  const sceneAnswer = (id: string) => {
    if (mode === "market") {
      if (id === `npc:${mission?.word}`) meet();
      else setFeedback("Let’s help the highlighted neighbour first.");
    } else if (mode === "memory" && phase === "study") {
      const index = rounds.findIndex(r => r.target.id === id);
      if (index >= 0) study(index);
    } else if (mode === "family" && built) answer(id);
  };
  const sceneAnswerRef = useRef(sceneAnswer); sceneAnswerRef.current = sceneAnswer;
  useEffect(() => {
    if (done) { museum.current?.setGame(null); return; }
    museum.current?.setGame({ mode, room: roomIndex, exhibits: pool, restored: [],
      conceal: mode === "family" || (mode === "memory" && phase === "recall"),
      enabled: !result && (mode === "market" || built || phase === "study"),
      actors: mode === "market" ? rounds.map(r => ({ id: r.mission!.word, name: r.mission!.name, color: r.mission!.color,
        active: r.target.id === target?.id, complete: solved.includes(r.target.id) })) : undefined,
      onAnswer: id => sceneAnswerRef.current(id),
    });
    return () => museum.current?.setGame(null);
    // The pool and round order stay fixed for this visit; callbacks use the live ref.
  }, [museum, mode, roomIndex, built, phase, cursor, result, done, locale]);

  const leave = () => { playback.stop(); museum.current?.setGame(null); onClose(); };
  const back = () => { playback.stop(); museum.current?.setGame(null); onBack(); };
  useEffect(() => {
    if (done) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); leave(); } };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [done, onClose, playback.stop]);
  const next = () => {
    if (!result) return;
    playback.stop();
    if (finishReady) {
      const stamps = addStamp(readPassport(), { mode, room: room.id, earnedAt: new Date().toISOString() });
      try { localStorage.setItem(PASSPORT_KEY, JSON.stringify(stamps)); } catch { setStorageNote(true); }
      onStamp(stamps); setDone(true); return;
    }
    lock.current = false; setCursor(cursor + 1); setResult(null); setFeedback(""); setHint(false);
    setTiles([]); setBuilt(false); setTalking(false); setAlternatives(false); setAudioError("");
  };
  const addTile = (tile: WordTile) => setTiles(previous => previous.some(p => p.key === tile.key) ? previous : [...previous, tile]);
  const buildWord = () => {
    if (!target || !round.family) return;
    if (assembleWord(tiles).toLowerCase() !== target.word.toLowerCase()) {
      setFeedback("The pieces do not form the word yet. Remove a piece and try a different order."); return;
    }
    setBuilt(true); setFeedback(""); setHint(false); listen(target);
  };
  const startRecall = () => {
    playback.stop(); setPhase("recall"); setHint(false); setAudioError("");
    museum.current?.resetGamePosition(roomIndex);
  };

  if (done) return <dialog ref={dialog} className="games-dialog" aria-label={t("Museum games")} onCancel={e => { e.preventDefault(); leave(); }}>
    <button className="icon-button games-close" onClick={leave} aria-label={t("Close games")}><X size={20} /></button>
    <div className="games-complete">
      <div className="passport-seal"><Stamp size={36} /><span>{t("WORD EXPLORER")}</span></div>
      <span className="eyebrow">{t("A LITTLE DISCOVERY, WELL EARNED")}</span><h1>{t("A stamp for your curiosity.")}</h1>
      <p>{t(GAME_TITLES[mode])} · {t(room.name)}</p>
      <div className="games-review">{rounds.map(({ target: e }) => <div key={e.id}><img src={assetUrl(e.image)} alt="" />
        <div><strong>{e.word}</strong><span>{clue(e)}</span></div><button className="icon-button" onClick={() => listen(e)} aria-label={`${t("Listen to word")}: ${e.word}`}><Volume2 size={18} /></button></div>)}</div>
      <p className="passport-note">{t("One stamp per game in each room.")}</p>
      {storageNote && <p role="status">{t("This browser could not save your stamp. You can keep playing.")}</p>}
      <div className="games-result-actions"><button className="primary-button" onClick={back}>{t("Try another game")}<ArrowRight size={17} /></button><button className="text-button" onClick={leave}>{t("Keep wandering")}</button></div>
      {audioError && <p className="game-audio-error" role="alert">{t(audioError)}</p>}
    </div>
  </dialog>;
  if (!target) return <div className="game-prompt"><p>{t("This activity needs a few more words. Try another room.")}</p><button onClick={back}>{t("Back to games")}</button></div>;

  return <section className={`game-overlay game-${mode}`} aria-label={t(GAME_TITLES[mode])}>
    <div className="game-topbar">
      <button className="game-back" onClick={back} aria-label={t("Back to games")}><ArrowLeft size={17} /><span>{t("Games")}</span></button>
      <div><strong>{t(GAME_TITLES[mode])}</strong><small>{t(room.name)}</small></div>
      <div className="game-rounds" aria-label={`${solved.length} / ${rounds.length}`}>
        {rounds.map((r, i) => <span key={r.target.id} data-complete={solved.includes(r.target.id)} data-current={queue[cursor] === i}>{solved.includes(r.target.id) ? <Check size={14} /> : i + 1}</span>)}
      </div><button className="icon-button" onClick={leave} aria-label={t("End game")}><X size={19} /></button>
    </div>
    <div className={`game-prompt extra-game-prompt ${phase === "study" ? "memory-study" : ""}`} data-correct={result === "correct"}>
      <span className="eyebrow">{t(mode === "family" ? "THE WORD WORKSHOP" : mode === "market" ? "SMALL FAVOURS IN THE SQUARE" : phase === "study" ? "PAUSE · LOOK · REMEMBER" : "A WALK THROUGH YOUR MEMORY")}</span>
      {result ? <div aria-live="polite">
        {result === "retry" && <p className="game-feedback">{t("Let’s remember this one. You’ll get another try before collecting your stamp.")}</p>}
        <h2>{result === "correct" && <Check size={25} />}{target.word}<button className="icon-button" onClick={() => listen(target)} aria-label={t("Listen to word")}><Volume2 size={18} /></button></h2>
        <p>{clue(target)}</p>
        {mission && <blockquote className="market-thanks">“{mission.thanks}”{locale === "zh_TW" && <small>{mission.thanksTranslation}</small>}
          <button onClick={() => void playback.start([{ key: "game-thanks", text: mission.thanks }])}><Volume2 size={15} />{t("Hear the reply")}</button></blockquote>}
        <button className="game-example" onClick={() => void playback.start([{ key: "game-example", text: target.example, url: target.exampleAudio }])}><Volume2 size={16} /><span>{target.example}</span></button>
        <button className="primary-button" onClick={next}>{t(finishReady ? "Collect my stamp" : mode === "market" ? "Next neighbour" : "Next word")}<ArrowRight size={18} /></button>
      </div> : phase === "study" ? <>
        <h2>{t("Take a little memory walk.")}</h2><p>{t("Meet these paintings. Tap a card to walk over and hear its word. Begin the recall when you feel ready.")}</p>
        <div className="memory-study-cards">{rounds.map((r, i) => <button key={r.target.id} data-active={studying === i} onClick={() => study(i)} aria-label={`${t("Study painting")}: ${r.target.word}`}>
          <img src={assetUrl(r.target.image)} alt="" /><strong>{r.target.word}</strong><span>{clue(r.target)}</span><Volume2 size={16} /></button>)}</div>
        <p className="game-instruction">{t("Next, the labels disappear. Remember a painting, a sound, and a sentence.")}</p>
        <button className="primary-button" onClick={startRecall}>{t("I’m ready to remember")}<ArrowRight size={18} /></button>
      </> : mode === "family" && round.family ? <>
        {built ? <><h2>{target.word}</h2><p>{t("You built it! Now find the painting that belongs to this word.")}</p>
          <button className="text-button" onClick={() => setAlternatives(v => !v)}><Eye size={17} />{t("Nearby paintings")}</button></> : <>
          <h2 className="game-clue">{clue(target)}</h2><p className="game-instruction">{t("Tap word parts from left to right, or drag them into the workbench. Tap a placed part to remove it.")}</p>
          <div className="word-workbench" aria-label={t("Word workbench")} onDragOver={e => e.preventDefault()} onDrop={e => {
            e.preventDefault(); const tile = round.family!.tiles.find(p => p.key === e.dataTransfer.getData("text/plain")); if (tile) addTile(tile);
          }}>
            {!tiles.length && <span>{t("Your word begins here")}</span>}
            {tiles.map(tile => <button key={tile.key} onClick={() => setTiles(tiles.filter(p => p.key !== tile.key))} aria-label={`${t("Remove part")}: ${tile.piece.joined}`}>{tile.piece.joined}<X size={12} /></button>)}
          </div>
          <div className="word-part-tray" aria-label={t("Available word parts")}>{round.family.tiles.map(tile => <button key={tile.key} disabled={tiles.some(p => p.key === tile.key)} draggable
            onDragStart={e => e.dataTransfer.setData("text/plain", tile.key)} onClick={() => addTile(tile)} aria-label={`${t("Add part")}: ${tile.piece.joined}`}>
            <strong>{tile.piece.joined}</strong><small>{tile.piece.translations[locale] || tile.piece.gloss}</small>
            {tile.piece.surface !== tile.piece.joined && <em>{tile.piece.surface} → {tile.piece.joined}</em>}
          </button>)}</div>
          <div className="workbench-actions"><button onClick={() => { setTiles([]); setFeedback(""); }}><RotateCcw size={14} />{t("Clear parts")}</button>
            <button className="primary-button" disabled={!tiles.length} onClick={buildWord}>{t("Build this word")}<ArrowRight size={16} /></button></div>
          {round.family.pieces.some(p => p.surface !== p.joined) && <p className="game-instruction">{t("Some parts change spelling when joined. The small arrow shows the change.")}</p>}
        </>}
      </> : mode === "market" && mission ? <>
        <div className="market-person" style={{ "--neighbour-color": mission.color } as React.CSSProperties}><span className="neighbour-portrait" aria-hidden="true"><i /><b /></span><div><small>{t(mission.role)}</small><h2>{mission.name}</h2></div></div>
        {!talking ? <><p>{t("Someone in the square could use your help. Click their wooden figure, or meet them here.")}</p><button className="primary-button" onClick={meet}>{t("Meet this neighbour")}<MapPin size={17} /></button></> : <>
          <blockquote className="market-request">“{mission.request}”</blockquote>
          <button className="text-button request-audio" onClick={meet}><Volume2 size={17} />{t("Listen to the request")}</button>
          <div className="market-replies" aria-label={t("Choose a reply")}>{mission.choices.map(choice => <button key={choice.word} onClick={() => {
            if (choice.word === mission.word) answer(target.id); else setFeedback(choice.feedback!);
          }}><span>{choice.reply}</span><ArrowRight size={15} /></button>)}</div>
        </>}
      </> : <>
        {meaningQuestion ? <><h2>{t("Which meaning did you hear?")}</h2><button className="game-listen" onClick={() => listen(target)}><Volume2 size={25} />{t("Play the clue")}</button></>
          : memoryKind === 2 && memorySentence(target) ? <><h2>{t("Put the word back in its sentence.")}</h2><blockquote className="memory-sentence">{memorySentence(target)}</blockquote></>
          : <><h2>{t("Which word belongs to this painting?")}</h2><img className="memory-recall-art" src={assetUrl(target.image)} alt={t("A painting from your memory walk")} /></>}
        <div className="memory-choices" aria-label={t("Choose an answer")}>{round.choices.map(choice => <button key={choice.id} onClick={() => answer(choice.id)}>{meaningQuestion ? clue(choice) : choice.word}</button>)}</div>
        {cursor >= rounds.length && <p className="memory-revisit">{t("A second look — you’ve met this word before.")}</p>}
      </>}
      {!result && phase !== "study" && <>
        {feedback && <p className="game-feedback" role="status">{t(feedback)}</p>}
        {hint && <p className="game-hint" role="status">{mode === "market" ? (locale === "zh_TW" ? mission?.translation : clue(target))
          : mode === "family" ? `${t("Starts with")} ${round.family?.pieces[0].joined} · ${round.family?.pieces.length} ${t("word parts")}`
          : meaningQuestion ? `${t("Starts with")} ${target.word[0].toUpperCase()}` : clue(target)}</p>}
        <div className="game-tools"><button onClick={() => setHint(v => !v)} aria-expanded={hint}><Lightbulb size={15} />{t(mode === "market" && locale === "zh_TW" ? "Translation hint" : "Hint")}</button>
          <button onClick={() => museum.current?.resetGamePosition(roomIndex)}><RotateCcw size={14} />{t("Starting point")}</button></div>
      </>}
      {audioError && <p className="game-audio-error" role="alert">{t(audioError)}</p>}
    </div>
    {mode === "family" && built && alternatives && !result && <div className="game-answer-tray" aria-label={t("Choose an answer")}>
      {pool.map((e, i) => <button key={e.id} onClick={() => answer(e.id)} aria-label={`${t("Painting")} ${i + 1}`}><img src={assetUrl(e.image)} alt="" /><span>{String(i + 1).padStart(2, "0")}</span></button>)}
    </div>}
  </section>;
}
