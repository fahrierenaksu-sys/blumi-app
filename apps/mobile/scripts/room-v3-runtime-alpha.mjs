const LOW_ALPHA_CHROMA_MAX = 16
const LOW_ALPHA_CHROMA_SPREAD_MIN = 96

/**
 * Removes residual chroma-key RGB values without changing the alpha silhouette.
 *
 * Image generation sources can contain fully saturated green, magenta, or red
 * RGB values at one-to-sixteen alpha levels. Those colours are imperceptible in
 * the source size but become visible as coloured edge specks after resampling.
 * Keeping alpha intact avoids clipping thin painted edges or changing floor
 * contact while a neutral RGB value makes the residue safe on every backdrop.
 */
export function despillLowAlphaChroma(input) {
  const output = Buffer.from(input)

  for (let index = 0; index < output.length; index += 4) {
    const red = output[index]
    const green = output[index + 1]
    const blue = output[index + 2]
    const alpha = output[index + 3]

    if (alpha === 0) {
      output[index] = 0
      output[index + 1] = 0
      output[index + 2] = 0
    } else if (alpha <= LOW_ALPHA_CHROMA_MAX && hasLowAlphaColourFringe(red, green, blue)) {
      const neutral = Math.round((red + green + blue) / 3)
      output[index] = neutral
      output[index + 1] = neutral
      output[index + 2] = neutral
    }
  }

  return output
}

function hasLowAlphaColourFringe(red, green, blue) {
  return Math.max(red, green, blue) - Math.min(red, green, blue) >= LOW_ALPHA_CHROMA_SPREAD_MIN
}
