import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Volume2, X } from "lucide-react";
import { useLocale } from "./i18n";
import { useExhibitAudio } from "./useExhibitAudio";
import { ENCOUNTERS_KEY, readEncounters, residentHat, residentRounds, type Resident } from "./residents";
import { playSfx } from "./sfx";
import { celebrate } from "./Celebrations";
import type { Exhibit } from "./types";
import "./residents.css";

type Mood = "idle" | "happy" | "puzzled" | "cheer";
// The resident's face in the chat, drawn like the wooden figure in the square. It hops at a
// right answer, tilts its head at a miss and cheers when the chat is done.
export function ResidentAvatar({ resident, mood }: { resident: Resident; mood: Mood }) {
  const smile = mood === "idle" ? "M25 45q5 3 10 0" : mood === "puzzled" ? "M26 46q4-1.5 8 0" : "M23 43q7 7 14 0";
  return <svg className="resident-avatar" data-mood={mood} viewBox="0 0 60 70" aria-hidden="true">
    <path d="M8 70q0-17 22-17t22 17z" fill={resident.color} />
    <circle cx="30" cy="36" r="15" fill="#c9976c" />
    {mood === "cheer" ? <><path d="M21 34q3-3 6 0M33 34q3-3 6 0" stroke="#343c32" strokeWidth="1.8" fill="none" strokeLinecap="round" /></>
      : <><circle cx="25" cy="35" r="1.7" fill="#343c32" /><circle cx="35" cy="35" r="1.7" fill="#343c32" /></>}
    {mood !== "idle" && mood !== "puzzled" && <><circle cx="20" cy="41" r="2.4" fill="#e39a7e" opacity=".6" /><circle cx="40" cy="41" r="2.4" fill="#e39a7e" opacity=".6" /></>}
    <circle cx="30" cy="39" r="2.2" fill="#b47f58" />
    <path d={smile} stroke="#343c32" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <rect x="9" y="21" width="42" height="4" rx="2" fill={residentHat(resident)} />
    <path d="M18 22q1-10 12-10t12 10z" fill={residentHat(resident)} />
  </svg>;
}

