import type { NextConfig } from 'next';
// transformers.js, its ONNX runtime and LanceDB are native/server-only; keep them out of the bundler.
const config: NextConfig = { reactStrictMode: true, serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'sharp', '@lancedb/lancedb'] };
export default config;
