-- ==========================================
-- CARD ATTACHMENTS: pasted links and PDFs
-- Safe to run on a database that already has data: it only adds a table.
-- ==========================================

CREATE TABLE IF NOT EXISTS card_attachments (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('link', 'pdf')),
    name VARCHAR(255),        -- display text; optional for a link, the file name for a PDF
    url TEXT,                 -- links only
    storage_key TEXT,         -- PDFs only: where the file is stored
    size_bytes INTEGER,       -- PDFs only
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- each row is a complete link or a complete PDF, never half of each
    CHECK (
        (kind = 'link' AND url IS NOT NULL AND storage_key IS NULL)
        OR (kind = 'pdf' AND storage_key IS NOT NULL AND url IS NULL AND name IS NOT NULL)
    )
);

-- getAttachments reads one card's attachments newest first
CREATE INDEX IF NOT EXISTS card_attachments_card_id_created_at_idx
    ON card_attachments (card_id, created_at DESC);
