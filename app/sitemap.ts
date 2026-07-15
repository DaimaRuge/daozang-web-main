import { getIndex } from '@/lib/data';
import type { MetadataRoute } from 'next';

const BASE_URL = 'https://daozang.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const index = getIndex();
  
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'monthly', priority: 1.0 },
    { url: `${BASE_URL}/catalog`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/search`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.5 },
  ];

  // Add all text pages
  const textPages: MetadataRoute.Sitemap = index.entries.map(entry => ({
    url: `${BASE_URL}/text/${entry.id}`,
    lastModified: new Date(),
    changeFrequency: 'yearly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...textPages];
}
