-- Only the public URL is stored here; credentials stay in the existing Vault entry.
do $$
begin
  if not exists(select 1 from vault.secrets where name='covra_indexer_url') then
    perform vault.create_secret('https://covra-lyart.vercel.app/api/indexer/sync', 'covra_indexer_url');
  end if;
end $$;
