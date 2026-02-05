-- Run this only if the database already exists and has the lands table.
-- It will add password support and enforce unique usernames.

ALTER TABLE lands
  ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE lands
  ADD UNIQUE KEY uniq_lands_username (username);
