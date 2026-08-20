'use client';

import { useId } from 'react';
import { LOW_CONFIDENCE } from '@/lib/content-schema';
import { GraphNode, NODE_TYPE_LABELS } from '@/lib/graph/schema';
import { GraphLayout, LABEL_BASE_DY, LABEL_FONT_SIZE } from '@/lib/graph/layout';

/**
 * 图谱画布：把布局结果画成 SVG。
 *
 * 为什么是「纯渲染 + 回调」而不是自带状态：
 * 选中态、跳转、展开都由父组件（GraphExplorer）统一编排 ——
 * 画布只负责把坐标画出来并把点击事件抛上去，
 * 这样同一套画布也能被未来的移动端容器或分享用静态图复用。
 *
 * 为什么用 SVG 而不是 canvas：节点数被刻意控制在数十个量级，
 * SVG 可直接承载文字、可聚焦、可读屏，比 canvas 更符合无障碍要求。
 */
export default function GraphCanvas({
  layout,
  selectedId,
  onSelect,
}: {
  layout: GraphLayout;
  selectedId: string | null;
  onSelect: (node: GraphNode) => void;
}) {
  // 同页可能出现多张图（搜索页面板 + 详情），渐变 id 必须唯一
  const uid = useId().replace(/:/g, '');
  const { width, height, center, nodes, sectors } = layout;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto touch-manipulation"
      role="img"
      aria-label={`以「${center.node.label}」为中心的关联图谱，含 ${nodes.length} 个关联节点`}
    >
      <defs>
        <radialGradient id={`halo-${uid}`}>
          <stop offset="0%" stopColor="var(--highlight)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--highlight)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 中心光晕：把视线先收到中心点，再向外读关系 */}
      <circle cx={center.x} cy={center.y} r={Math.min(width, height) / 3.4} fill={`url(#halo-${uid})`} />

      {/* 连线：置信度低的边画得更淡更虚，视觉上即传达「这条关系较弱」 */}
      <g strokeLinecap="round">
        {nodes.map((n, i) => {
          const weak = n.confidence < LOW_CONFIDENCE;
          return (
            <line
              key={`edge-${i}`}
              x1={center.x}
              y1={center.y}
              x2={n.x}
              y2={n.y}
              stroke="var(--accent)"
              strokeWidth={weak ? 0.6 : 1.1}
              strokeOpacity={weak ? 0.22 : 0.42}
              strokeDasharray={weak ? '3 4' : undefined}
            />
          );
        })}
      </g>

      {/* 扇区标题：告诉用户这一片方向上是哪一类关系 */}
      <g>
        {sectors.map(s => (
          <text
            key={`sector-${s.groupIndex}`}
            x={s.x}
            y={s.y}
            textAnchor={Math.cos(s.angle) > 0.25 ? 'start' : Math.cos(s.angle) < -0.25 ? 'end' : 'middle'}
            className="fill-[var(--muted)] text-[11px]"
            style={{ fontFamily: 'var(--font-sans-cn)' }}
          >
            {s.label}
            {s.total > s.shown ? ` (${s.shown}/${s.total})` : ''}
          </text>
        ))}
      </g>

      {/* 邻居节点 */}
      <g>
        {nodes.map((n, i) => {
          const selected = n.node.id === selectedId;
          const isWork = n.node.type === 'work';
          const weak = n.confidence < LOW_CONFIDENCE;
          return (
            <g
              key={`${n.node.id}-${i}`}
              onClick={() => onSelect(n.node)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(n.node);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`${n.relationLabel}：${n.node.label}（${NODE_TYPE_LABELS[n.node.type]}）${weak ? '，关系待考' : ''}`}
              className="cursor-pointer outline-none focus-visible:opacity-100 [&:focus-visible_circle]:stroke-[var(--cinnabar)]"
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={selected ? n.r + 3 : n.r}
                fill={isWork ? 'var(--card)' : 'var(--accent)'}
                fillOpacity={isWork ? 1 : weak ? 0.45 : 0.85}
                stroke={selected ? 'var(--cinnabar)' : 'var(--accent)'}
                strokeWidth={selected ? 2 : 1}
                strokeOpacity={weak ? 0.5 : 0.9}
              />
              {/* 标签位置与文本均由布局算出（含碰撞避让），渲染层不得自行改动，
                  否则避让所依据的包围盒就与实际绘制不一致 */}
              <text
                x={n.x}
                y={n.y + n.r + LABEL_BASE_DY + n.labelDy}
                textAnchor="middle"
                fontSize={LABEL_FONT_SIZE}
                className={selected ? 'fill-[var(--cinnabar)]' : 'fill-[var(--text-secondary)]'}
                style={{ fontFamily: 'var(--font-serif-cn)' }}
              >
                {n.displayLabel}
              </text>
            </g>
          );
        })}
      </g>

      {/* 中心节点最后画，确保压在连线之上 */}
      <g>
        <circle
          cx={center.x}
          cy={center.y}
          r={center.r}
          fill="var(--cinnabar)"
          fillOpacity={0.9}
          stroke="var(--bg)"
          strokeWidth={2}
        />
        <text
          x={center.x}
          y={center.y + center.r + LABEL_BASE_DY + center.labelDy}
          textAnchor="middle"
          fontSize={15}
          className="fill-[var(--text)]"
          style={{ fontFamily: 'var(--font-serif-cn)' }}
        >
          {center.displayLabel}
        </text>
      </g>
    </svg>
  );
}
