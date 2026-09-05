#!/usr/bin/env python3
"""Package a 4x generated male wardrobe master onto the canonical rig canvas."""

from __future__ import annotations

import argparse
from functools import reduce
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


def apply_registration_envelope(
    master: Image.Image,
    envelope_source: Image.Image,
    *,
    scale: int = 4,
    dilation_native_px: int = 2,
) -> Image.Image:
    master = master.convert("RGBA")
    envelope_source = envelope_source.convert("RGBA")
    expected = (envelope_source.width * scale, envelope_source.height * scale)
    if master.size != expected:
        raise ValueError(f"master must be exactly {scale}x the envelope canvas")
    if dilation_native_px < 0:
        raise ValueError("dilation_native_px cannot be negative")

    envelope = envelope_source.getchannel("A").point(lambda value: 255 if value else 0)
    envelope = envelope.resize(master.size, Image.Resampling.NEAREST)
    dilation_master_px = dilation_native_px * scale
    if dilation_master_px:
        envelope = envelope.filter(ImageFilter.MaxFilter(dilation_master_px * 2 + 1))

    cleaned = master.copy()
    cleaned.putalpha(ImageChops.multiply(cleaned.getchannel("A"), envelope))
    return cleaned


def register_master(
    master: Image.Image,
    envelope_source: Image.Image,
    *,
    mode: str,
    scale: int = 4,
    dilation_native_px: int = 2,
) -> Image.Image:
    if mode == "envelope":
        return apply_registration_envelope(
            master,
            envelope_source,
            scale=scale,
            dilation_native_px=dilation_native_px,
        )
    if mode != "exact":
        raise ValueError(f"unsupported registration mode: {mode}")

    expected = (envelope_source.width * scale, envelope_source.height * scale)
    if master.size != expected:
        raise ValueError(f"master must be exactly {scale}x the envelope canvas")
    return master.convert("RGBA").copy()


def downsample_master(master: Image.Image, native_size: tuple[int, int]) -> Image.Image:
    return master.convert("RGBA").resize(native_size, Image.Resampling.LANCZOS)


