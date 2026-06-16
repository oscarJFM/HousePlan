# Installing HousePlanScanner on your iPhone (Free, no Xcode needed)

You'll build the app for free in the cloud, then install it with a free tool called Sideloadly.

---

## Step 1 — Push to GitHub

If you haven't already, put this project on GitHub:

1. Go to [github.com/new](https://github.com/new) and create a new **private** repository
2. In your terminal (on your Mac), run:
   ```bash
   git init
   git add .
   git commit -m "initial"
   git remote add origin https://github.com/YOUR_USERNAME/houseplan.git
   git push -u origin main
   ```

---

## Step 2A — GitHub Actions (recommended, always free)

1. Go to your GitHub repo → click the **Actions** tab
2. You'll see a workflow called **"Build iOS IPA"** already set up
3. Click it → click **"Run workflow"** → click the green **"Run workflow"** button
4. Wait ~10–15 minutes for the Apple Silicon Mac to build it
5. When done, click the finished run → scroll down to **Artifacts** → download **HousePlanScanner-unsigned-ipa**

---

## Step 2B — Codemagic (alternative, 500 free minutes/month)

1. Go to [codemagic.io](https://codemagic.io) and sign in with your GitHub account
2. Click **Add application** → select your houseplan repo
3. Codemagic will detect `codemagic.yaml` automatically
4. Click **Start new build**
5. When done, download the IPA from the Artifacts section

---

## Step 3 — Install Sideloadly on your Mac

1. Download from [sideloadly.io](https://sideloadly.io) (free, no account needed)
2. Open the downloaded `.dmg` and drag Sideloadly to Applications
3. Open Sideloadly

---

## Step 4 — Install the IPA on your iPhone

1. Plug your iPhone into your Mac
2. Open Sideloadly
3. Drag the downloaded `.ipa` file into the Sideloadly window
4. Enter your **Apple ID email** (the free one — no developer account needed)
5. Click **Start**
6. Sideloadly will ask for your Apple ID password to sign the app
7. On your iPhone, go to **Settings → General → VPN & Device Management**
   and tap your Apple ID email → **Trust**
8. The app is installed — open it from your home screen

> **Note:** Free Apple ID signing expires every **7 days**. Just repeat Step 4
> to re-sign. The app data is preserved between re-signs.

---

## Add your Supabase credentials before building

Before Step 2, open:
```
ios/HousePlanScanner/HousePlanScanner/Services/SupabaseService.swift
```
Find these two lines (~25) and replace the placeholders:
```swift
?? "https://YOUR_PROJECT.supabase.co"
?? "YOUR_ANON_KEY"
```
with your actual Supabase URL and anon key, then commit and push.
