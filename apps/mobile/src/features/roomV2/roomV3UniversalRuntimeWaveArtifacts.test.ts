import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { PNG } = require("pngjs") as {
  PNG: { sync: { read(bytes: Uint8Array): { width: number; height: number; data: Uint8Array } } }
}

type RuntimeBaseline = {
  sha256: string
  width: number
  height: number
  alphaBounds: { minX: number; minY: number; maxXInclusive: number; maxYInclusive: number }
  transparentPixelCount: number
  partialAlphaPixelCount: number
}

const BASELINES: Record<string, RuntimeBaseline> = {
  universal_bench_a_front: { sha256: "db3a5358dc02373b7dda5f4070540fc08dcda60536eff923719cfaf596058243", width: 2440, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 2415, maxYInclusive: 975 }, transparentPixelCount: 465464, partialAlphaPixelCount: 31067 },
  universal_bench_a_back: { sha256: "18e12ad149f18ebacb7acbfc1aa76047fee0b94ea568610f3e68c34ba60123e2", width: 2293, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 2268, maxYInclusive: 975 }, transparentPixelCount: 431182, partialAlphaPixelCount: 26648 },
  universal_bench_a_left: { sha256: "a7028bd5692f6fb6aa6f1b5de57d0d8bfd613e6ac74327a13dcbefd863a51415", width: 1634, height: 1000, alphaBounds: { minX: 25, minY: 24, maxXInclusive: 1609, maxYInclusive: 975 }, transparentPixelCount: 333861, partialAlphaPixelCount: 20383 },
  universal_bench_a_right: { sha256: "148d4e994041c8d09d47a8b034dc05edf66cbc893e84d1639e295a3b7a72b82a", width: 1664, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1639, maxYInclusive: 975 }, transparentPixelCount: 306022, partialAlphaPixelCount: 24353 },
  universal_soft_floor_cushion_a_front: { sha256: "2951b332facfed01da265fc18d15aed089a7225d3beb554d2cc4ca96b3c1da36", width: 1702, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1677, maxYInclusive: 975 }, transparentPixelCount: 263722, partialAlphaPixelCount: 13611 },
  universal_soft_floor_cushion_a_back: { sha256: "6ac3a91c2f0b593b7d8ea41b8a0f58be7f74f9005c6c8b8d6300bc4ab228c11d", width: 1697, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1672, maxYInclusive: 975 }, transparentPixelCount: 268535, partialAlphaPixelCount: 14116 },
  universal_soft_floor_cushion_a_left: { sha256: "0f87c26a3ee98d29d0a440b2895d5d564d14bf367dd703be3b9000e2d1c6ad40", width: 2606, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 2581, maxYInclusive: 975 }, transparentPixelCount: 377977, partialAlphaPixelCount: 25964 },
  universal_soft_floor_cushion_a_right: { sha256: "fd088deb2223f0c8bc334a7427795385c25382fa87f64885524da0f9d80b626f", width: 2629, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 2604, maxYInclusive: 975 }, transparentPixelCount: 368949, partialAlphaPixelCount: 24670 },
  universal_pet_bed_a_front: { sha256: "29e36060f92eb45294dc0b30a2d05dc9c42dd896de44da94fa498a3fdface70b", width: 1829, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1804, maxYInclusive: 975 }, transparentPixelCount: 331809, partialAlphaPixelCount: 13129 },
  universal_pet_bed_a_back: { sha256: "02c60afed681d7359cbc32fcfdf571569753485d0a0cbd225cbbb7fb5f9ec7c3", width: 2016, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1991, maxYInclusive: 975 }, transparentPixelCount: 374529, partialAlphaPixelCount: 16039 },
  universal_pet_bed_a_left: { sha256: "808e85e2b0e01984dac53c40ea3318efa225e9303b9ec35db43f71e7b1fbac83", width: 2032, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 2007, maxYInclusive: 975 }, transparentPixelCount: 381878, partialAlphaPixelCount: 17058 },
  universal_pet_bed_a_right: { sha256: "a4bdc4ef4794afd1c89b3b694e0756005071d3c6964eb184b8cce9ab74d9b010", width: 2057, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 2032, maxYInclusive: 975 }, transparentPixelCount: 345546, partialAlphaPixelCount: 18338 },
  universal_nightstand_a_front: { sha256: "409c5319201b2cceae9b14ef94ce92e9ac4b16a3defd47373e845291f5b8088c", width: 823, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 798, maxYInclusive: 975 }, transparentPixelCount: 197739, partialAlphaPixelCount: 8253 },
  universal_nightstand_a_back: { sha256: "9ace9bf6382cc8a48b21fbe5adec560513349676cfd41fb960423e8c47b42572", width: 833, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 808, maxYInclusive: 975 }, transparentPixelCount: 187281, partialAlphaPixelCount: 10175 },
  universal_nightstand_a_left: { sha256: "5a3f92b79b9e763cc4bbdac1613e73d9305ea2367ad584539fb2fd8043988daa", width: 542, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 517, maxYInclusive: 975 }, transparentPixelCount: 146029, partialAlphaPixelCount: 5684 },
  universal_nightstand_a_right: { sha256: "5dd0be39f9f856b348f03125d41151a221db9c3d594f544b8f9bf347d7f47584", width: 537, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 512, maxYInclusive: 975 }, transparentPixelCount: 142100, partialAlphaPixelCount: 10221 },
  universal_laundry_basket_a_front: { sha256: "3ec187560b9f406d27ac767576b4461c9d2f2f32bce78491197b6ec191d77871", width: 791, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 766, maxYInclusive: 975 }, transparentPixelCount: 191395, partialAlphaPixelCount: 10872 },
  universal_laundry_basket_a_back: { sha256: "57dc44fb5a81a8a09ec60e0d38d343aa7690f433268d6d7fcbb9e549f8afde68", width: 699, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 674, maxYInclusive: 975 }, transparentPixelCount: 168140, partialAlphaPixelCount: 10142 },
  universal_laundry_basket_a_left: { sha256: "be044d0c6a78fd6a69dca0eec493d2bb929a1ded5cc4d2bfc5e1866c7f29ae7b", width: 424, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 399, maxYInclusive: 975 }, transparentPixelCount: 131083, partialAlphaPixelCount: 7752 },
  universal_laundry_basket_a_right: { sha256: "7eff69f379983ad3face4f27a3b858fcca37b47189bab67ddff53d9495545f4b", width: 314, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 289, maxYInclusive: 975 }, transparentPixelCount: 93485, partialAlphaPixelCount: 8671 },
  universal_small_speaker_a_front: { sha256: "f604a0d813fdcbb684d0202952d7b6c86633532b63de692f35b4147ff7dcb4aa", width: 891, height: 1000, alphaBounds: { minX: 25, minY: 24, maxXInclusive: 866, maxYInclusive: 975 }, transparentPixelCount: 173206, partialAlphaPixelCount: 5490 },
  universal_rug_a_front: { sha256: "501890a7fe5ad377b45f87ef826e5fb7aaf36e79ecd99aa664443d5fa6fa0ee6", width: 1420, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1395, maxYInclusive: 975 }, transparentPixelCount: 303754, partialAlphaPixelCount: 8823 },
  universal_cushion_set_a_front: { sha256: "352c0798165b8a2e457eee0f8d6344183655847f0d5b62308f0b3da437f8fdc2", width: 1978, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1953, maxYInclusive: 975 }, transparentPixelCount: 371910, partialAlphaPixelCount: 21440 },
  universal_full_length_mirror_a_front: { sha256: "6ca2e665e0995e37aa1471d7c2d55eed823f5ca6a153af8cc84be399b2fda421", width: 526, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 501, maxYInclusive: 975 }, transparentPixelCount: 198267, partialAlphaPixelCount: 8786 },
  universal_open_display_shelf_a_front: { sha256: "5c42fd4bc245374fb71cf88ccc470ea63566dc4734c2342d51964700ec16cb74", width: 759, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 734, maxYInclusive: 975 }, transparentPixelCount: 297251, partialAlphaPixelCount: 26411 },
  universal_room_divider_a_front: { sha256: "b3786cea1086cea1a9f33b98f156a853c791ae7b6b006a83b587ee6d47075b77", width: 913, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 888, maxYInclusive: 975 }, transparentPixelCount: 190274, partialAlphaPixelCount: 12470 },
  universal_vanity_table_a_front: { sha256: "d71fcddd62badc2293001bb1372c447d2aeae704d7a72b198dbf2ac8c75c58c5", width: 1136, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1111, maxYInclusive: 975 }, transparentPixelCount: 628191, partialAlphaPixelCount: 10530 },
  universal_vanity_table_a_back: { sha256: "37b99eea6eca11744adf266d4c3e9573d61ffe2f5f74b208df56f4971fc6c136", width: 1138, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 1113, maxYInclusive: 975 }, transparentPixelCount: 693908, partialAlphaPixelCount: 10133 },
  universal_vanity_table_a_left: { sha256: "e1743ea19978ce580a2113dd8ed1e691aeeda1b0a1f13ef899ab3dd306b60b95", width: 472, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 447, maxYInclusive: 975 }, transparentPixelCount: 242089, partialAlphaPixelCount: 12499 },
  universal_vanity_table_a_right: { sha256: "9622b908cec94ee922f7289351ff57c1c0d44647f551b4ae3fcc4f8f255ff817", width: 536, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 511, maxYInclusive: 975 }, transparentPixelCount: 291410, partialAlphaPixelCount: 11779 },
  universal_shoe_cabinet_a_front: { sha256: "3c3949c4af79a5b7ee86fc85a8ecfe8567da63fe092b07ed3450000264a35553", width: 684, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 659, maxYInclusive: 975 }, transparentPixelCount: 115281, partialAlphaPixelCount: 10128 },
  universal_shoe_cabinet_a_back: { sha256: "748ff656ea4755f902db3887e0699be41d0fea4393bfde054491b3346cda1393", width: 578, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 553, maxYInclusive: 975 }, transparentPixelCount: 108178, partialAlphaPixelCount: 7752 },
  universal_shoe_cabinet_a_left: { sha256: "90ba6b978a3a2c9b6495fae21fcf9013f01974398ace441acf7abd96d603a831", width: 281, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 256, maxYInclusive: 975 }, transparentPixelCount: 82528, partialAlphaPixelCount: 7995 },
  universal_shoe_cabinet_a_right: { sha256: "0698f457c13ef32cb7423c8a431b579cbfa81414bcc81e88692edba85c9ac425", width: 283, height: 1000, alphaBounds: { minX: 24, minY: 24, maxXInclusive: 258, maxYInclusive: 975 }, transparentPixelCount: 79313, partialAlphaPixelCount: 7958 }
}

