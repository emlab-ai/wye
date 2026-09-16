import type { NextConfig } from 'next';
// transformers.js and its ONNX runtime are native/server-only; keep them out of the bundler.
const config: NextConfig = { reactStrictMode: true, serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'sharp'] };
export default config;
