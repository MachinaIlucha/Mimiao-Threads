CREATE TABLE growth_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, text text NOT NULL, url text, author text NOT NULL DEFAULT '',
 kind text NOT NULL CHECK(kind IN ('public','founder','customer','demo')), hypothesis text NOT NULL CHECK(hypothesis IN ('transition','accounting')),
 published_at timestamptz, activity_at timestamptz, confirmed boolean NOT NULL DEFAULT false, permission boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE replies ADD COLUMN draft_reason text NOT NULL DEFAULT '';
ALTER TABLE replies ADD COLUMN drafted_at timestamptz;
ALTER TABLE posts ADD COLUMN evidence_id uuid REFERENCES growth_sources(id);
ALTER TABLE posts ADD COLUMN hypothesis text CHECK(hypothesis IN ('transition','accounting'));
CREATE TABLE growth_schools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, name text NOT NULL, qualified boolean NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE growth_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES growth_schools(id),
 stage text NOT NULL CHECK(stage IN ('conversation','registered','activated','paid','renewed','lost')), happened_at timestamptz NOT NULL,
 attribution text NOT NULL CHECK(attribution IN ('tracked','reported','unknown')), source text NOT NULL DEFAULT '', content_id text NOT NULL DEFAULT '', proof text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(school_id,stage)
);
-- Review the old generated queue before using the new editorial workflow.
INSERT INTO revisions(post_id,revision,snapshot,reason)
 SELECT id,revision,to_jsonb(posts),'Переход на согласование владельцем' FROM posts WHERE generated AND status='scheduled'
 ON CONFLICT DO NOTHING;
UPDATE posts SET status='draft',revision=revision+1,error='Нужны источник и проверка владельца',updated_at=now() WHERE generated AND status='scheduled';
UPDATE settings SET value=value||'{"dailyCount":1,"weeklyCount":5,"adaptive":false}'::jsonb,updated_at=now();
