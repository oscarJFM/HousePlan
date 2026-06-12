# HousePlan

A home maintenance log app — scan any room with your phone camera, build a navigable 3D panorama, and pin labels directly onto surfaces (mirror, light fitting, paint colour, appliance, etc.) to track every component of your home.

## Run & Operate

- `pnpm --filter @workspace/houseplan run dev` — run the frontend (Vite, auto-assigned port)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, not used by houseplan yet)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite, Tailwind v4, shadcn/ui
- Routing: wouter
- 3D: Three.js via @react-three/fiber + @react-three/drei
- Backend: Supabase (auth + Postgres + storage — client-side only, no API server)

## Where things live

- `artifacts/houseplan/src/` — all frontend source
  - `pages/auth.tsx` — login / signup
  - `pages/dashboard.tsx` — room grid with stats
  - `pages/new-room.tsx` — create room form
  - `pages/room-detail.tsx` — room detail (Labels tab + 3D Panorama tab)
  - `pages/room-scan.tsx` — gyroscope-guided camera scan → uploads frames to Supabase storage
  - `components/PanoramaViewer.tsx` — Three.js sphere panorama with clickable label pins
  - `components/ItemSheet.tsx` — add/edit item sheet (used standalone, not in panorama flow)
  - `lib/supabase.ts` — Supabase client + Room/RoomItem/RoomPhoto types + ITEM_TYPES
- `artifacts/houseplan/supabase/setup.sql` — DB schema, RLS, storage bucket (run in Supabase SQL Editor)

## Architecture decisions

- Supabase is used entirely client-side (RLS enforces per-user data isolation)
- Room scan frames stored in `room-photos` Supabase storage bucket; yaw/pitch encoded in filenames: `frame_yaw{deg}_pitch{deg}_{ts}.jpg`
- Label positions stored in `room_items.position_x` (sphere X) and `position_y` (sphere Y); Z reconstructed from sphere geometry. Z also stored as `__pz:{z}__` prefix in notes for round-trip fidelity
- PanoramaViewer uses `rotateSpeed: -0.5` (inverted drag = look-around feel, not object-rotate feel)
- Item type icons mapped statically in `room-detail.tsx` TYPE_ICON map

## Product

- **Scan** — point phone camera around the room; gyroscope auto-captures frames every ~30° of rotation; radial progress radar shows coverage
- **Explore** — interactive 3D panorama (Three.js inside-sphere) with drag/zoom
- **Label** — click any surface → side panel → fill in name/type/brand/model/colour/dates → amber pin appears at that exact spot
- **Dashboard** — see all rooms, total labels, maintenance-due count

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Supabase schema must be applied manually via SQL Editor (`artifacts/houseplan/supabase/setup.sql`)
- iOS 13+ requires `DeviceOrientationEvent.requestPermission()` — handled in room-scan.tsx
- The `room-photos` storage bucket must be public (or signed URLs used) — setup.sql sets it to public
- `THREE.Clock` deprecation warning from @react-three/fiber is cosmetic; no action needed
- `RoomViewer.tsx` is unused (superseded by PanoramaViewer); can be deleted

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
