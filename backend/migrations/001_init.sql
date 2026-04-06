create extension if not exists "uuid-ossp";
create extension if not exists postgis;
create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists app_users (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  password_hash text not null,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

create table if not exists routes (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  duration_minutes int,
  tags text[] not null default '{}',
  category text,
  city_adcode text,
  cover_image text,
  thumbnail_image text,
  total_distance_km numeric(8,2),
  heat_level int,
  heat_count int not null default 0,
  is_visible boolean not null default true,
  published_version int not null default 0,
  last_published_at timestamptz,
  draft_saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists spots (
  id uuid primary key default uuid_generate_v4(),
  route_id uuid not null references routes(id) on delete cascade,
  name text not null,
  subtitle text,
  short_desc text,
  detail text,
  rich_content text,
  tags text[] not null default '{}',
  thumb text,
  photos jsonb not null default '[]'::jsonb,
  lat double precision not null,
  lng double precision not null,
  geofence_radius_m int not null default 30,
  estimated_stay_min int,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  is_easter_egg boolean not null default false,
  spot_type text not null default 'attraction',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_checkins (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references app_users(id) on delete cascade,
  spot_id uuid not null references spots(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  photos jsonb not null default '[]'::jsonb,
  ai_summary text,
  created_at timestamptz not null default now()
);

create table if not exists route_drafts (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null unique,
  source_file text,
  file_type text,
  raw_content text,
  status text not null default 'pending_review',
  parsed_data jsonb,
  gap_items jsonb not null default '[]'::jsonb,
  user_overrides jsonb not null default '[]'::jsonb,
  confirmed_data jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists route_versions (
  id uuid primary key default uuid_generate_v4(),
  route_id uuid not null references routes(id) on delete cascade,
  version_number int not null,
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  unique(route_id, version_number)
);

create table if not exists home_carousel_configs (
  config_key text primary key,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists home_carousel_city_groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists home_carousel_city_group_members (
  group_id uuid not null references home_carousel_city_groups(id) on delete cascade,
  city_adcode text not null unique,
  created_at timestamptz not null default now(),
  primary key(group_id, city_adcode)
);

create table if not exists app_public_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_chunks (
  id uuid primary key default uuid_generate_v4(),
  spot_id uuid references spots(id) on delete set null,
  chunk_text text not null,
  chunk_type text not null default 'note',
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_spots_route_sort on spots(route_id, sort_order);
create index if not exists idx_routes_city on routes(city_adcode);
create index if not exists idx_knowledge_text on knowledge_chunks using gin (chunk_text gin_trgm_ops);

insert into app_public_settings(setting_key, setting_value)
values ('map_engine', 'amap')
on conflict (setting_key) do nothing;

insert into home_carousel_configs(config_key, items)
values ('general', '[]'::jsonb)
on conflict (config_key) do nothing;
