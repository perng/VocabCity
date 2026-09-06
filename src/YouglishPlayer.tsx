import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useLocale } from "./i18n";

export const youglishUrl = (word: string) =>
  `https://youglish.com/pronounce/${encodeURIComponent(word)}/english`;

export function YouTubeLogo() {
  return (
    <svg className="youtube-logo" viewBox="0 0 32 23" aria-hidden="true">
      <rect x="1" y="1" width="30" height="21" rx="6" fill="#c94637" />
      <path d="m13 6.5 9 5-9 5z" fill="#fffaf0" />
    </svg>
  );
}

type Widget = {
  fetch: (word: string, language: string) => void;
  pause: () => void;
  close: () => void;
};
type WidgetEvent = { totalResult?: number; code?: number };
type YouglishAPI = {
  Widget: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => Widget;
};
declare global {
  interface Window {
    YG?: YouglishAPI;
    onYouglishAPIReady?: () => void;
  }
}
let apiPromise: Promise<YouglishAPI> | undefined;

// Load the provider only after the visitor opens a video, once per page.
function loadYouglish(): Promise<YouglishAPI> {
  if (window.YG?.Widget) return Promise.resolve(window.YG);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://youglish.com/public/emb/widget.js";
    script.async = true;
    const previous = window.onYouglishAPIReady;
    const restore = () => {
      if (window.onYouglishAPIReady === ready)
        window.onYouglishAPIReady = previous;
    };
    const fail = () => {
      clearTimeout(timer);
      restore();
      script.remove();
      apiPromise = undefined;
      reject(new Error("YouGlish unavailable"));
    };
    const ready = () => {
      if (!window.YG?.Widget) return;
      clearTimeout(timer);
      restore();
      resolve(window.YG);
      previous?.();
    };
    const timer = window.setTimeout(fail, 15000);
    window.onYouglishAPIReady = ready;
    script.onerror = fail;
    script.onload = () => {
      if (window.YG?.Widget) ready();
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function YouglishPlayer({ word }: { word: string }) {
  const { t } = useLocale();
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    let widget: Widget | undefined;
    const container = host.current!;
    setStatus("loading");
    const watchdog = window.setTimeout(() => {
      if (live) setStatus("error");
    }, 25000);
    const update = (next: typeof status) => {
      if (!live) return;
      clearTimeout(watchdog);
      setStatus(next);
    };
    void loadYouglish()
      .then((YG) => {
        if (!live) return;
        const mount = document.createElement("div");
        mount.id = `youglish-${crypto.randomUUID()}`;
        container.appendChild(mount);
        widget = new YG.Widget(mount, {
          // Caption + speed + previous/next/replay + title. Keep provider branding.
          components: 4 + 8 + 16 + 64,
          autoStart: 0,
          captionSize: 22,
          backgroundColor: "#f8f6ef",
          titleColor: "#355d47",
          captionColor: "#4e6349",
          linkColor: "#426a50",
          markerColor: "#e8dfb3",
          events: {
            onFetchDone: (event: WidgetEvent) => {
              if (event.totalResult === 0) update("empty");
            },
            onPlayerReady: () => update("ready"),
            onError: () => update("error"),
          },
        });
        widget.fetch(word, "english");
      })
      .catch(() => update("error"));
    return () => {
      live = false;
      clearTimeout(watchdog);
      try {
        widget?.pause();
        widget?.close();
      } catch {
        /* Removing the iframe also stops playback. */
      }
      container.replaceChildren();
    };
  }, [word, attempt]);
  return (
    <div className="youglish-player">
      <div className="video-status" role="status">
        {status === "loading" && (
          <span>{t("Finding real-world examples…")}</span>
        )}
        {status === "empty" && (
          <span>{t("No video examples found for this word.")}</span>
        )}
        {status === "error" && (
          <span>
            {t(
              "The video provider is unavailable here. You can retry or open YouGlish.",
            )}
          </span>
        )}
        {(status === "empty" || status === "error") && (
          <button
            className="text-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            <RefreshCw size={14} />
            {t("Try again")}
          </button>
        )}
      </div>
      <div
        ref={host}
        className="youglish-host"
        aria-label={`${t("Video examples")}: ${word}`}
      />
      <footer className="youglish-footer">
        <a href={youglishUrl(word)} target="_blank" rel="noopener noreferrer">
          {t("Open this word on YouGlish")}
          <ExternalLink size={13} />
        </a>
        <a
          href="https://youglish.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by YouGlish.com
        </a>
        <span>
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            YouTube {t("Terms")}
          </a>{" "}
          ·{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google {t("Privacy")}
          </a>
        </span>
      </footer>
    </div>
  );
}
