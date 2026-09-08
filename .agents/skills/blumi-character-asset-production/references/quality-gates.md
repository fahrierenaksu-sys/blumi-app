# Blumi Character Asset Quality Gates

Read this reference when defining, producing, or reviewing a Blumi character asset. Apply the relevant category gates plus the shared pose and combination gates.

## Base anatomy and continuity

- Head, jaw, neck, shoulders, torso, pelvis, legs, and feet form one readable volume.
- The neck is visible where the garment design permits it and has no horizontal band, dark splice, floating edge, or two-piece appearance.
- Head scale and placement remain consistent with the approved chibi proportion.
- Skin lighting, contour softness, and shadow direction remain continuous across body parts.
- Hands stay simple and chibi; prioritize readable palm and wrist placement over unnecessary finger or thumb detail.

## Hair

- Design directly on the current canonical head, not a generic face template.
- Cover the crown naturally without bald strips or opaque scalp patches.
- Follow forehead, temple, ear, and back-head anchors without gaps, floating tips, or collisions.
- Preserve believable skull volume: no helmet, oversized dome, compressed cap, pasted-on edge, or accidental asymmetry.
- Match the approved Blumi painted texture, outline weight, softness, detail density, and lighting.
- Verify hats and hair accessories with explicit front/rear occlusion.

## Tops and outerwear

- Neckline and collar reveal the intended amount of neck and follow the current shoulder line.
- Sleeves follow shoulder, upper arm, elbow, cuff, wrist, and hand in every pose.
- Hands remain visible unless deliberate coverage belongs to the approved design.
- Wrists exit the real cuff opening; arms do not leak beside the garment.
- Hem meets the bottom naturally with no background or skin gap and no destructive overlap.
- Material identity stays stable across poses: cotton, knit, leather, denim, lace, and tweed retain their own controlled treatment.

## Bottoms and dresses

- Waistband matches the base waist and the equipped top or dress contract.
- Pelvis, crotch, leg gap, thigh volume, hem, and sitting deformation follow the body.
- Walking frames preserve leg ownership and do not swap or slice panels.
- Slim, straight, relaxed, and oversized fits remain intentional and anatomically attached.

## Shoes

- Scale matches the actual base foot envelope; never enlarge footwear to hide alignment errors.
- Heel, toe, sole, ankle opening, and left/right perspective align with the pose.
- Pants cover only the intended shoe upper; skin does not show through closed footwear.
- Sole contact remains grounded in static, walking, and sitting views.

## Shared style continuity

- Outline color and weight, edge softness, light direction, saturation, highlight strength, and micro-detail match the character family.
- Avoid photoreal texture, plastic shine, sharp vector edges, muddy resampling, and AI-like micro-noise.
- Inspect at source scale, native runtime scale, and a controlled close-up. Close-up quality cannot compensate for poor native readability.

## Pose continuity

Read required states from the current runtime contract instead of assuming a fixed count. For the current front-facing PNG system, verify static, all four walking frames, and sitting where the item supports them.

- Every frame uses the correct product and pose source.
- Static fallback does not hide a required missing motion asset.
- Hair and face anchors do not jump between states.
- Hands, neck, cuffs, hems, waist, legs, and shoes keep contact continuity.
- Pattern, material, and silhouette do not turn into another product during motion.
- Shop, Wardrobe, Room, MiniRoom, and remote presentation resolve the same semantic item.

## Combination coverage

Test representative and high-risk combinations, including relevant top-bottom, bottom-shoe, hair-collar, hair-headwear, and accessory-arm pairs. One passing outfit does not approve a catalog or category.

## Critical failures

Any exposed scalp, artificial neck seam, unintentional missing hand, wrong cuff exit, arm leak, waist gap, broken crotch, oversized shoe, skin-through-shoe, identity drift, or wrong runtime product blocks promotion.
