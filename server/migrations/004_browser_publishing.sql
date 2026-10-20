ALTER TABLE posts ADD COLUMN publication_method text NOT NULL DEFAULT 'api' CHECK (publication_method IN ('api','browser'));
ALTER TABLE publish_attempts ADD COLUMN transport text NOT NULL DEFAULT 'api' CHECK (transport IN ('api','browser'));
ALTER TABLE publish_attempts ADD COLUMN browser_baseline jsonb;
ALTER TABLE publish_attempts ADD COLUMN sending_at timestamptz;
CREATE TABLE browser_status (
 id integer PRIMARY KEY CHECK (id=1),
 state text NOT NULL,
 message text NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now()
);