export function ResidentQuiz({ resident, exhibits, checked, onClose, onAudioChange }: {
  resident: Resident; exhibits: Exhibit[]; checked: string[]; onClose: () => void; onAudioChange: (active: boolean) => void;
}) {
  const { locale, t } = useLocale();
  const [progress, setProgress] = useState(readEncounters);
  const [rounds, setRounds] = useState(() => residentRounds(resident, exhibits, checked, progress[resident.id]?.words ?? []));
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  const [correct, setCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [hint, setHint] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const round = rounds[index];
  const audio = useExhibitAudio(resident.id, setError);
  useEffect(() => { onAudioChange(Boolean(audio.active)); return () => onAudioChange(false); }, [audio.active, onAudioChange]);
  useEffect(() => { heading.current?.focus(); }, [index, complete]);
  const [mood, setMood] = useState<Mood>("idle");
  const answer = (choice: Exhibit) => {
    if (correct || wrong.includes(choice.id)) return;
    if (choice.id !== round.target.id) { setWrong([...wrong, choice.id]); setMood("puzzled"); playSfx("wrong"); return; }
    setCorrect(true); setMood("happy"); playSfx("correct"); celebrate("spark");
    if (!wrong.length) setScore(value => value + 1);
  };
  const next = () => {
    audio.stop(); setError("");
    if (index < rounds.length - 1) {
      setIndex(index + 1); setCorrect(false); setWrong([]); setHint(false); setMood("idle"); return;
    }
    const latest = readEncounters();
    const previous = latest[resident.id] ?? progress[resident.id];
    const updated = { ...latest, [resident.id]: {
      visits: (previous?.visits ?? 0) + 1,
      best: Math.max(previous?.best ?? 0, score),
      words: [...new Set([...(previous?.words ?? []), ...rounds.map(r => r.target.id)])],
    } };
    setProgress(updated);
    try { localStorage.setItem(ENCOUNTERS_KEY, JSON.stringify(updated)); }
    catch { setStorageError(true); }
    setComplete(true); setMood("cheer");
    playSfx("complete"); celebrate(score === rounds.length ? "confetti" : "spark");
  };
  return <section className="resident-sheet" style={{ "--resident-color": resident.color } as React.CSSProperties}>
    <header className="resident-heading">
      <div className="resident-portrait" aria-hidden="true"><ResidentAvatar key={`${index}-${wrong.length}-${mood}`} resident={resident} mood={mood} /></div>
      <div><span className="eyebrow">{t(resident.location)}</span><h2>{resident.name}<small>{t(resident.role)}</small></h2></div>
      <button className="icon-button" onClick={onClose} aria-label={t("Close conversation")}><X size={20} /></button>
    </header>
    <p className="resident-greeting">{t(resident.greeting)}</p>
    {!round ? <p>{t("No questions are available here yet.")}</p> : complete ? <div className="resident-complete">
      <Check size={32} /><h3 ref={heading} tabIndex={-1}>{t("A lovely chat!")}</h3>
      <p>{t("Correct on the first try")}: <strong>{score} / {rounds.length}</strong></p>
      <p>{t("Best score")}: {progress[resident.id].best} / {rounds.length} · {t("Completed visits")}: {progress[resident.id].visits}</p>
      <div className="resident-review">{rounds.map(({ target }) => <button key={target.id} onClick={() => void audio.play([{ key: target.id, url: target.audio, text: target.word }])}>
        <Volume2 size={16} /><strong>{target.word}</strong><span>{(locale && target.translations[locale]) || target.definition}</span>
      </button>)}</div>
      <p className="resident-saved">{t(storageError ? "This visit could not be saved in this browser." : "Your visit is saved in this browser.")}</p>
      <button className="primary-button" onClick={onClose}>{t("Keep wandering")}<ArrowRight size={17} /></button>
      <button className="text-button" onClick={() => {
        audio.stop(); setRounds(residentRounds(resident, exhibits, checked, progress[resident.id].words));
        setIndex(0); setWrong([]); setCorrect(false); setScore(0); setHint(false); setComplete(false); setMood("idle"); setError(""); setStorageError(false);
      }}>{t("Try three more")}</button>
    </div> : <>
      <div className="resident-question-top"><span className="eyebrow">{t("A LITTLE WORD CHALLENGE")}</span><span>{index + 1} / {rounds.length}</span></div>
      <h3 ref={heading} tabIndex={-1}>{t("Which word matches this meaning?")}</h3>
      <p className="resident-clue" lang="en">{round.target.definition}</p>
      <div className="resident-choices">{round.choices.map((choice, i) => <button key={choice.id}
        aria-label={choice.word}
        disabled={correct || wrong.includes(choice.id)} data-correct={correct && choice.id === round.target.id}
        onClick={() => answer(choice)}><span>{String(i + 1).padStart(2, "0")}</span>{choice.word}{correct && choice.id === round.target.id && <Check size={18} />}</button>)}</div>
      <div className="resident-feedback" role="status" aria-live="polite">
        {correct ? <><strong>{t("That’s the word!")} {round.target.word}</strong><p lang="en">{round.target.example}</p>
          {locale && <p>{round.target.exampleTranslations[locale]}</p>}
          <button onClick={() => void audio.play([{ key: "word", url: round.target.audio, text: round.target.word }])}><Volume2 size={16} />{t("Listen to word")}</button></>
          : wrong.length > 0 && <><strong>{t("Not quite. Try another word.")}</strong><p>{round.choices.find(c => c.id === wrong.at(-1))!.word}: {round.choices.find(c => c.id === wrong.at(-1))!.definition}</p></>}
      </div>
      {hint && <p className="resident-hint">{(locale && round.target.definitionTranslations[locale]) || `${t("First letter")}: ${round.target.word[0].toUpperCase()} · ${round.target.pos}`}</p>}
      <footer className="resident-actions">{correct ? <button className="primary-button" onClick={next}>{t(index === rounds.length - 1 ? "Finish conversation" : "Next question")}<ArrowRight size={17} /></button>
        : <button className="text-button" onClick={() => setHint(!hint)} aria-expanded={hint}>{t(hint ? "Hide hint" : "Show hint")}</button>}
        <span>{t("No timer. Take your time.")}</span></footer>
    </>}
    {error && <p role="alert">{t(error)}</p>}
  </section>;
}
