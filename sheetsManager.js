const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DATA_DIR = path.join(__dirname, 'data');
const MASTER_WORKBOOK_PATH = path.join(DATA_DIR, 'AWP_All_Responses.xlsx');
const CSV_MASTER_PATH = path.join(DATA_DIR, 'AWP_Master_Responses.csv');

// Column Definitions for Sheet 1: AWP_Master_Responses
const MASTER_HEADERS = [
  'Submission_ID',
  'Timestamp',
  'UDISE_Code',
  'School_Name',
  'Mandal_Code',
  'Mandal_Name',
  'District_Code',
  'District_Name',
  'School_Category',
  'Management_Category',
  'Management_Name',
  'Status',
  'Updated_By',
  // Section 1: Basic & Institutional
  'HM_Name',
  'HM_Phone',
  'School_Email',
  'Village',
  'Habitation',
  'Assembly_Constituency',
  'Parliament_Constituency',
  'Area_Type',
  'School_Type',
  'Shift_System',
  'Pre_Primary_In_Campus',
  'Short_Term_Target',
  'Long_Term_Target',
  // Section 2: Enrolment
  'Enrolment_Total_Boys',
  'Enrolment_Total_Girls',
  'Enrolment_Grand_Total',
  // Section 2: Facilities
  'Boys_Toilets_Functional',
  'Girls_Toilets_Functional',
  'CWSN_Toilet_Available',
  'Drinking_Water_Functional',
  'Classrooms_Good_Condition',
  'Classrooms_Minor_Repair',
  'Electricity_Functional',
  'Solar_Panel_Available',
  // Section 4 & 5: Teachers
  'Teachers_Sanctioned',
  'Teachers_Working',
  'Teachers_Vacant',
  'Teachers_Required',
  'Teacher_Requirement_Level',
  'CPD_Training_50Hrs_Completed',
  'Alternative_Arrangements_Steps',
  // Section 14 & 18: Infrastructure & Safety
  'Compound_Wall_Status',
  'MDM_Kitchen_Shed_Status',
  'CWSN_Ramp_Handrail_Status',
  'Fire_Safety_Extinguishers',
  'Child_Safety_Box',
  'Cyber_Safety_Trained',
  // Section 16: Budget (₹)
  'Budget_Composite_School_Grant_INR',
  'Budget_Sports_Grant_INR',
  'Budget_Library_Grant_INR',
  'Budget_Eco_Club_Grant_INR',
  'Budget_Self_Defence_Grant_INR',
  'Total_Budget_Requested_INR',
  // Section 21 & 22: Action Plans
  'Short_Term_Action_Plan',
  'Short_Term_Roles',
  'Short_Term_Timeline',
  'Long_Term_Action_Plan',
  'Long_Term_Roles',
  'Long_Term_Timeline',
  'SMC_Resolutions_Summary'
];

// Column Definitions for Sheet 2: SMC_Committee_Responses
const SMC_HEADERS = [
  'Submission_ID',
  'Timestamp',
  'UDISE_Code',
  'School_Name',
  'Mandal_Code',
  'Mandal_Name',
  'Member_No',
  'Member_Name',
  'Gender',
  'Designation',
  'Contact_Phone'
];

// Column Definitions for Sheet 3: Budget_Proposals_Responses
const BUDGET_HEADERS = [
  'Submission_ID',
  'Timestamp',
  'UDISE_Code',
  'School_Name',
  'Mandal_Code',
  'Mandal_Name',
  'Activity_SNo',
  'Grant_Description',
  'Unit_Cost_INR',
  'Units_Required',
  'Total_Amount_Requested_INR'
];

// Column Definitions for Sheet 4: User_Accounts_Registry
const ACCOUNTS_HEADERS = [
  'Login_ID',
  'Role',
  'Entity_Name',
  'District_Code',
  'Mandal_Code',
  'UDISE_Code',
  'Initial_Password_Formula',
  'Password_Changed_Status',
  'Password_Changed_At',
  'Last_Login_Timestamp'
];

// Column Definitions for Sheet 5: Mandal_Summary_Stats
const MANDAL_STATS_HEADERS = [
  'Mandal_Code',
  'Mandal_Name',
  'District_Code',
  'Total_Schools',
  'Total_Boys',
  'Total_Girls',
  'Grand_Total_Enrolment',
  'AWP_Submitted_Count',
  'AWP_Draft_Count',
  'AWP_Pending_Count',
  'Submission_Rate_Percentage'
];

class SheetsManager {
  constructor() {
    this.masterRows = new Map();   // UDISE -> row object
    this.smcRows = [];              // array of SMC member rows
    this.budgetRows = [];           // array of budget item rows
  }

