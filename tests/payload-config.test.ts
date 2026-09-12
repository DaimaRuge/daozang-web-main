/**
 * Payload 接入约束：运营账号不得占用前台 users 表。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PayloadAdmins } from '../payload/collections/PayloadAdmins';

test('Payload 运营账号不占用前台 users 表', () => {
  assert.equal(PayloadAdmins.slug, 'payload-admins');
  assert.equal(PayloadAdmins.dbName, 'payload_admins');
  assert.notEqual(PayloadAdmins.slug, 'users');
  assert.equal(PayloadAdmins.auth, true);
});
