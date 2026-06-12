import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Room = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  floor_area: number | null;
  created_at: string;
  updated_at: string;
};

export type RoomItem = {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  item_type: string;
  model: string | null;
  brand: string | null;
  color: string | null;
  notes: string | null;
  purchase_date: string | null;
  next_maintenance: string | null;
  position_x: number;
  position_y: number;
  created_at: string;
  updated_at: string;
};

export type RoomPhoto = {
  id: string;
  room_id: string;
  user_id: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
};

export const ITEM_TYPES = [
  { value: "bulb", label: "Light Bulb" },
  { value: "paint", label: "Paint" },
  { value: "fixture", label: "Fixture" },
  { value: "appliance", label: "Appliance" },
  { value: "flooring", label: "Flooring" },
  { value: "furniture", label: "Furniture" },
  { value: "plumbing", label: "Plumbing" },
  { value: "hvac", label: "HVAC / Heating" },
  { value: "electrical", label: "Electrical" },
  { value: "window", label: "Window / Door" },
  { value: "other", label: "Other" },
];
