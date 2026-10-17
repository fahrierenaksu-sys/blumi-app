#!/usr/bin/env python3
"""Land one QA-passed new collection piece in the app (domain newCollectionItems.ts), in minutes.

Run from anywhere on the Mac that has the art Workbench; the repository is this file's checkout:

    python3 tools/avatar25d/import_collection_item.py ITEM_ID \
        --base-rig  <assembled source rig of the body as the app ships it now (Workbench)> \
        --item-rig  <QA-passed room rig that holds ITEM_ID (Workbench)> \
        --out-rig   <where to write the new assembled source rig (Workbench; the next import's --base-rig)> \
        [--front FRONT.png [--front-erase ERASE.png] [--front-back BACK.png] [--front-order N]] \
        [--owner-look-approved "<date, owner words, OWNER_DECISIONS line>"] [--replace] [--plan] [--skip-tests]

Steps (each stops the run on failure; nothing is committed, the end prints the files to stage):
  1. ITEM_ID is declared in newCollectionItems.ts and not landed yet; its body picks the rig (girl or boy).
  2. Graft: the item (and the hybrid variant keys that name it, and its sit/wave card boxes) is copied from the item
     rig onto the base rig. Bones and ground must be equal; the body layers stay the base's (a body fix inside the
     item rig is NOT carried over; the run says how many layers differ so the lead can decide).
  3. Export into apps/mobile/src/features/avatar/rigs/<rig> (PNG pages + packed ASTC), as the shipped exports do.
  4. AVATAR_ITEM_ART gets ITEM_ID (art ID = rig ID = app ID) and NEW_COLLECTION_LANDED_ITEM_IDS gets ITEM_ID, so it
     joins the loadout, economy and mobile catalogs. The release catalog hold `new-collection-art-pending` stays: the
     piece is never sold, listed or granted until the lead lands the owner's receipt.
  5. Front (showcase): the layers are copied into the Workbench showcase root (new_collection/<id>/). With
     --owner-look-approved the allowlist entry is added and bake-showcase runs; without it the piece is listed in the
     showcase-pending test list (3/4 fallback) and the pending allowlist entry is printed for the owner sheet.
  6. bake-stills, the blink gate, then typecheck and the affected tests (domain, avatar, wardrobe, shop preview).
With --front, the Shop and Wardrobe card thumb is cut from the front layer (front-thumbs.mjs) before bake-stills.
--replace re-imports an already landed piece after an art fix (QA swap): the old entry (and its variant keys) is taken
out of --base-rig (the last import's --out-rig), the new one grafted, exported and baked again; the domain and app
sources are left as they are (step 4 and the pending list are skipped). An owner-approved front keeps its allowlist
entry: re-approve and rerun bake-showcase when its front layer changed.
--plan validates the inputs and prints the steps without writing anything.
"""
import argparse, copy, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = Path(os.environ.get("BLUMI_WORKBENCH", Path.home() / "BlumiArtWorkbench/avatar25-v2"))
SHOWCASE_ROOT = WORKBENCH / "integration/card_design/showcase"
SHOWCASE_SUBDIR = "new_collection"
PYTHON = WORKBENCH / "texcomp/venv/bin/python3"
COLLECTION_TS = ROOT / "packages/domain/src/avatar/newCollectionItems.ts"
ITEM_ART_TS = ROOT / "apps/mobile/src/features/avatar/model/avatarItemArt.ts"
COVERAGE_TEST_TS = ROOT / "packages/domain/src/avatar/avatarShowcaseCoverage.test.ts"
ALLOWLIST = ROOT / "tools/avatar25d/showcase-allowlist.json"
RIG_DIRS = {"female": "girl", "male": "boy"}
BOY_BODY = "BOY"
EXPORT_ARGS = {
    "female": ["--motion", "lab40/motion_A4.json", "--motion-config", "life/avatar_motion_girl_app.json"],
    "male": ["--motion-config", "life/avatar_motion_male_app.json"],
}
GENERATED_GLOBS = ["*_page*.png", "rig25.json", "rigAssets.ts", "rigAssets.ios.ts", "astc/*.zip", "astc/manifest.json", "astc/astcAssets.ts"]
VARIANT_FAMILIES = ("legVariants", "torsoVariants", "armVariants", "sitVariants")
DEFAULT_FRONT_ORDER = {"shoes": 1, "bottom": 2, "top": 3, "hair": 4}
ERASING_SLOTS = {"shoes", "bottom", "top", "dress"}
HIDDEN_BACK_SLOTS = {"glasses", "accessory"}
AFFECTED_TESTS = [
    ["npm", "run", "build", "-w", "@blumi/domain"],
    ["npm", "test", "-w", "@blumi/domain"],
    ["npm", "run", "typecheck", "-w", "@blumi/mobile"],
    ["npm", "run", "test:avatar", "-w", "@blumi/mobile"],
    ["npm", "run", "test:wardrobe", "-w", "@blumi/mobile"],
    ["npm", "run", "test:shop-preview-assets", "-w", "@blumi/mobile"],
]


