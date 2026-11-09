-- Owner decision 2026-11-09: posts publish by default without per-post approval.
-- Clear the stored pause once; the owner can still pause again in the interface.
UPDATE settings SET value=jsonb_set(value,'{paused}','false'::jsonb),updated_at=now() WHERE id=1;
