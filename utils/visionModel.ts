// The on-device vision model used for photo tag suggestions (workers/vision.worker.ts).
// Gemma 4 E2B is the smallest Gemma that reads images and has a published browser (ONNX, WebGPU) build.
// Swapping in another image-text model means changing this and the processor call in the worker.
export const VISION_MODEL = {
  repo: 'onnx-community/gemma-4-E2B-it-ONNX',
  dtype: 'q4f16',
  label: 'Gemma 4 E2B',
  /** Rough size of the 4-bit files, for the download warning. Not measured. */
  approxGB: 3,
} as const
