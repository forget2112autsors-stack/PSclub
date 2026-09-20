-- Create partial unique index on shift (club_id) where status = 'OPEN'
-- Bu bir vaqtda ikkita ochiq smena paydo bo'lishini (race condition) bazaviy darajada to'xtatadi.
CREATE UNIQUE INDEX IF NOT EXISTS "unique_open_shift_per_club" ON "shift" ("club_id") WHERE "status" = 'OPEN';
