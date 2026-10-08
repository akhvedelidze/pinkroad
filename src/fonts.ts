import { publicUrl } from './publicUrl.ts'

const georgian = 'U+0589, U+10A0-10FF, U+1C90-1CBA, U+1CBD-1CBF, U+205A, U+2D00-2D2F, U+2E31'
const latin =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'

const faces = [
  ['400', 'fonts/noto-sans-georgian-400.woff2', georgian],
  ['700', 'fonts/noto-sans-georgian-700.woff2', georgian],
  ['400', 'fonts/noto-sans-georgian-latin-400.woff2', latin],
  ['700', 'fonts/noto-sans-georgian-latin-700.woff2', latin],
] as const

const style = document.createElement('style')
style.textContent = faces
  .map(
    ([weight, file, range]) => `@font-face {
  font-family: "Noto Sans Georgian";
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url("${publicUrl(file)}") format("woff2");
  unicode-range: ${range};
}`,
  )
  .join('\n')
document.head.appendChild(style)