test("Universal Core launch wave runtime PNGs keep their normalized alpha baselines", () => {
  for (const [key, baseline] of Object.entries(BASELINES)) {
    const [id, rotation] = key.match(/^(.*)_(front|back|left|right)$/)?.slice(1) ?? []
    assert.ok(id && rotation)
    const relativePath = `assets/runtime/candidates/${id}/${id}_${rotation}_runtime_v2.png`
    const bytes = readFileSync(resolve(process.cwd(), "src/features/roomV2", relativePath))
    const image = PNG.sync.read(bytes)
    assert.equal(createHash("sha256").update(bytes).digest("hex"), baseline.sha256)
    assert.equal(image.width, baseline.width)
    assert.equal(image.height, baseline.height)

    let minX: number = image.width
    let minY: number = image.height
    let maxX: number = -1
    let maxY: number = -1
    let transparent = 0
    let partial = 0
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const alpha = image.data[(y * image.width + x) * 4 + 3]
        if (alpha === 0) {
          transparent += 1
          continue
        }
        if (alpha < 255) partial += 1
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    assert.deepEqual({ minX, minY, maxXInclusive: maxX, maxYInclusive: maxY }, baseline.alphaBounds)
    assert.equal(transparent, baseline.transparentPixelCount)
    assert.equal(partial, baseline.partialAlphaPixelCount)
  }
})