def fail(message):
    sys.exit(f"import_collection_item: {message}")


def run(cmd, cwd=ROOT):
    print("  $", " ".join(str(c) for c in cmd), flush=True)
    if subprocess.run([str(c) for c in cmd], cwd=cwd).returncode != 0:
        fail(f"step failed: {' '.join(str(c) for c in cmd)}")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def declared_item(item_id):
    """(rig, is_landed) for a declared new collection ID; fails when it is not declared."""
    source = COLLECTION_TS.read_text()
    line = next((l for l in source.splitlines() if re.search(rf'\(\s*"{re.escape(item_id)}"', l)), None)
    if line is None:
        fail(f"{item_id} is not declared in {COLLECTION_TS.relative_to(ROOT)}")
    landed = re.search(r"NEW_COLLECTION_LANDED_ITEM_IDS[^=]*=\s*new Set<string>\(\[(.*?)\]\)", source, re.S)
    if landed is None:
        fail("NEW_COLLECTION_LANDED_ITEM_IDS not found")
    is_landed = f'"{item_id}"' in landed.group(1)
    return ("male" if f"bodyId: {BOY_BODY}" in line else "female"), is_landed


def count_differing(a, b):
    """How many entries of two layer lists (or dicts) differ, counting a missing entry as different. Pure."""
    if isinstance(a, dict) and isinstance(b, dict):
        return sum(1 for k in set(a) | set(b) if a.get(k) != b.get(k))
    return sum(1 for x, y in zip(a, b) if x != y) + abs(len(a) - len(b))


def hidden_back_entry(src, view, item_id):
    """The empty back entry of a head piece (glasses, accessory) the factory rig leaves out of the back view because
    nothing of it shows from behind; the exporter needs the item in both views, with no parts allowed. None otherwise.
    Pure."""
    front = src["front"]["items"].get(item_id)
    if view != "back" or front is None or front.get("slot") not in HIDDEN_BACK_SLOTS:
        return None
    entry = {"slot": front["slot"]}
    if "group" in front:
        entry["group"] = front["group"]
    entry["parts"] = []
    return entry


def graft(base, src, item_id):
    """A copy of base with item_id (and its variant keys and card boxes) taken from src. Pure."""
    out = copy.deepcopy(base)
    differing_layers = 0
    for view in ("front", "back"):
        v, s = out[view], src[view]
        for key in ("bones", "ground"):
            if s[key] != v[key]:
                fail(f"{view} {key} of the item rig differ from the base: not the same body")
        differing_layers += count_differing(v["layers"], s["layers"])
        if item_id not in s["items"]:
            hidden = hidden_back_entry(src, view, item_id)
            if hidden is None:
                fail(f"the item rig has no {view} item {item_id} (art ID = rig ID = app ID)")
            if item_id in v["items"]:
                fail(f"the base rig already has {item_id}")
            v["items"][item_id] = hidden
            continue
        if item_id in v["items"]:
            fail(f"the base rig already has {item_id}")
        item = copy.deepcopy(s["items"][item_id])
        for pose in ("sit", "wave"):
            if item.get(pose) and f"{pose}Box" not in item:
                item[f"{pose}Box"] = list(s["hybrid"][pose]["box"])
        v["items"][item_id] = item
        for family in VARIANT_FAMILIES:
            for key, value in (s["hybrid"].get(family) or {}).items():
                if item_id in key.split("+"):
                    v["hybrid"].setdefault(family, {})[key] = copy.deepcopy(value)
    return out, differing_layers


def ungraft(base, item_id):
    """A copy of base without item_id: its item entry in both views and the hybrid variant keys that name it. Pure."""
    out = copy.deepcopy(base)
    for view in ("front", "back"):
        v = out[view]
        if item_id not in v["items"]:
            fail(f"the base rig has no {view} item {item_id} to replace")
        del v["items"][item_id]
        for family in VARIANT_FAMILIES:
            keys = [key for key in (v["hybrid"].get(family) or {}) if item_id in key.split("+")]
            for key in keys:
                del v["hybrid"][family][key]
    return out


def cut_front_thumb(args, rig, item_id):
    """The card thumb from the front layer (front-thumbs.mjs), so bake-stills takes the front, never the 3/4 view."""
    with tempfile.TemporaryDirectory(prefix="blumi-thumb-") as scratch:
        sources = Path(scratch) / "sources.tsv"
        sources.write_text("item_id\trig\tfront\tback\n" + f"{item_id}\t{rig}\t{args.front}\t{args.front_back or ''}\n")
        run(["node", "tools/avatar25d/front-thumbs.mjs", "--sources", sources])


