#!/usr/bin/env python3
"""Render Motion v1 base-driver overlay QA HTML.

This is a preflight review tool. It reads extracted staging frames from
docs/avatar-motion-pipeline/extracted-frames and writes an HTML QA sheet under
docs/avatar-motion-pipeline only. It does not touch app assets or catalog code.
"""

from __future__ import annotations

import argparse
import html
import json
import os
from pathlib import Path


DEFAULT_MANIFEST = "docs/avatar-motion-pipeline/room-avatar-motion-missing-assets.json"
DEFAULT_OUT = "docs/avatar-motion-pipeline/room-avatar-motion-base-overlay-qa.html"
DEFAULT_EXTRACTED_DIR = "docs/avatar-motion-pipeline/extracted-frames"
BASE_PREFIXES = [
    "room_avatar_base_female_v2_walking_front",
    "room_avatar_base_female_v2_sitting_front",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render Blumi Motion v1 base-driver overlay QA."
    )
    parser.add_argument("--manifest", default=DEFAULT_MANIFEST)
    parser.add_argument("--extracted-dir", default=DEFAULT_EXTRACTED_DIR)
    parser.add_argument("--out", default=DEFAULT_OUT)
    return parser.parse_args()


def load_base_plans(manifest_path: Path) -> list[dict[str, object]]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    plans = [
        plan for plan in manifest["plans"]
        if plan["expectedAssetKeyPrefix"] in BASE_PREFIXES
    ]
    plans_by_prefix = {str(plan["expectedAssetKeyPrefix"]): plan for plan in plans}
    missing = [prefix for prefix in BASE_PREFIXES if prefix not in plans_by_prefix]
    if missing:
        raise SystemExit(f"Missing base plans in manifest: {', '.join(missing)}")
    return [plans_by_prefix[prefix] for prefix in BASE_PREFIXES]


def relative_path(from_file: Path, target: Path) -> str:
    return os.path.relpath(target, from_file.parent)


def assert_frame_exists(frame_path: Path) -> None:
    if not frame_path.exists():
        raise SystemExit(
            f"Missing extracted frame: {frame_path}\n"
            "Run the extractor after saving generated base strips."
        )


def render_frame_card(
    out_path: Path,
    extracted_dir: Path,
    plan: dict[str, object],
    frame_name: str,
    label: str,
) -> str:
    prefix = str(plan["expectedAssetKeyPrefix"])
    frame_path = extracted_dir / prefix / frame_name
    assert_frame_exists(frame_path)
    frame_src = html.escape(relative_path(out_path, frame_path))
    title = html.escape(f"{plan['label']} - {label}")
    return f"""
      <article class="card">
        <h2>{title}</h2>
        <p><code>{html.escape(frame_name)}</code></p>
        <div class="stage">
          <span class="centerline"></span>
          <span class="baseline"></span>
          <img src="{frame_src}" alt="{title}" />
        </div>
      </article>
    """


def render_plan_cards(
    out_path: Path,
    extracted_dir: Path,
    plan: dict[str, object],
) -> str:
    frame_names = [str(name) for name in plan["expectedFileNames"]]
    cards = [
        render_frame_card(
            out_path,
            extracted_dir,
            plan,
            frame_names[0],
            "frame 01 seed lock",
        )
    ]
    if len(frame_names) > 1:
        cards.append(
            render_frame_card(
                out_path,
                extracted_dir,
                plan,
                frame_names[1],
                "motion check frame",
            )
        )
    return "\n".join(cards)


def main() -> None:
    args = parse_args()
    manifest_path = Path(args.manifest)
    extracted_dir = Path(args.extracted_dir)
    out_path = Path(args.out)
    plans = load_base_plans(manifest_path)

    cards = "\n".join(
        render_plan_cards(out_path, extracted_dir, plan) for plan in plans
    )
    content = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Blumi Motion v1 Base Overlay QA</title>
    <style>
      :root {{
        color-scheme: dark;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #100b16;
        color: #fff4fa;
      }}
      body {{
        margin: 0;
        padding: 28px;
        background: #100b16;
      }}
      header, main {{
        max-width: 980px;
        margin: 0 auto;
      }}
      h1 {{
        margin: 0;
        font-size: 24px;
      }}
      .summary {{
        margin: 8px 0 18px;
        color: rgba(255, 234, 244, 0.74);
        font-size: 14px;
      }}
      .grid {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }}
      .card {{
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 14px;
        background: rgba(255, 234, 244, 0.07);
        padding: 14px;
      }}
      h2 {{
        margin: 0;
        font-size: 14px;
      }}
      p {{
        margin: 6px 0 12px;
        color: rgba(255, 214, 232, 0.82);
        font-size: 12px;
        overflow-wrap: anywhere;
      }}
      code {{
        color: #8fffd1;
      }}
      .stage {{
        position: relative;
        width: 256px;
        height: 384px;
        max-width: 100%;
        margin: 0 auto;
        overflow: hidden;
        background:
          linear-gradient(45deg, rgba(255,255,255,.08) 25%, transparent 25%),
          linear-gradient(-45deg, rgba(255,255,255,.08) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, rgba(255,255,255,.08) 75%),
          linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.08) 75%);
        background-color: rgba(255, 255, 255, 0.05);
        background-size: 24px 24px;
        background-position: 0 0, 0 12px, 12px -12px, -12px 0;
      }}
      .stage img {{
        position: relative;
        z-index: 1;
        display: block;
        width: 256px;
        height: 384px;
      }}
      .centerline, .baseline {{
        position: absolute;
        z-index: 2;
        pointer-events: none;
      }}
      .centerline {{
        left: 128px;
        top: 0;
        width: 1px;
        height: 100%;
        background: rgba(143, 255, 209, 0.72);
      }}
      .baseline {{
        left: 0;
        top: 360px;
        width: 100%;
        height: 1px;
        background: rgba(255, 180, 212, 0.78);
      }}
    </style>
  </head>
  <body>
    <header>
      <h1>Blumi Motion v1 Base Overlay QA</h1>
      <p class="summary">Review female base frame 01 locks and first walk motion frame against centerline x=128 and feet baseline y=360 before fitted-layer generation.</p>
    </header>
    <main class="grid">
{cards}
    </main>
  </body>
</html>
"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(content, encoding="utf-8")
    print(f"rendered Motion v1 base overlay QA to {out_path}")


if __name__ == "__main__":
    main()
