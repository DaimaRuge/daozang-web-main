import path from 'path';
import { fileURLToPath } from 'url';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import sharp from 'sharp';
import { PayloadAdmins } from './payload/collections/PayloadAdmins';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * 后台 CMS。表全部进 Postgres schema `payload`，避免 Drizzle push 碰到前台 `users`。
 * 本轮只有运营账号，媒体库与栏目下一增量再加（上传未接 S3 前不要开 upload）。
 */
export default buildConfig({
  admin: {
    user: PayloadAdmins.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: ' · 道可道 CMS',
    },
  },
  collections: [PayloadAdmins],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  graphQL: {
    disable: true,
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    schemaName: 'payload',
  }),
  sharp,
});
