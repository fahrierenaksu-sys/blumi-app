#!/usr/bin/env python3
"""Register an ImageGen keyed edit back onto the canonical male rig geometry."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


GREEN = (0, 255, 0, 255)


def _is_magenta(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return (
        alpha > 16
        and red >= 160
        and blue >= 160
        and red >= green + 80
        and blue >= green + 80
        and abs(red - blue) <= 80
    )


def _is_green_key(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 16 and green >= 160 and green >= red + 70 and green >= blue + 70


def _normalize_green_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    normalized = Image.new("RGBA", rgba.size)
    normalized.putdata([GREEN if _is_green_key(pixel) else pixel for pixel in rgba.getdata()])
    return normalized


def extract_keyed_foreground(image: Image.Image) -> Image.Image:
    """Extract generated wardrobe art while feathering green and magenta keys."""

    extracted = Image.new("RGBA", image.size, (0, 0, 0, 0))
    output_pixels: list[tuple[int, int, int, int]] = []
    for red, green, blue, source_alpha in image.convert("RGBA").getdata():
        green_dominance = green - max(red, blue)
        if green >= 115 and green_dominance >= 70:
            green_factor = 0.0
        elif green < 90 or green_dominance <= 10:
            green_factor = 1.0
        else:
            green_factor = max(0.0, min(1.0, (70 - green_dominance) / 60))

        magenta_dominance = min(red, blue) - green
        magenta_candidate = red >= 160 and blue >= 160 and abs(red - blue) <= 80
        magenta_factor = (
            0.0 if magenta_candidate and magenta_dominance >= 80 else 1.0
        )

        alpha = round(source_alpha * min(green_factor, magenta_factor))
        if alpha <= 0:
            output_pixels.append((0, 0, 0, 0))
            continue
        if green_dominance > 10:
            green = min(green, max(red, blue) + 4)
        output_pixels.append((red, green, blue, alpha))

    extracted.putdata(output_pixels)
    return extracted


def cleanup_alpha_components(
    image: Image.Image,
    min_pixel_count: int,
) -> Image.Image:
    """Remove alpha-connected foreground components smaller than the threshold."""

    if min_pixel_count < 0:
        raise ValueError("minimum foreground component pixel count must be nonnegative")

    rgba = image.convert("RGBA")
    if min_pixel_count <= 1:
        return rgba.copy()

    width, height = rgba.size
    pixels = list(rgba.getdata())
    retained_pixels = list(pixels)
    visited = bytearray(width * height)

    for start_index, pixel in enumerate(pixels):
        if visited[start_index] or pixel[3] == 0:
            continue

        visited[start_index] = 1
        component = [start_index]
        pending = [start_index]
        while pending:
            current = pending.pop()
            x = current % width
            y = current // width
            neighbors = []
            if x > 0:
                neighbors.append(current - 1)
            if x + 1 < width:
                neighbors.append(current + 1)
            if y > 0:
                neighbors.append(current - width)
            if y + 1 < height:
                neighbors.append(current + width)

            for neighbor in neighbors:
                if visited[neighbor] or pixels[neighbor][3] == 0:
                    continue
                visited[neighbor] = 1
                component.append(neighbor)
                pending.append(neighbor)

        if len(component) < min_pixel_count:
            for component_index in component:
                retained_pixels[component_index] = (0, 0, 0, 0)

    cleaned = Image.new("RGBA", rgba.size)
    cleaned.putdata(retained_pixels)
    return cleaned


def keyed_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgba = image.convert("RGBA")
    mask = Image.new("L", rgba.size, 0)
    mask.putdata([255 if _is_magenta(pixel) else 0 for pixel in rgba.getdata()])
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError("image does not contain a usable magenta registration body")
    return bounds


def register_keyed_edit(generated: Image.Image, guide: Image.Image) -> Image.Image:
    generated_rgba = _normalize_green_key(generated)
    guide_rgba = guide.convert("RGBA")
    source_left, source_top, source_right, source_bottom = keyed_bbox(generated_rgba)
    target_left, target_top, target_right, target_bottom = keyed_bbox(guide_rgba)
    source_width = source_right - source_left
    source_height = source_bottom - source_top
    target_width = target_right - target_left
    target_height = target_bottom - target_top
    if min(source_width, source_height, target_width, target_height) <= 0:
        raise ValueError("magenta registration body has invalid bounds")

    scale_x = target_width / source_width
    scale_y = target_height / source_height
    inverse_affine = (
        1.0 / scale_x,
        0.0,
        source_left - target_left / scale_x,
        0.0,
        1.0 / scale_y,
        source_top - target_top / scale_y,
    )
    registered = generated_rgba.transform(
        guide_rgba.size,
        Image.Transform.AFFINE,
        inverse_affine,
        resample=Image.Resampling.BICUBIC,
        fillcolor=GREEN,
    )
    return _normalize_green_key(registered)


def sanitize_bottom_foot_contact(
    registered: Image.Image,
    contact_guide: Image.Image,
) -> Image.Image:
    """Restore the guide's complete lower contact band over generated spill."""

    registered_rgba = _normalize_green_key(registered)
    guide_rgba = _normalize_green_key(contact_guide)
    if registered_rgba.size != guide_rgba.size:
        raise ValueError("bottom contact guide must match the registered image size")

    width, height = guide_rgba.size
    lower_magenta_rows = [
        y
        for y in range(height // 2, height)
        if any(_is_magenta(guide_rgba.getpixel((x, y))) for x in range(width))
    ]
    if not lower_magenta_rows:
        raise ValueError("bottom contact guide has no lower-body magenta registration")

    foot_top = min(lower_magenta_rows)
    contact_top = foot_top
    for y in range(foot_top - 1, height // 2 - 1, -1):
        contains_non_keyed_contact = any(
            pixel[3] > 16
            and not _is_green_key(pixel)
            and not _is_magenta(pixel)
            for pixel in (guide_rgba.getpixel((x, y)) for x in range(width))
        )
        if not contains_non_keyed_contact:
            break
        contact_top = y

    sanitized = Image.new("RGBA", registered_rgba.size)
    if contact_top > 0:
        sanitized.paste(registered_rgba.crop((0, 0, width, contact_top)), (0, 0))
    sanitized.paste(
        guide_rgba.crop((0, contact_top, width, height)),
        (0, contact_top),
    )
    return sanitized


def _nonnegative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("value must be nonnegative")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--generated", type=Path, required=True)
    parser.add_argument("--guide", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--output-foreground", type=Path)
    parser.add_argument(
        "--min-foreground-component-pixels",
        type=_nonnegative_int,
        default=0,
    )
    parser.add_argument("--bottom-contact-guide", type=Path)
    args = parser.parse_args()

    with Image.open(args.generated) as generated, Image.open(args.guide) as guide:
        registered = register_keyed_edit(generated, guide)
    if args.bottom_contact_guide is not None:
        with Image.open(args.bottom_contact_guide) as contact_guide:
            registered = sanitize_bottom_foot_contact(registered, contact_guide)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    registered.save(args.output, format="PNG", optimize=True)
    if args.output_foreground is not None:
        args.output_foreground.parent.mkdir(parents=True, exist_ok=True)
        foreground = extract_keyed_foreground(registered)
        cleanup_alpha_components(
            foreground,
            min_pixel_count=args.min_foreground_component_pixels,
        ).save(
            args.output_foreground,
            format="PNG",
            optimize=True,
        )


if __name__ == "__main__":
    main()
