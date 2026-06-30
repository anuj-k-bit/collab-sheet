# CollabSheet

A real-time collaborative spreadsheet web application built with plain JS/ES modules, powered by Supabase (Postgres, Auth, Realtime, Presence) and bundled using Vite.

🔗 Live Demo: [collab-sheet-alpha.vercel.app](https://collab-sheet-alpha.vercel.app)

---

## ✨ Features

- **Real-time Collaboration**: Watch other users' active cell cursors and see edits appear live without page refreshes.
- **Row-Level Security (RLS)**: Enforced collaborator roles at the database layer (viewers can read but not write, editors and owners can edit).
- **Google & Anonymous Auth**: Sign in using your Google account or continue as a Guest using Supabase Anonymous Auth.
- **Formula Support**: Standard spreadsheet computations (e.g., `=SUM(A1:A10)`, simple cell references, and arithmetic expressions).
- **Spreadsheet Grid**: 50 rows × 26 columns with keyboard navigation (arrow keys, enter, delete).
- **Collaborator Management**: Share spreadsheets with other users using their User ID, assigning them Editor or Viewer roles.
- **Export to CSV**: Download your spreadsheet data directly.

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6 Modules)
- **Bundler & Server**: Vite
- **Backend & Persistence**: Supabase
  - **Database**: PostgreSQL (for tables, foreign keys, constraints)
  - **Auth**: Google OAuth + Anonymous Guest Sessions
  - **Realtime**: Postgres Changes Subscription (last-write-wins)
  - **Presence**: Decoupled cursor tracking and collaborator status broadcasts

---

## 🚀 Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/anuj-k-bit/collab-sheet.git
cd collab-sheet
npm install
