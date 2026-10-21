"use client";

export interface TradeShareArtProps {
  title: string;
  meta: string;
  pctLabel: string;
  pnlLabel: string;
  wonLabel: string | null;
  rows: Array<[string, string]>;
  positive: boolean;
  negative: boolean;
}

function wrapTitle(title: string): string[] {
  const max = 18;
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rocket(accent: string): string {
  return `
    <g transform="translate(500 690) rotate(-32)" opacity="0.9">
      <ellipse cx="18" cy="210" rx="28" ry="70" fill="${accent}" opacity="0.28"/>
      <ellipse cx="18" cy="168" rx="16" ry="36" fill="${accent}" opacity="0.55"/>
      <path d="M-8 150 L18 188 L44 150 Z" fill="${accent}" opacity="0.8"/>
      <path d="M18 8 C48 48 52 110 40 156 L-4 156 C-16 110 -12 48 18 8 Z" fill="#e8eef5"/>
      <path d="M18 8 C34 42 36 96 30 140 L18 148 L6 140 C12 96 2 42 18 8 Z" fill="#cbd5e1"/>
      <circle cx="18" cy="78" r="12" fill="#0b1220"/>
      <circle cx="18" cy="78" r="7" fill="#7dd3fc"/>
      <path d="M-4 118 L-28 158 L2 146 Z" fill="#fb7185"/>
      <path d="M40 118 L66 158 L34 146 Z" fill="#fb7185"/>
    </g>
    <g opacity="0.35" fill="${accent}">
      <circle cx="120" cy="180" r="2"/>
      <circle cx="210" cy="120" r="1.5"/>
      <circle cx="80" cy="420" r="1.4"/>
      <circle cx="260" cy="520" r="2"/>
      <circle cx="160" cy="760" r="1.6"/>
      <circle cx="90" cy="900" r="1.3"/>
      <circle cx="300" cy="300" r="1.2"/>
    </g>`;
}

export function tradeShareSvg(props: TradeShareArtProps): string {
  const accent = props.positive ? "#34d399" : props.negative ? "#fb7185" : "#e2e8f0";
  const lines = wrapTitle(props.title);
  const title = lines
    .map((line, index) => `<tspan x="56" dy="${index === 0 ? 0 : 50}">${xml(line)}</tspan>`)
    .join("");
  const rows = props.rows
    .map(
      ([label, value], index) => `
        <text x="56" y="${820 + index * 58}" fill="#94a3b8" font-size="28" font-family="Segoe UI, Malgun Gothic, sans-serif">${xml(label)}</text>
        <text x="664" y="${820 + index * 58}" fill="#f8fafc" font-size="30" text-anchor="end" font-family="Segoe UI, Malgun Gothic, sans-serif">${xml(value)}</text>`
    )
    .join("");
  const won = props.wonLabel
    ? `<text x="360" y="690" text-anchor="middle" fill="#cbd5e1" font-size="26" font-family="Segoe UI, Malgun Gothic, sans-serif">${xml(props.wonLabel)}</text>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1080" viewBox="0 0 720 1080">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#07111f"/>
      <stop offset="0.55" stop-color="#0b1220"/>
      <stop offset="1" stop-color="#12304a"/>
    </linearGradient>
    <radialGradient id="glow" cx="70%" cy="62%" r="45%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="720" height="1080" rx="36" fill="url(#sky)"/>
  <rect width="720" height="1080" fill="url(#glow)"/>
  ${rocket(accent)}
  <text x="56" y="78" fill="#94a3b8" font-size="22" letter-spacing="6" font-family="Segoe UI, sans-serif">CHARTDESK</text>
  <text x="56" y="168" fill="#f8fafc" font-size="42" font-weight="700" font-family="Segoe UI, Malgun Gothic, sans-serif">${title}</text>
  <text x="56" y="${168 + lines.length * 50 + 18}" fill="#94a3b8" font-size="24" font-family="Segoe UI, Malgun Gothic, sans-serif">${xml(props.meta)}</text>
  <text x="360" y="500" text-anchor="middle" fill="#cbd5e1" font-size="26" font-family="Segoe UI, Malgun Gothic, sans-serif">수익률</text>
  <text x="360" y="590" text-anchor="middle" fill="${accent}" font-size="92" font-weight="700" font-family="Segoe UI, Malgun Gothic, sans-serif">${xml(props.pctLabel)}</text>
  <text x="360" y="656" text-anchor="middle" fill="${accent}" font-size="34" font-family="Segoe UI, Malgun Gothic, sans-serif">${xml(props.pnlLabel)}</text>
  ${won}
  <line x1="56" y1="760" x2="664" y2="760" stroke="#ffffff" stroke-opacity="0.16"/>
  ${rows}
</svg>`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("card image"));
    img.src = url;
  });
}

export async function copyTradeShareImage(props: TradeShareArtProps): Promise<void> {
  const svg = tradeShareSvg(props);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = 1440;
    canvas.height = 2160;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(img, 0, 0, 1440, 2160);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("png");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function TradeShareArt(props: TradeShareArtProps) {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tradeShareSvg(props))}`;
  return <img src={src} alt="" className="block w-full rounded-[28px] shadow-2xl" />;
}
