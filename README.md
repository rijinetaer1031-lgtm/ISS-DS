ISS-DS (Information Systems Society - Document Archiving and Management System)

1. Overview
ISS-DS is a centralized, web-based document archiving, organization, and retrieval system developed for the Information Systems Society (ISS). It replaces scattered personal drives, local folders, and physical copies with a single structured repository supporting standardized naming, three-level folder organization (Department, Event, and Document Type), version tracking, role-based access control, an activity audit log, Recycle Bin recovery and permanent deletion, and automated weekly backups for ISS officers and technical administrators.

2. Features (Implemented)
- Document Upload, Standardized Naming, and Metadata Editing: Upload supported files (.pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt, .csv, .png, .jpg, .jpeg up to 25 MB) with standardized naming and metadata updates.
- Three-Level Folder Hierarchy: Organize records across Secretariat and Fiscal departments, event folders, and document type subfolders (defaulting to General).
- Document Versioning: Re-uploading an updated file saves a new version while preserving earlier versions.
- Search, Filtering, and Dashboard Quick Access: Search by keyword across title, category, event, and date; filter by department, event, and date range; sort results; and view frequently accessed documents on the dashboard.
- Signed In-Browser Preview: Preview permitted documents in the browser using short-lived, HMAC-signed URLs with a 2-minute expiration.
- Five-Tier Role-Based Access Control (RBAC) and Fiscal Isolation: Enforces permissions across Officer, Secretary, Treasurer, President, and Administrator roles, restricting Fiscal records to President, Treasurer, and Secretary and denying Officer and Administrator access to Fiscal documents.
- Presidential Record Approval: Allows the President to view organizational records and mark documents as Approved with timestamp and approver attribution.
- Activity Log: Records user actions including logins, uploads, edits, new versions, views, downloads, approvals, account changes, Recycle Bin actions, and backups for President and Administrator review.
- Recycle Bin and Permanent Deletion: Soft-deletes documents, events, and subfolders into a Recycle Bin for restoration, with permanent deletion restricted to Administrator and President roles.
- Account Management and Security Hardening: Supports user creation, role assignment, active or inactive status toggling, password resets with salted password hashing (bcryptjs), brute-force login rate limiting (10 attempts per 15-minute window), and HTTP security headers and CSP.
- Automated Weekly and On-Demand Backups: Runs an automated weekly cron job every Sunday at 12:00 AM archiving database exports and repository_files into backups (retaining the latest 8 .zip archives) while keeping live user files untouched, alongside Administrator backup and restore support.

3. Technologies and Versions
- Runtime: Node.js (v18.x or v20.x LTS)
- Web Framework: Express.js (v4.x)
- Database and Session Storage: PostgreSQL (v14+ or Supabase PostgreSQL) with pg and connect-pg-simple
- Security and Auth: bcryptjs, express-session, express-rate-limit, HMAC-SHA256 signed URLs, and CSP and security headers
- Backup and Archiving: node-cron and archiver
- Frontend: HTML5, CSS3 (public/css/app.css), and Vanilla JavaScript (public/js/pages/)
- Version Control: Git and GitHub

4. Installation and Setup
Requirements:
- Node.js (v18+ recommended) and npm
- PostgreSQL (v14+ or Supabase PostgreSQL connection string)
- Git (optional, if cloning from GitHub)

Steps to Download or Clone:
git clone https://github.com/rijinetaer1031-lgtm/iss-ds-portal.git
cd iss-ds-portal

Install Dependencies and Configure Environment:
1. Install packages: npm install
2. Copy .env.example to .env and fill in your local configuration values (never commit real secrets or credentials):
cp .env.example .env
PORT=3000
DATABASE_URL=postgresql://username:password@localhost:5432/iss_ds
SESSION_SECRET=replace_with_a_strong_session_secret
PREVIEW_SECRET=replace_with_a_strong_preview_secret

Start the Application:
npm start
Open http://localhost:3000 in your browser once the server starts.

5. Sample Accounts / Test Data
Use your configured seed or test accounts on a clean local or test database to verify each role's permissions:

- Administrator: username admin, password Admin@1234 - User and role management, password resets, backups, activity log, Recycle Bin permanent purge (no Fiscal access)
- President: username president, password Pres@1234 - View all records (including Fiscal), approve documents, manage non-Admin accounts, activity log, Recycle Bin permanent purge
- Secretary: username secretary, password Sec@1234 - Upload, edit, version, preview, and download Secretariat and Fiscal records; manage folders; restore Recycle Bin items
- Treasurer: username treasurer, password Treas@1234 - Manage and access Fiscal financial and liquidation reports and Secretariat records; manage folders; restore Recycle Bin items
- Officer: username officer, password Officer@1234 - Upload, edit metadata, preview, search, filter, and download Secretariat documents

Confirm exact seed credentials from your local setup script before running your clean-machine test.

6. Running the Tests
1. Start the server (npm start) against a clean test database.
2. Run automated tests if defined in package.json: npm test.
3. Execute the test cases documented in Phase 5 of the project portfolio and 04_Evidence/Testing_Evidence/ (authentication and RBAC, Fiscal access restriction, upload and standardized naming, versioning and signed preview, Presidential approval and activity log, Recycle Bin restore and permanent purge, and backup and restore).

7. Project Structure
- config and server.js: Express server setup, security headers, PostgreSQL connection and schema initialization, and Sunday 12:00 AM backup cron job.
- middleware and routes: Session authentication, 5-tier RBAC checks, document, folder, and Recycle Bin APIs, and admin and backup endpoints.
- public: HTML pages (login.html, dashboard.html, documents.html, upload.html, recycle-bin.html, activity-log.html, admin.html), styles (css/app.css), and page scripts (js/pages/).
- utils: Standardized naming, HMAC signed URL helpers, and backup archive helpers.
- repository_files and backups: Local storage for uploaded files and backup .zip archives (excluded from Git via .gitignore).

8. Team
Team Name: WARKA

- Zoie B. Tanudtanud - Project Leader: Project leadership, stakeholder coordination, SRS and documentation alignment, admin view, and presentation lead
- Rijine B. Taer - Lead Developer / Repository Maintainer: Frontend UI and styling, Backend architecture, database and RBAC logic, signed previews, GitHub repository, and release management
- Tricia Fe M. Bosbos - Developer / QA and Documentation: Recycle Bin soft-delete, restore, filtering, and purge integration, testing, and quality evidence

9. Known Limitations
- Online access only: Offline access is not supported in this web-based release.
- Metadata search scope: Keyword search matches document metadata (title, category, event, date) rather than indexing full text inside uploaded binary files.
- Single-step approval: Presidential approval marks document status as Approved without multi-stage routing workflows or external email notifications.
- Standalone scope: Does not integrate with external university-wide systems.

10. Final Version
- Repository: https://github.com/rijinetaer1031-lgtm/iss-ds-portal.git
- Final Commit ID: 74bea84 (update if a later commit is pushed)
- Date: November 22, 2026
