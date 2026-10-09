-- JIVA FLORIST — skema inti tiga entitas untuk PostgreSQL / Supabase.
-- Nilai moneter disimpan dalam rupiah; biaya pembelian langsung per unit
-- mencakup harga beli dan ongkos langsung yang dialokasikan ke produk.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null check (length(trim(category)) between 1 and 80),
  unit text not null default 'batang' check (length(trim(unit)) between 1 and 30),
  reorder_level numeric(14, 3) not null default 0 check (reorder_level >= 0),
  target_margin numeric(5, 4) not null default 0.55 check (target_margin > 0 and target_margin < 0.9),
  selling_price_override numeric(16, 2) check (selling_price_override is null or selling_price_override > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products
  add column if not exists selling_price_override numeric(16, 2)
  check (selling_price_override is null or selling_price_override > 0);

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  purchase_date date not null default (timezone('Asia/Jakarta', now())::date),
  quantity_in numeric(14, 3) not null check (quantity_in > 0),
  quantity_remaining numeric(14, 3) not null check (quantity_remaining >= 0 and quantity_remaining <= quantity_in),
  unit_cost numeric(16, 2) not null check (unit_cost > 0),
  carrying_unit_cost numeric(16, 2) not null check (carrying_unit_cost >= 0 and carrying_unit_cost <= unit_cost),
  supplier text,
  created_at timestamptz not null default now()
);

-- Migrasi aman untuk inventory_batches versi lama. CREATE TABLE IF NOT EXISTS
-- tidak menambahkan kolom ke tabel yang sudah ada.
do $$
declare
  v_has_rows boolean;
  v_has_remaining boolean;
  v_has_legacy_remaining boolean;
  v_has_quantity_in boolean;
  v_has_quantity boolean;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_batches'
      and column_name = 'product_id'
  ) then
    return;
  end if;

  select exists (select 1 from public.inventory_batches limit 1) into v_has_rows;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_batches'
      and column_name = 'quantity_remaining'
  ) into v_has_remaining;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_batches'
      and column_name in ('remaining_quantity', 'quantity_on_hand', 'stock_remaining', 'current_quantity')
  ) into v_has_legacy_remaining;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_batches'
      and column_name = 'quantity_in'
  ) into v_has_quantity_in;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_batches'
      and column_name = 'quantity'
  ) into v_has_quantity;

  if v_has_rows and not v_has_remaining and not v_has_legacy_remaining then
    raise exception 'inventory_batches sudah berisi data tetapi belum memiliki kolom sisa stok. Periksa stok aktual sebelum memigrasikan; SQL dihentikan agar jumlah stok tidak terisi ulang secara keliru.';
  end if;
  if v_has_rows and not v_has_quantity_in and not v_has_quantity then
    raise exception 'inventory_batches sudah berisi data tetapi tidak memiliki kolom quantity_in atau quantity. Migrasikan kuantitas awal setiap batch sebelum menjalankan skema.';
  end if;
end;
$$;

alter table public.inventory_batches
  add column if not exists purchase_date date not null default (timezone('Asia/Jakarta', now())::date),
  add column if not exists quantity_in numeric(14, 3),
  add column if not exists quantity_remaining numeric(14, 3),
  add column if not exists carrying_unit_cost numeric(16, 2),
  add column if not exists supplier text,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_batches'
      and column_name = 'product_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_batches'
      and column_name = 'unit_cost'
  ) then
    raise exception 'Tabel public.inventory_batches lama tidak memiliki product_id atau unit_cost. Periksa dan migrasikan tabel tersebut sebelum menjalankan skema JIVA FLORIST.';
  end if;

  if exists (
    select 1 from public.inventory_batches where quantity_in is null
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'inventory_batches'
        and column_name = 'quantity'
    ) then
      execute 'update public.inventory_batches set quantity_in = quantity where quantity_in is null';
    else
      raise exception 'Tabel inventory_batches lama berisi baris tanpa quantity_in dan tidak memiliki kolom quantity untuk migrasi otomatis. Migrasikan kuantitas batch lama secara eksplisit sebelum menjalankan ulang SQL.';
    end if;
  end if;

  if exists (
    select 1 from public.inventory_batches where quantity_remaining is null
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory_batches'
        and column_name = 'remaining_quantity'
    ) then
      execute 'update public.inventory_batches set quantity_remaining = remaining_quantity where quantity_remaining is null';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory_batches'
        and column_name = 'quantity_on_hand'
    ) then
      execute 'update public.inventory_batches set quantity_remaining = quantity_on_hand where quantity_remaining is null';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory_batches'
        and column_name = 'stock_remaining'
    ) then
      execute 'update public.inventory_batches set quantity_remaining = stock_remaining where quantity_remaining is null';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'inventory_batches'
        and column_name = 'current_quantity'
    ) then
      execute 'update public.inventory_batches set quantity_remaining = current_quantity where quantity_remaining is null';
    elsif not exists (select 1 from public.inventory_batches limit 1) then
      update public.inventory_batches set quantity_remaining = quantity_in where quantity_remaining is null;
    else
      raise exception 'quantity_remaining belum terisi untuk batch lama. Isi sesuai stok aktual sebelum menjalankan ulang SQL; jangan samakan otomatis dengan quantity_in.';
    end if;
  end if;

  update public.inventory_batches
  set carrying_unit_cost = unit_cost
  where carrying_unit_cost is null;

  if exists (
    select 1 from public.inventory_batches
    where quantity_in <= 0
       or quantity_remaining < 0
       or quantity_remaining > quantity_in
       or unit_cost <= 0
       or carrying_unit_cost < 0
       or carrying_unit_cost > unit_cost
  ) then
    raise exception 'Data batch lama tidak memenuhi batas kuantitas atau biaya JIVA FLORIST. Periksa inventory_batches sebelum menjalankan ulang SQL.';
  end if;
