const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const sheetsManager = require('./sheetsManager');

const CSV_FILE = path.join(__dirname, 'google_sheet.csv');
const STATE_FILE = path.join(__dirname, 'data', 'app_state.json');

class Database {
  constructor() {
    this.districts = new Map();
    this.mandals = new Map();
    this.schools = new Map();
    this.users = new Map();
    this.awpSubmissions = new Map();
    this.initialized = false;
  }

  // Parse CSV lines handling quoted fields correctly
  parseCSVLine(text) {
    const row = [''];
    let r = 0;
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQuotes && text[i + 1] === '"') {
          row[r] += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push('');
        r++;
      } else {
        row[r] += c;
      }
    }
    return row;
  }

  init() {
    console.log('[Database] Initializing data from CSV...');
    if (!fs.existsSync(CSV_FILE)) {
      throw new Error(`CSV file not found at: ${CSV_FILE}`);
    }

    const content = fs.readFileSync(CSV_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const headers = this.parseCSVLine(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCSVLine(lines[i]);
      if (row.length < 6) continue;

      // Extract & strictly enforce TEXT/STRING format
      const districtName = String(row[0] || '').trim();
      const districtCode = String(row[1] || '').trim();
      const mandalName = String(row[2] || '').trim();
      const mandalCode = String(row[3] || '').trim();
      const schoolName = String(row[4] || '').trim();
      const udiseCode = String(row[5] || '').trim();

      if (!districtCode || !mandalCode || !udiseCode) continue;

      // 1. District Record
      if (!this.districts.has(districtCode)) {
        this.districts.set(districtCode, {
          code: districtCode,
          name: districtName,
          mandalCodes: []
        });

        // Provision District User
        const distInitialPassword = `${districtCode}@Admin`;
        this.users.set(districtCode, {
          loginId: districtCode,
          role: 'DISTRICT',
          name: `${districtName} District Education Office`,
          districtCode: districtCode,
          mandalCode: null,
          udiseCode: null,
          initialPassword: distInitialPassword,
          mustChangePassword: true,
          passwordHash: null,
          passwordChangedAt: null,
          lastLoginAt: null
        });
      }

      const distObj = this.districts.get(districtCode);
      if (!distObj.mandalCodes.includes(mandalCode)) {
        distObj.mandalCodes.push(mandalCode);
      }

      // 2. Mandal Record
      if (!this.mandals.has(mandalCode)) {
        this.mandals.set(mandalCode, {
          code: mandalCode,
          name: mandalName,
          districtCode: districtCode,
          districtName: districtName,
          schoolCodes: []
        });

        // Provision Mandal User
        const mandalInitialPassword = `${mandalCode}@AWP2026`;
        this.users.set(mandalCode, {
          loginId: mandalCode,
          role: 'MANDAL',
          name: `${mandalName} Mandal Resource Centre`,
          districtCode: districtCode,
          mandalCode: mandalCode,
          udiseCode: null,
          initialPassword: mandalInitialPassword,
          mustChangePassword: true,
          passwordHash: null,
          passwordChangedAt: null,
          lastLoginAt: null
        });
      }

      const mandalObj = this.mandals.get(mandalCode);
      if (!mandalObj.schoolCodes.includes(udiseCode)) {
        mandalObj.schoolCodes.push(udiseCode);
      }

      // 3. School Record
      // Build class enrolment breakdown
      const enrolment = {
        pp3: { boys: parseInt(row[8]) || 0, girls: parseInt(row[9]) || 0, trans: parseInt(row[10]) || 0, total: parseInt(row[11]) || 0 },
        pp2: { boys: parseInt(row[12]) || 0, girls: parseInt(row[13]) || 0, trans: parseInt(row[14]) || 0, total: parseInt(row[15]) || 0 },
        pp1: { boys: parseInt(row[16]) || 0, girls: parseInt(row[17]) || 0, trans: parseInt(row[18]) || 0, total: parseInt(row[19]) || 0 },
        class1: { boys: parseInt(row[20]) || 0, girls: parseInt(row[21]) || 0, trans: parseInt(row[22]) || 0, total: parseInt(row[23]) || 0 },
        class2: { boys: parseInt(row[24]) || 0, girls: parseInt(row[25]) || 0, trans: parseInt(row[26]) || 0, total: parseInt(row[27]) || 0 },
        class3: { boys: parseInt(row[28]) || 0, girls: parseInt(row[29]) || 0, trans: parseInt(row[30]) || 0, total: parseInt(row[31]) || 0 },
        class4: { boys: parseInt(row[32]) || 0, girls: parseInt(row[33]) || 0, trans: parseInt(row[34]) || 0, total: parseInt(row[35]) || 0 },
        class5: { boys: parseInt(row[36]) || 0, girls: parseInt(row[37]) || 0, trans: parseInt(row[38]) || 0, total: parseInt(row[39]) || 0 },
        class6: { boys: parseInt(row[40]) || 0, girls: parseInt(row[41]) || 0, trans: parseInt(row[42]) || 0, total: parseInt(row[43]) || 0 },
        class7: { boys: parseInt(row[44]) || 0, girls: parseInt(row[45]) || 0, trans: parseInt(row[46]) || 0, total: parseInt(row[47]) || 0 },
        class8: { boys: parseInt(row[48]) || 0, girls: parseInt(row[49]) || 0, trans: parseInt(row[50]) || 0, total: parseInt(row[51]) || 0 },
        class9: { boys: parseInt(row[52]) || 0, girls: parseInt(row[53]) || 0, trans: parseInt(row[54]) || 0, total: parseInt(row[55]) || 0 },
        class10: { boys: parseInt(row[56]) || 0, girls: parseInt(row[57]) || 0, trans: parseInt(row[58]) || 0, total: parseInt(row[59]) || 0 },
        class11: { boys: parseInt(row[60]) || 0, girls: parseInt(row[61]) || 0, trans: parseInt(row[62]) || 0, total: parseInt(row[63]) || 0 },
        class12: { boys: parseInt(row[64]) || 0, girls: parseInt(row[65]) || 0, trans: parseInt(row[66]) || 0, total: parseInt(row[67]) || 0 },
        totalBoys: parseInt(row[68]) || 0,
        totalGirls: parseInt(row[69]) || 0,
        totalTrans: parseInt(row[70]) || 0,
        grandTotal: parseInt(row[71]) || 0
      };

      const schoolRecord = {
        udiseCode: udiseCode,
        schoolName: schoolName,
        mandalCode: mandalCode,
        mandalName: mandalName,
        districtCode: districtCode,
        districtName: districtName,
        schoolManagementCode: row[6] ? String(row[6]).trim() : '',
        schoolCategoryCode: row[7] ? String(row[7]).trim() : '',
        managementName: row[76] ? String(row[76]).trim() : '',
        managementCategory: row[77] ? String(row[77]).trim() : '',
        structure: row[78] ? String(row[78]).trim() : '',
        lowestClass: row[75] ? String(row[75]).trim() : '',
        target: parseInt(row[73]) || 0,
        achieved: parseInt(row[72]) || 0,
        enrolment: enrolment
      };
      this.schools.set(udiseCode, schoolRecord);

      // Provision School User
      // Initial Password: Last 4 digits of UDISE Code + @AWP2026
      const last4 = udiseCode.slice(-4);
      const schoolInitialPassword = `${last4}@AWP2026`;
      this.users.set(udiseCode, {
        loginId: udiseCode,
        role: 'SCHOOL',
        name: schoolName,
        districtCode: districtCode,
        mandalCode: mandalCode,
        udiseCode: udiseCode,
        initialPassword: schoolInitialPassword,
        mustChangePassword: true,
        passwordHash: null,
        passwordChangedAt: null,
        lastLoginAt: null
      });
    }

    // Load persisted state (changed passwords, AWP submissions)
    this.loadPersistedState();

    // Automatically create and verify all required response sheets
    sheetsManager.initializeAllSheets(this);

    this.initialized = true;
    console.log(`[Database] Initialized successfully:`);
    console.log(` - Districts: ${this.districts.size}`);
    console.log(` - Mandals: ${this.mandals.size}`);
    console.log(` - Schools: ${this.schools.size}`);
    console.log(` - User Accounts Provisioned: ${this.users.size}`);
  }

  loadPersistedState() {
    if (!fs.existsSync(STATE_FILE)) {
      return;
    }
    try {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (data.users) {
        for (const [loginId, uState] of Object.entries(data.users)) {
          const user = this.users.get(loginId);
          if (user) {
            user.mustChangePassword = uState.mustChangePassword;
            user.passwordHash = uState.passwordHash;
            user.passwordChangedAt = uState.passwordChangedAt;
            user.lastLoginAt = uState.lastLoginAt;
          }
        }
      }
      if (data.awpSubmissions) {
        for (const [udiseCode, sub] of Object.entries(data.awpSubmissions)) {
          this.awpSubmissions.set(udiseCode, sub);
        }
      }
      console.log(`[Database] Persisted state loaded: ${Object.keys(data.users || {}).length} custom user states, ${this.awpSubmissions.size} AWP submissions.`);
    } catch (err) {
      console.error('[Database] Failed to load persisted state:', err.message);
    }
  }

  savePersistedState() {
    try {
      const usersState = {};
      this.users.forEach((u, loginId) => {
        if (!u.mustChangePassword || u.lastLoginAt) {
          usersState[loginId] = {
            mustChangePassword: u.mustChangePassword,
            passwordHash: u.passwordHash,
            passwordChangedAt: u.passwordChangedAt,
            lastLoginAt: u.lastLoginAt
          };
        }
      });

      const submissionsObj = {};
      this.awpSubmissions.forEach((sub, udiseCode) => {
        submissionsObj[udiseCode] = sub;
      });

      const data = {
        savedAt: new Date().toISOString(),
        users: usersState,
        awpSubmissions: submissionsObj
      };

      fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Database] Failed to save persisted state:', err.message);
    }
  }

  // --- Authentication ---
  authenticate(loginId, password) {
    const id = String(loginId || '').trim();
    const user = this.users.get(id);

    if (!user) {
      return { success: false, message: 'Invalid Login ID. Please check your Code.' };
    }

    let isValid = false;
    if (user.mustChangePassword) {
      // Compare with initial password
      isValid = (password === user.initialPassword);
    } else {
      // Compare with bcrypt hash
      isValid = bcrypt.compareSync(password, user.passwordHash);
    }

    if (!isValid) {
      return { success: false, message: 'Invalid password. Please check your credentials.' };
    }

    user.lastLoginAt = new Date().toISOString();
    this.savePersistedState();

    return {
      success: true,
      user: this.sanitizeUser(user)
    };
  }

  changePassword(loginId, oldPassword, newPassword, confirmPassword) {
    const id = String(loginId || '').trim();
    const user = this.users.get(id);

    if (!user) {
      return { success: false, message: 'User not found.' };
    }

    // Validate old password
    let oldValid = false;
    if (user.mustChangePassword) {
      oldValid = (oldPassword === user.initialPassword);
    } else {
      oldValid = bcrypt.compareSync(oldPassword, user.passwordHash);
    }

    if (!oldValid) {
      return { success: false, message: 'Current password is incorrect.' };
    }

    if (!newPassword || newPassword.length < 8) {
      return { success: false, message: 'New password must be at least 8 characters long.' };
    }

    if (newPassword !== confirmPassword) {
      return { success: false, message: 'New password and confirmation do not match.' };
    }

    if (newPassword === oldPassword) {
      return { success: false, message: 'New password cannot be identical to the initial/old password.' };
    }

    // Check password complexity (at least 1 letter, 1 number, 1 special character)
    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[@$!%*#?&]/.test(newPassword);

    if (!hasLetter || !hasNumber || !hasSpecial) {
      return {
        success: false,
        message: 'Password must contain at least one letter, one number, and one special character (@$!%*#?&).'
      };
    }

    // Hash and store
    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date().toISOString();

    this.savePersistedState();

    return {
      success: true,
      message: 'Password changed successfully.',
      user: this.sanitizeUser(user)
    };
  }

  sanitizeUser(user) {
    return {
      loginId: user.loginId,
      role: user.role,
      name: user.name,
      districtCode: user.districtCode,
      mandalCode: user.mandalCode,
      udiseCode: user.udiseCode,
      mustChangePassword: user.mustChangePassword,
      passwordChangedAt: user.passwordChangedAt,
      lastLoginAt: user.lastLoginAt
    };
  }

  // Admin reset
  resetPassword(adminUser, targetLoginId) {
    const target = this.users.get(String(targetLoginId));
    if (!target) {
      return { success: false, message: 'Target user not found.' };
    }

    // Authorization check
    if (adminUser.role === 'DISTRICT') {
      if (target.districtCode !== adminUser.districtCode) {
        return { success: false, message: 'Unauthorized: outside district boundary.' };
      }
    } else if (adminUser.role === 'MANDAL') {
      if (target.role !== 'SCHOOL' || target.mandalCode !== adminUser.mandalCode) {
        return { success: false, message: 'Unauthorized: outside mandal boundary.' };
      }
    } else {
      return { success: false, message: 'Unauthorized.' };
    }

    target.passwordHash = null;
    target.mustChangePassword = true;
    target.passwordChangedAt = null;
    this.savePersistedState();

    return {
      success: true,
      message: `Password reset to initial default: ${target.initialPassword}`,
      initialPassword: target.initialPassword
    };
  }

  // --- Strict Hierarchy Validation Helpers ---
  validateSchoolAccess(user, udiseCode) {
    const school = this.schools.get(String(udiseCode));
    if (!school) {
      return { allowed: false, error: 'School not found.', status: 404 };
    }

    if (user.role === 'SCHOOL') {
      if (user.udiseCode !== school.udiseCode) {
        return { allowed: false, error: 'Access denied: You can only view your own school.', status: 403 };
      }
    } else if (user.role === 'MANDAL') {
      if (user.mandalCode !== school.mandalCode) {
        return { allowed: false, error: 'Access denied: School does not belong to your Mandal.', status: 403 };
      }
    } else if (user.role === 'DISTRICT') {
      if (user.districtCode !== school.districtCode) {
        return { allowed: false, error: 'Access denied: School does not belong to your District.', status: 403 };
      }
    } else {
      return { allowed: false, error: 'Access denied.', status: 403 };
    }

    return { allowed: true, school };
  }

  validateMandalAccess(user, mandalCode) {
    const mandal = this.mandals.get(String(mandalCode));
    if (!mandal) {
      return { allowed: false, error: 'Mandal not found.', status: 404 };
    }

    if (user.role === 'SCHOOL') {
      return { allowed: false, error: 'Access denied: School users cannot access Mandal overviews.', status: 403 };
    } else if (user.role === 'MANDAL') {
      if (user.mandalCode !== mandal.code) {
        return { allowed: false, error: 'Access denied: You can only view your assigned Mandal.', status: 403 };
      }
    } else if (user.role === 'DISTRICT') {
      if (user.districtCode !== mandal.districtCode) {
        return { allowed: false, error: 'Access denied: Mandal does not belong to your District.', status: 403 };
      }
    }

    return { allowed: true, mandal };
  }

  // --- Data Access Methods ---
  getSchool(udiseCode) {
    const school = this.schools.get(String(udiseCode));
    if (!school) return null;
    const awp = this.awpSubmissions.get(String(udiseCode)) || null;
    return {
      ...school,
      awpStatus: awp ? awp.status : 'PENDING',
      isLocked: awp ? !!awp.isLocked : false,
      submittedAt: awp ? awp.submittedAt : null,
      awpLastUpdated: awp ? awp.updatedAt : null,
      awpData: awp ? awp.data : null
    };
  }

  getSchoolsForMandal(mandalCode) {
    const mandal = this.mandals.get(String(mandalCode));
    if (!mandal) return [];
    return mandal.schoolCodes.map(code => {
      const s = this.schools.get(code);
      const awp = this.awpSubmissions.get(code);
      const awpData = awp ? (awp.data || {}) : {};
      return {
        udiseCode: s.udiseCode,
        schoolName: s.schoolName,
        mandalCode: s.mandalCode,
        mandalName: s.mandalName,
        districtCode: s.districtCode,
        managementName: s.managementName,
        managementCategory: s.managementCategory,
        structure: s.structure,
        totalEnrolment: s.enrolment.grandTotal,
        totalBoys: s.enrolment.totalBoys,
        totalGirls: s.enrolment.totalGirls,
        awpStatus: awp ? awp.status : 'PENDING',
        isLocked: awp ? !!awp.isLocked : false,
        submittedAt: awp ? awp.submittedAt : null,
        awpLastUpdated: awp ? awp.updatedAt : null,
        hmName: awpData.hmName || 'Not Appointed / Entered',
        hmPhone: awpData.hmPhone || 'N/A'
      };
    });
  }

  getMandalSummary(mandalCode) {
    const mandal = this.mandals.get(String(mandalCode));
    if (!mandal) return null;

    const schoolsList = this.getSchoolsForMandal(mandalCode);
    const categoryStats = {};
    const managementStats = {};
    let totalBoys = 0;
    let totalGirls = 0;
    let grandTotal = 0;
    let submittedCount = 0;
    let draftCount = 0;
    let pendingCount = 0;

    schoolsList.forEach(s => {
      totalBoys += s.totalBoys;
      totalGirls += s.totalGirls;
      grandTotal += s.totalEnrolment;

      const struct = s.structure || 'Other';
      categoryStats[struct] = (categoryStats[struct] || 0) + 1;

      const mgmt = s.managementCategory || 'Other';
      managementStats[mgmt] = (managementStats[mgmt] || 0) + 1;

      if (s.awpStatus === 'SUBMITTED') submittedCount++;
      else if (s.awpStatus === 'DRAFT') draftCount++;
      else pendingCount++;
    });

    return {
      mandalCode: mandal.code,
      mandalName: mandal.name,
      districtCode: mandal.districtCode,
      districtName: mandal.districtName,
      totalSchools: schoolsList.length,
      enrolment: {
        totalBoys,
        totalGirls,
        grandTotal
      },
      categoryStats,
      managementStats,
      awpStats: {
        submitted: submittedCount,
        draft: draftCount,
        pending: pendingCount
      }
    };
  }

  getDistrictSummary(districtCode) {
    const dist = this.districts.get(String(districtCode));
    if (!dist) return null;

    const mandalsList = dist.mandalCodes.map(mCode => this.getMandalSummary(mCode));
    let totalSchools = 0;
    let totalBoys = 0;
    let totalGirls = 0;
    let grandTotal = 0;
    let totalSubmitted = 0;
    let totalDraft = 0;
    let totalPending = 0;
    const districtMgmtStats = {};
    const districtCategoryStats = {};

    mandalsList.forEach(m => {
      totalSchools += m.totalSchools;
      totalBoys += m.enrolment.totalBoys;
      totalGirls += m.enrolment.totalGirls;
      grandTotal += m.enrolment.grandTotal;
      totalSubmitted += m.awpStats.submitted;
      totalDraft += m.awpStats.draft;
      totalPending += m.awpStats.pending;

      Object.entries(m.managementStats).forEach(([k, v]) => {
        districtMgmtStats[k] = (districtMgmtStats[k] || 0) + v;
      });
      Object.entries(m.categoryStats).forEach(([k, v]) => {
        districtCategoryStats[k] = (districtCategoryStats[k] || 0) + v;
      });
    });

    return {
      districtCode: dist.code,
      districtName: dist.name,
      totalMandals: dist.mandalCodes.length,
      totalSchools,
      enrolment: {
        totalBoys,
        totalGirls,
        grandTotal
      },
      awpStats: {
        submitted: totalSubmitted,
        draft: totalDraft,
        pending: totalPending
      },
      managementStats: districtMgmtStats,
      categoryStats: districtCategoryStats,
      mandals: mandalsList
    };
  }

  saveAWP(udiseCode, formData, status = 'DRAFT', updatedBy = 'SCHOOL') {
    const code = String(udiseCode);
    const existing = this.awpSubmissions.get(code);

    // CRITICAL SECURITY RULE: Prevent multiple submissions
    // If school has already finalized and submitted, reject any further edits unless unlocked by an admin
    if (existing && existing.status === 'SUBMITTED' && updatedBy === 'SCHOOL') {
      const submittedDate = existing.submittedAt ? new Date(existing.submittedAt).toLocaleString() : 'previously';
      throw new Error(`Multiple data submissions are not allowed. Your School Development Plan (AWP) was officially submitted and finalized on ${submittedDate}. Contact your Mandal Education Officer (MEO) or District Admin if unlocking is required.`);
    }

    const timestamp = new Date().toISOString();
    const isFinalSubmission = status === 'SUBMITTED';

    const updated = {
      udiseCode: code,
      status: status, // 'DRAFT' or 'SUBMITTED'
      isLocked: isFinalSubmission,
      submittedAt: isFinalSubmission ? (existing && existing.submittedAt ? existing.submittedAt : timestamp) : null,
      updatedAt: timestamp,
      updatedBy: updatedBy,
      data: {
        ...(existing && existing.data ? existing.data : {}),
        ...formData
      }
    };

    this.awpSubmissions.set(code, updated);
    this.savePersistedState();

    // Automatically synchronize response to all required sheets
    const school = this.schools.get(code);
    if (school) {
      sheetsManager.recordAWPResponse(this, school, updated.data, status, updatedBy);
    }

    return updated;
  }

  // Admin action: Unlock a school for resubmission (Mandal or District admin only)
  unlockSchoolSubmission(adminUser, udiseCode, reason = '') {
    const code = String(udiseCode);
    const existing = this.awpSubmissions.get(code);
    if (!existing) {
      return { success: false, message: 'No submission found for this school.' };
    }

    // Hierarchy validation for admin
    const access = this.validateSchoolAccess(adminUser, code);
    if (!access.allowed) {
      return { success: false, message: access.error };
    }

    existing.status = 'DRAFT';
    existing.isLocked = false;
    existing.unlockedAt = new Date().toISOString();
    existing.unlockedBy = adminUser.role;
    existing.unlockReason = reason || 'Administrative unlock granted for correction';

    this.awpSubmissions.set(code, existing);
    this.savePersistedState();

    const school = this.schools.get(code);
    if (school) {
      sheetsManager.recordAWPResponse(this, school, existing.data, 'DRAFT', adminUser.role);
    }

    return {
      success: true,
      isLocked: false,
      message: `School ${code} has been successfully unlocked for data revision.`,
      submission: existing
    };
  }
}

const db = new Database();
db.init();

module.exports = db;
