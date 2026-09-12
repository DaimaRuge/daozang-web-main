import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getEntryById } from '@/lib/data';
import {
  detectRestoredPresence,
  resolveDaozangImageFile,
  restoredImagesForBook,
} from '@/lib/daozang-images';
import {
  availableVariants,
  imagePairUrls,
  isCalibrationVariant,
  isSafeImageSegment,
  neighboringRestored,
  pickDefaultVariant,
  type CalibrationVariant,
} from '@/lib/restore-calibration';
import CalibrateForm from './CalibrateForm';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ part?: string; file?: string; variant?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const entry = getEntryById(id);
  return { title: entry ? `校定插图 · ${entry.title}` : '插图校定' };
}

const VARIANT_LABEL: Record<CalibrationVariant, string> = {
  cinnabar: '高清朱砂复原',
  ink: '高清墨线复原',
  restored: '高清复原',
};

export default async function CalibratePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const entry = getEntryById(id);
  if (!entry) notFound();

  const part = sp.part?.trim() ?? '';
  const file = sp.file?.trim() ?? '';
  if (!isSafeImageSegment(part) || !isSafeImageSegment(file)) notFound();

  const original = resolveDaozangImageFile(part, file);
  if (!original || original.kind !== 'scan') notFound();

  const presence = detectRestoredPresence(part, file);
  const preferred = isCalibrationVariant(sp.variant) ? sp.variant : 'cinnabar';
  const variant = pickDefaultVariant(presence, preferred);
  const variants = availableVariants(presence);
  const { prev, next } = neighboringRestored(restoredImagesForBook(id), file);
  const hrefFor = (item: { part: string; file: string }, nextVariant = variant) => {
    const qs = new URLSearchParams({ part: item.part, file: item.file });
    if (nextVariant && nextVariant !== 'cinnabar') qs.set('variant', nextVariant);
    return `/text/${id}/calibrate?${qs}`;
  };

  const pair = variant ? imagePairUrls(part, file, variant) : null;
  const callback = `/text/${id}/calibrate?${new URLSearchParams({
    part,
    file,
    ...(variant && variant !== 'cinnabar' ? { variant } : {}),
  }).toString()}`;

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <p className="text-xs text-[var(--muted)]">
          <Link href={`/text/${id}`} className="hover:text-[var(--accent)]">
            《{entry.title}》
          </Link>
          <span className="mx-2">/</span>
          插图校定
        </p>
        <h1 className="text-2xl font-serif tracking-wider mt-1">人工校定</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          左边是原书扫描，右边是高清复原（默认同像素朱砂透明底）。复原为 AI 增强，不是原文。请对照后确认或标为不通过，并可留下备注。
        </p>
        <p className="text-xs text-[var(--muted)] mt-1 font-mono break-all">{file}</p>
      </header>

      {pair && variant ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:gap-6 items-stretch">
            <ComparePane title="原图" src={pair.originalUrl} alt="原书扫描" />
            <ComparePane title={VARIANT_LABEL[variant]} src={pair.restoredUrl} alt={VARIANT_LABEL[variant]} />
          </div>
          <p className="text-xs text-[var(--muted)]">
            两侧同一画幅、同一比例：复原图约缩小三成，原图放大到与之同高，便于对照笔画。点图可看原尺寸文件。
          </p>

          {variants.length > 1 && (
            <p className="flex flex-wrap gap-2 text-sm">
              {variants.map(item => (
                <Link
                  key={item}
                  href={hrefFor({ part, file }, item)}
                  className={`px-3 py-1 rounded-lg border ${
                    item === variant
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {VARIANT_LABEL[item]}
                </Link>
              ))}
            </p>
          )}

          <CalibrateForm
            bookId={id}
            part={part}
            file={file}
            variant={variant}
            loginHref={`/login?callbackUrl=${encodeURIComponent(callback)}`}
          />
        </>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          这张图还没有高清复原，暂时不能做并排校定。
          <Link href={`/text/${id}`} className="ml-2 text-[var(--accent)] hover:underline">
            返回阅读
          </Link>
        </p>
      )}

      <nav className="flex flex-wrap gap-4 text-sm pt-2">
        {prev && (
          <Link href={hrefFor(prev)} className="text-[var(--muted)] hover:text-[var(--accent)]">
            ← 上一张已复原
          </Link>
        )}
        {next && (
          <Link href={hrefFor(next)} className="text-[var(--muted)] hover:text-[var(--accent)]">
            下一张已复原 →
          </Link>
        )}
        <Link href={`/text/${id}`} className="text-[var(--muted)] hover:text-[var(--accent)]">
          返回阅读页
        </Link>
      </nav>
    </div>
  );
}

/** 两侧同一画幅：原像素小图放大、复原图约按 75vh 的七成显示，object-contain 保持比例。 */
function ComparePane({ title, src, alt }: { title: string; src: string; alt: string }) {
  return (
    <figure className="flex min-h-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <p className="text-xs text-[var(--muted)] mb-2">{title}</p>
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="flex h-[52vh] max-h-[36rem] w-full items-center justify-center"
      >
        <img src={src} alt={alt} className="h-full w-auto max-w-full object-contain" />
      </a>
    </figure>
  );
}