end;
$$;

alter table public.inventory_batches
  alter column quantity_in set not null,
  alter column quantity_remaining set not null,
  alter column carrying_unit_cost set not null;

create index if not exists inventory_batches_fifo_idx
  on public.inventory_batches (product_id, purchase_date, created_at, id)
  where quantity_remaining > 0;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null default gen_random_uuid(),
  product_id uuid references public.products(id),
  type text not null check (type in ('purchase', 'sale', 'expense', 'adjustment')),
  description text not null check (length(trim(description)) between 1 and 240),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(16, 2) not null check (unit_price >= 0),
  subtotal numeric(16, 2) not null check (subtotal >= 0),
  cogs numeric(16, 2) not null default 0 check (cogs >= 0),
  gross_profit numeric(16, 2) not null default 0,
  vat_rate numeric(6, 5) not null default 0 check (vat_rate >= 0 and vat_rate <= 1),
  vat_amount numeric(16, 2) not null default 0 check (vat_amount >= 0),
  fifo_allocations jsonb not null default '[]'::jsonb check (jsonb_typeof(fifo_allocations) = 'array'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint transaction_product_type_check check (
    (type = 'expense' and product_id is null)
    or (type in ('purchase', 'sale', 'adjustment') and product_id is not null)
  )
);

alter table public.transactions
  add column if not exists supplier_invoice_path text,
  add column if not exists supplier_invoice_filename text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-invoices',
  'supplier-invoices',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create index if not exists transactions_occurred_at_idx on public.transactions (occurred_at desc);
create index if not exists transactions_product_occurred_idx on public.transactions (product_id, occurred_at desc);

alter table public.inventory_batches
  add column if not exists source_transaction_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_batches_source_transaction_id_fkey'
      and conrelid = 'public.inventory_batches'::regclass
  ) then
    alter table public.inventory_batches
      add constraint inventory_batches_source_transaction_id_fkey
      foreign key (source_transaction_id) references public.transactions(id);
  end if;
end;
$$;

create unique index if not exists inventory_batches_source_transaction_id_idx
  on public.inventory_batches (source_transaction_id)
  where source_transaction_id is not null;

with candidates as (
  select b.id as batch_id, t.id as transaction_id,
         count(*) over (partition by b.id) as batch_matches,
         count(*) over (partition by t.id) as transaction_matches
  from public.inventory_batches b
  join public.transactions t
    on t.product_id = b.product_id
   and t.type = 'purchase'
   and t.quantity = b.quantity_in
   and t.unit_price = b.unit_cost
   and abs(extract(epoch from (t.created_at - b.created_at))) <= 10
  where b.source_transaction_id is null
)
update public.inventory_batches b
set source_transaction_id = c.transaction_id
from candidates c
where b.id = c.batch_id
  and c.batch_matches = 1
  and c.transaction_matches = 1;

alter table public.products enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.transactions enable row level security;

revoke all on public.products, public.inventory_batches, public.transactions from anon, authenticated;
grant all on public.products, public.inventory_batches, public.transactions to service_role;

