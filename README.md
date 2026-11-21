# ISS-DS — Information System Society Document Archiving & Retrieval System

A centralized, role-based web repository built for the ISS ORG to store, organize, preview, version, and track organizational records.

## Key Features

- Three-Level Folder Hierarchy: Organizes files under Department (Secretariat / Fiscal) > Event > Document Type Folder with automatic standardized file naming ({Department}[_{DocType}]_{Title}_{Date}_v{Version}.{ext}).
- Automatic Versioning: Uploading a revised file saves a new version while keeping earlier versions intact.
- Search, Filtering & Signed Previews: Supports keyword search, filtering by department, event, and date range, sorting, and in-browser previews via short-lived HMAC-signed temporary URLs (2-minute expiry).
- Five-Tier Role-Based Access Control (RBAC):
  - Officer: Upload, edit metadata, preview, search, and download Secretariat records.
  - Secretary & Treasurer: Access Secretariat and Fiscal records, manage Event and Document Type folders, and soft-delete or restore items in the Recycle Bin.
  - President: View all records (including Fiscal), mark documents as Approved, view activity logs, manage non-Administrator accounts, and restore or permanently purge Recycle Bin items.
  - Administrator: Manage user accounts, roles, and password resets, view activity logs, run manual ZIP backups, and restore or permanently purge Recycle Bin items (restricted from Fiscal records).
- Recycle Bin & Activity Log: Soft-deletes items to the Recycle Bin prior to permanent purge, paired with an audit log of system and document actions.
- Automated & Manual Backups: Runs scheduled weekly ZIP backups (node-cron every Sunday at 00:00, retaining the 8 most recent archives) and supports on-demand Administrator ZIP exports of PostgreSQL data and repository files.

## Tech Stack

- Backend: Node.js, Express.js
- Database & Sessions: PostgreSQL (connect-pg-simple persistent sessions)
- Frontend: HTML5, CSS3, Vanilla JavaScript
- Security & Utilities: bcryptjs password hashing, IP login rate-limiting, CSP & security headers, archiver, node-cron

## Local Setup

1. Clone the repository:
   git clone (https://github.com/rijinetaer1031-lgtm/iss-ds-portal)
   cd iss-ds-upload

2. Install dependencies:
   npm install

3. Configure environment variables:
   Create a .env file in the project root with your PostgreSQL connection string, session secret, and port settings.

4. Start the server:
   npm start
   Open http://localhost:3000 in your browser.

## Project Team (WARKA)

- Zoie B. Tanudtanud — Project Leader
- Rijine B. Taer — Team Member / Developer
- Tricia Fe M. Bosbos — Team Member / Developer
