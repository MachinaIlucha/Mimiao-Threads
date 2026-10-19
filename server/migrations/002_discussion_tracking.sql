ALTER TABLE replies ADD COLUMN kind text NOT NULL DEFAULT 'incoming';
ALTER TABLE replies ADD COLUMN sending_at timestamptz;