  // Ensures data directory exists
  ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  // Initializes all required sheets
  initializeAllSheets(db) {
    this.ensureDir();
    console.log('[SheetsManager] Automatically creating and verifying all required response sheets...');

    // Populate user registry
    const accountsData = [];
    db.users.forEach(u => {
      accountsData.push({
        Login_ID: String(u.loginId),
        Role: u.role,
        Entity_Name: u.name,
        District_Code: String(u.districtCode || ''),
        Mandal_Code: String(u.mandalCode || ''),
        UDISE_Code: String(u.udiseCode || ''),
        Initial_Password_Formula: u.initialPassword,
        Password_Changed_Status: u.mustChangePassword ? 'PENDING_FIRST_CHANGE' : 'SECURED',
        Password_Changed_At: u.passwordChangedAt || 'N/A',
        Last_Login_Timestamp: u.lastLoginAt || 'NEVER'
      });
    });

    // Populate Mandal Summary Stats
    const mandalStatsData = [];
    const dist = db.districts.get('2822');
    if (dist) {
      dist.mandalCodes.forEach(mCode => {
        const sum = db.getMandalSummary(mCode);
        if (sum) {
          const totalSch = sum.totalSchools || 1;
          const subRate = Math.round((sum.awpStats.submitted / totalSch) * 100);
          mandalStatsData.push({
            Mandal_Code: String(sum.mandalCode),
            Mandal_Name: sum.mandalName,
            District_Code: String(sum.districtCode),
            Total_Schools: sum.totalSchools,
            Total_Boys: sum.enrolment.totalBoys,
            Total_Girls: sum.enrolment.totalGirls,
            Grand_Total_Enrolment: sum.enrolment.grandTotal,
            AWP_Submitted_Count: sum.awpStats.submitted,
            AWP_Draft_Count: sum.awpStats.draft,
            AWP_Pending_Count: sum.awpStats.pending,
            Submission_Rate_Percentage: `${subRate}%`
          });
        }
      });
    }

    // Populate existing AWP submissions
    this.masterRows.clear();
    this.smcRows = [];
    this.budgetRows = [];

    db.awpSubmissions.forEach((sub, udise) => {
      const s = db.schools.get(udise);
      if (s) {
        this.addSubmissionRows(s, sub.data || {}, sub.status, sub.updatedAt, sub.updatedBy);
      }
    });

    this.writeWorkbook(accountsData, mandalStatsData);
    console.log(`[SheetsManager] All 5 Required Response Sheets Created & Updated:`);
    console.log(` 1. AWP_Master_Responses (${this.masterRows.size} submissions recorded)`);
    console.log(` 2. SMC_Committee_Responses (${this.smcRows.length} member records)`);
    console.log(` 3. Budget_Proposals_Responses (${this.budgetRows.length} line items)`);
    console.log(` 4. User_Accounts_Registry (${accountsData.length} accounts provisioned)`);
    console.log(` 5. Mandal_Summary_Stats (${mandalStatsData.length} administrative blocks)`);
  }

