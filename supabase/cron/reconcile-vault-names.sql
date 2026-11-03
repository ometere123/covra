-- Server-side copy preserves the existing operator entry. No secret is returned.
do $$
begin
  if not exists (select 1 from vault.secrets where name='covra_indexer_cron_secret') then
    if not exists (select 1 from vault.secrets where name='covra-indexer-secret') then
      raise exception 'Existing operator indexer secret is missing';
    end if;
    perform vault.create_secret(
      (select decrypted_secret from vault.decrypted_secrets where name='covra-indexer-secret'),
      'covra_indexer_cron_secret'
    );
  end if;
end $$;
