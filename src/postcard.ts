import { assetUrl, partOfSpeech, type Exhibit } from "./types";

// A postcard from Vocab City: the painting on the left, the word, its meaning and example
// on the right, with a stamp and a postmark naming the place it hangs.
const W = 1800, H = 1200;

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines = 6) {
  // Break on spaces (or between characters for scripts written without spaces).
  const tokens = /\s/.test(text) ? text.split(/(?<=\s)/) : [...text];
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    if (line && ctx.measureText(line + token).width > width) { lines.push(line.trimEnd()); line = token.trimStart(); }
    else line += token;
  }
  if (line.trim()) lines.push(line.trimEnd());
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = shown[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > width && last.length > 1) last = last.slice(0, -1);
    shown[maxLines - 1] = `${last}…`;
  }
  for (const text of shown) { ctx.fillText(text, x, y); y += lineHeight; }
  return y;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image); image.onerror = reject;
    image.src = src;
  });
}

export async function drawPostcard(exhibit: Exhibit, place: string, translation: string, locale: string) {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f6f0e1"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#c9b691"; ctx.lineWidth = 3; ctx.strokeRect(28, 28, W - 56, H - 56);
  // The painting, framed in gold.
  const art = await loadImage(assetUrl(exhibit.image));
  const size = 900, top = (H - size) / 2;
  ctx.fillStyle = "#d9a22e"; ctx.fillRect(66, top - 14, size + 28, size + 28);
  ctx.fillStyle = "#fbf6e8"; ctx.fillRect(76, top - 4, size + 8, size + 8);
  ctx.drawImage(art, 80, top, size, size);
  // A dotted divider, as on the back of a real postcard.
  const x0 = size + 200;
  ctx.setLineDash([6, 10]); ctx.strokeStyle = "#b7ab8c"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0 - 40, 120); ctx.lineTo(x0 - 40, H - 120); ctx.stroke(); ctx.setLineDash([]);
  const textWidth = W - x0 - 90;
  // Stamp and postmark.
  const sx = W - 250, sy = 90;
  ctx.fillStyle = "#fbf6e8"; ctx.fillRect(sx, sy, 160, 190);
  ctx.strokeStyle = "#b8453a"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.strokeRect(sx + 4, sy + 4, 152, 182); ctx.setLineDash([]);
  ctx.drawImage(art, sx + 22, sy + 22, 116, 116);
  ctx.fillStyle = "#b8453a"; ctx.font = '600 20px "DM Sans", sans-serif'; ctx.textAlign = "center";
  ctx.fillText("VOCAB CITY", sx + 80, sy + 170);
  ctx.save(); ctx.translate(sx - 30, sy + 150); ctx.rotate(-0.25);
  ctx.strokeStyle = "#56735caa"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#56735ccc"; ctx.font = '600 15px "DM Sans", sans-serif';
  ctx.fillText(new Date().toLocaleDateString(locale ? locale.replace("_", "-") : "en", { year: "numeric", month: "short", day: "numeric" }).toUpperCase(), 0, 6);
  ctx.restore();
  // The word and what it means.
  ctx.textAlign = "left";
  ctx.fillStyle = "#56735c"; ctx.font = '600 22px "DM Sans", sans-serif';
  wrap(ctx, `GREETINGS FROM ${place.toUpperCase()}`, x0, 340, textWidth, 30, 2);
  ctx.fillStyle = "#2f4435";
  let fontSize = 120;
  ctx.font = `italic 500 ${fontSize}px "Cormorant Garamond", serif`;
  while (ctx.measureText(exhibit.word).width > textWidth && fontSize > 56) { fontSize -= 6; ctx.font = `italic 500 ${fontSize}px "Cormorant Garamond", serif`; }
  ctx.fillText(exhibit.word, x0, 480);
  ctx.fillStyle = "#7a7a66"; ctx.font = '400 26px "DM Sans", sans-serif';
  ctx.fillText(partOfSpeech(exhibit.pos), x0, 530);
  ctx.fillStyle = "#3d463a"; ctx.font = '400 34px "DM Sans", sans-serif';
  let y = wrap(ctx, exhibit.definition, x0, 600, textWidth, 46, 3);
  if (translation) { ctx.fillStyle = "#56735c"; ctx.font = '500 34px "DM Sans", sans-serif'; y = wrap(ctx, translation, x0, y + 6, textWidth, 48, 2); }
  ctx.fillStyle = "#4f5a4a"; ctx.font = 'italic 400 40px "Cormorant Garamond", serif';
  y = wrap(ctx, `“${exhibit.example}”`, x0, y + 44, textWidth, 50, 4);
  // Ruled address lines to finish the look.
  ctx.strokeStyle = "#d4c9ad"; ctx.lineWidth = 2;
  for (let line = y + 20; line < H - 110; line += 56) { ctx.beginPath(); ctx.moveTo(x0, line); ctx.lineTo(W - 90, line); ctx.stroke(); }
  if (exhibit.artwork) {
    ctx.fillStyle = "#8a8f7c"; ctx.font = 'italic 400 26px "Cormorant Garamond", serif';
    ctx.fillText(`${exhibit.artwork.title} · ${exhibit.artwork.medium}`.slice(0, 70), x0, H - 70);
  }
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("postcard"))), "image/png"));
}

/** Share the postcard where the browser can, or save it as an image. */
export async function sendPostcard(exhibit: Exhibit, place: string, translation: string, locale: string) {
  const blob = await drawPostcard(exhibit, place, translation, locale);
  const file = new File([blob], `vocab-city-${exhibit.word.replace(/[^a-z0-9-]+/gi, "-")}.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
    try { await nav.share({ files: [file], title: `Vocab City · ${exhibit.word}` }); return "shared"; }
    catch (error) { if ((error as Error).name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "saved";
}
