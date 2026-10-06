// Copy the onnxruntime-web WASM runtime that @huggingface/transformers v4 requests
// into public/ort/ so it is self-hosted (offline-capable) instead of loaded from jsdelivr.
// Transformers picks ort-wasm-simd-threaded.asyncify.{mjs,wasm} (plain ort-wasm-simd-threaded.{mjs,wasm}
// on Safari < 26 without WebGPU). The jsep/jspi variants are never requested, so they are skipped.
// Run: node scripts/copy-ort.mjs   (wire into postinstall/prebuild yourself)
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const dest = join(root, 'public', 'ort')
const WANTED = /^ort-wasm-simd-threaded(\.asyncify)?\.(mjs|wasm)$/

if (!existsSync(src)) {
  console.warn('[copy-ort] onnxruntime-web not installed; skipping')
  process.exit(0)
}
mkdirSync(dest, { recursive: true })
const files = readdirSync(src).filter((f) => WANTED.test(f))
for (const f of files) copyFileSync(join(src, f), join(dest, f))
console.log(`[copy-ort] copied ${files.length} files to public/ort: ${files.join(', ')}`)
