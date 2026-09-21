"""Build a candlestick-chart .ico for the ChartDesk desktop shortcut."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "chartdesk.ico"
PNG_PREVIEW = ROOT / "public" / "chartdesk-icon.png"

BG = (11, 18, 32, 255)
BG_TOP = (18, 32, 56, 255)
GRID = (40, 58, 90, 90)
GREEN = (34, 197, 94, 255)
GREEN_WICK = (22, 163, 74, 255)
RED = (239, 68, 68, 255)
RED_WICK = (220, 38, 38, 255)
LINE = (52, 211, 153, 220)
GLOW = (16, 185, 129, 70)


def rounded_rect(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    r = max(4, size * 22 // 100)
    # vertical gradient fill
    for y in range(size):
        t = y / max(size - 1, 1)
        c = tuple(int(BG[i] * (1 - t) + BG_TOP[i] * t) for i in range(3)) + (255,)
        draw.line([(0, y), (size - 1, y)], fill=c)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    img.putalpha(mask)
    return img


def draw_chart(size: int) -> Image.Image:
    img = rounded_rect(size)
    draw = ImageDraw.Draw(img)
    pad = size * 16 // 100
    inner = size - pad * 2

    # faint grid
    if size >= 32:
        for i in range(1, 4):
            y = pad + inner * i // 4
            draw.line([(pad, y), (size - pad, y)], fill=GRID, width=max(1, size // 128))

    # candles: (rel_x, open_rel, close_rel, wick_lo, wick_hi, bull)
    # y=0 top of chart area, y=1 bottom — invert later
    candles = [
        (0.08, 0.72, 0.58, 0.78, 0.52, True),
        (0.24, 0.60, 0.70, 0.76, 0.54, False),
        (0.40, 0.68, 0.48, 0.74, 0.42, True),
        (0.56, 0.50, 0.34, 0.56, 0.28, True),
        (0.72, 0.38, 0.22, 0.44, 0.16, True),
    ]

    def y_at(rel: float) -> int:
        return pad + int(inner * rel)

    def x_at(rel: float) -> int:
        return pad + int(inner * rel)

    body_w = max(2, inner * 10 // 100)
    wick_w = max(1, size // 64)

    # trend line through closes
    pts = [(x_at(c[0]) + body_w // 2, y_at(c[2])) for c in candles]
    if size >= 24:
        draw.line(pts, fill=LINE, width=max(1, size // 42), joint="curve")

    for cx, o, cl, lo, hi, bull in candles:
        x = x_at(cx)
        color = GREEN if bull else RED
        wick = GREEN_WICK if bull else RED_WICK
        mid = x + body_w // 2
        draw.line([(mid, y_at(hi)), (mid, y_at(lo))], fill=wick, width=wick_w)
        y1, y2 = sorted((y_at(o), y_at(cl)))
        if y2 - y1 < 2:
            y2 = y1 + 2
        draw.rectangle([x, y1, x + body_w, y2], fill=color)

    if size >= 48:
        glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        g = ImageDraw.Draw(glow)
        g.ellipse([size * 55 // 100, pad, size - pad // 2, pad + inner // 2], fill=GLOW)
        glow = glow.filter(ImageFilter.GaussianBlur(radius=max(2, size // 18)))
        img = Image.alpha_composite(img, glow)
        # redraw candles on top of glow
        overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        draw.line(pts, fill=LINE, width=max(1, size // 42), joint="curve")
        for cx, o, cl, lo, hi, bull in candles:
            x = x_at(cx)
            color = GREEN if bull else RED
            wick = GREEN_WICK if bull else RED_WICK
            mid = x + body_w // 2
            draw.line([(mid, y_at(hi)), (mid, y_at(lo))], fill=wick, width=wick_w)
            y1, y2 = sorted((y_at(o), y_at(cl)))
            if y2 - y1 < 2:
                y2 = y1 + 2
            draw.rectangle([x, y1, x + body_w, y2], fill=color)
        img = Image.alpha_composite(img, overlay)

    return img


def main() -> None:
    sizes = (16, 24, 32, 48, 64, 128, 256)
    images = [draw_chart(s) for s in sizes]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    images[-1].save(
        OUT,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=images[:-1],
    )
    images[-1].save(PNG_PREVIEW, format="PNG")
    print(f"Wrote {OUT}")
    print(f"Wrote {PNG_PREVIEW}")


if __name__ == "__main__":
    main()
