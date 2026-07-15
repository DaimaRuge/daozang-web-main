export default function AboutPage() {
  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      <h1 className="text-2xl font-serif tracking-wider mb-8">关于</h1>

      <div className="prose prose-sm space-y-6 text-[var(--muted)] leading-relaxed">
        <section>
          <h2 className="text-lg font-serif text-[var(--text)] mb-3">道可道</h2>
          <p className="text-sm">
            「道可道，非常道。」——《道德经》第一章
          </p>
          <p className="text-sm mt-3">
            道可道是一个道藏经文在线阅读平台，旨在为学术研究者、道教学者及对中国传统文化感兴趣的读者提供一个简洁、高效的经文检索与阅读工具。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-serif text-[var(--text)] mb-3">数据来源</h2>
          <p className="text-sm">
            本站文本数据来源于开源项目 GitHub 仓库 <code className="text-xs bg-[var(--card)] px-1.5 py-0.5 rounded">DaimaRuge/daozang-text</code>，收录了正统道藏与续道藏中的经典文献，共计 1500 余部。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-serif text-[var(--text)] mb-3">收录范围</h2>
          <ul className="text-sm space-y-1 list-disc list-inside">
            <li><strong>正统道藏</strong>：洞真部、洞玄部、洞神部（各含十二类）、太平部、太清部、太玄部、正一部</li>
            <li><strong>续道藏</strong>：明代续编道藏经典</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-serif text-[var(--text)] mb-3">版权声明</h2>
          <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs leading-relaxed">
            <p className="mb-2">
              <strong>学术研究用途声明</strong>
            </p>
            <p className="mb-2">
              本站所有经文文本仅供学术研究、文化交流与个人学习之用途。任何组织或个人不得将本站文本用于任何商业目的，包括但不限于出版、发行、转载牟利等。
            </p>
            <p className="mb-2">
              道藏原文的版权归属于相关权利人。本站不声称对所收录文本拥有任何版权。如有任何版权问题，请联系本站管理员，我们将及时处理。
            </p>
            <p>
              本站对文本内容的准确性不做任何保证。如需引用，请务必核对权威版本。
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-serif text-[var(--text)] mb-3">技术说明</h2>
          <p className="text-sm">
            本站使用 Next.js 构建，部署于 Vercel 平台。文本数据在构建时预处理为结构化索引，页面由服务端渲染以保证良好的 SEO 与加载性能。
          </p>
        </section>
      </div>
    </div>
  );
}
