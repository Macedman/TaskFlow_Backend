-- ==========================================
-- CARD COMMENTS: track edits
-- Safe to run on a database that already has data: it only adds a column.
-- NULL means the comment was never edited; existing comments stay NULL.
-- ==========================================

ALTER TABLE card_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
