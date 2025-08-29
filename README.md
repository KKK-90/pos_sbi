# pos_sbi
POSTRKR_290825

# Advanced POS Deployment Tracker (Static PWA)

A single-page, offline-capable tracker for SBI–DOP POS deployment. **No server required** — deploy on GitHub Pages and use the browser as the runtime. Initial data seeded from `data/sample-data.json`. Users can import/export Excel, generate PDFs, and back up/restore JSON.

## 🚀 Quick start (GitHub Pages)

1. Create a repo and push these files to the `main` branch.
2. Add a file named `CNAME` at the root containing:

3. In **Settings → Pages**: Source = "GitHub Actions". The provided workflow `/ .github/workflows/pages.yml` deploys automatically on push.
4. DNS: Point your `nkr-ka.in` A/AAAA/CNAME records to GitHub Pages (already done per your note).

## 🗃️ “Database” model

- The app uses **localStorage** to persist data in the browser.
- First load seeds from `data/sample-data.json` (if no local data exists).
- Use **Data Management → Backup** to download a JSON snapshot and **Restore** to load it back later.
- For organization-wide sharing, publish curated JSON files in `/data/` and instruct users to **Restore** from them.

> GitHub Pages is static hosting (no server DB). To introduce multi-user centralized storage later, plug in an API (e.g. serverless function + cloud DB). This package keeps everything static and GoI-friendly for internal LAN/Internet read-only hosting.

## 📦 Excel & PDF

- Excel import/export via `xlsx` and PDF via `jsPDF` (CDN). Assets are cached by the service worker after first load for offline use.

## 🔧 Common fixes from your original file

- **Tab switch bug**: `showTab` case now matches the `locations` pane id (previous code used `"PO-wise-details"`), so “PO wise Details” populates correctly.  
- **Global `event` usage** removed; `showTab(event,'…')` passes the event safely.  
- **Truncated `clearAllData()`** restored.  
- Minor robustness tweaks across Excel import and id generation.

## 🔒 GoI Considerations

- Static front-end, no external data collection by default.
- Offline-capable (PWA), usable on LAN without Internet.
- Future: add a privacy notice & DPDP-aligned guidance page if collecting personal data beyond local browser storage.

## 🧪 Local test

- Serve locally with any static server (e.g. VSCode Live Server). Or open `index.html` directly — service worker requires `http(s)`, so prefer a local server to test offline features.

## 🆘 Support

- Clear browser storage via DevTools Application tab if you want to reset the app.

Demo Credentials
Hint (demo users): superadmin1 / Sup@123, admin1 / Adm@123, nkr_user / User@123
