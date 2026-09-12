import type { CollectionConfig } from 'payload';

/**
 * Payload 运营账号。
 * 故意不用 slug `users`：那张表属于前台 Auth.js，两套账号不打通。
 */
export const PayloadAdmins: CollectionConfig = {
  slug: 'payload-admins',
  dbName: 'payload_admins',
  auth: true,
  admin: {
    useAsTitle: 'email',
    group: '系统',
  },
  labels: {
    singular: 'CMS 账号',
    plural: 'CMS 账号',
  },
  versions: false,
  fields: [
    {
      name: 'name',
      type: 'text',
      label: '显示名',
    },
  ],
};
