/// <reference types="node" />
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingExcludes: {
    // 这些目录已作为 CDN 静态资源分发。若被 NFT 打进 Serverless Function，
    // content≈100MB、audio≈274MB，远超 Vercel 函数体积上限，预览部署会失败。
    // 服务端按需读取见 lib/public-data.ts（本地 fs / Vercel fetch）。
    '*': [
      './data/daozang-text/**',
      './data/daozang-text-utf8/**',
      './data/daozang-text-new/**',
      './data/daozang-text-orig/**',
      './data/graph/terms.auto.json',
      './public/data/content/**',
      './public/audio/**',
      './public/images/**',
    ],
  },
};

export default nextConfig;