def insert_item_art(source, rig, item_id):
    """avatarItemArt.ts source with `item_id: "item_id"` appended to the rig's AVATAR_ITEM_ART block. Pure."""
    start = source.index("export const AVATAR_ITEM_ART")
    block = source.index(f"  {rig}: {{", start)
    end = source.index("\n  }", block)
    body = source[block:end].rstrip()
    if f"  {item_id}:" in body:
        fail(f"{item_id} is already in AVATAR_ITEM_ART.{rig}")
    joiner = "" if body.endswith(("{", ",")) else ","
    return source[:block] + body + f'{joiner}\n    {item_id}: "{item_id}"' + source[end:]


def insert_landed(source, item_id):
    """newCollectionItems.ts source with item_id added to NEW_COLLECTION_LANDED_ITEM_IDS (sorted). Pure."""
    pattern = re.compile(r"(NEW_COLLECTION_LANDED_ITEM_IDS[^=]*=\s*new Set<string>\(\[)(.*?)(\]\))", re.S)
    match = pattern.search(source)
    ids = sorted(set(re.findall(r'"([^"]+)"', match.group(2))) | {item_id})
    listed = "\n" + "".join(f'  "{i}",\n' for i in ids)
    return source[:match.start(2)] + listed + source[match.end(2):]


def insert_showcase_pending(source, rig, item_id, reason):
    """The coverage test source with item_id in SHOWCASE_PENDING[rig] and a dated reason line. Pure."""
    marker = "const SHOWCASE_PENDING"
    head = source.index(marker)
    comment_end = source.rindex(" */", 0, head)
    source = source[:comment_end] + f" * {reason}\n" + source[comment_end:]
    match = re.compile(rf"(\n  {rig}: \[)(.*?)(\],)", re.S).search(source, source.index(marker))
    ids = [i for i in re.findall(r'"([^"]+)"', match.group(2))] + [item_id]
    return source[:match.start(2)] + ", ".join(f'"{i}"' for i in ids) + source[match.end(2):]


def front_entry(args, slot, item_id):
    """The allowlist entry for the copied front layers (paths relative to the showcase root)."""
    order = args.front_order or DEFAULT_FRONT_ORDER.get(slot)
    if order is None:
        fail(f"slot {slot} has no default front order: pass --front-order")
    rel = f"{SHOWCASE_SUBDIR}/{item_id}"
    entry = {"slot": slot, "order": order, "file": f"{rel}/front.png", "sha256": sha256(args.front)}
    if args.front_erase:
        if slot not in ERASING_SLOTS:
            fail(f"slot {slot} does not erase the body")
        entry.update(eraseFile=f"{rel}/erase.png", eraseSha256=sha256(args.front_erase))
    if args.front_back:
        entry.update(backFile=f"{rel}/back.png", backSha256=sha256(args.front_back))
    if slot == "top":
        entry["tucked"] = False
    return entry


def copy_front(args, item_id):
    target = SHOWCASE_ROOT / SHOWCASE_SUBDIR / item_id
    target.mkdir(parents=True, exist_ok=True)
    for source, name in ((args.front, "front.png"), (args.front_erase, "erase.png"), (args.front_back, "back.png")):
        if source:
            shutil.copyfile(source, target / name)


def export_rig(rig, rig_path):
    """Export into a scratch folder first, so a refused export leaves the app's rig files untouched."""
    out_dir = ROOT / "apps/mobile/src/features/avatar/rigs" / RIG_DIRS[rig]
    with tempfile.TemporaryDirectory(prefix="blumi-import-") as scratch:
        staged = Path(scratch) / "out"
        run([PYTHON, ROOT / "tools/avatar25d/export_rig.py", rig_path, *EXPORT_ARGS[rig], "--out", staged, "--astc"],
            cwd=WORKBENCH)
        for pattern in GENERATED_GLOBS:
            for path in out_dir.glob(pattern):
                path.unlink()
        for path in staged.rglob("*"):
            if path.is_file():
                target = out_dir / path.relative_to(staged)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(path), target)
    return out_dir


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("item_id")
    p.add_argument("--base-rig", required=True, type=Path)
    p.add_argument("--item-rig", required=True, type=Path)
    p.add_argument("--out-rig", required=True, type=Path)
    p.add_argument("--front", type=Path)
    p.add_argument("--front-erase", type=Path)
    p.add_argument("--front-back", type=Path)
    p.add_argument("--front-order", type=int)
    p.add_argument("--owner-look-approved", metavar="NOTE")
    p.add_argument("--replace", action="store_true")
    p.add_argument("--plan", action="store_true")
    p.add_argument("--skip-tests", action="store_true")
    args = p.parse_args()
    for path in (args.base_rig, args.item_rig, args.front, args.front_erase, args.front_back):
        if path and not path.is_file():
            fail(f"missing input {path}")
        if path and re.search("candidate", str(path), re.I):
            fail(f"a candidate path cannot enter the app: {path}")
    if (args.front_erase or args.front_back or args.owner_look_approved) and not args.front:
        fail("front options need --front")
    return args


