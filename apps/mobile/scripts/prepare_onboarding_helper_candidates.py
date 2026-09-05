"""Package generated Blumi helper motion as review-only runtime candidates."""

import json
from pathlib import Path
import sys

from PIL import Image


SCRIPT_ROOT = Path(__file__).resolve().parent
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

from prepare_onboarding_run_candidates import normalize_frames  # noqa: E402


MOBILE_ROOT = SCRIPT_ROOT.parent
SOURCE_ROOT = MOBILE_ROOT / "artifacts/onboarding-intro-v4/helper-candidates"
OUTPUT_ROOT = (
    MOBILE_ROOT / "src/features/session/assets/onboarding-helper-v1-candidate"
)
SOURCES = {
    "female": SOURCE_ROOT / "female-helper-candidate-v1-alpha.png",
    "male": SOURCE_ROOT / "male-helper-candidate-v2-alpha.png",
}
FRAME_COUNT = 6
COLS = 3
ROWS = 2


def split_three_by_two_sheet(sheet: Image.Image, role: str) -> list[Image.Image]:
    rgba = sheet.convert("RGBA")
    if rgba.getchannel("A").getextrema()[0] == 255:
        raise ValueError(f"{role} helper sheet must use genuine transparent pixels")
    if rgba.width < COLS or rgba.height < ROWS:
        raise ValueError(f"{role} helper sheet must contain a 3 by 2 grid")

    x_bounds = [round(index * rgba.width / COLS) for index in range(COLS + 1)]
    y_bounds = [round(index * rgba.height / ROWS) for index in range(ROWS + 1)]
    return [
        rgba.crop((
            x_bounds[column],
            y_bounds[row],
            x_bounds[column + 1],
            y_bounds[row + 1],
        ))
        for row in range(ROWS)
        for column in range(COLS)
    ]


def prepare_helper_candidates(output: Path = OUTPUT_ROOT) -> dict[str, object]:
    output.mkdir(parents=True, exist_ok=True)
    role_reports: dict[str, object] = {}

    for role, source_path in SOURCES.items():
        with Image.open(source_path) as source:
            frames = normalize_frames(
                split_three_by_two_sheet(source, role),
                role,
            )
        for index, frame in enumerate(frames, start=1):
            frame.save(
                output / f"blumi_onboarding_helper_{role}_f{index:02}.png",
                optimize=True,
            )
        role_reports[role] = {
            "source": str(source_path.relative_to(MOBILE_ROOT)),
            "frames": len(frames),
            "footBaselineY": 360,
        }

    manifest: dict[str, object] = {
        "contract": "blumi-onboarding-helper-candidate-v1",
        "status": "candidate-only",
        "runtimePromotionAllowed": False,
        "frameCountPerRole": FRAME_COUNT,
        "canvas": [256, 384],
        "roles": role_reports,
        "blockingReason": (
            "Female edge spill repair, identity continuity review, native motion "
            "evidence, independent review and explicit user approval are required "
            "before runtime promotion."
        ),
    }
    (output / "candidate-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> int:
    prepare_helper_candidates()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
