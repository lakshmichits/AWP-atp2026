const http = require('http');
const { app, server } = require('./server');
const db = require('./database');

const PORT = process.env.PORT || 3000;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runApiTests() {
  console.log('================================================================');
  console.log(' STARTING FULL API HTTP ENDPOINTS INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  // Reset test accounts and submissions to clean state
  ['2822', '282225', '28222591359'].forEach(id => {
    const u = db.users.get(id);
    if (u) {
      u.mustChangePassword = true;
      u.passwordHash = null;
      u.passwordChangedAt = null;
    }
  });
  db.awpSubmissions.delete('28222591359');
  db.savePersistedState();

  let passed = 0;
  let failed = 0;

  function assertTest(name, condition, details = '') {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} -> Details: ${details}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate School (UDISE + Last4@AWP2026)
    const schoolLogin = await request('POST', '/api/auth/login', {
      loginId: '28222591359',
      password: '1359@AWP2026'
    });
    assertTest('School Login (11-digit UDISE & Last4@AWP2026)', schoolLogin.status === 200 && schoolLogin.data.success && schoolLogin.data.mustChangePassword === true);
    const initialSchoolToken = schoolLogin.data.token;

    // 2. Security Check: School cannot access portal data before password change
    const blockedBeforePwChange = await request('GET', '/api/schools/28222591359', null, initialSchoolToken);
    assertTest('Mandatory First-Login Enforcement: Blocked with 403 before password change', blockedBeforePwChange.status === 403 && blockedBeforePwChange.data.mustChangePassword === true);

    // 3. School performs mandatory password change
    const schoolPwChange = await request('POST', '/api/auth/change-password', {
      oldPassword: '1359@AWP2026',
      newPassword: 'Secure@SchoolHM2026',
      confirmPassword: 'Secure@SchoolHM2026'
    }, initialSchoolToken);
    assertTest('School Mandatory Password Change succeeds', schoolPwChange.status === 200 && schoolPwChange.data.success);
    const schoolToken = schoolPwChange.data.token;

    // 4. Authenticate Mandal (Mandal Code + Code@AWP2026) & Change Password
    const mandalLogin = await request('POST', '/api/auth/login', {
      loginId: '282225',
      password: '282225@AWP2026'
    });
    assertTest('Mandal Login (6-digit Mandal Code & Code@AWP2026)', mandalLogin.status === 200 && mandalLogin.data.success);
    const mandalPwChange = await request('POST', '/api/auth/change-password', {
      oldPassword: '282225@AWP2026',
      newPassword: 'Secure@MandalMEO2026',
      confirmPassword: 'Secure@MandalMEO2026'
    }, mandalLogin.data.token);
    assertTest('Mandal Password Change succeeds', mandalPwChange.status === 200 && mandalPwChange.data.success);
    const mandalToken = mandalPwChange.data.token;

    // 5. Authenticate District (District Code + Code@Admin) & Change Password
    const districtLogin = await request('POST', '/api/auth/login', {
      loginId: '2822',
      password: '2822@Admin'
    });
    assertTest('District Login (4-digit District Code & Code@Admin)', districtLogin.status === 200 && districtLogin.data.success);
    const districtPwChange = await request('POST', '/api/auth/change-password', {
      oldPassword: '2822@Admin',
      newPassword: 'Secure@DistrictDEO2026',
      confirmPassword: 'Secure@DistrictDEO2026'
    }, districtLogin.data.token);
    assertTest('District Password Change succeeds', districtPwChange.status === 200 && districtPwChange.data.success);
    const districtToken = districtPwChange.data.token;

    // 6. Hierarchy Security: School cannot access another school
    const otherSchoolCode = db.mandals.get('282202').schoolCodes[0];
    const illegalSchoolAccess = await request('GET', `/api/schools/${otherSchoolCode}`, null, schoolToken);
    assertTest('Hierarchy Scoping: School cannot access another school (403 Forbidden)', illegalSchoolAccess.status === 403, JSON.stringify(illegalSchoolAccess));

    // 7. School Save Draft
    const draftRes = await request('PUT', '/api/schools/28222591359/awp', {
      status: 'DRAFT',
      formData: {
        hmName: 'P. Ramanathan',
        hmPhone: '9848012345',
        drinkingWater: 'Yes',
        boysToilets: 3,
        girlsToilets: 3,
        budget_csg_total: 50000
      }
    }, schoolToken);
    assertTest('School Save Draft succeeds and remains unlocked', draftRes.status === 200 && draftRes.data.submission.status === 'DRAFT' && draftRes.data.submission.isLocked === false);

    // 8. School Final Submit & Locking
    const submitRes = await request('PUT', '/api/schools/28222591359/awp', {
      status: 'SUBMITTED',
      formData: {
        hmName: 'P. Ramanathan',
        hmPhone: '9848012345',
        drinkingWater: 'Yes',
        boysToilets: 3,
        girlsToilets: 3,
        budget_csg_total: 50000
      }
    }, schoolToken);
    assertTest('School Final Submit succeeds and permanently locks form', submitRes.status === 200 && submitRes.data.submission.status === 'SUBMITTED' && submitRes.data.submission.isLocked === true);

    // 9. CRITICAL REQUIREMENT: Multiple Data Submissions strictly blocked
    const blockedRes = await request('PUT', '/api/schools/28222591359/awp', {
      status: 'SUBMITTED',
      formData: {
        hmName: 'Attempt to overwrite locked submission'
      }
    }, schoolToken);
    assertTest('Multiple Submissions strictly blocked with 403 error', blockedRes.status === 403 && blockedRes.data.error.includes('Multiple data submissions are not allowed'));

    // 10. Mandal MEO views schools list & submitted/pending counts
    const mandalSchools = await request('GET', '/api/mandals/282225/schools', null, mandalToken);
    assertTest('Mandal Schools list returns submittedCount & pendingCount', mandalSchools.status === 200 && mandalSchools.data.submittedCount >= 1 && mandalSchools.data.pendingCount >= 0);

    // 11. Mandal Filter by SUBMITTED
    const mandalSubmittedOnly = await request('GET', '/api/mandals/282225/schools?status=SUBMITTED', null, mandalToken);
    assertTest('Mandal Filter for Submitted Schools works accurately', mandalSubmittedOnly.status === 200 && mandalSubmittedOnly.data.schools.every(s => s.awpStatus === 'SUBMITTED'));

    // 12. Mandal Filter by PENDING
    const mandalPendingOnly = await request('GET', '/api/mandals/282225/schools?status=PENDING', null, mandalToken);
    assertTest('Mandal Filter for Pending Schools works accurately', mandalPendingOnly.status === 200 && mandalPendingOnly.data.schools.every(s => s.awpStatus !== 'SUBMITTED'));

    // 13. Mandal-Wise Comparison Report (Mandal View)
    const mandalComp = await request('GET', '/api/mandals/282225/comparison', null, mandalToken);
    assertTest('Mandal Comparison Report returns all 32 mandals ranked by submission rate', mandalComp.status === 200 && mandalComp.data.totalMandals === 32 && mandalComp.data.comparison.some(m => m.isCurrentMandal === true));

    // 14. Mandal-Wise Comparison Report (District View)
    const distComp = await request('GET', '/api/district/2822/comparison', null, districtToken);
    assertTest('District Comparison Report returns 32 ranked mandals with infrastructure indicators', distComp.status === 200 && distComp.data.totalMandals === 32 && distComp.data.comparison[0].rank === 1);

    // 15. MEO Unlocks School for correction
    const unlockRes = await request('POST', '/api/schools/28222591359/unlock', {
      reason: 'HM requested correction of toilet counts and budget figures'
    }, mandalToken);
    assertTest('MEO Administrative Unlock succeeds', unlockRes.status === 200 && unlockRes.data.success);

    // 16. School can now re-submit after unlock
    const reSubmit = await request('PUT', '/api/schools/28222591359/awp', {
      status: 'SUBMITTED',
      formData: {
        hmName: 'P. Ramanathan',
        hmPhone: '9848012345',
        boysToilets: 4,
        girlsToilets: 4,
        budget_csg_total: 50000
      }
    }, schoolToken);
    assertTest('School successfully re-submits after admin unlock and is locked again', reSubmit.status === 200 && reSubmit.data.submission.isLocked === true);

  } catch (err) {
    console.error('Fatal API test error:', err);
    failed++;
  } finally {
    server.close();
    console.log('\n================================================================');
    console.log(` API TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Allow server to finish initializing before running tests
setTimeout(runApiTests, 500);
