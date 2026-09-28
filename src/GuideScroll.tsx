import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLocale } from "./i18n";
import { guide } from "./guide";

const ROLL_UP_MS = 420;

// The visitor's guide as a parchment scroll: it unrolls between two wooden rods, the
// contents jump to a chapter, and closing rolls it back up before the dialog goes.
export function GuideScroll({ onClose }: { onClose: () => void }) {
  const { locale } = useLocale();
  const text = guide(locale);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    bodyRef.current?.focus({ preventScroll: true });
    return () => dialog.close();
  }, []);
  const close = () => {
    if (closing) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { onClose(); return; }
    setClosing(true);
    window.setTimeout(onClose, ROLL_UP_MS);
  };
  const jump = (id: string) => {
    const body = bodyRef.current, section = body?.querySelector<HTMLElement>(`#guide-${id}`);
    if (!body || !section) return;
    body.scrollTo({ top: section.offsetTop - 16, behavior: "smooth" });
  };
  return (
    <dialog
      ref={dialogRef}
      className={`guide-scroll${closing ? " closing" : ""}`}
      aria-label={text.title}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="scroll-rod" aria-hidden="true" />
      <div className="scroll-sheet">
        <div className="scroll-body" ref={bodyRef} tabIndex={-1}>
          <button className="scroll-x" onClick={close} aria-label={text.close}>
            <X size={20} />
          </button>
          <header>
            <span className="scroll-ornament" aria-hidden="true">❦</span>
            <h2>{text.title}</h2>
            <p>{text.subtitle}</p>
          </header>
          <nav aria-label={text.contents}>
            <h3>{text.contents}</h3>
            <ol>
              {text.chapters.map((chapter, i) => (
                <li key={chapter.id}>
                  <button onClick={() => jump(chapter.id)}>
                    <b>{i + 1}</b>
                    {chapter.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          {text.chapters.map((chapter, i) => (
            <section key={chapter.id} id={`guide-${chapter.id}`} aria-labelledby={`guide-${chapter.id}-title`}>
              <h3 id={`guide-${chapter.id}-title`}>
                <b>{i + 1}</b>
                {chapter.title}
              </h3>
              {chapter.blocks.map((block, j) =>
                typeof block === "string" ? (
                  <p key={j}>{block}</p>
                ) : (
                  <dl key={j}>
                    {block.map(([term, detail]) => (
                      <div key={term}>
                        <dt>{term}</dt>
                        <dd>{detail}</dd>
                      </div>
                    ))}
                  </dl>
                ),
              )}
            </section>
          ))}
          <button className="scroll-done" onClick={close}>
            {text.close}
          </button>
        </div>
      </div>
      <div className="scroll-rod" aria-hidden="true" />
    </dialog>
  );
}
