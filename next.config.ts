/// <reference types="node" />
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    '*': ['./data/daozang-text/**', './data/daozang-text-utf8/**', './data/daozang-text-new/**', './data/daozang-text-orig/**'],
  },
};

export default nextConfig;
