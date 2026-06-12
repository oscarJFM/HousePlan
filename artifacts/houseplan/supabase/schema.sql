-- HousePlan Database Schema
-- Run this in your Supabase SQL Editor at https://app.supabase.com

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Rooms table
create table if not exists rooms (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  floor_area numeric,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Room items/labels table
create table if not exists room_items (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references rooms(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  item_type text not null default 'other',
  model text,
  brand text,
  color text,
  notes text,
  purchase_date date,
  next_maintenance date,
  position_x numeric default 0,
  position_y numeric default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Room photos table
create table if not exists room_photos (
  id uuid default uuid_generate_v4() primary key,
  room_id uuid references rooms(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  storage_path text not null,
  caption text,
  created_at timestamptz default now() not null
);

-- Row Level Security
alter table rooms enable row level security;
alter table room_items enable row level security;
alter table room_photos enable row level security;

-- RLS Policies for rooms
create policy "Users can view their own rooms" on rooms
  for select using (auth.uid() = user_id);

create policy "Users can insert their own rooms" on rooms
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own rooms" on rooms
  for update using (auth.uid() = user_id);

create policy "Users can delete their own rooms" on rooms
  for delete using (auth.uid() = user_id);

-- RLS Policies for room_items
create policy "Users can view their own items" on room_items
  for select using (auth.uid() = user_id);

create policy "Users can insert their own items" on room_items
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own items" on room_items
  for update using (auth.uid() = user_id);

create policy "Users can delete their own items" on room_items
  for delete using (auth.uid() = user_id);

-- RLS Policies for room_photos
create policy "Users can view their own photos" on room_photos
  for select using (auth.uid() = user_id);

create policy "Users can insert their own photos" on room_photos
  for insert with check (auth.uid() = user_id);

create policy "Users can delete their own photos" on room_photos
  for delete using (auth.uid() = user_id);

-- Storage bucket (run this separately in Supabase dashboard or via SQL)
-- insert into storage.buckets (id, name, public) values ('room-photos', 'room-photos', false);

-- Storage policies
-- create policy "Users can upload their own photos" on storage.objects
--   for insert with check (bucket_id = 'room-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can view their own photos" on storage.objects
--   for select using (bucket_id = 'room-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can delete their own photos" on storage.objects
--   for delete using (bucket_id = 'room-photos' and auth.uid()::text = (storage.foldername(name))[1]);
