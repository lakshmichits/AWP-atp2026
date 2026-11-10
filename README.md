# SAMAGRA SHIKSHA — DEPARTMENT OF SCHOOL EDUCATION, ANDHRA PRADESH
## ANNUAL WORK PLAN & BUDGET (AWP) — THREE-LEVEL AUTHENTICATION & HIERARCHY SYSTEM

A comprehensive, production-ready portal for the **School Development Plan (AWP F.Y. 2024-25 / 2026-27)** implementing three-level role-based access control, strict backend hierarchy validation, secure provisioning, forced password change on first login, and full multi-section AWP forms matching the official Samagra Shiksha Andhra Pradesh framework.

---

### 1. Three-Level Authentication Configuration

| Administrative Tier | Login ID Specification | Initial Password Rule | Example Login ID | Example Initial Password | Data Scope / Authorization |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. School Login** | **11-digit UDISE Code** | Last 4 digits of UDISE + `@AWP2026` | `28222591359`<br>*(or `28222500101`)* | `1359@AWP2026`<br>*(or `0101@AWP2026`)* | Strictly restricted to its **own school profile and AWP form**. |
| **2. Mandal Login** | **6-digit Mandal Code** | Mandal Code + `@AWP2026` | `282225` | `282225@AWP2026` | Strictly restricted to **schools belonging to that Mandal**. |
| **3. District Login** | **4-digit District Code** | District Code + `@Admin` | `2822` | `2822@Admin` | Complete overview of **all Mandals (32) and Schools (2,521)** in District. |

---

### 2. Mandatory Hierarchy & Mapping Rules

1. **Hierarchy Integrity**:
   - Every School UDISE Code (11 digits) is mapped to its parent 6-digit Mandal Code.
   - Every 6-digit Mandal Code is mapped to its parent 4-digit District Code.
2. **Text / String Preservation**:
   - All codes (`districtCode`, `mandalCode`, `udiseCode`) are stored and transmitted strictly as `TEXT / STRING` to preserve leading zeros and avoid JavaScript IEEE 754 float precision loss.
3. **Backend Authorization & Isolation**:
   - **School Level**: Backend rejects any request to access or update any school other than the authenticated school's own UDISE code (`403 Forbidden`).
   - **Mandal Level**: Backend rejects cross-mandal inspection; mandal officers can only retrieve school records where `school.mandalCode === req.user.mandalCode`.
   - **District Level**: District admin can view summaries, drill down into mandals, and inspect all schools across the district.
4. **Mandatory First Login Password Change**:
   - Every initial account is provisioned with `mustChangePassword: true`.
   - On first login, access to data endpoints is blocked (`403 Forbidden`) until the user sets a private password via the secure modal.
   - New passwords require minimum 8 characters with at least one letter, one number, and one special symbol (`@$!%*#?&`), hashed with 10-round `bcrypt`.

---

### 3. Data Integration

- Live school records extracted and synchronized from the official Google Sheet:
  `https://docs.google.com/spreadsheets/d/1lekUYF0I08_sCBFhwg92t5XJt_gtl6E5TLchYGqItME/edit?usp=sharing`
- **Total Provisioned Accounts**:
  - **1 District**: Anantapur (`2822`)
  - **32 Mandals**: Anantapur (`282225`), Anantapur Urban (`282264`), Atmakur (`282224`), Beluguppa (`282216`), etc.
  - **2,521 Schools**: Pre-primary through Class 12, covering State Govt, MPP/ZPP, Aided, and Private Unaided schools.

---

### 4. Running the Application Locally

1. **Install Dependencies** (already installed in workspace):
   ```bash
   npm install
   ```

2. **Run Comprehensive Test Suite**:
   ```bash
   npm test
   ```
   *Runs all 7 automated unit & integration tests covering string preservation, hierarchy mapping, credential generation, scoping boundaries, and password hashing.*

3. **Start Portal Server**:
   ```bash
   npm start
   ```
   Open your browser to:
   **`http://localhost:3000`**

---

### 5. Google Apps Script (GAS) Direct Deployment

If you wish to deploy directly within Google Sheets / Google Apps Script:
1. Open the spreadsheet `https://docs.google.com/spreadsheets/d/1lekUYF0I08_sCBFhwg92t5XJt_gtl6E5TLchYGqItME/edit?usp=sharing`.
2. Go to **Extensions > Apps Script**.
3. Copy the contents of `gas/Code.gs` into `Code.gs`.
4. Create an HTML file named `Index` and paste the contents of `gas/Index.html`.
5. Click **Deploy > New Deployment > Web App** (Execute as: *Me*, Who has access: *Anyone*).

---

### 6. Project Architecture

```
AWP- Application/
├── server.js               # Express server with security headers & routing
├── database.js             # Data layer with CSV parsing, hierarchy maps & bcrypt auth
├── middleware/
│   └── auth.js             # JWT verification, RBAC & mandatory password-change gatekeeper
├── routes/
│   ├── auth.js             # Login, password change, profile, admin reset endpoints
│   ├── schools.js          # School profile & AWP draft/submission endpoints
│   ├── mandals.js          # Mandal summary & filtered school roster endpoints
│   └── district.js         # District summary, mandal breakdown & search endpoints
├── public/                 # Modern, responsive Government of AP Web Portal
│   ├── index.html          # Login view, forced password change modal & role dashboards
│   ├── css/
│   │   └── style.css       # Official Gov AP theme (Navy, Gold, modern UI)
│   └── js/
│       ├── app.js          # Router, session management & auth controller
│       ├── school-awp.js   # 7-tab School Development Plan form (pages 1-73 format)
│       ├── mandal-view.js  # Mandal dashboard, search, roster & export
│       └── district-view.js# District KPI metrics, 32 mandals grid & master search
├── gas/                    # Google Apps Script version for native Google Sheet hosting
│   ├── Code.gs
│   └── Index.html
├── google_sheet.csv        # 2,521 schools source database
├── test_auth.js            # Automated test suite
└── package.json
```
