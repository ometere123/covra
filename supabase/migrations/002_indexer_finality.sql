-- Track canonical block hashes for fail-closed reorg detection.
alter table indexer_cursors add column if not exists last_block_hash text;

