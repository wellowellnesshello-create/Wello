-- Admin AI extraction log.
--
-- Every call to the extract-sessions edge function logs one row here so we
-- can grade the model's output before shipping any partner-facing version
-- of this flow. Keeps raw JSON + input kind so we can rebuild the case if
-- the review UI mangles anything downstream.

create table if not exists admin_extractions (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  business_id bigint references businesses(id) on delete set null,
  input_kind  text not null check (input_kind in ('image','pdf','text')),
  model       text not null,
  raw_json    jsonb,
  raw_text    text,
  error       text
);

create index if not exists admin_extractions_business_id_idx
  on admin_extractions (business_id, created_at desc);
