-- LootRadar recommendation data schema (Postgres/Supabase)

create table if not exists games (
  id bigserial primary key,
  canonical_title text not null,
  rawg_id bigint unique,
  slug text,
  released date,
  rawg_rating numeric,
  rawg_ratings_count int,
  metacritic int,
  genres text[] default '{}',
  tags text[] default '{}',
  platforms text[] default '{}',
  background_image text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists game_external_ids (
  game_id bigint not null references games(id) on delete cascade,
  source text not null,                 -- cheapshark|steam|rawg|igdb
  external_id text not null,
  primary key (source, external_id)
);

create table if not exists deals (
  deal_id text primary key,
  game_id bigint references games(id) on delete set null,
  store_id text not null,
  title text not null,
  sale_price numeric,
  normal_price numeric,
  savings numeric,
  steam_app_id text,
  steam_rating_percent int,
  steam_rating_count int,
  steam_rating_text text,
  deal_rating numeric,
  thumb text,
  seen_at timestamptz default now()
);

create table if not exists user_profiles (
  user_id text primary key,
  budget numeric default 30,
  min_rating int default 70,
  min_discount int default 20,
  preferred_genres text[] default '{}',
  updated_at timestamptz default now()
);

create table if not exists user_feedback (
  user_id text not null,
  deal_id text not null references deals(deal_id) on delete cascade,
  action text not null check (action in ('like','dislike','played')),
  created_at timestamptz default now(),
  primary key (user_id, deal_id)
);

create index if not exists idx_games_title on games using gin (to_tsvector('english', canonical_title));
create index if not exists idx_deals_seen_at on deals (seen_at desc);
create index if not exists idx_deals_game_id on deals (game_id);
