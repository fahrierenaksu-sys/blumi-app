import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

const root = resolve(import.meta.dirname, "../../..");
const evidence = join(
  root,
  "docs/avatar-motion-pipeline/male-young-drop/2026-07-18",
);
const room = join(root, "apps/mobile/src/features/avatarV2/assets/room");
const states = [
  "walking_front_f01",
  "walking_front_f02",
  "walking_front_f03",
  "walking_front_f04",
  "sitting_front_f01",
];
const RETIRED_SLUGS = new Set(["tinted_star_glasses"]);
const expected = [
  ["shoes", "retro_colorblock_runner", "body"],
  ["shoes", "chunky_skate_sneakers", "body"],
  ["shoes", "suede_penny_mules", "body"],
  ["shoes", "lightweight_trail_sneakers", "body"],
  ["accessory", "soft_patch_beanie", "fixed"],
  ["accessory", "nylon_crossbody_bag", "fixed"],
  ["accessory", "beaded_charm_necklace", "fixed"],
  ["bottom", "washed_baggy_denim", "body"],
  ["bottom", "soft_parachute_cargo_pants", "body"],
  ["bottom", "colorblock_nylon_track_pants", "body"],
  ["top", "striped_chunky_cardigan", "body"],
  ["top", "colorblock_rugby_polo", "body"],
  ["top", "pixel_heart_boxy_tee", "body"],
  ["top", "soft_varsity_knit_jacket", "body"],
  ["top", "soft_panel_overshirt_bomber", "body"],
];

const accessoryFrontBounds = new Map([
  ["soft_patch_beanie", [90, 80, 166, 150]],
  ["nylon_crossbody_bag", [94, 218, 162, 286]],
  ["beaded_charm_necklace", [100, 214, 156, 246]],
]);

const transparentResidue = (png) => {
  for (let offset = 0; offset < png.data.length; offset += 4) {
    if (png.data[offset + 3] === 0)
      assert.deepEqual([...png.data.slice(offset, offset + 3)], [0, 0, 0]);
  }
};

test("young male drop keeps the requested 4 shoes, 3 active accessories, 3 bottoms, and adds one overshirt-bomber signature top", () => {
  assert.equal(expected.length, 15);
  assert.deepEqual(
    Object.fromEntries(
      ["shoes", "accessory", "bottom", "top"].map((type) => [
        type,
        expected.filter(([category]) => category === type).length,
      ]),
    ),
    { shoes: 4, accessory: 3, bottom: 3, top: 5 },
  );
});

test("cancelled young-drop features are not resurrected in runtime", () => {
  for (const slug of RETIRED_SLUGS) {
    assert.equal(
      existsSync(join(room, `avatar_room_accessory_male_${slug}_v1.png`)),
      false,
      `${slug} retired static layer`,
    );
    for (const state of states) {
      assert.equal(
        existsSync(
          join(
            room,
            "motion",
            `room_avatar_accessory_male_${slug}_v1_${state}.png`,
          ),
        ),
        false,
        `${slug} retired ${state}`,
      );
    }
  }
});

test("every young-drop static candidate is 256x384, alpha-clean, live-staged, and proofed", () => {
  for (const [category, slug] of expected) {
    const candidate = join(evidence, "candidate-layers/static", `${slug}.png`);
    const proof = join(evidence, `static-${slug}-proof.png`);
    const live = join(room, `avatar_room_${category}_male_${slug}_v1.png`);
    assert.equal(existsSync(candidate), true, `${slug} candidate`);
    assert.equal(existsSync(proof), true, `${slug} static proof`);
    assert.equal(existsSync(live), true, `${slug} live staged layer`);
    const png = PNG.sync.read(readFileSync(live));
    assert.deepEqual([png.width, png.height], [256, 384], `${slug} canvas`);
    transparentResidue(png);
  }
});

test("front-facing accessory layers stay inside the reviewed head, torso, neck, and eye envelopes", () => {
  for (const [slug, expectedBounds] of accessoryFrontBounds) {
    const png = PNG.sync.read(
      readFileSync(join(evidence, "candidate-layers/static", `${slug}.png`)),
    );
    let minX = png.width;
    let minY = png.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        if (png.data[(y * png.width + x) * 4 + 3] <= 16) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    assert.deepEqual(
      [minX, minY, maxX + 1, maxY + 1],
      expectedBounds,
      `${slug} front-fit bounds`,
    );
  }
});

test("young-drop body layers have true 4W+1S and every item has contact-sheet evidence", () => {
  const manifest = JSON.parse(
    readFileSync(join(evidence, "motion-manifest.json"), "utf8"),
  );
  assert.equal(manifest.rigId, "blumi_2_5d_layered_v1");
  assert.equal(manifest.fitProfileId, "blumi_male_room_avatar_v1");
  assert.deepEqual(
    manifest.items
      .filter((item) => !RETIRED_SLUGS.has(item.slug))
      .map((item) => item.slug),
    expected.map(([, slug]) => slug),
  );

  for (const [category, slug, treatment] of expected) {
    assert.equal(
      existsSync(
        join(evidence, "motion-candidates", slug, "motion-contact-sheet.png"),
      ),
      true,
      `${slug} contact sheet`,
    );
    if (treatment === "fixed") continue;
    const frames = states.map((state) => {
      const candidate = join(
        evidence,
        "motion-candidates",
        slug,
        `${state}.png`,
      );
      const live = join(
        room,
        "motion",
        `room_avatar_${category}_male_${slug}_v1_${state}.png`,
      );
      assert.equal(existsSync(candidate), true, `${slug} ${state} candidate`);
      assert.equal(existsSync(live), true, `${slug} ${state} live`);
      const png = PNG.sync.read(readFileSync(live));
      assert.deepEqual(
        [png.width, png.height],
        [256, 384],
        `${slug} ${state} canvas`,
      );
      transparentResidue(png);
      return png.data.toString("base64");
    });
    assert.equal(
      new Set(frames.slice(0, 4)).size,
      4,
      `${slug} walking variants`,
    );
    assert.notEqual(frames[0], frames[4], `${slug} sitting variant`);
  }
});
