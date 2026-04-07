const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { query, tx } = require('./db');
const { config } = require('./config');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashPassword,
  verifyPassword,
  requireAuth,
  requireAdmin,
} = require('./auth');
const { publish, subscribe } = require('./events');

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use('/storage', express.static(path.resolve(config.uploadRoot, '..')));

fs.mkdirSync(config.uploadRoot, { recursive: true });
const upload = multer({ dest: config.uploadRoot });

function toApiError(res, err, status = 500) {
  const message = err?.message || 'Internal server error';
  return res.status(status).json({ error: message });
}

async function runAgent(pathname, payload) {
  const base = process.env.AGENT_BASE_URL || 'http://127.0.0.1:8000';
  const res = await fetch(`${base}/${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agent ${pathname} failed (${res.status}): ${text}`);
  }
  return res.json();
}

app.get('/healthz', async (_req, res) => {
  await query('select 1');
  return res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = req.body.role === 'admin' ? 'admin' : 'user';
    if (!email || !password) return res.status(400).json({ error: 'email/password required' });
    const passhash = await hashPassword(password);
    const r = await query(
      'insert into app_users(email, password_hash, role) values ($1, $2, $3) returning id, email, role',
      [email, passhash, role]
    );
    const user = r.rows[0];
    return res.status(201).json({
      user,
      access_token: signAccessToken(user),
      refresh_token: signRefreshToken(user),
    });
  } catch (err) {
    return toApiError(res, err, 400);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const r = await query('select id, email, role, password_hash from app_users where email = $1', [email]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    return res.json({
      user: { id: user.id, email: user.email, role: user.role },
      access_token: signAccessToken(user),
      refresh_token: signRefreshToken(user),
    });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const token = String(req.body.refresh_token || '');
    if (!token) return res.status(400).json({ error: 'refresh_token required' });
    const payload = verifyRefreshToken(token);
    const r = await query('select id, email, role from app_users where id = $1', [payload.sub]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });
    return res.json({
      access_token: signAccessToken(user),
      refresh_token: signRefreshToken(user),
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

app.get('/api/routes', async (req, res) => {
  try {
    const { tag, city_adcode, search } = req.query;
    const values = [];
    const where = ['is_visible = true'];
    if (tag) {
      values.push(`%${tag}%`);
      where.push(`array_to_string(tags, ',') ilike $${values.length}`);
    }
    if (city_adcode) {
      values.push(city_adcode);
      where.push(`city_adcode = $${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      where.push(`title ilike $${values.length}`);
    }
    const sql = `select * from routes where ${where.join(' and ')} order by created_at desc`;
    const r = await query(sql, values);
    return res.json(r.rows);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/routes/:id', async (req, res) => {
  try {
    const r = await query('select * from routes where id = $1 and is_visible = true', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Route not found' });
    return res.json(r.rows[0]);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/routes/:id/spots', async (req, res) => {
  try {
    const r = await query(
      'select * from spots where route_id = $1 and is_visible = true and is_easter_egg = false order by sort_order asc',
      [req.params.id]
    );
    return res.json(r.rows);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/routes/:id/full', async (req, res) => {
  try {
    const route = await query('select * from routes where id = $1', [req.params.id]);
    if (!route.rows[0]) return res.status(404).json({ error: 'Route not found' });
    const spots = await query('select * from spots where route_id = $1 order by sort_order asc', [req.params.id]);
    return res.json({ ...route.rows[0], spots: spots.rows });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/checkins', requireAuth, async (req, res) => {
  try {
    const { spot_id, lat, lng, photos, ai_summary } = req.body || {};
    const r = await query(
      `insert into user_checkins(user_id, spot_id, lat, lng, photos, ai_summary)
       values ($1, $2, $3, $4, $5::jsonb, $6) returning *`,
      [req.auth.sub, spot_id, lat, lng, JSON.stringify(photos || []), ai_summary || null]
    );
    const row = r.rows[0];
    publish('checkins', row);
    return res.status(201).json(row);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/checkins', requireAuth, async (req, res) => {
  try {
    const r = await query(
      'select * from user_checkins where user_id = $1 order by created_at desc',
      [req.auth.sub]
    );
    return res.json(r.rows);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/realtime/checkins', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const unsub = subscribe('checkins', (payload) => {
    if (payload.user_id !== req.auth.sub) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });
  req.on('close', () => unsub());
});

app.get('/api/settings/map-engine', async (_req, res) => {
  try {
    const r = await query(
      `select setting_value from app_public_settings where setting_key='map_engine' limit 1`
    );
    return res.json({ setting_value: r.rows[0]?.setting_value || 'amap' });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/carousel', async (req, res) => {
  try {
    const adcode = String(req.query.city_adcode || '').replace(/\D/g, '').slice(-6);
    if (adcode) {
      const cityKey = `city:${adcode}`;
      const city = await query('select items from home_carousel_configs where config_key=$1', [cityKey]);
      if (city.rows[0]) return res.json({ items: city.rows[0].items || [], configKey: cityKey, mode: 'city' });
    }
    const gen = await query("select items from home_carousel_configs where config_key='general'");
    return res.json({ items: gen.rows[0]?.items || [], configKey: 'general', mode: 'general' });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/storage/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const filename = `${Date.now()}-${req.file.originalname || req.file.filename}`;
  const target = path.resolve(config.uploadRoot, filename);
  fs.renameSync(req.file.path, target);
  const base = config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
  return res.status(201).json({ url: `${base}/storage/images/${filename}` });
});

// Admin APIs
app.get('/api/admin/routes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { search = '', city_adcode = '', is_visible, page = '1', pageSize = '20' } = req.query;
    const where = [];
    const values = [];
    if (search) {
      values.push(`%${search}%`);
      where.push(`title ilike $${values.length}`);
    }
    if (city_adcode) {
      values.push(String(city_adcode));
      where.push(`city_adcode = $${values.length}`);
    }
    if (is_visible === 'true' || is_visible === 'false') {
      values.push(is_visible === 'true');
      where.push(`is_visible = $${values.length}`);
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const p = Number.parseInt(page, 10) || 1;
    const size = Number.parseInt(pageSize, 10) || 20;
    values.push(size, (p - 1) * size);
    const data = await query(
      `select * from routes ${whereSql} order by created_at desc limit $${values.length - 1} offset $${values.length}`,
      values
    );
    const count = await query(`select count(*)::int as c from routes ${whereSql}`, values.slice(0, values.length - 2));
    return res.json({ data: data.rows, total: count.rows[0].c, page: p, pageSize: size });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/admin/routes/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const route = await query('select * from routes where id = $1', [req.params.id]);
    if (!route.rows[0]) return res.status(404).json({ error: 'Route not found' });
    const spots = await query('select * from spots where route_id = $1 order by sort_order asc', [req.params.id]);
    return res.json({ ...route.rows[0], spots: spots.rows });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/admin/routes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const r = await query(
      `insert into routes(title, description, tags, city_adcode, cover_image, is_visible)
       values ($1,$2,$3::text[],$4,$5,$6) returning *`,
      [body.title || '未命名路线', body.description || null, body.tags || [], body.city_adcode || null, body.cover_image || null, body.is_visible !== false]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.patch('/api/admin/routes/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const patch = req.body || {};
    const fields = Object.keys(patch).filter((k) => !['published_version', 'last_published_at', 'heat_level', 'heat_count'].includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No updatable fields' });
    const values = [];
    const sets = fields.map((k) => {
      values.push(patch[k]);
      return `${k} = $${values.length}`;
    });
    values.push(new Date().toISOString(), req.params.id);
    sets.push(`updated_at = $${values.length - 1}`, `draft_saved_at = $${values.length - 1}`);
    const r = await query(`update routes set ${sets.join(', ')} where id = $${values.length} returning *`, values);
    return res.json(r.rows[0]);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.delete('/api/admin/routes/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await query('delete from routes where id = $1', [req.params.id]);
    return res.json({ id: req.params.id });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/admin/routes/:id/versions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await query(
      'select id, version_number, published_at from route_versions where route_id = $1 order by version_number desc',
      [req.params.id]
    );
    return res.json(r.rows);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/admin/routes/:id/publish', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await tx(async (client) => {
      const routeRes = await client.query('select * from routes where id = $1', [req.params.id]);
      const route = routeRes.rows[0];
      const spotRes = await client.query('select * from spots where route_id = $1 order by sort_order asc', [req.params.id]);
      const spots = spotRes.rows;
      const version = (route.published_version || 0) + 1;
      const snapshot = {
        id: route.id,
        title: route.title,
        description: route.description || '',
        duration_minutes: route.duration_minutes || null,
        tags: route.tags || [],
        category: route.category || '',
        city_adcode: route.city_adcode || '',
        cover_image: route.cover_image || '',
        thumbnail_image: route.thumbnail_image || '',
        is_visible: route.is_visible !== false,
        published_version: version,
        last_published_at: new Date().toISOString(),
        total_distance_km: route.total_distance_km || null,
        spots,
      };
      await client.query(
        'insert into route_versions(route_id, version_number, snapshot) values ($1,$2,$3::jsonb)',
        [route.id, version, JSON.stringify(snapshot)]
      );
      const upd = await client.query(
        'update routes set published_version=$1,last_published_at=now(),updated_at=now() where id=$2 returning *',
        [version, route.id]
      );
      return { route: upd.rows[0], version, snapshot };
    });
    return res.json(result);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/admin/routes/:id/spots', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await query('select * from spots where route_id = $1 order by sort_order asc', [req.params.id]);
    return res.json(r.rows);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/admin/spots', requireAuth, requireAdmin, async (req, res) => {
  try {
    const p = req.body || {};
    const r = await query(
      `insert into spots(route_id, name, subtitle, short_desc, detail, rich_content, tags, thumb, photos, lat, lng,
       geofence_radius_m, estimated_stay_min, sort_order, is_visible, is_easter_egg, spot_type)
       values ($1,$2,$3,$4,$5,$6,$7::text[],$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,
      [p.route_id, p.name, p.subtitle || '', p.short_desc || '', p.detail || '', p.rich_content || p.detail || '', p.tags || [], p.thumb || '', JSON.stringify(p.photos || []), p.lat, p.lng, p.geofence_radius_m ?? 30, p.estimated_stay_min ?? null, p.sort_order ?? 0, p.is_visible !== false, !!p.is_easter_egg, p.spot_type || 'attraction']
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.patch('/api/admin/spots/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const patch = req.body || {};
    const fields = Object.keys(patch);
    if (!fields.length) return res.status(400).json({ error: 'No fields' });
    const values = [];
    const sets = fields.map((k) => {
      values.push(patch[k]);
      return `${k} = $${values.length}`;
    });
    values.push(req.params.id);
    const r = await query(`update spots set ${sets.join(', ')}, updated_at=now() where id = $${values.length} returning *`, values);
    return res.json(r.rows[0]);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.delete('/api/admin/spots/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await query('delete from spots where id = $1', [req.params.id]);
    return res.json({ id: req.params.id });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/admin/carousel-configs', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const r = await query('select config_key, items, updated_at from home_carousel_configs order by config_key asc');
    return res.json(r.rows);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.put('/api/admin/carousel-configs/:configKey', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await query(
      `insert into home_carousel_configs(config_key, items) values ($1, $2::jsonb)
       on conflict(config_key) do update set items = excluded.items, updated_at = now()
       returning *`,
      [req.params.configKey, JSON.stringify(req.body.items || [])]
    );
    return res.json(r.rows[0]);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.delete('/api/admin/carousel-configs/:configKey', requireAuth, requireAdmin, async (req, res) => {
  try {
    await query('delete from home_carousel_configs where config_key = $1', [req.params.configKey]);
    return res.json({ config_key: req.params.configKey });
  } catch (err) {
    return toApiError(res, err);
  }
});

async function listCarouselCityGroupsWithMembers() {
  const groups = await query(
    'select id, name, created_at from home_carousel_city_groups order by created_at asc'
  );
  const members = await query(
    'select group_id, city_adcode from home_carousel_city_group_members'
  );
  const map = new Map();
  for (const g of groups.rows) {
    map.set(g.id, { id: g.id, name: g.name || '', created_at: g.created_at, city_adcodes: [] });
  }
  for (const m of members.rows) {
    const row = map.get(m.group_id);
    if (row) row.city_adcodes.push(m.city_adcode);
  }
  for (const row of map.values()) row.city_adcodes.sort();
  return [...map.values()];
}

app.get('/api/admin/carousel-city-groups', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = await listCarouselCityGroupsWithMembers();
    return res.json(rows);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/admin/carousel-city-groups', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name ?? '');
    const uniq = [...new Set((req.body?.city_adcodes || []).map((x) => String(x)).filter(Boolean))];
    if (!uniq.length) return res.status(400).json({ error: '至少需要一个城市' });
    const taken = await query(
      'select city_adcode from home_carousel_city_group_members where city_adcode = any($1::text[])',
      [uniq]
    );
    if (taken.rows.length) {
      return res.status(409).json({ error: `以下城市已在其他组合中：${taken.rows.map((r) => r.city_adcode).join(', ')}` });
    }
    const result = await tx(async (client) => {
      let items = [];
      for (const ad of uniq) {
        const row = await client.query(
          'select items from home_carousel_configs where config_key = $1',
          [`city:${ad}`]
        );
        if (Array.isArray(row.rows[0]?.items) && row.rows[0].items.length) {
          items = row.rows[0].items;
          break;
        }
      }
      const grp = await client.query(
        `insert into home_carousel_city_groups(name) values($1) returning id, name, created_at`,
        [name]
      );
      const group = grp.rows[0];
      for (const ad of uniq) {
        await client.query(
          'insert into home_carousel_city_group_members(group_id, city_adcode) values ($1, $2)',
          [group.id, ad]
        );
        await client.query(
          `insert into home_carousel_configs(config_key, items) values ($1, $2::jsonb)
           on conflict(config_key) do update set items = excluded.items, updated_at = now()`,
          [`city:${ad}`, JSON.stringify(items)]
        );
      }
      return { ...group, city_adcodes: uniq };
    });
    return res.status(201).json(result);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.patch('/api/admin/carousel-city-groups/:groupId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name ?? '');
    await query('update home_carousel_city_groups set name = $1 where id = $2', [name, req.params.groupId]);
    return res.json({ id: req.params.groupId, name });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.put('/api/admin/carousel-city-groups/:groupId/items', requireAuth, requireAdmin, async (req, res) => {
  try {
    const items = req.body?.items || [];
    const members = await query(
      'select city_adcode from home_carousel_city_group_members where group_id = $1',
      [req.params.groupId]
    );
    if (!members.rows.length) return res.status(400).json({ error: '该组合内没有城市，无法保存' });
    await tx(async (client) => {
      for (const m of members.rows) {
        await client.query(
          `insert into home_carousel_configs(config_key, items) values ($1, $2::jsonb)
           on conflict(config_key) do update set items = excluded.items, updated_at = now()`,
          [`city:${m.city_adcode}`, JSON.stringify(items)]
        );
      }
    });
    return res.json({ group_id: req.params.groupId, city_count: members.rows.length });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/admin/carousel-city-groups/:groupId/cities', requireAuth, requireAdmin, async (req, res) => {
  try {
    const cityAdcode = String(req.body?.city_adcode || '');
    if (!cityAdcode) return res.status(400).json({ error: '未选择城市' });
    const clash = await query(
      'select group_id from home_carousel_city_group_members where city_adcode = $1',
      [cityAdcode]
    );
    if (clash.rows[0] && clash.rows[0].group_id !== req.params.groupId) {
      return res.status(409).json({ error: `城市 ${cityAdcode} 已属于其他组合` });
    }
    if (clash.rows[0] && clash.rows[0].group_id === req.params.groupId) {
      return res.json({ ok: true });
    }
    await tx(async (client) => {
      const first = await client.query(
        'select city_adcode from home_carousel_city_group_members where group_id = $1 limit 1',
        [req.params.groupId]
      );
      let items = [];
      if (first.rows[0]?.city_adcode) {
        const cfg = await client.query(
          'select items from home_carousel_configs where config_key = $1',
          [`city:${first.rows[0].city_adcode}`]
        );
        items = cfg.rows[0]?.items || [];
      }
      await client.query(
        'insert into home_carousel_city_group_members(group_id, city_adcode) values ($1, $2)',
        [req.params.groupId, cityAdcode]
      );
      await client.query(
        `insert into home_carousel_configs(config_key, items) values ($1, $2::jsonb)
         on conflict(config_key) do update set items = excluded.items, updated_at = now()`,
        [`city:${cityAdcode}`, JSON.stringify(items)]
      );
    });
    return res.status(201).json({ group_id: req.params.groupId, city_adcode: cityAdcode });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.delete('/api/admin/carousel-city-groups/:groupId/cities/:cityAdcode', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { groupId, cityAdcode } = req.params;
    await tx(async (client) => {
      await client.query(
        'delete from home_carousel_city_group_members where group_id = $1 and city_adcode = $2',
        [groupId, cityAdcode]
      );
      await client.query('delete from home_carousel_configs where config_key = $1', [`city:${cityAdcode}`]);
      const left = await client.query(
        'select city_adcode from home_carousel_city_group_members where group_id = $1',
        [groupId]
      );
      if (!left.rows.length) {
        await client.query('delete from home_carousel_city_groups where id = $1', [groupId]);
      }
    });
    return res.json({ group_id: groupId, city_adcode: cityAdcode });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.delete('/api/admin/carousel-city-groups/:groupId', requireAuth, requireAdmin, async (req, res) => {
  try {
    await tx(async (client) => {
      const members = await client.query(
        'select city_adcode from home_carousel_city_group_members where group_id = $1',
        [req.params.groupId]
      );
      await client.query('delete from home_carousel_city_groups where id = $1', [req.params.groupId]);
      for (const m of members.rows) {
        await client.query('delete from home_carousel_configs where config_key = $1', [`city:${m.city_adcode}`]);
      }
    });
    return res.json({ id: req.params.groupId });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/admin/carousel-city-groups/reconcile', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = await query(
      "select config_key from home_carousel_configs where config_key like 'city:%'"
    );
    const members = await query('select city_adcode from home_carousel_city_group_members');
    const used = new Set(members.rows.map((m) => m.city_adcode));
    let deleted = 0;
    for (const r of rows.rows) {
      const ad = String(r.config_key).replace(/^city:/, '');
      if (!used.has(ad)) {
        await query('delete from home_carousel_configs where config_key = $1', [r.config_key]);
        deleted += 1;
      }
    }
    return res.json({ deleted });
  } catch (err) {
    return toApiError(res, err);
  }
});

// Route ingest replacement
app.post('/api/route-ingest', requireAuth, async (req, res) => {
  try {
    const { session_id, file_content, file_type, source_url } = req.body || {};
    if (!session_id || !file_content || !file_type) return res.status(400).json({ error: 'missing required fields' });
    await query(
      `insert into route_drafts(session_id, source_file, file_type, raw_content, status, gap_items)
       values ($1,$2,$3,$4,'pending_review','[]'::jsonb)
       on conflict(session_id) do nothing`,
      [session_id, source_url || null, file_type, file_content]
    );
    const agentResult = await runAgent('route-upload', { session_id, file_content, file_type });
    const nextStatus = agentResult.status === 'has_gaps' ? 'gaps_filling' : (agentResult.status === 'success' ? 'ready_to_confirm' : 'failed');
    await query(
      `update route_drafts set parsed_data=$1::jsonb, gap_items=$2::jsonb, status=$3, updated_at=now() where session_id=$4`,
      [JSON.stringify(agentResult.route_preview || null), JSON.stringify(agentResult.gaps || []), nextStatus, session_id]
    );
    return res.json({ session_id, ...agentResult });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/route-ingest/:sessionId', requireAuth, async (req, res) => {
  try {
    const r = await query('select status, parsed_data, gap_items, created_at from route_drafts where session_id = $1', [req.params.sessionId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Session not found' });
    return res.json(r.rows[0]);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/route-ingest/:sessionId/gap-reply', requireAuth, async (req, res) => {
  try {
    const result = await runAgent('route-upload/gap-reply', { session_id: req.params.sessionId, overrides: req.body.overrides || [] });
    return res.json(result);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/route-ingest/:sessionId/confirm', requireAuth, async (req, res) => {
  try {
    const result = await runAgent('route-upload/confirm', {
      session_id: req.params.sessionId,
      confirmed: !!req.body.confirmed,
      overrides: req.body.overrides || [],
    });
    await query(
      `update route_drafts set status=$1, user_overrides=$2::jsonb, updated_at=now() where session_id=$3`,
      [req.body.confirmed ? 'confirmed' : 'ready_to_confirm', JSON.stringify(req.body.overrides || []), req.params.sessionId]
    );
    return res.json({ session_id: req.params.sessionId, ...result });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.get('/api/internal/route-drafts/:sessionId', async (req, res) => {
  try {
    if (req.headers['x-internal-token'] !== process.env.INTERNAL_API_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized internal token' });
    }
    const r = await query('select * from route_drafts where session_id = $1', [req.params.sessionId]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Session not found' });
    return res.json(r.rows[0]);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.patch('/api/internal/route-drafts/:sessionId', async (req, res) => {
  try {
    if (req.headers['x-internal-token'] !== process.env.INTERNAL_API_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized internal token' });
    }
    const patch = req.body || {};
    const fields = Object.keys(patch);
    if (!fields.length) return res.status(400).json({ error: 'No fields' });
    const values = [];
    const sets = fields.map((k) => {
      values.push(typeof patch[k] === 'object' && patch[k] !== null ? JSON.stringify(patch[k]) : patch[k]);
      if (typeof patch[k] === 'object' && patch[k] !== null) return `${k} = $${values.length}::jsonb`;
      return `${k} = $${values.length}`;
    });
    values.push(req.params.sessionId);
    const r = await query(`update route_drafts set ${sets.join(', ')}, updated_at=now() where session_id = $${values.length} returning *`, values);
    return res.json(r.rows[0] || null);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/internal/routes/import', async (req, res) => {
  try {
    if (req.headers['x-internal-token'] !== process.env.INTERNAL_API_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized internal token' });
    }
    const data = req.body || {};
    const report = await tx(async (client) => {
      const routePayload = {
        id: data.id || randomUUID(),
        title: data.route_name || data.title || '未命名路线',
        description: data.description || '',
        duration_minutes: data.duration_minutes ?? null,
        tags: data.tags || [],
        cover_image: data.cover_image || null,
        total_distance_km: data.total_distance_km ?? null,
        is_visible: data.is_visible !== false,
      };
      const routeR = await client.query(
        `insert into routes(id,title,description,duration_minutes,tags,cover_image,total_distance_km,is_visible)
         values($1,$2,$3,$4,$5::text[],$6,$7,$8)
         on conflict(id) do update set title=excluded.title,description=excluded.description,duration_minutes=excluded.duration_minutes,
         tags=excluded.tags,cover_image=excluded.cover_image,total_distance_km=excluded.total_distance_km,is_visible=excluded.is_visible,updated_at=now()
         returning id`,
        [routePayload.id, routePayload.title, routePayload.description, routePayload.duration_minutes, routePayload.tags, routePayload.cover_image, routePayload.total_distance_km, routePayload.is_visible]
      );
      const routeId = routeR.rows[0].id;
      const spots = Array.isArray(data.spots) ? data.spots : [];
      const spotIds = [];
      for (let i = 0; i < spots.length; i += 1) {
        const s = spots[i];
        if (!s.name) continue;
        const sid = s.id || randomUUID();
        await client.query(
          `insert into spots(id, route_id, name, subtitle, short_desc, detail, rich_content, tags, thumb, photos, lat, lng,
            geofence_radius_m, estimated_stay_min, sort_order, is_visible, is_easter_egg, spot_type)
           values($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18)
           on conflict(id) do update set route_id=excluded.route_id,name=excluded.name,subtitle=excluded.subtitle,short_desc=excluded.short_desc,
             detail=excluded.detail,rich_content=excluded.rich_content,tags=excluded.tags,thumb=excluded.thumb,photos=excluded.photos,lat=excluded.lat,
             lng=excluded.lng,geofence_radius_m=excluded.geofence_radius_m,estimated_stay_min=excluded.estimated_stay_min,sort_order=excluded.sort_order,
             is_visible=excluded.is_visible,is_easter_egg=excluded.is_easter_egg,spot_type=excluded.spot_type,updated_at=now()`,
          [sid, routeId, s.name, s.subtitle || '', s.short_desc || '', s.detail || '', s.rich_content || s.detail || '', s.tags || [], s.thumb || '', JSON.stringify(s.photos || []), s.lat ?? null, s.lng ?? null, s.geofence_radius_m ?? 30, s.estimated_stay_min ?? null, s.sort_order ?? i, s.is_visible !== false, !!s.is_easter_egg, s.spot_type || 'attraction']
        );
        spotIds.push(sid);
      }
      return { route_id: routeId, spot_ids: spotIds, errors: [] };
    });
    return res.json(report);
  } catch (err) {
    return toApiError(res, err);
  }
});

app.post('/api/knowledge/search', requireAuth, async (req, res) => {
  try {
    const { query: q = '', spot_id } = req.body || {};
    const values = [];
    const where = [];
    if (spot_id) {
      values.push(spot_id);
      where.push(`spot_id = $${values.length}`);
    }
    if (q) {
      values.push(`%${q}%`);
      where.push(`chunk_text ilike $${values.length}`);
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const r = await query(`select * from knowledge_chunks ${whereSql} order by created_at desc limit 5`, values);
    return res.json({ results: r.rows });
  } catch (err) {
    return toApiError(res, err);
  }
});

app.listen(config.port, config.listenHost, () => {
  console.log(`[backend] listening on http://${config.listenHost}:${config.port}`);
});
