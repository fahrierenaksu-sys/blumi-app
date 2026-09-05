#!/usr/bin/env python3
"""Render a lightweight HTML contact sheet for room-avatar motion canvases."""

from __future__ import annotations

import argparse
import html
import json
import os
from pathlib import Path


DEFAULT_MANIFEST = "docs/avatar-motion-pipeline/room-avatar-motion-missing-assets.json"
DEFAULT_OUT = "docs/avatar-motion-pipeline/room-avatar-motion-contact-sheet.html"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render a Blumi room-avatar motion contact sheet."
    )
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    parser.add_argument("--out", default=DEFAULT_OUT)
    parser.add_argument(
        "--include-optional",
        action="store_true",
        help="Reserved for future non-v1 plans if the manifest includes them.",
    )
    return parser.parse_args()


def relative_path(from_file: Path, target: str) -> str:
    return os.path.relpath(target, from_file.parent)


def render_card(plan: dict[str, object], out_path: Path) -> str:
    image_src = html.escape(relative_path(out_path, str(plan["editCanvasPath"])))
    title = html.escape(f"{plan['bodyPreset']} {plan['label']} - {plan['layerName']}")
    playback = "looping" if bool(plan["loop"]) else "static/non-looping"
    meta = html.escape(
        f"{plan['layerType']} · {plan['minimumFrameCount']} frame · {plan['frameDurationMs']}ms · {playback} · {plan['expectedStripFileName']}"
    )
    seed = html.escape(str(plan["seedPath"]))
    slot = html.escape(str(plan["catalogMotionSlot"]))
    return f"""
      <article class="card">
        <div class="card-copy">
          <h2>{title}</h2>
          <p>{meta}</p>
          <p class="fine">Seed: <code>{seed}</code></p>
          <p class="fine">Catalog slot: <code>{slot}</code></p>
        </div>
        <div class="strip-wrap">
          <img src="{image_src}" alt="{title}" />
        </div>
      </article>
    """


def main() -> None:
    args = parse_args()
    manifest_path = Path(args.manifest)
    out_path = Path(args.out)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    plans = [
        plan for plan in manifest["plans"]
        if args.include_optional or plan["productionBlocking"]
    ]
    cards = "\n".join(render_card(plan, out_path) for plan in plans)
    content = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Blumi Room Avatar Motion Contact Sheet</title>
    <style>
      :root {{
        color-scheme: dark;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0e0a16;
        color: #fff4fa;
      }}
      body {{
        margin: 0;
        padding: 28px;
        background: #0e0a16;
      }}
      header {{
        max-width: 1120px;
        margin: 0 auto 18px;
      }}
      h1 {{
        margin: 0;
        font-size: 24px;
      }}
      .summary {{
        margin: 8px 0 0;
        color: rgba(255, 234, 244, 0.72);
        font-size: 14px;
      }}
      .grid {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 14px;
        max-width: 1120px;
        margin: 0 auto;
      }}
      .card {{
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.13);
        border-radius: 14px;
        background: rgba(255, 234, 244, 0.07);
      }}
      .card-copy {{
        padding: 13px 14px 8px;
      }}
      h2 {{
        margin: 0;
        font-size: 14px;
      }}
      p {{
        margin: 5px 0 0;
        color: rgba(255, 214, 232, 0.82);
        font-size: 12px;
      }}
      code {{
        color: #8fffd1;
        font-size: 11px;
      }}
      .fine {{
        overflow-wrap: anywhere;
      }}
      .strip-wrap {{
        margin: 0 14px 14px;
        padding: 8px;
        border-radius: 10px;
        background:
          linear-gradient(45deg, rgba(255,255,255,.06) 25%, transparent 25%),
          linear-gradient(-45deg, rgba(255,255,255,.06) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, rgba(255,255,255,.06) 75%),
          linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.06) 75%);
        background-size: 20px 20px;
        background-position: 0 0, 0 10px, 10px -10px, -10px 0;
      }}
      img {{
        display: block;
        width: 100%;
        height: auto;
        image-rendering: auto;
      }}
    </style>
  </head>
  <body>
    <header>
      <h1>Blumi Room Avatar Motion Contact Sheet</h1>
      <p class="summary">{len(plans)} production canvas rows generated from {html.escape(str(manifest_path))}. These are review inputs only, not catalog-ready motion assets.</p>
    </header>
    <main class="grid">
{cards}
    </main>
  </body>
</html>
"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(content, encoding="utf-8")
    print(f"rendered {len(plans)} motion canvas cards to {out_path}")


if __name__ == "__main__":
    main()