def main():
    args = parse_args()
    item_id = args.item_id
    rig, is_landed = declared_item(item_id)
    if is_landed and not args.replace:
        fail(f"{item_id} has already landed (pass --replace to re-import its art)")
    if args.replace and not is_landed:
        fail(f"{item_id} has not landed yet: import it without --replace")
    print(f"1. {item_id}: rig {rig}" + (" (replace)" if args.replace else ""))
    base, src = json.loads(args.base_rig.read_text()), json.loads(args.item_rig.read_text())
    if args.replace:
        base = ungraft(base, item_id)
    merged, differing_layers = graft(base, src, item_id)
    slot = src["front"]["items"][item_id]["slot"]
    print(f"2. graft ok (slot {slot}); body layers differing between base and item rig: {differing_layers} (base kept)")
    approved = bool(args.owner_look_approved)
    entry = front_entry(args, slot, item_id) if args.front else None
    if args.plan:
        steps = "replace the rig item, export" if args.replace else "export, map, mark landed, " + (
            "allowlist + bake front" if approved else "list front as pending")
        print(f"--plan: inputs valid; would {steps}, cut the card thumb, bake stills, gate, test")
        if entry:
            print("front entry:", json.dumps({item_id: entry}))
        return
    args.out_rig.write_text(json.dumps(merged))
    out_dir = export_rig(rig, args.out_rig.resolve())
    print(f"3. exported {args.out_rig} -> {out_dir.relative_to(ROOT)}")
    if args.replace:
        if entry:
            copy_front(args, item_id)
        print("4-5. replace: sources unchanged" + (", front layers copied" if entry else ""))
    else:
        land_sources(args, rig, item_id, entry, approved)
    if args.front:
        cut_front_thumb(args, rig, item_id)
    finish(out_dir, args)


def land_sources(args, rig, item_id, entry, approved):
    """Steps 4 and 5 of a first import: map, mark landed, and allowlist or list the front as pending."""
    ITEM_ART_TS.write_text(insert_item_art(ITEM_ART_TS.read_text(), rig, item_id))
    COLLECTION_TS.write_text(insert_landed(COLLECTION_TS.read_text(), item_id))
    print("4. mapped in AVATAR_ITEM_ART and marked landed (release hold unchanged)")
    if entry and approved:
        copy_front(args, item_id)
        allow = json.loads(ALLOWLIST.read_text())
        body = allow["bodies"][rig]
        body["items"][item_id] = entry
        body["ownerApprovalNote"] += f" {args.owner_look_approved} ({item_id})."
        ALLOWLIST.write_text(json.dumps(allow, indent=2, ensure_ascii=False) + "\n")
        run(["node", "tools/avatar25d/bake-showcase.mjs", "--src", SHOWCASE_ROOT])
        print("5. front allowlisted and baked")
    else:
        if entry:
            copy_front(args, item_id)
            print("5. front NOT approved by the owner: pending allowlist entry for the owner sheet:")
            print(json.dumps({item_id: entry}, indent=1))
        reason = (f"new collection: {item_id} landed without an owner-approved front look; "
                  "it keeps the 3/4 fallback until the owner says yes and the import adds its allowlist entry.")
        COVERAGE_TEST_TS.write_text(insert_showcase_pending(COVERAGE_TEST_TS.read_text(), rig, item_id, reason))
        print("5. listed as showcase pending")


def finish(out_dir, args):
    run(["npm", "run", "build", "-w", "@blumi/domain"])
    run(["node", "tools/avatar25d/bake-stills.mjs"])
    run(["python3", "tools/avatar25d/blink_gate.py", out_dir])
    print("6. stills baked, blink gate passed")
    if not args.skip_tests:
        for cmd in AFFECTED_TESTS:
            run(cmd)
        print("   affected tests passed")
    status = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all"], cwd=ROOT,
                            capture_output=True, text=True, check=True).stdout
    print("Stage exactly these (review with git diff --cached; commit 'feat: land <piece> (held until its receipt)'):")
    print("\n".join("  " + line[3:] for line in status.splitlines()))


if __name__ == "__main__":
    main()
