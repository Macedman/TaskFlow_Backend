-- ==========================================
-- CARD COMMENTS
-- Safe to run on a database that already has data: it only adds a table.
-- ==========================================

CREATE TABLE IF NOT EXISTS card_comments (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- getComments reads one card's comments newest first
CREATE INDEX IF NOT EXISTS card_comments_card_id_created_at_idx
    ON card_comments (card_id, created_at DESC);
