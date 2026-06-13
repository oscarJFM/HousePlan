# HousePlan iOS — RoomPlan Companion App

Native iPhone app that uses **Apple's RoomPlan framework** (LiDAR) to scan rooms
and sync them with the same Supabase backend as the HousePlan web app.

---

## What this app does

| Feature | Details |
|---|---|
| **Sign in / Sign up** | Same Supabase account as the web app |
| **Dashboard** | Lists all your rooms, synced in real time |
| **Add / edit items** | Log fixtures, appliances, paint colours, etc. |
| **RoomPlan 3D scan** | LiDAR scans room geometry → walls, doors, windows, furniture |
| **USDZ export** | Uploads the scan as a `.usdz` model to Supabase Storage |
| **Maintenance alerts** | Items due for service in the next 30 days shown prominently |

---

## Requirements

| Requirement | Detail |
|---|---|
| **Mac with Xcode 15+** | Available free from the Mac App Store |
| **Apple Developer account** | Free account works for on-device testing; paid ($99/yr) needed for App Store |
| **iPhone 12 Pro or newer** | Or iPad Pro (any with LiDAR sensor) — RoomPlan **requires LiDAR** |
| **iOS 17.0+** | Minimum deployment target set in the project |

> **No LiDAR? No problem for items/labels.** The Labels tab works on any iPhone.
> Only the "3D Scan" tab requires LiDAR hardware.

---

## Setup — Step by step

### 1. Run the Supabase migration

In your [Supabase project](https://supabase.com) → **SQL Editor**, paste and run:

```
ios/supabase-migration.sql
```

This creates the `room_scans` table and `room-scans` storage bucket.

### 2. Open in Xcode

```bash
open ios/HousePlanScanner/HousePlanScanner.xcodeproj
```

### 3. Set your Supabase credentials

Two options:

**Option A — Xcode Scheme environment variables (recommended for development):**
1. Product → Scheme → Edit Scheme…
2. Run → Arguments → Environment Variables
3. Add:
   - `SUPABASE_URL` = `https://YOUR_PROJECT_REF.supabase.co`
   - `SUPABASE_ANON_KEY` = `your-anon-key`

**Option B — Edit the source directly:**

Open `Services/SupabaseService.swift` and replace the placeholders:
```swift
// Line ~25
?? "https://YOUR_PROJECT.supabase.co"
?? "YOUR_ANON_KEY"
```

Your Supabase URL and anon key are in:
Supabase Dashboard → Project Settings → API → Project URL & anon/public key

### 4. Set your Team

1. Click the `HousePlanScanner` project in the file navigator
2. Select the `HousePlanScanner` target → Signing & Capabilities
3. Set **Team** to your Apple ID / Developer account

### 5. Build & run

Connect your iPhone, select it as the run destination, press ▶.

---

## Project structure

```
ios/HousePlanScanner/
├── HousePlanScanner.xcodeproj/
└── HousePlanScanner/
    ├── HousePlanScannerApp.swift   # App entry point
    ├── ContentView.swift           # Auth gate
    ├── Models/
    │   └── Models.swift            # Room, RoomItem, RoomScan structs
    ├── Services/
    │   └── SupabaseService.swift   # All Supabase API calls (no SDK needed)
    └── Views/
        ├── AuthView.swift          # Sign in / sign up
        ├── DashboardView.swift     # Room list
        ├── RoomDetailView.swift    # Labels + 3D Scan tabs
        ├── RoomPlanView.swift      # RoomPlan session + SceneKit preview + USDZ upload
        └── AddItemView.swift       # Add/edit item sheet
```

---

## How the RoomPlan scan works

1. User taps **Start Room Scan** in the 3D Scan tab
2. `RoomCaptureView` (Apple's UI) shows a live camera feed with mesh overlay
3. RoomPlan continuously builds a `CapturedRoom` with:
   - Walls, doors, windows (parametric geometry)
   - Furniture / objects (bounding box estimates)
4. User taps **Done** → session stops
5. App shows a **review screen** with a SceneKit 3D preview and counts (walls/doors/windows/objects)
6. User taps **Save Scan**:
   - `RoomBuilder` exports the captured structure to a `.usdz` file
   - USDZ uploaded to Supabase Storage (`room-scans` bucket)
   - Metadata row inserted into `room_scans` table

---

## Shared Supabase backend

This app reads and writes the **same database** as the web app:

| Table | Used by |
|---|---|
| `rooms` | Both — create/list/delete rooms |
| `room_items` | Both — labels with type, brand, model, colour, dates |
| `room_photos` | Web only — camera scan frames (not used by iOS) |
| `room_scans` | iOS only — USDZ models from RoomPlan |

---

## No third-party dependencies

The app uses only:
- **SwiftUI** — UI
- **RoomPlan** — LiDAR scanning (Apple framework, no install needed)
- **SceneKit** — 3D preview on the review screen (Apple framework)
- **URLSession** — direct Supabase REST API calls (no Supabase Swift SDK needed)
