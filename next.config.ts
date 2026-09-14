/// <reference types="node" />
import type { NextConfig } from 'next';
import { withPayload } from '@payloadcms/next/withPayload';

// 媒体走对象存储 CDN，next/image 需要显式登记该域名才肯优化远程图片。
// 未配置时（本地回退模式）留空数组，走 public/ 本地文件，无需登记。
// 本地 MinIO 用 http + 127.0.0.1:9000，必须按协议/主机/端口放行，否则 next/image 会拒载。
const mediaHost = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;

function mediaRemotePatterns(): NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> {
  const githubCdn: NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> = [
    { protocol: 'https', hostname: 'cdn.jsdelivr.net', pathname: '/**' },
    { protocol: 'https', hostname: 'raw.githubusercontent.com', pathname: '/**' },
  ];
  if (!mediaHost) return githubCdn;
  try {
    const url = new URL(mediaHost);
    const protocol = url.protocol.replace(':', '') as 'http' | 'https';
    if (protocol !== 'http' && protocol !== 'https') return githubCdn;
    return [{
      protocol,
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      pathname: '/**',
    }, ...githubCdn];
  } catch {
    return githubCdn;
  }
}

const nextConfig: NextConfig = {
  // 本项目的 AI 协作约定统一由 .cursor/rules/*.mdc 维护，是人工审定的内容边界（三层文本边界、注释规范等）。
  // Next 16.3 起 next dev 默认会往仓库根目录写 AGENTS.md / CLAUDE.md，既与上述约定形成两套并行来源、
  // 又会在每次开发时留下未跟踪文件噪声，因此在源头关闭而非交给 .gitignore 掩盖。
  agentRules: false,
  // pi-ai 按供应商懒加载 SDK；交给 Node 解析，避免 Turbopack 把 Anthropic/OpenAI 全部打进函数包。
  serverExternalPackages: [
    '@earendil-works/pi-agent-core',
    '@earendil-works/pi-ai',
    '@earendil-works/pi-telemetry',
  ],
  outputFileTracingExcludes: {
    '*': ['./data/daozang-text/**', './data/daozang-text-utf8/**', './data/daozang-text-new/**', './data/daozang-text-orig/**', './data/images-daozang/**'],
  },
  images: {
    remotePatterns: mediaRemotePatterns(),
  },
};

export default withPayload(nextConfig);
