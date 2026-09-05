#!/usr/bin/env python3
"""Package the final ten item-specific male sitting wardrobe candidates."""

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))

from package_male_sitting_mid_blue_straight_v1 import (
    BASE, CANVAS, ROOT, SHOES, TOP, _checkerboard, _font,
    _keep_largest_component, canonical_composite, load,
)


SOURCE_EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v6"
)
EVIDENCE = ROOT / (
    "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-30/"
    "bottom-sitting-on-base-v7"
)
MASTERS = SOURCE_EVIDENCE / "item-masters"
REDESIGNED_MASTERS = EVIDENCE / "item-masters"
CANDIDATES = EVIDENCE / "candidates/final-remaining-wave-v1"
WAVE_BOARD = EVIDENCE / "remaining-ten-sitting-v1-review-board.png"


@dataclass(frozen=True)
class Profile:
    slug: str
    label: str
    master_name: str
    selector: str
    fit_family: str
    is_short: bool = False
    arm_left: int = 87
    arm_right: int = 169
    min_thigh_pixels: int = 28
    min_shoe_overlap: int = 100
    max_shoe_overlap: int = 330
    contact_outer: int = 20
    contact_opening: int = 7
    short_probe_row: int = 297
    short_clear_row: int = 305
    short_gap_start: int = 299
    waist_source_row: int = 294

    @property
    def master(self) -> Path:
        redesigned = REDESIGNED_MASTERS / self.master_name
        return redesigned if redesigned.exists() else MASTERS / self.master_name

    @property
    def output(self) -> Path:
        return CANDIDATES / f"room_avatar_bottom_male_{self.slug}_v1_sitting_front_f01-candidate-v1.png"

    @property
    def composite(self) -> Path:
        return EVIDENCE / f"{self.slug.replace('_', '-')}-canonical-sitting-v1.png"

    @property
    def board(self) -> Path:
        return EVIDENCE / f"{self.slug.replace('_', '-')}-sitting-v1-review-board.png"

    @property
    def manifest(self) -> Path:
        return EVIDENCE / f"{self.slug.replace('_', '-')}-sitting-v1-manifest.json"


PROFILES = (
    Profile("washed_baggy_denim", "Washed Baggy Denim", "washed-baggy-denim-sitting-master-v1-1024.png", "washed_denim", "male_baggy", min_thigh_pixels=30, min_shoe_overlap=110),
    Profile("soft_parachute_cargo_pants", "Soft Parachute Cargo", "soft-parachute-cargo-pants-sitting-master-v1-1024.png", "soft_parachute", "male_parachute", min_thigh_pixels=29, min_shoe_overlap=110, max_shoe_overlap=350, contact_outer=21),
    Profile("creative_utility_bottom", "Creative Utility Cargo", "creative-utility-bottom-sitting-master-v1-1024.png", "creative_green", "male_cargo", min_thigh_pixels=29, min_shoe_overlap=105),
    Profile("modern_track_luxury_bottom", "Modern Track Luxury", "modern-track-luxury-bottom-sitting-master-v1-1024.png", "modern_navy", "male_track", min_thigh_pixels=27, min_shoe_overlap=70),
    Profile("colorblock_nylon_track_pants", "Colorblock Nylon Track", "colorblock-nylon-track-pants-sitting-master-v1-1024.png", "colorblock_plum", "male_track", min_thigh_pixels=27, min_shoe_overlap=95),
    Profile("sage_cuffed_shorts", "Sage Cuffed Shorts", "sage-cuffed-shorts-sitting-master-v1-1024.png", "sage_short", "male_shorts", True, arm_left=90, arm_right=166, short_probe_row=304, short_clear_row=318, short_gap_start=310, waist_source_row=294),
    Profile("relaxed_tailored_shorts", "Relaxed Tailored Shorts", "relaxed-tailored-shorts-sitting-master-v2-1024.png", "blue_short", "male_shorts", True, arm_left=90, arm_right=166, short_probe_row=307, short_clear_row=322, short_gap_start=314, waist_source_row=290),
    Profile("refined_utility_cargo_shorts", "Refined Utility Cargo Shorts", "refined-utility-cargo-shorts-sitting-master-v1-1024.png", "utility_short", "male_cargo_shorts", True, arm_left=89, arm_right=167, short_probe_row=304, short_clear_row=318, short_gap_start=310, waist_source_row=292),
    Profile("technical_sport_shorts", "Technical Sport Shorts", "technical-sport-shorts-sitting-master-v1-1024.png", "technical_short", "male_sport_shorts", True, arm_left=90, arm_right=166, short_probe_row=304, short_clear_row=322, short_gap_start=312, waist_source_row=294),
    Profile("contemporary_resort_street_bottom", "Contemporary Resort Street", "contemporary-resort-street-bottom-sitting-master-v1-1024.png", "resort_short", "male_resort_shorts", True, arm_left=90, arm_right=166, short_probe_row=305, short_clear_row=324, short_gap_start=314, waist_source_row=293),
)

