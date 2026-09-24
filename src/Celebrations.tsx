import { useEffect, useRef, useState, type CSSProperties } from "react";
import { assetUrl } from "./types";

// A small burst of paper sparkles where something good just happened: a checked word,
// a right answer, a stamp or a finished house. Pure decoration, hidden from assistive tech.
export type Burst = "spark" | "confetti";
type Particle = { id: number; x: number; y: number; dx: number; dy: number; spin: number; color: string; size: number; delay: number; round: boolean };
const EVENT = "vocabhall:celebrate";
const COLORS = ["#d9a22e", "#e8c15d", "#56735c", "#8fb08f", "#b8453a", "#6f9fa4", "#f4e7c5"];
let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, at: 0 };

/** Celebrate at a point, or where the visitor last clicked or tapped. */
export function celebrate(kind: Burst = "spark", at?: { x: number; y: number }) {
  const recent = performance.now() - lastPointer.at < 1500;
  const origin = at ?? (recent ? lastPointer : { x: window.innerWidth / 2, y: window.innerHeight * 0.42 });
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind, x: origin.x, y: origin.y } }));
}

const ANNOUNCE = "vocabhall:announce";
/** A short ribbon over everything, for milestones such as a finished house. */
export function announce(title: string, detail = "") {
  window.dispatchEvent(new CustomEvent(ANNOUNCE, { detail: { title, detail } }));
}

let nextId = 0;
function particles(kind: Burst, x: number, y: number): Particle[] {
  const count = kind === "confetti" ? 70 : 16;
  return Array.from({ length: count }, (_, i) => {
    const angle = kind === "confetti" ? -Math.PI / 2 + (Math.random() - 0.5) * 2.2 : (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = kind === "confetti" ? 260 + Math.random() * 420 : 50 + Math.random() * 60;
    return {
      id: nextId++, x: kind === "confetti" ? x + (Math.random() - 0.5) * 240 : x, y,
      dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed + (kind === "confetti" ? 0 : -20),
      spin: (Math.random() - 0.5) * 720, color: COLORS[i % COLORS.length],
      size: kind === "confetti" ? 7 + Math.random() * 6 : 5 + Math.random() * 4,
      delay: kind === "confetti" ? Math.random() * 120 : 0, round: kind === "spark" || i % 3 === 0,
    };
  });
}

export function Celebrations() {
  const [bursts, setBursts] = useState<{ id: number; kind: Burst; items: Particle[] }[]>([]);
  const [banner, setBanner] = useState<{ id: number; title: string; detail: string } | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  // Modal dialogs live in the browser's top layer; re-open this popover on each burst
  // so the sparkles land above whichever dialog is open.
  useEffect(() => {
    const element = layer.current;
    if (!element?.showPopover) return;
    try {
      if (element.matches(":popover-open")) element.hidePopover();
      if (bursts.length || banner) element.showPopover();
    } catch { /* Older browsers keep the fixed layer below dialogs. */ }
  }, [bursts, banner]);
  useEffect(() => {
    const remember = (event: PointerEvent) => { lastPointer = { x: event.clientX, y: event.clientY, at: performance.now() }; };
    const onBurst = (event: Event) => {
      const { kind, x, y } = (event as CustomEvent<{ kind: Burst; x: number; y: number }>).detail;
      const id = nextId++;
      setBursts((current) => [...current.slice(-4), { id, kind, items: particles(kind, x, y) }]);
      setTimeout(() => setBursts((current) => current.filter((burst) => burst.id !== id)), kind === "confetti" ? 2600 : 1100);
    };
    // Milestones queue up, so a finished house and a finished walk each get their moment.
    let bannerTimer: ReturnType<typeof setTimeout> | undefined;
    const queue: { title: string; detail: string }[] = [];
    const showNext = () => {
      const next = queue.shift();
      setBanner(next ? { id: nextId++, ...next } : null);
      bannerTimer = next ? setTimeout(showNext, queue.length ? 2600 : 3600) : undefined;
    };
    const onAnnounce = (event: Event) => {
      // Keep the line short when milestones arrive quickly, as on a fast guided tour.
      if (queue.length >= 2) queue.pop();
      queue.push((event as CustomEvent<{ title: string; detail: string }>).detail);
      if (!bannerTimer) showNext();
      else if (queue.length === 1) { clearTimeout(bannerTimer); bannerTimer = setTimeout(showNext, 2600); }
    };
    window.addEventListener("pointerdown", remember, true);
    window.addEventListener(EVENT, onBurst);
    window.addEventListener(ANNOUNCE, onAnnounce);
    return () => {
      clearTimeout(bannerTimer);
      window.removeEventListener("pointerdown", remember, true); window.removeEventListener(EVENT, onBurst); window.removeEventListener(ANNOUNCE, onAnnounce);
    };
  }, []);
  return <div ref={layer} className="celebrations" popover="manual">
    <p className="milestone-live" role="status" aria-live="polite">{banner ? `${banner.title}${/[.!?！。]$/.test(banner.title) ? "" : "."} ${banner.detail}` : ""}</p>
    {banner && <div key={banner.id} className="milestone-banner" aria-hidden="true">
      <img src={assetUrl("mascot/welcome.webp")} alt="" />
      <strong>{banner.title}</strong>{banner.detail && <span>{banner.detail}</span>}
    </div>}
    {bursts.map((burst) => <div key={burst.id} className={`burst burst-${burst.kind}`} aria-hidden="true">
      {burst.items.map((p) => <i key={p.id} data-round={p.round} style={{
        left: p.x, top: p.y, width: p.size, height: p.round ? p.size : p.size * 0.5, background: p.color,
        animationDelay: `${p.delay}ms`, "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--spin": `${p.spin}deg`,
      } as CSSProperties} />)}
    </div>)}
  </div>;
}
