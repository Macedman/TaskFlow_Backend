-- User
INSERT INTO users (full_name, email, password_hash)
VALUES (
    'Eugene',
    'eugene@example.com',
    '$2b$10$examplehashedpassword'
);

-- Board
INSERT INTO boards (name, owner_id)
VALUES (
    'TaskFlow',
    1
);

-- Board Member
INSERT INTO board_members (board_id, user_id, role)
VALUES
(1, 1, 'admin');

-- Lists
INSERT INTO lists (board_id, name, position)
VALUES
(1, 'To Do', 0),
(1, 'In Progress', 1),
(1, 'Done', 2);

-- Cards
INSERT INTO cards (list_id, title, description, position)
VALUES
(1, 'Build Login', 'Implement JWT authentication', 0),
(1, 'Create Dashboard', 'Display all boards', 1),
(2, 'Setup PostgreSQL', 'Configure Docker database', 0);

-- Card Assignees
INSERT INTO card_assignees (card_id, user_id)
VALUES
(1, 1),
(2, 1),
(3, 1);