SEATED_EXTENSIONS = {
    "technical_sport_shorts": {"start": 304, "end": 320, "left": (91, 126), "right": (130, 165)},
    "contemporary_resort_street_bottom": {"start": 303, "end": 322, "left": (91, 126), "right": (130, 165)},
}
SEATED_EXTENSION_PALETTE = {
    "technical_sport_shorts": np.array([25, 57, 150], dtype=np.uint8),
    "contemporary_resort_street_bottom": np.array([242, 227, 196], dtype=np.uint8),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _material_mask(profile: Profile, pixels: np.ndarray) -> np.ndarray:
    rows, cols = np.indices(pixels.shape[:2])
    red, green, blue = (pixels[..., channel].astype(np.int16) for channel in range(3))
    zone = (rows >= 270) & (rows < 345) & (cols >= 74) & (cols < 182)
    kind = profile.selector
    if kind == "washed_denim":
        selected = (blue > red + 10) & (blue > green + 5) & (blue < 252) & (red < 210)
    elif kind == "soft_parachute":
        cream = (red > 200) & (green > 180) & (blue > 155) & (red > green + 8) & (green > blue + 5)
        blue_panel = (blue > red + 12) & (blue > green + 5)
        selected = cream | blue_panel
    elif kind == "creative_green":
        selected = (green >= red - 9) & (green > blue + 24) & (red < 225)
    elif kind == "modern_navy":
        selected = (blue > red + 20) & (blue > green + 10) & (blue < 155)
    elif kind == "colorblock_plum":
        plum = (red > blue + 8) & (blue > green + 20) & (red < 190)
        grey_panel = (red < 190) & (np.abs(red - green) < 22) & (np.abs(green - blue) < 22)
        cream_panel = (
            (red > 180) & (green > 145) & (blue > 105)
            & (red > green + 8) & (green > blue + 4)
            & ((cols < 118) | (cols > 138))
        )
        orange_piping = (red > 150) & (red > green + 35) & (green > blue + 5)
        selected = plum | grey_panel | cream_panel | orange_piping
    elif kind == "sage_short":
        selected = (red >= green - 8) & (red < green + 35) & (green > blue + 28) & (red < 220)
    elif kind == "blue_short":
        selected = (blue > red + 10) & (blue > green + 8) & (blue < 252)
    elif kind == "utility_short":
        beige = (red > green + 12) & (green > blue + 15) & (red < 245)
        pocket = (blue >= red - 5) & (blue > green - 8) & (red < 190)
        selected = beige | pocket
    elif kind == "technical_short":
        selected = (blue > red + 25) & (blue > green + 20) & (blue < 230)
    elif kind == "resort_short":
        cream = (red > 225) & (green > 205) & (blue > 175) & (red - green < 38) & (green > blue + 5)
        teal = (green > red + 3) & (blue > red + 3)
        coral = (red > green + 18) & (red > blue + 20) & (red < 250)
        selected = cream | teal | coral
    else:
        raise ValueError(f"Unknown selector: {kind}")
    selected &= zone
    side_arm = (rows >= 280) & (rows <= 326) & ((cols <= profile.arm_left) | (cols >= profile.arm_right))
    selected[side_arm] = False
    if profile.is_short:
        selected[profile.short_clear_row :] = False
    return selected


def build_candidate(profile: Profile) -> Image.Image:
    source = np.asarray(load(profile.master).resize(CANVAS, Image.Resampling.LANCZOS)).copy()
    mask = _material_mask(profile, source)
    registered = np.zeros_like(source)
    registered[mask] = source[mask]
    registered[:283] = 0

    # Threshold segmentation can drop highlight/shadow pixels from the middle
    # of an otherwise continuous garment panel. Restore only those internal
    # holes, between real item pixels on the same leg; never expand the item's
    # outer silhouette or borrow geometry from another product.
    panel_end = profile.short_clear_row if profile.is_short else 329
    for row in range(288, panel_end):
        for left, right in ((84, 127), (130, 172)):
            present = np.where(registered[row, left:right, 3] > 24)[0]
            if len(present) < 2:
                continue
            start = left + int(present.min())
            stop = left + int(present.max())
            holes = registered[row, start : stop + 1, 3] <= 24
            registered[row, start : stop + 1][holes] = source[row, start : stop + 1][holes]

    top_alpha = np.asarray(load(TOP))[..., 3]
    template_row = profile.waist_source_row
    template = registered[template_row].copy()
    template_columns = np.where(template[..., 3] > 24)[0]
    if len(template_columns) > 0:
        template_left = int(template_columns.min())
        template_right = int(template_columns.max())
        template_samples = template[template_columns, :3].astype(np.float32)
        template_color = np.rint(np.median(template_samples, axis=0)).astype(np.uint8)
        missing = template[template_left : template_right + 1, 3] <= 24
        template[template_left : template_right + 1][missing, :3] = template_color
        template[template_left : template_right + 1][missing, 3] = 255
    for row in range(283, 288):
        columns = np.where(top_alpha[row] > 24)[0]
        left = max(0, int(columns.min()) - 1)
        right = min(CANVAS[0] - 1, int(columns.max()) + 1)
        registered[row, left : right + 1] = template[left : right + 1]
        registered[row, :left] = 0
        registered[row, right + 1 :] = 0

    if profile.is_short:
        # Sitting shorts retain a connected pelvis above the crotch, then split
        # into two front-facing leg openings.  The rear panel is intentionally
        # not modeled because the canonical pose is front-only.
        extension = SEATED_EXTENSIONS.get(profile.slug)
        if extension:
            for side_left, side_right in (extension["left"], extension["right"]):
                for row in range(extension["start"], extension["end"] + 1):
                    seed_row = extension["start"] - 1
                    candidates = np.where(registered[seed_row, side_left:side_right, 3] > 24)[0]
                    if not len(candidates):
                        continue
                    progress = (row - extension["start"]) / max(1, extension["end"] - extension["start"])
                    inset = round(progress * 2)
                    row_left = side_left + inset
                    row_right = side_right - inset
                    for x in range(row_left, row_right):
                        if registered[row, x, 3] <= 24:
                            registered[row, x, :3] = SEATED_EXTENSION_PALETTE[profile.slug]
                            registered[row, x, 3] = 255
        for row in range(292, profile.short_gap_start):
            if np.all(registered[row, 127:130, 3] > 24):
                continue
            left_pixels = registered[row, 122:127]
            right_pixels = registered[row, 130:135]
            samples = np.concatenate((left_pixels[left_pixels[:, 3] > 24], right_pixels[right_pixels[:, 3] > 24]))
            if len(samples):
                bridge = np.rint(samples[:, :3].mean(axis=0) * 0.94).astype(np.uint8)
                registered[row, 127:130, :3] = bridge
                registered[row, 127:130, 3] = 255
        registered[profile.short_gap_start : profile.short_clear_row, 127:130] = 0
    else:
        rows, cols = np.indices((CANVAS[1], CANVAS[0]))
        shoe_alpha = np.asarray(load(SHOES))[..., 3] > 24
        depth = rows - 329
        contact_rows = (rows >= 329) & (rows <= 333)
        opening = profile.contact_opening + depth
        left_contact = (cols < 128) & (np.abs(cols - 110) >= opening) & (np.abs(cols - 110) <= profile.contact_outer)
        right_contact = (cols >= 128) & (np.abs(cols - 146) >= opening) & (np.abs(cols - 146) <= profile.contact_outer)
        allowed_contact = contact_rows & (left_contact | right_contact)
        registered[shoe_alpha & ~allowed_contact] = 0
        registered[334:] = 0
        for row in range(306, 329):
            samples = np.concatenate((registered[row, 122:126, :3], registered[row, 131:135, :3])).astype(np.float32)
            bridge = np.rint(samples.mean(axis=0) * 0.92)
            registered[row, 126:131, :3] = bridge.astype(np.uint8)
            registered[row, 126:131, 3] = 255
            registered[row, 128, :3] = np.rint(bridge * 0.55).astype(np.uint8)

        # Close any remaining base-skin pinholes beside the seam. The repair is
        # row-local and interpolates the nearest real pixels from this item's
        # own left/right panels, so it follows the authored crotch contour
        # instead of stamping a shared rectangular pelvis mask.
        base = np.asarray(load(BASE))
        base_skin = (
            (base[..., 0] > 180)
            & (base[..., 0] > base[..., 1] + 20)
            & (base[..., 1] > base[..., 2] - 5)
        )
        for row in range(294, 329):
            for col in range(122, 135):
                if registered[row, col, 3] > 24 or not base_skin[row, col]:
                    continue
                left_pixels = np.where(registered[row, 118:col, 3] > 24)[0]
                right_pixels = np.where(registered[row, col + 1 : 139, 3] > 24)[0]
                if not len(left_pixels) or not len(right_pixels):
                    continue
                left_col = 118 + int(left_pixels.max())
                right_col = col + 1 + int(right_pixels.min())
                ratio = (col - left_col) / (right_col - left_col)
                registered[row, col] = np.rint(
                    registered[row, left_col] * (1 - ratio)
                    + registered[row, right_col] * ratio
                ).astype(np.uint8)
                registered[row, col, 3] = 255
        registered[329:338, 127:130] = 0
        contact_alpha = registered[..., 3]
        registered[allowed_contact & (contact_alpha >= 220), 3] = 255

    alpha_mask = _keep_largest_component(registered[..., 3] > 24)
    registered[~alpha_mask] = 0
    registered[registered[..., 3] == 0, :3] = 0
    return Image.fromarray(registered)


def _review_board(profile: Profile, bottom: Image.Image, composite: Image.Image) -> Image.Image:
    board = Image.new("RGB", (1200, 850), "#fff8fc")
    draw = ImageDraw.Draw(board)
    draw.text((28, 18), f"{profile.label.upper()} · SITTING V1", font=_font(28, True), fill="#382c37")
    draw.text((28, 56), f"item-specific {profile.fit_family} master · candidate only · runtime closed", font=_font(18), fill="#796976")
    for x, label, background in ((30, "FULL COMPOSITE", "#211b22"), (320, "RAW / CHECKER", None), (610, "RAW / DARK", "#211b22")):
        panel = _checkerboard(CANVAS) if background is None else Image.new("RGB", CANVAS, background)
        layer = composite if x == 30 else bottom
        panel.paste(layer, (0, 0), layer)
        board.paste(panel, (x, 120))
        draw.text((x, 92), label, font=_font(18), fill="#382c37")
    waist = composite.crop((84, 278, 172, 315)).resize((440, 185), Image.Resampling.NEAREST)
    contact_box = (84, 292, 172, 326) if profile.is_short else (82, 321, 174, 350)
    contact = composite.crop(contact_box).resize((552, 204 if profile.is_short else 174), Image.Resampling.NEAREST)
    board.paste(waist, (30, 585), waist)
    board.paste(contact, (540, 585), contact)
    draw.text((30, 550), "5x WAIST / SEATED VOLUME", font=_font(18), fill="#382c37")
    draw.text((540, 550), "SHORT HEM / LEGS" if profile.is_short else "HEM / SHOE CONTACT", font=_font(18), fill="#382c37")
    return board


def _manifest(profile: Profile) -> dict:
    return {
        "schemaVersion": 1,
        "recordType": "male_wardrobe_sitting_candidate",
        "assetId": f"blumi-avatar-bottom-{profile.slug.replace('_', '-')}-sitting-v1.0",
        "itemId": profile.slug,
        "fitFamily": profile.fit_family,
        "status": "candidate_pending_independent_review_and_user_approval",
        "candidateOnly": True,
        "runtimePromoted": False,
        "source": {"path": str(profile.master.relative_to(ROOT)), "sha256": sha256(profile.master), "origin": "generated_in_project", "toolProvider": "not_provided", "modelOrEngine": "not_provided", "requestOrJobId": "not_provided", "seed": "not_provided"},
        "candidate": {"path": str(profile.output.relative_to(ROOT)), "sha256": sha256(profile.output), "dimensions": "256x384", "format": "PNG RGBA"},
        "evidence": {"compositePath": str(profile.composite.relative_to(ROOT)), "compositeSha256": sha256(profile.composite), "reviewBoardPath": str(profile.board.relative_to(ROOT)), "reviewBoardSha256": sha256(profile.board), "focusedTest": "python3 -m unittest test_package_male_sitting_remaining_wave_v1.py"},
        "continuityLocks": {"canonicalTop": str(TOP.relative_to(ROOT)), "canonicalShoes": str(SHOES.relative_to(ROOT)), "itemSpecificSelector": profile.selector, "itemSpecificMasterRequired": True},
        "approval": {"independentReviewVerdict": "PENDING", "explicitUserApproval": False},
    }


def _wave_board(composites: list[tuple[Profile, Image.Image]]) -> Image.Image:
    board = Image.new("RGB", (1500, 1260), "#fff8fc")
    draw = ImageDraw.Draw(board)
    draw.text((30, 20), "MALE BOTTOM SITTING · FINAL REMAINING TEN", font=_font(30, True), fill="#382c37")
    draw.text((30, 62), "same canonical base · item-specific candidates · runtime unchanged", font=_font(18), fill="#796976")
    for index, (profile, composite) in enumerate(composites):
        col, row = index % 5, index // 5
        x, y = 30 + col * 290, 110 + row * 560
        panel = Image.new("RGB", CANVAS, "#211b22")
        panel.paste(composite, (0, 0), composite)
        board.paste(panel, (x, y))
        draw.text((x, y + 394), profile.label, font=_font(16, True), fill="#382c37")
        draw.text((x, y + 420), profile.fit_family, font=_font(14), fill="#796976")
    return board


def produce() -> None:
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    composites: list[tuple[Profile, Image.Image]] = []
    for profile in PROFILES:
        bottom = build_candidate(profile)
        bottom.save(profile.output, optimize=True)
        composite = canonical_composite(bottom)
        composite.save(profile.composite, optimize=True)
        _review_board(profile, bottom, composite).save(profile.board, optimize=True)
        profile.manifest.write_text(json.dumps(_manifest(profile), indent=2) + "\n", encoding="utf-8")
        composites.append((profile, composite))
    _wave_board(composites).save(WAVE_BOARD, optimize=True)


if __name__ == "__main__":
    produce()
