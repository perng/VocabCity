import { useCallback, useEffect, useRef, useState } from "react";
import { assetUrl } from "./types";

export type AudioClip = { key: string; url?: string | null; text: string };

export function useExhibitAudio(
  exhibitId: string | undefined,
  onError: (message: string) => void,
) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const cancelPending = useRef<(() => void) | null>(null);
  const rateRef = useRef(1);
  const [active, setActive] = useState<string | null>(null);
  const [sequence, setSequence] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);

  const stop = useCallback(() => {
    generation.current++;
    if (audio.current) {
      audio.current.onended =
        audio.current.onerror =
        audio.current.ontimeupdate =
        audio.current.onloadedmetadata =
          null;
      audio.current.pause();
      audio.current = null;
    }
    window.speechSynthesis?.cancel();
    cancelPending.current?.();
    cancelPending.current = null;
    setActive(null);
    setSequence(false);
    setTime(0);
    setDuration(0);
  }, []);

  useEffect(() => {
    stop();
    return stop;
  }, [exhibitId, stop]);

  const play = async (clips: AudioClip[], asSequence = false) => {
    if (
      (asSequence && sequence) ||
      (!asSequence && active === clips[0]?.key && !sequence)
    ) {
      stop();
      return;
    }
    stop();
    const token = generation.current;
    setSequence(asSequence);
    for (const clip of clips) {
      if (token !== generation.current) return;
      setActive(clip.key);
      setTime(0);
      setDuration(0);
      const completed = await new Promise<boolean>((resolve) => {
        let settled = false,
          fallingBack = false;
        const finish = (success: boolean) => {
          if (settled) return;
          settled = true;
          cancelPending.current = null;
          resolve(success);
        };
        cancelPending.current = () => finish(false);
        const fallback = () => {
          if (fallingBack || settled || token !== generation.current) return;
          fallingBack = true;
          if (audio.current) {
            audio.current.onended = audio.current.onerror = null;
            audio.current.pause();
            audio.current = null;
          }
          if (!window.speechSynthesis) {
            onError("Audio is unavailable in this browser.");
            finish(false);
            return;
          }
          const speech = new SpeechSynthesisUtterance(clip.text);
          speech.lang = "en-US";
          speech.rate = rateRef.current * 0.9;
          speech.onend = () => finish(true);
          speech.onerror = () => {
            if (token === generation.current)
              onError("Audio could not play. Please try again.");
            finish(false);
          };
          window.speechSynthesis.speak(speech);
        };
        if (!clip.url) {
          fallback();
          return;
        }
        const recording = new Audio(assetUrl(clip.url));
        audio.current = recording;
        recording.playbackRate = rateRef.current;
        recording.onloadedmetadata = () => {
          if (token === generation.current)
            setDuration(
              Number.isFinite(recording.duration) ? recording.duration : 0,
            );
        };
        recording.ontimeupdate = () => {
          if (token === generation.current) setTime(recording.currentTime);
        };
        recording.onended = () => finish(true);
        recording.onerror = fallback;
        void recording.play().catch(fallback);
      });
      if (!completed || token !== generation.current) break;
    }
    if (token === generation.current) {
      setActive(null);
      setSequence(false);
      setTime(0);
      setDuration(0);
    }
  };

  const setRate = (value: number) => {
    rateRef.current = value;
    setRateState(value);
    if (audio.current) audio.current.playbackRate = value;
  };
  return { active, sequence, time, duration, rate, setRate, play, stop };
}
