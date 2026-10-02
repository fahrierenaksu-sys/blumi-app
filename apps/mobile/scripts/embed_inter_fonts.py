"""Build the Inter fonts that the native app embeds at build time (FONT-1).

The app names its fonts by weight ("Inter_400Regular", ...). Android resolves
an embedded font by file name, but iOS resolves it by the font's own family or
PostScript name, and every Inter weight reports the family "Inter". This
script copies the six weights the app uses from @expo-google-fonts/inter and
rewrites only their name tables, so that on both platforms the family and the
PostScript name equal the file name. Glyphs, metrics and features are
unchanged. That keeps today's rendering on iOS too: before, expo-font's
runtime aliases gave each name a one-face family, so the named face won over
any fontWeight in the style. A shared "Inter" family would let fontWeight pick
a different face.

Inter is licensed under the SIL Open Font License 1.1 without a Reserved Font
Name; LICENSE_INTER.txt travels with the files.

Usage (needs `pip install fonttools`), from apps/mobile:
    python3 scripts/embed_inter_fonts.py
"""

from pathlib import Path
import shutil

from fontTools.ttLib import TTFont

MOBILE_ROOT = Path(__file__).resolve().parent.parent
SOURCE_ROOT = MOBILE_ROOT.parent.parent / "node_modules" / "@expo-google-fonts" / "inter"
OUTPUT_ROOT = MOBILE_ROOT / "assets" / "fonts"
WEIGHTS = ["400Regular", "500Medium", "600SemiBold", "700Bold", "800ExtraBold", "900Black"]

# nameID 1 family, 3 unique ID, 4 full name, 6 PostScript name.
RENAMED_IDS = (1, 3, 4, 6)
# nameID 16/17 typographic family/subfamily and 25 variations prefix would make
# iOS group every weight under "Inter" again.
DROPPED_IDS = (16, 17, 25)


def build(weight: str) -> Path:
    name = f"Inter_{weight}"
    font = TTFont(SOURCE_ROOT / weight / f"{name}.ttf")
    table = font["name"]
    table.names = [record for record in table.names if record.nameID not in DROPPED_IDS]
    for record in table.names:
        if record.nameID in RENAMED_IDS:
            record.string = name
        elif record.nameID == 2:
            # One face per family: the face is the family's regular style.
            record.string = "Regular"
    # Style-linking bits off, so no platform treats a face as the bold or
    # italic member of another family.
    font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0b1100001) | 0b1000000
    font["head"].macStyle = 0
    output = OUTPUT_ROOT / f"{name}.ttf"
    font.save(output)
    return output


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    for weight in WEIGHTS:
        print(build(weight).relative_to(MOBILE_ROOT))
    shutil.copyfile(SOURCE_ROOT / "LICENSE_FONT", OUTPUT_ROOT / "LICENSE_INTER.txt")


if __name__ == "__main__":
    main()
