-- Owner request: eight posts every day, including weekends, without automatic changes.
UPDATE settings SET value=value||'{"dailyCount":8,"weeklyCount":7,"adaptive":false}'::jsonb,updated_at=now();
-- A previous weekend skip is not a completed eight-post plan. Leave real content intact.
UPDATE daily_plans SET status='failed',attempts=0,updated_at=now()-interval '31 minutes'
 WHERE day>=(now() AT TIME ZONE 'Europe/Kyiv')::date AND status='ready' AND count=0;
