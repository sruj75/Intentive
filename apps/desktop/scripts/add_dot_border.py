"""
Build capturing/error tray icons from the idle silhouette + a status dot.

Approach:
  - Idle PNG is the canonical head+asterisk silhouette (black pixels, template).
  - Capturing/Error variants are the SAME silhouette but rendered white, plus a
    colored status dot at the bottom-right.
  - We rebuild the variants from idle's alpha mask each run — no destructive
    edits on top of stale state.

Design choices:
  - Capturing dot: Apple system green #34C759 (matches macOS active indicators).
  - Error dot:    amber/gold #FFB300.
  - Dot diameter ≈ 33% of the head bounding box's larger dimension.
  - Dot placed so its center sits at the bottom-right edge of the head bbox.
  - 10 px transparent gap around the dot separates it from the white head on
    both light and dark menu bars.
"""

from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

APPLE_GREEN = (52, 199, 89)
AMBER_GOLD = (255, 179, 0)

ICONS_DIR = Path(__file__).parent.parent / "src-tauri" / "icons" / "tray"
GAP_PX = 10


def build_variant(dst: Path, dot_color: tuple[int, int, int]) -> None:
    idle = Image.open(ICONS_DIR / "status-item-idle.png").convert("RGBA")
    idle_arr = np.array(idle)
    alpha = idle_arr[..., 3]

    # Build white head silhouette by reusing idle's alpha mask
    out = np.zeros_like(idle_arr)
    out[..., 0] = 255
    out[..., 1] = 255
    out[..., 2] = 255
    out[..., 3] = alpha

    # Head bounding box from the alpha mask
    ys, xs = np.where(alpha > 32)
    hx0, hy0, hx1, hy1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    head_w = hx1 - hx0
    head_h = hy1 - hy0

    # Dot size midway between the original (r=14.5) and the smaller variant (r=10.7)
    dot_r = 12.6
    cx = hx1 - dot_r * 0.2  # slight outset so the dot kisses the edge
    cy = hy0 + dot_r * 0.2

    img = Image.fromarray(out, "RGBA")
    draw = ImageDraw.Draw(img)
    draw.ellipse(
        [cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
        fill=(*dot_color, 255),
    )

    # Punch transparent gap around the dot so the menu-bar bg shows through
    arr = np.array(img, dtype=np.uint8)
    h, w = arr.shape[:2]
    gy, gx = np.ogrid[:h, :w]
    dist = np.sqrt((gx - cx) ** 2 + (gy - cy) ** 2)
    arr[(dist >= dot_r) & (dist < dot_r + GAP_PX), 3] = 0

    Image.fromarray(arr, "RGBA").save(dst, "PNG")
    print(f"  {dst.name}: dot at ({cx:.0f},{cy:.0f}) r={dot_r:.1f}, gap={GAP_PX}px")


build_variant(ICONS_DIR / "status-item-capturing.png", APPLE_GREEN)
build_variant(ICONS_DIR / "status-item-error.png", AMBER_GOLD)
