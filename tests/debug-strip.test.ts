import preact from '@preact/preset-vite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build, type Rollup } from 'vite'
import { describe, expect, it } from 'vitest'

const marker = '+5 ქულა'

describe('debug stripping', () => {
  it(
    'keeps the debug controls in staging and removes them from the production bundle',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'pink-route-debug-'))
      try {
        const staging = await bundle('staging', path.join(root, 'staging'))
        const production = await bundle('production', path.join(root, 'production'))
        expect(staging).toContain(marker)
        expect(production).not.toContain(marker)
        expect(production).not.toContain('PINK_DEBUG')
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    180_000,
  )
})

async function bundle(mode: 'staging' | 'production', outDir: string): Promise<string> {
  const result = await build({
    configFile: false,
    root: process.cwd(),
    plugins: [preact()],
    mode,
    logLevel: 'error',
    publicDir: false,
    build: { outDir, emptyOutDir: true, sourcemap: false },
  })
  const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[]
  return outputs
    .flatMap((item) => item.output)
    .filter((item): item is Rollup.OutputChunk => item.type === 'chunk')
    .map((item) => item.code)
    .join('\n')
}
