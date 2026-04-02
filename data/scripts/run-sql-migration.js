#!/usr/bin/env node
/**
 * 使用 Postgres 直连执行单个 .sql 迁移文件（用于本地/CI 代跑 Supabase DDL）。
 *
 * 1. 在 Supabase：Project Settings → Database → Connection string → URI
 *    复制连接串，把 [YOUR-PASSWORD] 换成数据库密码（非 anon/service_role）。
 * 2. 在项目根 .env 增加：
 *      DATABASE_URL=postgresql://...
 *    或：
 *      SUPABASE_DATABASE_URL=postgresql://...
 * 3. 运行：npm run migrate:005
 *
 * 敏感信息只放在 .env，不要发到聊天里。
 */

'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const url = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
const sqlRel = process.argv[2] || 'server/migrations/005_routes_engagement.sql';
const sqlPath = path.resolve(__dirname, '../..', sqlRel);

if (!url) {
  console.error(`
未找到 DATABASE_URL / SUPABASE_DATABASE_URL。

请在本机 WeGO 根目录的 .env 中增加（值从 Supabase Dashboard 复制，勿粘贴到聊天）：

  DATABASE_URL=postgresql://postgres.[ref]:[密码]@aws-0-....pooler.supabase.com:6543/postgres

说明：密码是创建项目时设置的 Database password；不是 SUPABASE_ANON_KEY。
若密码含 @ # 等字符，需做 URL 编码后再写入连接串。
`);
  process.exit(1);
}

if (!fs.existsSync(sqlPath)) {
  console.error('找不到 SQL 文件:', sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const { Client } = require('pg');

const useSsl =
  /supabase\.co|pooler\.supabase\.com|amazonaws\.com/i.test(url) ||
  process.env.DATABASE_SSL === 'require';

const client = new Client({
  connectionString: url,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  console.log('执行迁移:', sqlPath);
  await client.connect();
  try {
    await client.query(sql);
    console.log('迁移执行成功。');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('迁移失败:', err.message || err);
  process.exit(1);
});
