/// <reference types="node" />
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 本项目的 AI 协作约定统一由 .cursor/rules/*.mdc 维护，是人工审定的内容边界（三层文本边界、注释规范等）。
  // Next 16.3 起 next dev 默认会往仓库根目录写 AGENTS.md / CLAUDE.md，既与上述约定形成两套并行来源、
  // 又会在每次开发时留下未跟踪文件噪声，因此在源头关闭而非交给 .gitignore 掩盖。
  agentRules: false,
  outputFileTracingExcludes: {
    '*': ['./data/daozang-text/**', './data/daozang-text-utf8/**', './data/daozang-text-new/**', './data/daozang-text-orig/**'],
  },
};

export default nextConfig;