def fit_master_to_native_box(
    master: Image.Image,
    *,
    native_size: tuple[int, int],
    box: tuple[int, int, int, int],
    scale: int = 4,
) -> Image.Image:
    """Fit visible 4x artwork to an exact item-level anchor before downsampling."""

    expected = (native_size[0] * scale, native_size[1] * scale)
    if master.size != expected:
        raise ValueError(f"master must be exactly {scale}x the native canvas")
    left, top, right, bottom = box
    if not (0 <= left < right <= native_size[0] and 0 <= top < bottom <= native_size[1]):
        raise ValueError("target box must be inside the native canvas")

    rgba = master.convert("RGBA")
    bounds = rgba.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
    if bounds is None:
        raise ValueError("master has no visible candidate artwork")
    fitted = rgba.crop(bounds).resize(
        ((right - left) * scale, (bottom - top) * scale),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", master.size, (0, 0, 0, 0))
    canvas.alpha_composite(fitted, (left * scale, top * scale))
    return canvas


def compose_static_proof(
    base: Image.Image,
    face: Image.Image,
    shoes: Image.Image,
    bottom: Image.Image,
    candidate: Image.Image,
    hair: Image.Image,
) -> Image.Image:
    transparent_top = Image.new("RGBA", base.size, (0, 0, 0, 0))
    return compose_category_proof(
        "top",
        base=base,
        face=face,
        neutral_shoes=shoes,
        neutral_bottom=bottom,
        neutral_top=transparent_top,
        candidate=candidate,
        hair=hair,
    )


def compose_category_proof(
    category: str,
    *,
    base: Image.Image,
    face: Image.Image,
    neutral_shoes: Image.Image,
    neutral_bottom: Image.Image,
    neutral_top: Image.Image,
    candidate: Image.Image,
    hair: Image.Image,
) -> Image.Image:
    if category == "top":
        layers = [base, face, neutral_shoes, neutral_bottom, candidate, hair]
    elif category == "bottom":
        layers = [base, face, neutral_shoes, candidate, neutral_top, hair]
    elif category == "shoe":
        layers = [base, face, candidate, neutral_bottom, neutral_top, hair]
    else:
        raise ValueError(f"unsupported wardrobe category: {category}")

    sizes = {layer.size for layer in layers}
    if len(sizes) != 1:
        raise ValueError("all proof layers must use the same canvas")
    return reduce(Image.alpha_composite, (layer.convert("RGBA") for layer in layers))


def compose_shoe_contact_proofs(
    *,
    base: Image.Image,
    face: Image.Image,
    candidate_shoes: Image.Image,
    slim_bottom: Image.Image,
    relaxed_bottom: Image.Image,
    neutral_top: Image.Image,
    hair: Image.Image,
) -> tuple[Image.Image, Image.Image]:
    """Compose the same shoe layer beneath two approved pant-contact profiles."""

    transparent_shoes = Image.new("RGBA", base.size, (0, 0, 0, 0))

    def compose(bottom: Image.Image) -> Image.Image:
        return compose_category_proof(
            "shoe",
            base=base,
            face=face,
            neutral_shoes=transparent_shoes,
            neutral_bottom=bottom,
            neutral_top=neutral_top,
            candidate=candidate_shoes,
            hair=hair,
        )

    return compose(slim_bottom), compose(relaxed_bottom)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", required=True, type=Path)
    parser.add_argument("--envelope", required=True, type=Path)
    parser.add_argument("--output-clean-master", required=True, type=Path)
    parser.add_argument("--output-layer", required=True, type=Path)
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--face", required=True, type=Path)
    parser.add_argument("--shoes", required=True, type=Path)
    parser.add_argument("--bottom", required=True, type=Path)
    parser.add_argument("--secondary-bottom", type=Path)
    parser.add_argument("--top", type=Path)
    parser.add_argument("--hair", required=True, type=Path)
    parser.add_argument("--output-composite", required=True, type=Path)
    parser.add_argument("--output-secondary-composite", type=Path)
    parser.add_argument("--dilation-native-px", type=int, default=2)
    parser.add_argument("--target-box", type=parse_box)
    parser.add_argument("--category", choices=("top", "bottom", "shoe"), default="top")
    parser.add_argument(
        "--registration-mode",
        choices=("envelope", "exact"),
        default="envelope",
    )
    return parser.parse_args()


def parse_box(value: str) -> tuple[int, int, int, int]:
    parts = tuple(int(part) for part in value.split(","))
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("target box must be x0,y0,x1,y1")
    return parts


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def main() -> None:
    args = parse_args()
    envelope = load(args.envelope)
    cleaned = register_master(
        load(args.master),
        envelope,
        mode=args.registration_mode,
        scale=4,
        dilation_native_px=args.dilation_native_px,
    )
    if args.category == "shoe" and args.target_box is None:
        raise ValueError("shoe packaging requires an item-level --target-box")
    if args.target_box is not None:
        cleaned = fit_master_to_native_box(
            cleaned,
            native_size=envelope.size,
            box=args.target_box,
            scale=4,
        )
    candidate = downsample_master(cleaned, envelope.size)
    if args.category != "top" and args.top is None:
        raise ValueError("--top is required when packaging bottom or shoe candidates")
    neutral_top = (
        load(args.top)
        if args.top is not None
        else Image.new("RGBA", envelope.size, (0, 0, 0, 0))
    )
    base = load(args.base)
    face = load(args.face)
    hair = load(args.hair)
    if args.category == "shoe":
        if args.secondary_bottom is None or args.output_secondary_composite is None:
            raise ValueError(
                "shoe packaging requires --secondary-bottom and "
                "--output-secondary-composite for slim and relaxed contact proof"
            )
        proof, secondary_proof = compose_shoe_contact_proofs(
            base=base,
            face=face,
            candidate_shoes=candidate,
            slim_bottom=load(args.bottom),
            relaxed_bottom=load(args.secondary_bottom),
            neutral_top=neutral_top,
            hair=hair,
        )
    else:
        proof = compose_category_proof(
            args.category,
            base=base,
            face=face,
            neutral_shoes=load(args.shoes),
            neutral_bottom=load(args.bottom),
            neutral_top=neutral_top,
            candidate=candidate,
            hair=hair,
        )
        secondary_proof = None
    save(cleaned, args.output_clean_master)
    save(candidate, args.output_layer)
    save(proof, args.output_composite)
    if secondary_proof is not None:
        save(secondary_proof, args.output_secondary_composite)


if __name__ == "__main__":
    main()
