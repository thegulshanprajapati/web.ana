# WA Automate - WhatsApp Automation Portal

A premium, modular, and production-ready WhatsApp Automation Portal utilizing multi-session support, real-time Socket.IO telemetry, and auto-reply scripts.

## Tech Stack
- **Backend**: Node.js 22+, Express, Socket.IO, `@whiskeysockets/baileys` multi-session engine, Prisma ORM, SQLite database.
- **Frontend**: React (Vite), TailwindCSS, Framer Motion, Zustand state manager, Lucide Icons.

---

## Directory Structure
- `backend/`: Express & Socket.IO server, Prisma schemas, and Baileys socket handlers.
- `frontend/`: React components, Zustand state stores, and styled views.
- `sessions/`: Dynamic storage directory for active WhatsApp accounts credentials.

---

## Installation & Running

1. **Install Dependencies for all workspaces**:
   ```bash
   npm run install:all
   ```

2. **Initialize SQLite Database Schema**:
   ```bash
   npm run prisma:push
   npm run prisma:gen
   ```

3. **Start Development Servers (Concurrent Backend + Frontend)**:
   ```bash
   npm run dev
   ```

4. **Navigate to Portal**:
   Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Wipe Caches / Admin Panel**:
   Click the **Admin Controls** link in the sidebar menu or navigate directly to `/admin` section on the dashboard to wipe or clean sessions.
