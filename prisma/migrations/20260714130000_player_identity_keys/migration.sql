-- The initial player-identity migration is already applied in production under
-- 20260713120000_player_identity_keys. This follow-up drops the legacy name
-- uniqueness constraint so draft rows are identified by stable IDs instead.
DROP INDEX "Player_name_draftId_key";
CREATE INDEX "Player_name_draftId_idx" ON "Player"("name", "draftId");