  // Adds/updates rows for a school's AWP submission
  addSubmissionRows(school, data, status, updatedAt, updatedBy) {
    const timestamp = updatedAt || new Date().toISOString();
    const submissionId = `AWP-${school.udiseCode}-${Date.now().toString().slice(-6)}`;

    // Calculate budget totals
    const csg = parseInt(data.budget_csg_total) || 50000;
    const sports = parseInt(data.budget_sports_total) || 10000;
    const library = parseInt(data.budget_library_total) || 13000;
    const eco = parseInt(data.budget_eco_total) || 15000;
    const selfDefence = parseInt(data.budget_selfdefence_total) || 15000;
    const totalBudget = csg + sports + library + eco + selfDefence;

    // 1. Master Row
    const masterRow = {
      Submission_ID: submissionId,
      Timestamp: timestamp,
      UDISE_Code: String(school.udiseCode),
      School_Name: school.schoolName,
      Mandal_Code: String(school.mandalCode),
      Mandal_Name: school.mandalName,
      District_Code: String(school.districtCode),
      District_Name: school.districtName,
      School_Category: school.structure || 'School',
      Management_Category: school.managementCategory || '',
      Management_Name: school.managementName || '',
      Status: status || 'DRAFT',
      Updated_By: updatedBy || 'SCHOOL',

      HM_Name: data.hmName || '',
      HM_Phone: data.hmPhone || '',
      School_Email: data.schoolEmail || '',
      Village: data.village || '',
      Habitation: data.habitation || '',
      Assembly_Constituency: data.assemblyConstituency || '',
      Parliament_Constituency: data.parliamentConstituency || '',
      Area_Type: data.areaType || 'Rural',
      School_Type: data.schoolType || 'Co-Education',
      Shift_System: data.shiftSystem || 'No',
      Pre_Primary_In_Campus: data.prePrimaryInCampus || 'Yes',
      Short_Term_Target: data.shortTermTarget || '',
      Long_Term_Target: data.longTermTarget || '',

      Enrolment_Total_Boys: school.enrolment.totalBoys,
      Enrolment_Total_Girls: school.enrolment.totalGirls,
      Enrolment_Grand_Total: school.enrolment.grandTotal,

      Boys_Toilets_Functional: parseInt(data.boysToilets) || 0,
      Girls_Toilets_Functional: parseInt(data.girlsToilets) || 0,
      CWSN_Toilet_Available: data.cwsnToilet || 'No',
      Drinking_Water_Functional: data.drinkingWater || 'Yes',
      Classrooms_Good_Condition: parseInt(data.classroomsGood) || 0,
      Classrooms_Minor_Repair: parseInt(data.classroomsMinorRepair) || 0,
      Electricity_Functional: data.electricityAvailable || 'Yes',
      Solar_Panel_Available: data.solarPanel || 'No',

      Teachers_Sanctioned: parseInt(data.teachersSanctioned) || 0,
      Teachers_Working: parseInt(data.teachersWorking) || 0,
      Teachers_Vacant: parseInt(data.teachersVacant) || 0,
      Teachers_Required: parseInt(data.teachersRequired) || 0,
      Teacher_Requirement_Level: data.teacherReqLevel || 'Primary (1-5)',
      CPD_Training_50Hrs_Completed: data.cpdTrainingCompleted || 'Yes',
      Alternative_Arrangements_Steps: data.teacherAlternativeSteps || '',

      Compound_Wall_Status: data.compoundWall || 'Pucca Wall',
      MDM_Kitchen_Shed_Status: data.mdmKitchenShed || 'Available & Functional',
      CWSN_Ramp_Handrail_Status: data.rampWithRailing || 'Yes',
      Fire_Safety_Extinguishers: data.fireSafety || 'Yes',
      Child_Safety_Box: data.childSafetyBox || 'Yes',
      Cyber_Safety_Trained: data.cyberSafety || 'Yes',

      Budget_Composite_School_Grant_INR: csg,
      Budget_Sports_Grant_INR: sports,
      Budget_Library_Grant_INR: library,
      Budget_Eco_Club_Grant_INR: eco,
      Budget_Self_Defence_Grant_INR: selfDefence,
      Total_Budget_Requested_INR: totalBudget,

      Short_Term_Action_Plan: data.shortActionDesc || '',
      Short_Term_Roles: data.shortActionRole || '',
      Short_Term_Timeline: data.shortActionTimeline || '',
      Long_Term_Action_Plan: data.longActionDesc || '',
      Long_Term_Roles: data.longActionRole || '',
      Long_Term_Timeline: data.longActionTimeline || '',
      SMC_Resolutions_Summary: data.smcResolutions || ''
    };

    this.masterRows.set(String(school.udiseCode), masterRow);

    // 2. SMC Committee Rows
    // Remove old SMC rows for this school if any
    this.smcRows = this.smcRows.filter(r => r.UDISE_Code !== String(school.udiseCode));

    const smcMembers = [
      { no: 1, name: data.smc1_name || 'Chairman', gender: data.smc1_gender || 'Male', desig: 'Chairman', phone: data.smc1_phone || '' },
      { no: 2, name: data.smc2_name || 'Vice Chairman', gender: data.smc2_gender || 'Female', desig: 'Vice Chairman', phone: data.smc2_phone || '' },
      { no: 3, name: data.smc3_name || (data.hmName || 'HM'), gender: data.smc3_gender || 'Male', desig: 'Member Convener (HM)', phone: data.smc3_phone || data.hmPhone || '' },
      { no: 4, name: data.smc4_name || 'Parent Member 1', gender: data.smc4_gender || 'Female', desig: 'Parent Member', phone: data.smc4_phone || '' },
      { no: 5, name: data.smc5_name || 'Parent Member 2', gender: data.smc5_gender || 'Male', desig: 'Parent Member', phone: data.smc5_phone || '' }
    ];

    smcMembers.forEach(m => {
      this.smcRows.push({
        Submission_ID: submissionId,
        Timestamp: timestamp,
        UDISE_Code: String(school.udiseCode),
        School_Name: school.schoolName,
        Mandal_Code: String(school.mandalCode),
        Mandal_Name: school.mandalName,
        Member_No: m.no,
        Member_Name: m.name,
        Gender: m.gender,
        Designation: m.desig,
        Contact_Phone: m.phone
      });
    });

    // 3. Budget Proposals Line Items
    this.budgetRows = this.budgetRows.filter(r => r.UDISE_Code !== String(school.udiseCode));

    const budgetItems = [
      { sno: 1, desc: 'Composite School Grant (Maintenance & Infrastructure)', unit: parseInt(data.budget_csg_unit) || 50000, units: parseInt(data.budget_csg_units) || 1, total: csg },
      { sno: 2, desc: 'Sports Grant (Sports equipment & play material)', unit: parseInt(data.budget_sports_unit) || 10000, units: parseInt(data.budget_sports_units) || 1, total: sports },
      { sno: 3, desc: 'Library Grant (Reading material & books)', unit: parseInt(data.budget_library_unit) || 13000, units: parseInt(data.budget_library_units) || 1, total: library },
      { sno: 4, desc: 'Youth & Eco Club Grant', unit: parseInt(data.budget_eco_unit) || 15000, units: parseInt(data.budget_eco_units) || 1, total: eco },
      { sno: 5, desc: 'Self Defence Training for Girl Children', unit: parseInt(data.budget_selfdefence_unit) || 15000, units: parseInt(data.budget_selfdefence_units) || 1, total: selfDefence }
    ];

    budgetItems.forEach(b => {
      this.budgetRows.push({
        Submission_ID: submissionId,
        Timestamp: timestamp,
        UDISE_Code: String(school.udiseCode),
        School_Name: school.schoolName,
        Mandal_Code: String(school.mandalCode),
        Mandal_Name: school.mandalName,
        Activity_SNo: b.sno,
        Grant_Description: b.desc,
        Unit_Cost_INR: b.unit,
        Units_Required: b.units,
        Total_Amount_Requested_INR: b.total
      });
    });
  }

