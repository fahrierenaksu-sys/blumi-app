"""Build and quality-gate canonical Blumi onboarding motion frames.

The repository currently contains an approved four-pose front walk cycle, not
a six-pose run cycle. The default command is therefore a read-only readiness
check that exits non-zero until every canonical layered run source exists.
Nothing in this script interpolates, warps, mirrors, or invents missing poses.

The legacy four-pose flattening step remains available only through the
explicit ``build-walk-fallback`` command so the current runtime can be rebuilt
deterministically without being mislabelled as production run art.
"""

import argparse
import hashlib
import json
from pathlib import Path
from typing import Iterable

from PIL import Image


MOBILE_ROOT = Path(__file__).resolve().parents[1]
ROOM = MOBILE_ROOT / "src/features/avatarV2/assets/room"
MOTION = ROOM / "motion"
OUTPUT = MOBILE_ROOT / "src/features/session/assets/onboarding-runners"
CANVAS_SIZE = (256, 384)
RUNTIME_ANCHOR = (128, 384)
TARGET_RUN_FRAME_COUNT = 6
CANONICAL_WALK_FRAME_COUNT = 4
RUN_PROMOTION_STATUS = "blocked"
WALK_FRAMES = tuple(f"f{index:02}" for index in range(1, 5))
RUN_FRAMES = tuple(f"f{index:02}" for index in range(1, 7))

FEMALE_LAYERS = (
    "hair_back_female_mocha_ribbon_blowout_v2",
    "base_female_v2",
    "face_female_soft_doll_foundation_v2",
    "eyes_female_mocha_doe_v2",
    "nose_female_soft_button_v2",
    "mouth_female_peach_whisper_smile_v2",
    "bottom_female_denim_skort_shorts_v2",
    "top_female_cream_basic_tee_v2",
    "shoes_female_milk_tea_court_sneakers_v2",
    "hair_front_female_mocha_ribbon_blowout_v2",
)

MALE_MOTION_LAYERS = (
    "base_male_light_v1",
    "bottom_male_navy_straight_pants_v1",
    "top_male_powder_blue_crew_tee_v1",
    "shoes_male_milk_tea_court_v1",
)

MALE_STATIC_LAYERS = (
    "face_male_warm_friendly_v1",
    "hair_front_male_espresso_crop_v1",
)


def motion_path(layer: str, motion: str, frame: str) -> Path:
    return MOTION / f"room_avatar_{layer}_{motion}_front_{frame}.png"


def require_canvas(image: Image.Image, source: Path) -> Image.Image:
    rgba = image.convert("RGBA")
    if rgba.size != CANVAS_SIZE:
        raise ValueError(
            f"{source} must use the canonical {CANVAS_SIZE[0]}x{CANVAS_SIZE[1]} canvas; "
            f"received {rgba.size[0]}x{rgba.size[1]}"
        )
    return rgba


def load_motion(layer: str, frame: str) -> Image.Image:
    source = motion_path(layer, "walking", frame)
    with Image.open(source) as image:
        return require_canvas(image, source)


def load_static(layer: str) -> Image.Image:
    source = ROOM / f"avatar_room_{layer}.png"
    with Image.open(source) as image:
        return require_canvas(image, source)


def compose_female(frame: str) -> Image.Image:
    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    for layer in FEMALE_LAYERS:
        canvas.alpha_composite(load_motion(layer, frame))
    return canvas


def compose_male(frame: str) -> Image.Image:
    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    canvas.alpha_composite(load_motion(MALE_MOTION_LAYERS[0], frame))
    canvas.alpha_composite(load_static("face_male_warm_friendly_v1"))
    for layer in MALE_MOTION_LAYERS[1:]:
        canvas.alpha_composite(load_motion(layer, frame))
    canvas.alpha_composite(load_static("hair_front_male_espresso_crop_v1"))
    return canvas


def required_run_sources() -> Iterable[Path]:
    # A run changes the body, feet, clothing and hair silhouette. Reusing static
    # face/hair overlays on a moving head is not accepted as canonical motion.
    for layer in (*FEMALE_LAYERS, *MALE_MOTION_LAYERS, *MALE_STATIC_LAYERS):
        for frame in RUN_FRAMES:
            yield motion_path(layer, "running", frame)


def inspect_walk_cycle(role: str) -> dict[str, object]:
    compose = compose_male if role == "male" else compose_female
    frames = [compose(frame) for frame in WALK_FRAMES]
    alpha_bounds = [frame.getchannel("A").getbbox() for frame in frames]
    if any(bounds is None for bounds in alpha_bounds):
        raise ValueError(f"{role} walk cycle contains a fully transparent frame")
    hashes = [hashlib.sha256(frame.tobytes()).hexdigest() for frame in frames]
    baselines = [bounds[3] for bounds in alpha_bounds if bounds is not None]
    return {
        "frameCount": len(frames),
        "distinctFrameCount": len(set(hashes)),
        "alphaBounds": [list(bounds) for bounds in alpha_bounds if bounds is not None],
        "visibleFootBaselineRange": [min(baselines), max(baselines)],
        "technicalStatus": "fallback-only",
        "visualStatus": "not-a-run-cycle",
    }


def assess_run_readiness() -> dict[str, object]:
    missing = [path for path in required_run_sources() if not path.exists()]
    status = "candidate" if not missing else RUN_PROMOTION_STATUS
    return {
        "contract": "blumi-onboarding-canonical-run-v1",
        "status": status,
        "targetFrameCount": TARGET_RUN_FRAME_COUNT,
        "availableCanonicalWalkFrameCount": CANONICAL_WALK_FRAME_COUNT,
        "canvas": list(CANVAS_SIZE),
        "runtimeAnchor": list(RUNTIME_ANCHOR),
        "sourceMotion": "running_front",
        "walkFallbackInspection": {
            "male": inspect_walk_cycle("male"),
            "female": inspect_walk_cycle("female"),
        },
        "forbiddenDerivations": ["interpolation", "warping", "mirroring", "frame duplication"],
        "missingSourceCount": len(missing),
        "missingSources": [str(path.relative_to(MOBILE_ROOT)) for path in missing],
        "blockingReason": None
        if not missing
        else (
            "The canonical rig supplies only the approved 4W walking cycle. "
            "Six authored running_front poses are required before runtime promotion."
        ),
    }


def build_walk_fallback(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(WALK_FRAMES, start=1):
        compose_male(frame).save(
            output / f"blumi_intro_canonical_runner_male_f{index:02}.png",
            optimize=True,
        )
        compose_female(frame).save(
            output / f"blumi_intro_canonical_runner_female_f{index:02}.png",
            optimize=True,
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        nargs="?",
        choices=("run-readiness", "build-walk-fallback"),
        default="run-readiness",
    )
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    if args.command == "build-walk-fallback":
        build_walk_fallback(args.output)
        return 0

    report = assess_run_readiness()
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "candidate" else 2


if __name__ == "__main__":
    raise SystemExit(main())