create or replace function public.register_purchase(
  p_product_id uuid,
  p_new_product jsonb,
  p_quantity numeric,
  p_unit_cost numeric,
  p_supplier text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_batch_id uuid;
  v_transaction_id uuid;
  v_product_id uuid := p_product_id;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then
    raise exception 'Jumlah pembelian harus lebih dari 0 dan tidak melebihi 1.000.000.' using errcode = '22023';
  end if;
  if p_unit_cost is null or p_unit_cost <= 0 or p_unit_cost > 1000000000000 then
    raise exception 'Biaya per unit harus lebih dari 0.' using errcode = '22023';
  end if;

  if v_product_id is null then
    if p_new_product is null then
      raise exception 'Pilih produk atau isi data produk baru.' using errcode = '22023';
    end if;
    insert into public.products (name, category, unit, reorder_level, target_margin)
    values (
      trim(p_new_product->>'name'),
      trim(p_new_product->>'category'),
      coalesce(nullif(trim(p_new_product->>'unit'), ''), 'batang'),
      coalesce(nullif(p_new_product->>'reorder_level', '')::numeric, 0),
      coalesce(nullif(p_new_product->>'target_margin', '')::numeric, 0.55)
    )
    returning * into v_product;
    v_product_id := v_product.id;
  else
    select * into v_product
    from public.products
    where id = v_product_id and is_active
    for update;
    if not found then
      raise exception 'Produk tidak ditemukan atau sudah dinonaktifkan.' using errcode = '22023';
    end if;
  end if;

  insert into public.inventory_batches (
    product_id, quantity_in, quantity_remaining, unit_cost, carrying_unit_cost, supplier
  )
  values (v_product_id, p_quantity, p_quantity, round(p_unit_cost, 2), round(p_unit_cost, 2), nullif(trim(p_supplier), ''))
  returning id into v_batch_id;

  insert into public.transactions (
    product_id, type, description, quantity, unit_price, subtotal
  )
  values (
    v_product_id,
    'purchase',
    'Pembelian ' || v_product.name || case when nullif(trim(p_supplier), '') is null then '' else ' · ' || trim(p_supplier) end,
    p_quantity,
    round(p_unit_cost, 2),
    round(p_quantity * p_unit_cost, 2)
  )
  returning id into v_transaction_id;

  update public.inventory_batches
  set source_transaction_id = v_transaction_id
  where id = v_batch_id;

  return jsonb_build_object(
    'transaction_id', v_transaction_id,
    'batch_id', v_batch_id,
    'product_id', v_product_id,
    'product_name', v_product.name,
    'unit', v_product.unit,
    'quantity', p_quantity,
    'unit_cost', round(p_unit_cost, 2)
  );
end;
$$;

create or replace function public.register_purchase_batch(
  p_items jsonb,
  p_supplier text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_group_id uuid := gen_random_uuid();
  v_count integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Daftar pembelian harus berupa array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Pilih antara 1 sampai 30 jenis bunga untuk pembelian.' using errcode = '22023';
  end if;
  if p_supplier is not null and length(trim(p_supplier)) > 120 then
    raise exception 'Nama pemasok maksimal 120 karakter.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Setiap baris pembelian harus berisi data bunga.' using errcode = '22023';
    end if;
    v_result := public.register_purchase(
      nullif(v_item->>'product_id', '')::uuid,
      v_item->'new_product',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_cost')::numeric,
      p_supplier
    );
    update public.transactions
    set group_id = v_group_id
    where id = (v_result->>'transaction_id')::uuid;
    v_results := v_results || jsonb_build_array(v_result || jsonb_build_object('group_id', v_group_id));
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'group_id', v_group_id,
    'transaction_count', v_count,
    'items', v_results
  );
end;
$$;

create or replace function public.register_sale(
  p_product_id uuid,
  p_quantity numeric,
  p_target_margin numeric,
  p_vat_rate numeric default 0,
  p_description text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_batch record;
  v_remaining numeric(14, 3);
  v_taken numeric(14, 3);
  v_cogs numeric := 0;
  v_unit_price numeric(16, 2);
  v_subtotal numeric(16, 2);
  v_vat numeric(16, 2);
  v_group_id uuid := gen_random_uuid();
  v_transaction_id uuid;
  v_allocations jsonb := '[]'::jsonb;
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then
    raise exception 'Jumlah penjualan harus lebih dari 0 dan tidak melebihi 1.000.000.' using errcode = '22023';
  end if;
  if p_target_margin is null or p_target_margin <= 0 or p_target_margin >= 0.9 then
    raise exception 'Margin target harus lebih dari 0%% dan kurang dari 90%%.' using errcode = '22023';
  end if;
  if p_vat_rate is null or p_vat_rate < 0 or p_vat_rate > 1 then
    raise exception 'Tarif PPN harus berada di antara 0%% dan 100%%.' using errcode = '22023';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and is_active
  for update;
  if not found then
    raise exception 'Produk tidak ditemukan atau sudah dinonaktifkan.' using errcode = '22023';
  end if;

  v_remaining := p_quantity;
  for v_batch in
    select id, quantity_remaining, unit_cost, carrying_unit_cost, purchase_date, created_at
    from public.inventory_batches
    where product_id = p_product_id and quantity_remaining > 0
    order by purchase_date asc, created_at asc, id asc
    for update
  loop
    exit when v_remaining <= 0;
    v_taken := least(v_batch.quantity_remaining, v_remaining);
    update public.inventory_batches
    set quantity_remaining = quantity_remaining - v_taken
    where id = v_batch.id;
    v_cogs := v_cogs + v_taken * v_batch.carrying_unit_cost;
    v_remaining := v_remaining - v_taken;
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'batch_id', v_batch.id,
      'purchase_date', v_batch.purchase_date,
      'quantity', v_taken,
      'unit_cost', v_batch.unit_cost,
      'carrying_unit_cost', v_batch.carrying_unit_cost
    ));
  end loop;

  if v_remaining > 0 then
    raise exception 'Stok tidak mencukupi. Jumlah tersedia: % %.',
      p_quantity - v_remaining, v_product.unit using errcode = '22023';
  end if;

  v_cogs := round(v_cogs, 2);
  v_unit_price := coalesce(
    v_product.selling_price_override,
    ceil((v_cogs / p_quantity / (1 - p_target_margin)) / 100) * 100
  );
  v_subtotal := round(v_unit_price * p_quantity, 2);
  v_vat := round(v_subtotal * p_vat_rate, 2);

  insert into public.transactions (
    group_id, product_id, type, description, quantity, unit_price,
    subtotal, cogs, gross_profit, vat_rate, vat_amount, fifo_allocations
  )
  values (
    v_group_id,
    p_product_id,
    'sale',
    coalesce(nullif(trim(p_description), ''), 'Penjualan ' || v_product.name),
    p_quantity,
    v_unit_price,
    v_subtotal,
    v_cogs,
    v_subtotal - v_cogs,
    p_vat_rate,
    v_vat,
    v_allocations
  )
  returning id into v_transaction_id;

  return jsonb_build_object(
    'transaction_id', v_transaction_id,
    'group_id', v_group_id,
    'product_id', p_product_id,
    'product_name', v_product.name,
    'unit', v_product.unit,
    'quantity', p_quantity,
    'unit_price', v_unit_price,
    'subtotal', v_subtotal,
    'vat_rate', p_vat_rate,
    'vat_amount', v_vat,
    'total', v_subtotal + v_vat,
    'cogs', v_cogs,
    'gross_profit', v_subtotal - v_cogs,
    'fifo_allocations', v_allocations
  );
