-- ─────────────────────────────────────────────────────────────────────────────
-- HousePlan iOS companion — Supabase migration
-- Run this in your Supabase project's SQL Editor ONCE.
-- It adds the room_scans table and the room-scans storage bucket
-- needed by the iOS RoomPlan scanner.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. room_scans table
-- Stores metadata for each RoomPlan USDZ scan.
create table if not exists public.room_scans (
    id              uuid primary key default uuid_generate_v4(),
    room_id         uuid not null references public.rooms(id) on delete cascade,
    user_id         uuid not null references auth.users(id) on delete cascade,
    storage_path    text not null,          -- path to .usdz in "room-scans" bucket
    thumbnail_path  text,                   -- path to .jpg preview (optional)
    created_at      timestamptz not null default now()
);

-- Index for fast per-room lookups
create index if not exists room_scans_room_id_idx on public.room_scans(room_id);

-- RLS
alter table public.room_scans enable row level security;

create policy "Users can read their own scans"
    on public.room_scans for select
    using (auth.uid() = user_id);

create policy "Users can insert their own scans"
    on public.room_scans for insert
    with check (auth.uid() = user_id);

create policy "Users can delete their own scans"
    on public.room_scans for delete
    using (auth.uid() = user_id);


-- 2. Storage bucket: room-scans
-- Stores the actual .usdz files and optional thumbnails.
insert into storage.buckets (id, name, public)
values ('room-scans', 'room-scans', true)
on conflict (id) do nothing;

-- Storage policies: users can only upload/delete inside their own user-id folder
create policy "room-scans: owner upload"
    on storage.objects for insert
    with check (
        bucket_id = 'room-scans'
        and auth.uid()::text = (string_to_array(name, '/'))[1]
    );

create policy "room-scans: owner delete"
    on storage.objects for delete
    using (
        bucket_id = 'room-scans'
        and auth.uid()::text = (string_to_array(name, '/'))[1]
    );

create policy "room-scans: public read"
    on storage.objects for select
    using (bucket_id = 'room-scans');
