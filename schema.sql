-- LAZIZ cloud database foundation for Supabase (PostgreSQL).
-- Run in a NEW Supabase project's SQL Editor after reviewing this file.
-- RLS is enabled on every business-data table. No demo products or prices are inserted.

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null default 'Building materials & hardware',
  currency text not null default 'NGN',
  created_at timestamptz not null default now()
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','cashier')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create or replace function public.is_business_member(target_business uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.business_members m where m.business_id = target_business and m.user_id = auth.uid()) $$;

create or replace function public.has_business_role(target_business uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.business_members m where m.business_id = target_business and m.user_id = auth.uid() and m.role = any(allowed_roles)) $$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  sku text,
  category text not null,
  unit text not null,
  cost numeric(14,2) not null default 0 check (cost >= 0),
  price numeric(14,2) not null default 0 check (price >= 0),
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, sku)
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  receipt_no text not null,
  cashier_id uuid references auth.users(id),
  customer_name text,
  payment_method text not null,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0 check (discount >= 0 and discount <= subtotal),
  total numeric(14,2) not null default 0,
  status text not null default 'completed' check (status in ('completed','partially_refunded','refunded','voided')),
  source text not null default 'online' check (source in ('online','offline_sync')),
  client_transaction_id text not null,
  created_at timestamptz not null default now(),
  unique (business_id, client_transaction_id),
  unique (business_id, receipt_no)
);

alter table public.sales add column if not exists discount numeric(14,2) not null default 0 check (discount >= 0 and discount <= subtotal);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  unit_price numeric(14,2) not null check (unit_price >= 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id),
  movement_type text not null check (movement_type in ('opening_stock','purchase','sale','customer_return','adjustment','damage','transfer_in','transfer_out')),
  quantity_change numeric(14,3) not null,
  quantity_after numeric(14,3) not null check (quantity_after >= 0),
  reference text,
  actor_id uuid references auth.users(id),
  client_transaction_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  description text not null,
  category text,
  amount numeric(14,2) not null check (amount >= 0),
  payment_method text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null, phone text, email text, notes text, created_at timestamptz not null default now()
);
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null, phone text, email text, notes text, created_at timestamptz not null default now()
);
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null references public.sales(id), amount numeric(14,2) not null check (amount >= 0),
  reason text, actor_id uuid references auth.users(id), created_at timestamptz not null default now()
);

-- Enable row-level security and isolate every tenant's records.
do $$ declare t text; begin
  foreach t in array array['businesses','business_members','products','sales','sale_items','stock_movements','expenses','customers','suppliers','refunds'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Business members can read their business; only owners can manage business/member settings.
drop policy if exists business_read_member on public.businesses;
create policy business_read_member on public.businesses for select using (public.is_business_member(id));
drop policy if exists business_update_owner on public.businesses;
create policy business_update_owner on public.businesses for update using (public.has_business_role(id, array['owner'])) with check (public.has_business_role(id, array['owner']));
drop policy if exists members_read_same_business on public.business_members;
create policy members_read_same_business on public.business_members for select using (public.is_business_member(business_id));
drop policy if exists members_manage_owner on public.business_members;
create policy members_manage_owner on public.business_members for all using (public.has_business_role(business_id, array['owner'])) with check (public.has_business_role(business_id, array['owner']));

-- Staff may read operational data; owners/managers maintain catalogue, cashiers may record sales.
create policy products_read_member on public.products for select using (public.is_business_member(business_id));
create policy products_write_manager on public.products for all using (public.has_business_role(business_id, array['owner','manager'])) with check (public.has_business_role(business_id, array['owner','manager']));
create policy sales_read_member on public.sales for select using (public.is_business_member(business_id));
create policy sales_insert_staff on public.sales for insert with check (public.has_business_role(business_id, array['owner','manager','cashier']));
create policy sales_update_manager on public.sales for update using (public.has_business_role(business_id, array['owner','manager'])) with check (public.has_business_role(business_id, array['owner','manager']));
create policy sale_items_read_member on public.sale_items for select using (public.is_business_member(business_id));
create policy sale_items_insert_staff on public.sale_items for insert with check (public.has_business_role(business_id, array['owner','manager','cashier']));
create policy stock_read_member on public.stock_movements for select using (public.is_business_member(business_id));
create policy stock_insert_staff on public.stock_movements for insert with check (public.has_business_role(business_id, array['owner','manager','cashier']));
create policy expenses_read_member on public.expenses for select using (public.is_business_member(business_id));
create policy expenses_write_manager on public.expenses for all using (public.has_business_role(business_id, array['owner','manager'])) with check (public.has_business_role(business_id, array['owner','manager']));
create policy customers_read_member on public.customers for select using (public.is_business_member(business_id));
create policy customers_write_staff on public.customers for all using (public.has_business_role(business_id, array['owner','manager','cashier'])) with check (public.has_business_role(business_id, array['owner','manager','cashier']));
create policy suppliers_read_member on public.suppliers for select using (public.is_business_member(business_id));
create policy suppliers_write_manager on public.suppliers for all using (public.has_business_role(business_id, array['owner','manager'])) with check (public.has_business_role(business_id, array['owner','manager']));
create policy refunds_read_member on public.refunds for select using (public.is_business_member(business_id));
create policy refunds_insert_manager on public.refunds for insert with check (public.has_business_role(business_id, array['owner','manager']));

create index if not exists products_business_idx on public.products(business_id);
create index if not exists sales_business_date_idx on public.sales(business_id, created_at desc);
create index if not exists stock_movements_business_date_idx on public.stock_movements(business_id, created_at desc);
create index if not exists stock_movements_product_idx on public.stock_movements(product_id, created_at desc);

-- Secure first-workspace setup: the signed-in user becomes the owner.
create or replace function public.create_business_workspace(p_name text, p_industry text default 'Building materials & hardware')
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_business_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Enter a valid business name'; end if;
  insert into public.businesses(name, industry) values (trim(p_name), coalesce(nullif(trim(p_industry),''),'Building materials & hardware')) returning id into new_business_id;
  insert into public.business_members(business_id, user_id, role) values (new_business_id, auth.uid(), 'owner');
  return new_business_id;
end;
$$;
grant execute on function public.create_business_workspace(text,text) to authenticated;