end;
$$;

create or replace function public.register_sale_batch(
  p_items jsonb,
  p_vat_rate numeric default 0,
  p_description text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_product public.products%rowtype;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_group_id uuid := gen_random_uuid();
  v_transaction_id uuid;
  v_count integer := 0;
  v_subtotal numeric(16, 2) := 0;
  v_vat numeric(16, 2) := 0;
  v_cogs numeric(16, 2) := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Daftar penjualan harus berupa array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Pilih antara 1 sampai 30 jenis bunga untuk penjualan.' using errcode = '22023';
  end if;
  if p_vat_rate is null or p_vat_rate < 0 or p_vat_rate > 1 then
    raise exception 'Tarif PPN harus berada di antara 0%% dan 100%%.' using errcode = '22023';
  end if;
  if p_description is not null and length(trim(p_description)) > 240 then
    raise exception 'Catatan penjualan maksimal 240 karakter.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Setiap baris penjualan harus berisi data bunga.' using errcode = '22023';
    end if;
    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid and is_active;
    if not found then
      raise exception 'Produk tidak ditemukan atau sudah dinonaktifkan.' using errcode = '22023';
    end if;

    v_result := public.register_sale(
      v_product.id,
      (v_item->>'quantity')::numeric,
      (v_item->>'target_margin')::numeric,
      p_vat_rate,
      p_description
    );
    v_transaction_id := (v_result->>'transaction_id')::uuid;
    update public.transactions
    set group_id = v_group_id,
        description = case
          when nullif(trim(p_description), '') is null then description
          else left(trim(p_description), 110) || ' · ' || v_product.name
        end
    where id = v_transaction_id;

    v_results := v_results || jsonb_build_array(v_result || jsonb_build_object('group_id', v_group_id));
    v_count := v_count + 1;
    v_subtotal := v_subtotal + (v_result->>'subtotal')::numeric;
    v_vat := v_vat + (v_result->>'vat_amount')::numeric;
    v_cogs := v_cogs + (v_result->>'cogs')::numeric;
  end loop;

  return jsonb_build_object(
    'group_id', v_group_id,
    'transaction_count', v_count,
    'subtotal', v_subtotal,
    'vat_amount', v_vat,
    'total', v_subtotal + v_vat,
    'cogs', v_cogs,
    'gross_profit', v_subtotal - v_cogs,
    'items', v_results
  );
end;
$$;

create or replace function public.register_expense(
  p_description text,
  p_amount numeric,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_transaction_id uuid;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_description is null or length(trim(p_description)) = 0 or length(trim(p_description)) > 240 then
    raise exception 'Deskripsi biaya wajib diisi (maksimal 240 karakter).' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000000 then
    raise exception 'Nominal biaya harus lebih dari 0.' using errcode = '22023';
  end if;
  if v_occurred_at > now() + interval '5 minutes' then
    raise exception 'Tanggal biaya tidak boleh berada jauh di masa depan.' using errcode = '22023';
  end if;

  insert into public.transactions (type, description, quantity, unit_price, subtotal, occurred_at)
  values ('expense', trim(p_description), 1, round(p_amount, 2), round(p_amount, 2), v_occurred_at)
  returning id into v_transaction_id;

  return jsonb_build_object('transaction_id', v_transaction_id, 'description', trim(p_description), 'amount', round(p_amount, 2));
end;
$$;

create or replace function public.assess_inventory_nrv(
  p_product_id uuid,
  p_nrv_unit numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_batch record;
  v_quantity numeric := 0;
  v_adjustment numeric := 0;
  v_updated_cost numeric(16, 2);
  v_transaction_id uuid;
begin
  if p_nrv_unit is null or p_nrv_unit < 0 or p_nrv_unit > 1000000000000 then
    raise exception 'Nilai realisasi neto per unit harus nol atau lebih.' using errcode = '22023';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and is_active
  for update;
  if not found then
    raise exception 'Produk tidak ditemukan atau sudah dinonaktifkan.' using errcode = '22023';
  end if;

  for v_batch in
    select id, quantity_remaining, unit_cost, carrying_unit_cost
    from public.inventory_batches
    where product_id = p_product_id and quantity_remaining > 0
    order by purchase_date asc, created_at asc, id asc
    for update
  loop
    v_updated_cost := least(v_batch.unit_cost, round(p_nrv_unit, 2));
    v_adjustment := v_adjustment
      + (v_updated_cost - v_batch.carrying_unit_cost) * v_batch.quantity_remaining;
    v_quantity := v_quantity + v_batch.quantity_remaining;
    update public.inventory_batches
    set carrying_unit_cost = v_updated_cost
    where id = v_batch.id;
  end loop;

  if v_quantity = 0 then
    raise exception 'Tidak ada stok tersedia untuk dinilai.' using errcode = '22023';
  end if;

  v_adjustment := round(v_adjustment, 2);
  if v_adjustment <> 0 then
    insert into public.transactions (
      product_id, type, description, quantity, unit_price, subtotal, gross_profit
    )
    values (
      p_product_id,
      'adjustment',
      case when v_adjustment < 0 then 'Penurunan nilai persediaan · ' else 'Pemulihan penurunan nilai · ' end || v_product.name,
      v_quantity,
      round(p_nrv_unit, 2),
      abs(v_adjustment),
      v_adjustment
    )
    returning id into v_transaction_id;
  end if;

  return jsonb_build_object(
    'transaction_id', v_transaction_id,
    'product_id', p_product_id,
    'product_name', v_product.name,
    'quantity', v_quantity,
    'nrv_unit', round(p_nrv_unit, 2),
    'adjustment', v_adjustment
  );
end;
$$;

drop function if exists public.get_products_inventory();

create function public.get_products_inventory()
returns table (
  id uuid,
  name text,
  category text,
  unit text,
  reorder_level numeric,
  target_margin numeric,
  selling_price_override numeric,
  stock numeric,
  fifo_unit_cost numeric,
  historical_unit_cost numeric,
  inventory_value numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.id, p.name, p.category, p.unit, p.reorder_level, p.target_margin, p.selling_price_override,
    coalesce(stock.quantity, 0)::numeric as stock,
    coalesce(next_batch.carrying_unit_cost, 0)::numeric as fifo_unit_cost,
    coalesce(next_batch.unit_cost, 0)::numeric as historical_unit_cost,
    coalesce(stock.value, 0)::numeric as inventory_value
  from public.products p
  left join lateral (
    select sum(b.quantity_remaining) as quantity,
           sum(b.quantity_remaining * b.carrying_unit_cost) as value
    from public.inventory_batches b
    where b.product_id = p.id and b.quantity_remaining > 0
  ) stock on true
  left join lateral (
    select b.unit_cost, b.carrying_unit_cost
    from public.inventory_batches b
    where b.product_id = p.id and b.quantity_remaining > 0
    order by b.purchase_date, b.created_at, b.id
    limit 1
  ) next_batch on true
  where p.is_active
  order by p.name;
$$;

create or replace function public.get_dashboard_summary(p_days integer default 7)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 7), 90));
  v_today date := timezone('Asia/Jakarta', now())::date;
  v_month_start date := date_trunc('month', timezone('Asia/Jakarta', now()))::date;
  v_result jsonb;
begin
  with bounds as (
    select (v_today::timestamp at time zone 'Asia/Jakarta') as today_start,
           ((v_today + 1)::timestamp at time zone 'Asia/Jakarta') as tomorrow_start,
           (v_month_start::timestamp at time zone 'Asia/Jakarta') as month_start
  ),
  stock as (
    select coalesce(sum(b.quantity_remaining * b.carrying_unit_cost), 0) as value
    from public.inventory_batches b
    where b.quantity_remaining > 0
  ),
  product_counts as (
    select count(*) as product_count
    from public.products p
    where p.is_active
  ),
  low_stock as (
    select p.id, p.name, p.category, p.unit, p.reorder_level,
           coalesce(sum(b.quantity_remaining), 0) as stock
    from public.products p
    left join public.inventory_batches b on b.product_id = p.id and b.quantity_remaining > 0
    where p.is_active
    group by p.id
    having coalesce(sum(b.quantity_remaining), 0) <= p.reorder_level
  ),
  today_values as (
    select coalesce(sum(t.subtotal) filter (where t.type = 'sale'), 0) as revenue,
           coalesce(sum(t.cogs) filter (where t.type = 'sale'), 0) as cogs,
           coalesce(sum(t.gross_profit) filter (where t.type = 'sale'), 0) as gross_profit,
           coalesce(sum(t.subtotal) filter (where t.type = 'expense'), 0) as expenses,
           coalesce(sum(t.gross_profit) filter (where t.type = 'adjustment'), 0) as adjustments
    from public.transactions t, bounds b
    where t.occurred_at >= b.today_start and t.occurred_at < b.tomorrow_start
  ),
  month_values as (
    select coalesce(sum(t.subtotal) filter (where t.type = 'sale'), 0) as revenue,
           coalesce(sum(t.cogs) filter (where t.type = 'sale'), 0) as cogs,
           coalesce(sum(t.gross_profit) filter (where t.type = 'sale'), 0) as gross_profit,
           coalesce(sum(t.subtotal) filter (where t.type = 'expense'), 0) as expenses,
           coalesce(sum(t.gross_profit) filter (where t.type = 'adjustment'), 0) as adjustments,
           coalesce(sum(t.vat_amount) filter (where t.type = 'sale'), 0) as vat
    from public.transactions t, bounds b
    where t.occurred_at >= b.month_start
  ),
  chart_values as (
    select d.day::date as day,
           coalesce(sum(t.subtotal) filter (where t.type = 'sale'), 0) as revenue,
           coalesce(sum(t.gross_profit) filter (where t.type = 'sale'), 0) as gross_profit
    from generate_series(v_today - (v_days - 1), v_today, interval '1 day') d(day)
    left join public.transactions t
      on timezone('Asia/Jakarta', t.occurred_at)::date = d.day::date
    group by d.day
    order by d.day
  )
  select jsonb_build_object(
    'today', (select jsonb_build_object('revenue', revenue, 'cogs', cogs, 'gross_profit', gross_profit, 'expenses', expenses, 'adjustments', adjustments) from today_values),
    'month', (select jsonb_build_object('revenue', revenue, 'cogs', cogs, 'gross_profit', gross_profit, 'expenses', expenses, 'adjustments', adjustments, 'vat', vat) from month_values),
    'inventory', jsonb_build_object(
      'value', (select value from stock),
      'product_count', (select product_count from product_counts),
      'low_stock_count', (select count(*) from low_stock)
    ),
    'low_stock', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'category', category, 'unit', unit, 'reorder_level', reorder_level, 'stock', stock) order by stock)
      from (select * from low_stock order by stock limit 6) limited_low_stock
    ), '[]'::jsonb),
    'chart', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', day,
        'label', to_char(day, 'DD Mon'),
        'revenue', revenue,
        'gross_profit', gross_profit
      ) order by day)
      from chart_values
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.edit_product(p_product_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_key text;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'Tidak ada perubahan produk yang dikirim.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_changes)
  loop
    if v_key not in ('name', 'category', 'unit', 'reorder_level', 'target_margin', 'selling_price_override') then
      raise exception 'Kolom produk tidak dapat diubah: %.', v_key using errcode = '22023';
    end if;
  end loop;

  select * into v_product
  from public.products
  where id = p_product_id and is_active
  for update;
  if not found then
    raise exception 'Produk tidak ditemukan atau sudah dinonaktifkan.' using errcode = '22023';
  end if;

  if p_changes ? 'name' and (length(trim(p_changes->>'name')) not between 1 and 120) then
    raise exception 'Nama bunga wajib diisi (maksimal 120 karakter).' using errcode = '22023';
  end if;
  if p_changes ? 'category' and (length(trim(p_changes->>'category')) not between 1 and 80) then
    raise exception 'Kategori wajib diisi (maksimal 80 karakter).' using errcode = '22023';
  end if;
  if p_changes ? 'unit' and (length(trim(p_changes->>'unit')) not between 1 and 30) then
    raise exception 'Satuan wajib diisi (maksimal 30 karakter).' using errcode = '22023';
  end if;
  if p_changes ? 'unit'
    and trim(p_changes->>'unit') <> v_product.unit
    and exists (select 1 from public.transactions where product_id = p_product_id) then
    raise exception 'Satuan tidak dapat diubah karena sudah ada transaksi untuk produk ini.' using errcode = '22023';
  end if;
  if p_changes ? 'reorder_level'
    and ((p_changes->>'reorder_level')::numeric < 0 or (p_changes->>'reorder_level')::numeric > 1000000) then
    raise exception 'Ambang stok harus antara 0 dan 1.000.000.' using errcode = '22023';
  end if;
  if p_changes ? 'target_margin'
    and ((p_changes->>'target_margin')::numeric <= 0 or (p_changes->>'target_margin')::numeric >= 0.9) then
    raise exception 'Margin target harus lebih dari 0%% dan kurang dari 90%%.' using errcode = '22023';
  end if;
  if p_changes ? 'selling_price_override'
    and p_changes->'selling_price_override' <> 'null'::jsonb
    and ((p_changes->>'selling_price_override')::numeric <= 0 or (p_changes->>'selling_price_override')::numeric > 1000000000000) then
    raise exception 'Harga jual tetap harus lebih dari 0 dan maksimal Rp1.000.000.000.000.' using errcode = '22023';
  end if;

  update public.products
  set name = case when p_changes ? 'name' then trim(p_changes->>'name') else name end,
      category = case when p_changes ? 'category' then trim(p_changes->>'category') else category end,
      unit = case when p_changes ? 'unit' then trim(p_changes->>'unit') else unit end,
      reorder_level = case when p_changes ? 'reorder_level' then (p_changes->>'reorder_level')::numeric else reorder_level end,
      target_margin = case when p_changes ? 'target_margin' then (p_changes->>'target_margin')::numeric else target_margin end,
      selling_price_override = case
        when p_changes ? 'selling_price_override' then nullif(p_changes->>'selling_price_override', 'null')::numeric
        else selling_price_override
      end
  where id = p_product_id
  returning * into v_product;

  return jsonb_build_object('id', v_product.id, 'name', v_product.name);
end;
$$;

create or replace function public.edit_transaction(p_transaction_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_transaction public.transactions%rowtype;
  v_batch public.inventory_batches%rowtype;
  v_key text;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_amount numeric;
  v_occurred_at timestamptz;
  v_supplier text;
  v_has_batch boolean;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'Tidak ada perubahan transaksi yang dikirim.' using errcode = '22023';
  end if;
  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;
  if not found then
    raise exception 'Transaksi tidak ditemukan.' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_changes)
  loop
    if v_key not in ('description', 'occurred_at', 'quantity', 'unit_price', 'vat_rate', 'amount', 'unit_cost', 'supplier') then
      raise exception 'Kolom transaksi tidak dapat diubah: %.', v_key using errcode = '22023';
    end if;
    if v_transaction.type = 'purchase' and v_key not in ('description', 'occurred_at', 'quantity', 'unit_cost', 'supplier') then
      raise exception 'Kolom ini bukan bagian dari pembelian.' using errcode = '22023';
    elsif v_transaction.type = 'sale' and v_key not in ('description', 'occurred_at', 'unit_price', 'vat_rate') then
      raise exception 'Jumlah penjualan tidak dapat diubah karena akan mengubah alokasi FIFO. Catat transaksi koreksi stok untuk perubahan jumlah.' using errcode = '22023';
    elsif v_transaction.type = 'expense' and v_key not in ('description', 'occurred_at', 'amount') then
      raise exception 'Kolom ini bukan bagian dari biaya.' using errcode = '22023';
    elsif v_transaction.type = 'adjustment' and v_key not in ('description', 'occurred_at') then
      raise exception 'Nilai penyesuaian NRV tidak dapat diedit langsung. Buat penilaian NRV baru agar jejak persediaan tetap benar.' using errcode = '22023';
    end if;
  end loop;

  if p_changes ? 'description' and length(trim(p_changes->>'description')) not between 1 and 240 then
    raise exception 'Keterangan wajib diisi (maksimal 240 karakter).' using errcode = '22023';
  end if;
  v_occurred_at := case when p_changes ? 'occurred_at' then (p_changes->>'occurred_at')::timestamptz else v_transaction.occurred_at end;
  if v_occurred_at > now() + interval '5 minutes' then
    raise exception 'Tanggal transaksi tidak boleh berada jauh di masa depan.' using errcode = '22023';
  end if;

  if v_transaction.type = 'purchase' then
    select * into v_batch
    from public.inventory_batches
    where source_transaction_id = p_transaction_id
    for update;
    v_has_batch := found;
    if p_changes ? 'quantity' or p_changes ? 'unit_cost' or p_changes ? 'supplier' or p_changes ? 'occurred_at' then
      if not v_has_batch then
        raise exception 'Pembelian lama belum terhubung dengan lapisan stok. Keterangan masih dapat diedit, tetapi jumlah, biaya, pemasok, dan tanggal tidak dapat diubah dengan aman.' using errcode = '22023';
      end if;
      if v_batch.quantity_remaining <> v_batch.quantity_in then
        raise exception 'Jumlah, biaya, pemasok, dan tanggal pembelian tidak dapat diubah karena sebagian stok batch sudah terpakai. Keterangan tetap dapat diedit.' using errcode = '22023';
      end if;
      if p_changes ? 'occurred_at'
        and exists (select 1 from public.transactions where product_id = v_transaction.product_id and type = 'sale') then
        raise exception 'Tanggal pembelian tidak dapat diubah setelah ada penjualan produk ini, agar urutan FIFO historis tetap konsisten.' using errcode = '22023';
      end if;
    end if;
    v_quantity := case when p_changes ? 'quantity' then (p_changes->>'quantity')::numeric else v_transaction.quantity end;
    v_unit_price := case when p_changes ? 'unit_cost' then (p_changes->>'unit_cost')::numeric else v_transaction.unit_price end;
    if v_quantity <= 0 or v_quantity > 1000000 then
      raise exception 'Jumlah pembelian harus lebih dari 0 dan tidak melebihi 1.000.000.' using errcode = '22023';
    end if;
    if v_unit_price <= 0 or v_unit_price > 1000000000000 then
      raise exception 'Biaya per unit harus lebih dari 0.' using errcode = '22023';
    end if;
    if v_has_batch and (p_changes ? 'quantity' or p_changes ? 'unit_cost' or p_changes ? 'supplier' or p_changes ? 'occurred_at') then
      v_supplier := case when p_changes ? 'supplier' then nullif(trim(p_changes->>'supplier'), '') else v_batch.supplier end;
      update public.inventory_batches
      set quantity_in = v_quantity,
          quantity_remaining = v_quantity,
          unit_cost = round(v_unit_price, 2),
          carrying_unit_cost = case
            when carrying_unit_cost = unit_cost then round(v_unit_price, 2)
            else least(carrying_unit_cost, round(v_unit_price, 2))
          end,
          supplier = v_supplier,
          purchase_date = case when p_changes ? 'occurred_at' then v_occurred_at::date else purchase_date end
      where id = v_batch.id;
    end if;
    update public.transactions
    set description = case when p_changes ? 'description' then trim(p_changes->>'description') else description end,
        quantity = v_quantity,
        unit_price = round(v_unit_price, 2),
        subtotal = round(v_quantity * v_unit_price, 2),
        occurred_at = v_occurred_at
    where id = p_transaction_id;
  elsif v_transaction.type = 'sale' then
    v_unit_price := case when p_changes ? 'unit_price' then (p_changes->>'unit_price')::numeric else v_transaction.unit_price end;
    v_vat_rate := case when p_changes ? 'vat_rate' then (p_changes->>'vat_rate')::numeric else v_transaction.vat_rate end;
    if v_unit_price <= 0 or v_unit_price > 1000000000000 then
      raise exception 'Harga jual per unit harus lebih dari 0.' using errcode = '22023';
    end if;
    if v_vat_rate < 0 or v_vat_rate > 1 then
      raise exception 'Tarif PPN harus antara 0%% dan 100%%.' using errcode = '22023';
    end if;
    update public.transactions
    set description = case when p_changes ? 'description' then trim(p_changes->>'description') else description end,
        unit_price = round(v_unit_price, 2),
        subtotal = round(v_unit_price * quantity, 2),
        vat_rate = v_vat_rate,
        vat_amount = round(v_unit_price * quantity * v_vat_rate, 2),
        gross_profit = round(v_unit_price * quantity, 2) - cogs,
        occurred_at = v_occurred_at
    where id = p_transaction_id;
  elsif v_transaction.type = 'expense' then
    v_amount := case when p_changes ? 'amount' then (p_changes->>'amount')::numeric else v_transaction.subtotal end;
    if v_amount <= 0 or v_amount > 1000000000000 then
      raise exception 'Nominal biaya harus lebih dari 0.' using errcode = '22023';
    end if;
    update public.transactions
    set description = case when p_changes ? 'description' then trim(p_changes->>'description') else description end,
        unit_price = round(v_amount, 2),
        subtotal = round(v_amount, 2),
        occurred_at = v_occurred_at
    where id = p_transaction_id;
  else
    update public.transactions
    set description = case when p_changes ? 'description' then trim(p_changes->>'description') else description end,
        occurred_at = v_occurred_at
    where id = p_transaction_id;
  end if;

  return jsonb_build_object('transaction_id', p_transaction_id, 'type', v_transaction.type, 'updated', true);
end;
$$;

revoke all on function public.register_purchase(uuid, jsonb, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.register_purchase_batch(jsonb, text) from public, anon, authenticated;
revoke all on function public.register_sale(uuid, numeric, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.register_sale_batch(jsonb, numeric, text) from public, anon, authenticated;
revoke all on function public.register_expense(text, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.assess_inventory_nrv(uuid, numeric) from public, anon, authenticated;
revoke all on function public.get_products_inventory() from public, anon, authenticated;
revoke all on function public.get_dashboard_summary(integer) from public, anon, authenticated;
revoke all on function public.edit_product(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.edit_transaction(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.register_purchase(uuid, jsonb, numeric, numeric, text) to service_role;
grant execute on function public.register_purchase_batch(jsonb, text) to service_role;
grant execute on function public.register_sale(uuid, numeric, numeric, numeric, text) to service_role;
grant execute on function public.register_sale_batch(jsonb, numeric, text) to service_role;
grant execute on function public.register_expense(text, numeric, timestamptz) to service_role;
grant execute on function public.assess_inventory_nrv(uuid, numeric) to service_role;
grant execute on function public.get_products_inventory() to service_role;
grant execute on function public.get_dashboard_summary(integer) to service_role;
grant execute on function public.edit_product(uuid, jsonb) to service_role;
grant execute on function public.edit_transaction(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
