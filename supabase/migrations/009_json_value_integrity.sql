-- Repair only legacy double-encoded values. Normal objects/arrays are unchanged.
update agent_credentials set scopes=(scopes #>> '{}')::jsonb where jsonb_typeof(scopes)='string';
update claims set evidence_urls=(evidence_urls #>> '{}')::jsonb where jsonb_typeof(evidence_urls)='string';
update policy_risk_specs set risk_spec_json=(risk_spec_json #>> '{}')::jsonb where jsonb_typeof(risk_spec_json)='string';
update evidence_issuer_observations set envelope=(envelope #>> '{}')::jsonb where jsonb_typeof(envelope)='string';
update claim_chain_events set payload=(payload #>> '{}')::jsonb where jsonb_typeof(payload)='string';
update indexer_runs set metadata=(metadata #>> '{}')::jsonb where jsonb_typeof(metadata)='string';
alter table agent_credentials add constraint agent_scopes_array check (jsonb_typeof(scopes)='array');
alter table claims add constraint claim_evidence_urls_array check (jsonb_typeof(evidence_urls)='array');
alter table policy_risk_specs add constraint policy_risk_json_object check (jsonb_typeof(risk_spec_json)='object');
alter table evidence_issuer_observations add constraint issuer_envelope_object check (jsonb_typeof(envelope)='object');
alter table claim_chain_events add constraint chain_event_payload_object check (jsonb_typeof(payload)='object');
alter table indexer_runs add constraint indexer_metadata_object check (jsonb_typeof(metadata)='object');
