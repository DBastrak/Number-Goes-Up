# Archived: Vendors tab

Weekly vendor offerings page (Xûr live stock + Zavala's focused weapon and weekly armor
sets). Archived — this folder is outside `src/`, so it is not compiled or bundled.

## What it did

- **Xûr**: live weekly public stock (exotic armor + any weapons Bungie exposes publicly),
  perk tooltips from item definitions. Absent Wed/Thu when Xûr is away.
- **Zavala**: the focused weekly weapon shown as 5 copies (random-roll perk pool table on
  hover: Barrel / Magazine / Perks 1 / Perks 2) plus the two weekly armor sets expanded
  to real pieces with icons, separated by class, with 2pc/4pc set bonuses on hover.
- Manifest item lookups cached to disk per game version
  (`userData/vendor-item-cache-v2.json`).

## Known limitations (public API, no OAuth)

Xûr's 2 weekly catalysts, per-copy weapon rolls, and armor stat numbers are all
account-scoped (OAuth) data and cannot be shown with just an API key. Armor pieces show a
"stats roll on drop" note instead. Adding Bungie OAuth sign-in would unlock all three —
the stat-table UI is already wired to render whenever stat data is present.

## To re-add

1. Move the files back:
   - `main/vendors.ts` → `src/main/vendors.ts`
   - `renderer/Vendors.tsx` → `src/renderer/src/pages/Vendors.tsx`
   - `renderer/vendors.css` → `src/renderer/src/styles/vendors.css`

2. `src/main/index.ts` — add the import and IPC handler:

   ```ts
   import { getPublicVendors } from './vendors'

   // (inside app.whenReady().then(...), next to the other ipcMain.handle calls)
   ipcMain.handle('get-vendors', async () => {
     try {
       return await getPublicVendors()
     } catch (err) {
       console.error('[main] get-vendors failed:', err)
       return { ok: false, error: err.message }
     }
   })
   ```

3. `src/preload/index.ts` — add to the `Api` interface and the `api` object:

   ```ts
   // Public vendor stock (Xûr etc.) with item icons + perks.
   getVendors: () => Promise<any>

   // …and in the api object:
   getVendors: () => ipcRenderer.invoke('get-vendors'),
   ```

4. `src/renderer/src/components/TopNav.tsx` — add the tab:

   ```ts
   { id: 'vendors', label: 'Vendors' },
   ```

5. `src/renderer/src/App.tsx` — import and route:

   ```tsx
   import Vendors from './pages/Vendors'
   // …
   {page === 'vendors' && <Vendors />}
   ```

6. Restart the app (main-process change).
