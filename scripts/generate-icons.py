"""Generate PWA/app icons for the Petty Cash Fund app.

Draws a simple wallet glyph (matching the in-app sidebar brand mark) on a
solid near-black background, at the sizes referenced by the web manifest
and root layout. Run with: python3 scripts/generate-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public" / "icons"
PUBLIC.mkdir(parents=True, exist_ok=True)

BG = (23, 23, 23, 255)  # near-black, matches the app's --primary token
FG = (255, 255, 255, 255)


def draw_wallet(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    w = x1 - x0
    h = y1 - y0
    radius = w * 0.14

    # Wallet body.
    body = (x0, y0 + h * 0.08, x1, y1 - h * 0.02)
    draw.rounded_rectangle(body, radius=radius, outline=FG, width=max(2, int(w * 0.06)))

    # Flap fold line.
    fold_y = y0 + h * 0.08 + h * 0.22
    draw.line(
        [(x0 + w * 0.08, fold_y), (x1 - w * 0.08, fold_y)],
        fill=FG,
        width=max(2, int(w * 0.05)),
    )

    # Clasp circle on the right edge.
    clasp_r = w * 0.09
    clasp_cx = x1 - w * 0.2
    clasp_cy = (body[1] + body[3]) / 2 + h * 0.05
    draw.ellipse(
        (clasp_cx - clasp_r, clasp_cy - clasp_r, clasp_cx + clasp_r, clasp_cy + clasp_r),
        fill=FG,
    )


def make_icon(size: int, *, padding_ratio: float, path: Path) -> None:
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    pad = size * padding_ratio
    draw_wallet(draw, (pad, pad, size - pad, size - pad))
    img.save(path)


def make_background_only(size: int, path: Path) -> None:
    """Opaque square, no rounding — for favicon.ico base and apple-touch-icon."""
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    pad = size * 0.22
    draw_wallet(draw, (pad, pad, size - pad, size - pad))
    img.save(path)


make_icon(192, padding_ratio=0.22, path=PUBLIC / "icon-192.png")
make_icon(512, padding_ratio=0.22, path=PUBLIC / "icon-512.png")
# Maskable icons need extra safe-zone padding so the OS can crop to a circle.
make_icon(512, padding_ratio=0.3, path=PUBLIC / "icon-maskable-512.png")
make_background_only(180, PUBLIC / "apple-touch-icon.png")
make_background_only(32, PUBLIC / "favicon-32.png")
make_background_only(16, PUBLIC / "favicon-16.png")

print("Icons written to", PUBLIC)
