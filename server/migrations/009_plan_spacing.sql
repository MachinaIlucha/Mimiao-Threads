-- A compact manual plan applies only to its own posts on its own calendar day.
-- Regular plans and unrelated manually scheduled posts retain ninety minutes.
ALTER TABLE daily_plans ADD COLUMN min_interval_minutes integer NOT NULL DEFAULT 90
 CHECK (min_interval_minutes IN (60,90));
