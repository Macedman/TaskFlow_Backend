-- ==========================================
-- ATTACHMENT FILES: the bytes of each uploaded PDF, kept in the database
-- Safe to run on a database that already has data: it only adds a constraint and a table.
-- ==========================================

-- storage_key is a random UUID we generate, so it is already unique; this makes Postgres
-- guarantee it, which the foreign key below needs
ALTER TABLE card_attachments
    ADD CONSTRAINT card_attachments_storage_key_key UNIQUE (storage_key);

-- One row per PDF attachment. ON DELETE CASCADE: deleting the attachment, or the card,
-- list or board above it, deletes the file in the same statement, so no file is ever
-- left behind and no attachment ever points at a missing file
CREATE TABLE IF NOT EXISTS attachment_files (
    storage_key TEXT PRIMARY KEY REFERENCES card_attachments(storage_key) ON DELETE CASCADE,
    data BYTEA NOT NULL
);
