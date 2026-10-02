-- Supabase の SQL Editor で実行する。
-- すべてのテーブルで RLS を有効にし、ポリシーは作らない（シークレットキー以外から読み書きできない）。

create table articles (
  id bigint generated always as identity primary key,
  link text not null unique,
  title text not null,
  snippet text not null default '',
  source_id text not null,
  source_name text not null,
  role text not null,
  bookmarks integer,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  summary text,                -- AIの要約（3行以内）
  keywords jsonb,              -- [{ "term": "用語", "explanation": "解説" }]
  reason text,                 -- おすすめ理由
  recommended_on date,         -- どの日のおすすめか（日本時間の日付）
  favorite boolean not null default false,
  read_later boolean not null default false,
  opened_at timestamptz,       -- 最後に記事を開いた日時
  tags text[]                  -- 記事のタグ（要約していない記事にも付ける）
);
create index articles_published_at_idx on articles (published_at desc);
create index articles_favorite_idx on articles (favorite) where favorite;
create index articles_read_later_idx on articles (read_later) where read_later;
create index articles_tags_idx on articles using gin (tags);
alter table articles enable row level security;

create table daily_digests (
  date date primary key,
  overview text not null,
  highlights jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table daily_digests enable row level security;

create table study_ideas (
  date date primary key,
  ideas jsonb not null default '[]',  -- [{ title, why, steps: string[], time, articleIds: number[] }]
  created_at timestamptz not null default now()
);
alter table study_ideas enable row level security;

create table run_logs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  trigger text not null,            -- cron / button / api
  target_date date,
  status text not null default 'running',  -- running / success / failed
  fetched integer, inserted integer, tagged integer, recommended integer,
  message text, error text
);

create table gemini_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  run_id bigint references run_logs (id) on delete set null,
  purpose text not null,            -- select / summarize / digest / tag / ideas
  model text not null,
  attempt integer not null,
  status text not null,             -- ok / busy / missing / error
  error_code text,
  duration_ms integer not null
);

create table feed_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  run_id bigint references run_logs (id) on delete set null,
  source_id text not null, source_name text not null,
  ok boolean not null, items integer not null default 0,
  duration_ms integer not null, error text
);

create index run_logs_started_at_idx on run_logs (started_at desc);
create index gemini_logs_created_at_idx on gemini_logs (created_at desc);
create index feed_logs_created_at_idx on feed_logs (created_at desc);
alter table run_logs enable row level security;
alter table gemini_logs enable row level security;
alter table feed_logs enable row level security;