  // Writes all sheets to AWP_All_Responses.xlsx
  writeWorkbook(accountsData, mandalStatsData) {
    this.ensureDir();
    const wb = XLSX.utils.book_new();

    // 1. Sheet: AWP_Master_Responses
    const masterData = Array.from(this.masterRows.values());
    const wsMaster = XLSX.utils.json_to_sheet(masterData.length > 0 ? masterData : [this.getEmptyRow(MASTER_HEADERS)], { header: MASTER_HEADERS });
    XLSX.utils.book_append_sheet(wb, wsMaster, 'AWP_Master_Responses');

    // 2. Sheet: SMC_Committee_Responses
    const wsSMC = XLSX.utils.json_to_sheet(this.smcRows.length > 0 ? this.smcRows : [this.getEmptyRow(SMC_HEADERS)], { header: SMC_HEADERS });
    XLSX.utils.book_append_sheet(wb, wsSMC, 'SMC_Committee_Responses');

    // 3. Sheet: Budget_Proposals_Responses
    const wsBudget = XLSX.utils.json_to_sheet(this.budgetRows.length > 0 ? this.budgetRows : [this.getEmptyRow(BUDGET_HEADERS)], { header: BUDGET_HEADERS });
    XLSX.utils.book_append_sheet(wb, wsBudget, 'Budget_Proposals_Responses');

    // 4. Sheet: User_Accounts_Registry
    const wsAccounts = XLSX.utils.json_to_sheet(accountsData && accountsData.length > 0 ? accountsData : [this.getEmptyRow(ACCOUNTS_HEADERS)], { header: ACCOUNTS_HEADERS });
    XLSX.utils.book_append_sheet(wb, wsAccounts, 'User_Accounts_Registry');

    // 5. Sheet: Mandal_Summary_Stats
    const wsMandal = XLSX.utils.json_to_sheet(mandalStatsData && mandalStatsData.length > 0 ? mandalStatsData : [this.getEmptyRow(MANDAL_STATS_HEADERS)], { header: MANDAL_STATS_HEADERS });
    XLSX.utils.book_append_sheet(wb, wsMandal, 'Mandal_Summary_Stats');

    // Write file
    XLSX.writeFile(wb, MASTER_WORKBOOK_PATH);

    // Also export AWP_Master_Responses.csv for quick flat file consumption
    if (masterData.length > 0) {
      const csvContent = XLSX.utils.sheet_to_csv(wsMaster);
      fs.writeFileSync(CSV_MASTER_PATH, csvContent, 'utf-8');
    }
  }

  getEmptyRow(headers) {
    const obj = {};
    headers.forEach(h => obj[h] = '');
    return obj;
  }

  // Live update method called on every AWP save/submit
  recordAWPResponse(db, school, data, status, updatedBy) {
    this.addSubmissionRows(school, data, status, new Date().toISOString(), updatedBy);
    this.initializeAllSheets(db);
  }

  // Live update method called on user login / password change
  recordUserActivity(db) {
    this.initializeAllSheets(db);
  }
}

const sheetsManager = new SheetsManager();
module.exports = sheetsManager;
