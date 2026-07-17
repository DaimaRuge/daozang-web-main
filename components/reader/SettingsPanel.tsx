'use client';

import { ReaderSettings } from '@/lib/user-data';

/**
 * 阅读设置面板。
 *
 * 为什么拆成独立组件：设置项（字号/行距/宽度/主题）后续还会扩展
 * （字体选择、简繁模式、竖排模式均已在数据模型中预留方向），
 * 集中在一个面板内迭代，不污染阅读器主体逻辑。
 * 设置的持久化由父组件统一处理（本组件保持无副作用，便于测试）。
 */
export default function SettingsPanel({
  settings,
  onChange,
}: {
  settings: ReaderSettings;
  onChange: (next: ReaderSettings) => void;
}) {
  const set = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const row = 'flex items-center justify-between gap-4 py-2';
  const btn = 'px-2.5 py-1 text-xs border border-[var(--border)] rounded hover:bg-[var(--card-hover)] transition-colors';
  const btnActive = 'px-2.5 py-1 text-xs border rounded transition-colors border-[var(--accent)] text-[var(--accent)]';

  return (
    <div className="text-sm font-[var(--font-sans-cn)]" role="group" aria-label="阅读设置">
      <div className={row}>
        <span className="text-[var(--muted)] text-xs">字号</span>
        <div className="flex items-center gap-2">
          <button className={btn} aria-label="减小字号"
            onClick={() => set('fontSize', Math.max(14, settings.fontSize - 1))}>A−</button>
          <span className="text-xs w-8 text-center">{settings.fontSize}</span>
          <button className={btn} aria-label="增大字号"
            onClick={() => set('fontSize', Math.min(26, settings.fontSize + 1))}>A+</button>
        </div>
      </div>

      <div className={row}>
        <span className="text-[var(--muted)] text-xs">行距</span>
        <div className="flex items-center gap-2">
          {[1.8, 2, 2.2].map(lh => (
            <button key={lh} className={settings.lineHeight === lh ? btnActive : btn}
              onClick={() => set('lineHeight', lh)}>{lh}</button>
          ))}
        </div>
      </div>

      <div className={row}>
        <span className="text-[var(--muted)] text-xs">宽度</span>
        <div className="flex items-center gap-2">
          {([['narrow', '窄'], ['normal', '适中'], ['wide', '宽']] as const).map(([w, label]) => (
            <button key={w} className={settings.width === w ? btnActive : btn}
              onClick={() => set('width', w)}>{label}</button>
          ))}
        </div>
      </div>

      <div className={row}>
        <span className="text-[var(--muted)] text-xs">主题</span>
        <div className="flex items-center gap-2">
          {([['paper', '宣纸'], ['sepia', '护眼'], ['night', '夜间']] as const).map(([t, label]) => (
            <button key={t} className={settings.theme === t ? btnActive : btn}
              onClick={() => set('theme', t)}>{label}</button>
          ))}
        </div>
      </div>

      <div className={row}>
        <span className="text-[var(--muted)] text-xs">阅读方式</span>
        <div className="flex items-center gap-2">
          {([['paged', '分页'], ['scroll', '滚动']] as const).map(([m, label]) => (
            <button key={m} className={settings.readingMode === m ? btnActive : btn}
              onClick={() => set('readingMode', m)}>{label}</button>
          ))}
        </div>
      </div>

      <div className={row}>
        <span className="text-[var(--muted)] text-xs">整理者按语</span>
        <button className={settings.showEditorNotes ? btnActive : btn}
          onClick={() => set('showEditorNotes', !settings.showEditorNotes)}>
          {settings.showEditorNotes ? '显示' : '隐藏'}
        </button>
      </div>
    </div>
  );
}
