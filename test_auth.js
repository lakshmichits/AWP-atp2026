const assert = require('assert');
const db = require('./database');

console.log('================================================================');
console.log(' RUNNING COMPREHENSIVE AWP AUTHENTICATION & MAPPING TEST SUITE');
console.log('================================================================\n');

// Ensure test users are in fresh initial state for deterministic test runs
['2822', '282225', '28222591359'].forEach(id => {
  const u = db.users.get(id);
  if (u) {
    u.mustChangePassword = true;
    u.passwordHash = null;
    u.passwordChangedAt = null;
  }
});
db.savePersistedState();

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// TEST 1: Storage Types & Format Verification (Codes as TEXT/STRING)
// -----------------------------------------------------------------------------
runTest('All Codes are stored strictly as STRING/TEXT to preserve leading zeros', () => {
  assert(db.districts.size > 0, 'Districts should be populated');
  assert(db.mandals.size > 0, 'Mandals should be populated');
  assert(db.schools.size > 0, 'Schools should be populated');

  // Verify District codes
  db.districts.forEach(d => {
    assert.strictEqual(typeof d.code, 'string', `District code ${d.code} must be a string`);
    assert.strictEqual(d.code.length, 4, `District code ${d.code} must be 4 digits`);
  });

  // Verify Mandal codes
  db.mandals.forEach(m => {
    assert.strictEqual(typeof m.code, 'string', `Mandal code ${m.code} must be a string`);
    assert.strictEqual(m.code.length, 6, `Mandal code ${m.code} must be 6 digits`);
    assert.strictEqual(typeof m.districtCode, 'string', `Mandal parent district code must be a string`);
  });

  // Verify School UDISE codes
  db.schools.forEach(s => {
    assert.strictEqual(typeof s.udiseCode, 'string', `UDISE code ${s.udiseCode} must be a string`);
    assert.strictEqual(s.udiseCode.length, 11, `UDISE code ${s.udiseCode} must be 11 digits`);
    assert.strictEqual(typeof s.mandalCode, 'string', `School parent mandal code must be a string`);
    assert.strictEqual(typeof s.districtCode, 'string', `School parent district code must be a string`);
  });
});

// -----------------------------------------------------------------------------
// TEST 2: Complete Hierarchy Mapping Rules
// -----------------------------------------------------------------------------
runTest('Every School maps to a valid Mandal, and every Mandal maps to a valid District', () => {
  db.schools.forEach(s => {
    const parentMandal = db.mandals.get(s.mandalCode);
    assert(parentMandal, `School ${s.udiseCode} references non-existent Mandal ${s.mandalCode}`);
    assert(parentMandal.schoolCodes.includes(s.udiseCode), `Mandal ${s.mandalCode} does not list School ${s.udiseCode}`);

    const parentDistrict = db.districts.get(s.districtCode);
    assert(parentDistrict, `School ${s.udiseCode} references non-existent District ${s.districtCode}`);
    assert.strictEqual(parentMandal.districtCode, s.districtCode, `Mandal and School district code mismatch for ${s.udiseCode}`);
  });

  db.mandals.forEach(m => {
    const parentDist = db.districts.get(m.districtCode);
    assert(parentDist, `Mandal ${m.code} references non-existent District ${m.districtCode}`);
    assert(parentDist.mandalCodes.includes(m.code), `District ${m.districtCode} does not list Mandal ${m.code}`);
  });
});

// -----------------------------------------------------------------------------
// TEST 3: School Login Credential Verification
// -----------------------------------------------------------------------------
runTest('School Login ID is 11-digit UDISE & Initial Password is Last 4 digits + @AWP2026', () => {
  const s = db.schools.get('28222591359');
  assert(s, 'School 28222591359 should exist');
  const last4 = s.udiseCode.slice(-4);
  const expectedPassword = `${last4}@AWP2026`;

  // Bad password
  const badAuth = db.authenticate(s.udiseCode, 'wrongpass');
  assert.strictEqual(badAuth.success, false, 'Bad password should fail');

  // Correct password
  const auth = db.authenticate(s.udiseCode, expectedPassword);
  assert.strictEqual(auth.success, true, 'Initial password should succeed');
  assert.strictEqual(auth.user.role, 'SCHOOL');
  assert.strictEqual(auth.user.udiseCode, s.udiseCode);
  assert.strictEqual(auth.user.mustChangePassword, true, 'First login must require password change');
});

// -----------------------------------------------------------------------------
// TEST 4: Mandal Login Credential Verification
// -----------------------------------------------------------------------------
runTest('Mandal Login ID is 6-digit Mandal Code & Initial Password is Mandal Code + @AWP2026', () => {
  const m = db.mandals.get('282225');
  assert(m, 'Mandal 282225 should exist');
  const expectedPassword = `${m.code}@AWP2026`;

  const badAuth = db.authenticate(m.code, 'wrongpass');
  assert.strictEqual(badAuth.success, false);

  const auth = db.authenticate(m.code, expectedPassword);
  assert.strictEqual(auth.success, true);
  assert.strictEqual(auth.user.role, 'MANDAL');
  assert.strictEqual(auth.user.mandalCode, '282225');
  assert.strictEqual(auth.user.mustChangePassword, true);
});

// -----------------------------------------------------------------------------
// TEST 5: District Login Credential Verification
// -----------------------------------------------------------------------------
runTest('District Login ID is 4-digit District Code & Initial Password is District Code + @Admin', () => {
  const d = db.districts.get('2822');
  assert(d, 'District 2822 should exist');
  const expectedPassword = `${d.code}@Admin`;

  const badAuth = db.authenticate(d.code, 'wrongpass');
  assert.strictEqual(badAuth.success, false);

  const auth = db.authenticate(d.code, expectedPassword);
  assert.strictEqual(auth.success, true);
  assert.strictEqual(auth.user.role, 'DISTRICT');
  assert.strictEqual(auth.user.districtCode, '2822');
  assert.strictEqual(auth.user.mustChangePassword, true);
});

// -----------------------------------------------------------------------------
// TEST 6: Strict Scoping & Hierarchy Validation on Data Access
// -----------------------------------------------------------------------------
runTest('Data scoping rules: School sees only own, Mandal sees only own mandal, District sees all', () => {
  const m1 = db.mandals.get('282225'); // ANANTAPUR
  const m2 = db.mandals.get('282202'); // BOMMANAHAL

  const s1Code = m1.schoolCodes[0];
  const s2Code = m2.schoolCodes[0];

  const schoolUser = db.users.get(s1Code);
  const mandal1User = db.users.get(m1.code);
  const mandal2User = db.users.get(m2.code);
  const districtUser = db.users.get('2822');

  // School user access checks
  assert.strictEqual(db.validateSchoolAccess(schoolUser, s1Code).allowed, true, 'School can view its own school');
  assert.strictEqual(db.validateSchoolAccess(schoolUser, s2Code).allowed, false, 'School CANNOT view another school');
  assert.strictEqual(db.validateMandalAccess(schoolUser, m1.code).allowed, false, 'School CANNOT view Mandal summary');

  // Mandal user access checks
  assert.strictEqual(db.validateSchoolAccess(mandal1User, s1Code).allowed, true, 'Mandal can view school inside its mandal');
  assert.strictEqual(db.validateSchoolAccess(mandal1User, s2Code).allowed, false, 'Mandal CANNOT view school in another mandal');
  assert.strictEqual(db.validateMandalAccess(mandal1User, m1.code).allowed, true, 'Mandal can view its own mandal summary');
  assert.strictEqual(db.validateMandalAccess(mandal1User, m2.code).allowed, false, 'Mandal CANNOT view another mandal summary');

  // District user access checks
  assert.strictEqual(db.validateSchoolAccess(districtUser, s1Code).allowed, true, 'District can view School 1');
  assert.strictEqual(db.validateSchoolAccess(districtUser, s2Code).allowed, true, 'District can view School 2');
  assert.strictEqual(db.validateMandalAccess(districtUser, m1.code).allowed, true, 'District can view Mandal 1');
  assert.strictEqual(db.validateMandalAccess(districtUser, m2.code).allowed, true, 'District can view Mandal 2');
});

// -----------------------------------------------------------------------------
// TEST 7: Mandatory Password Change on First Login
// -----------------------------------------------------------------------------
runTest('First login password change cycle: validation, bcrypt hashing, and unlocking', () => {
  const testUdise = '28222591359';
  const initialPw = '1359@AWP2026';

  // 1. Authenticate with initial password
  const auth1 = db.authenticate(testUdise, initialPw);
  assert.strictEqual(auth1.success, true);
  assert.strictEqual(auth1.user.mustChangePassword, true);

  // 2. Weak new password should fail
  const weakChange = db.changePassword(testUdise, initialPw, 'simple', 'simple');
  assert.strictEqual(weakChange.success, false, 'Weak password should be rejected');

  // 3. Mismatched confirmation should fail
  const mismatchChange = db.changePassword(testUdise, initialPw, 'Valid@Pass123', 'Different@123');
  assert.strictEqual(mismatchChange.success, false, 'Mismatched passwords should be rejected');

  // 4. Same as old password should fail
  const sameChange = db.changePassword(testUdise, initialPw, initialPw, initialPw);
  assert.strictEqual(sameChange.success, false, 'Same as initial password should be rejected');

  // 5. Valid new password should succeed
  const newPw = 'SchoolHM#Secure2026';
  const successChange = db.changePassword(testUdise, initialPw, newPw, newPw);
  assert.strictEqual(successChange.success, true, 'Valid password change should succeed');
  assert.strictEqual(successChange.user.mustChangePassword, false, 'mustChangePassword should now be false');

  // 6. Old password should now fail
  const oldAuth = db.authenticate(testUdise, initialPw);
  assert.strictEqual(oldAuth.success, false, 'Old initial password must no longer work');

  // 7. New password should now succeed
  const newAuth = db.authenticate(testUdise, newPw);
  assert.strictEqual(newAuth.success, true, 'New password must succeed');
  assert.strictEqual(newAuth.user.mustChangePassword, false, 'mustChangePassword remains false');

  // 8. Admin Reset back to initial password
  const distUser = db.users.get('2822');
  const resetRes = db.resetPassword(distUser, testUdise);
  assert.strictEqual(resetRes.success, true, 'Admin reset should succeed');

  // 9. Initial password should work again and require password change
  const postResetAuth = db.authenticate(testUdise, initialPw);
  assert.strictEqual(postResetAuth.success, true, 'Initial password works again after reset');
  assert.strictEqual(postResetAuth.user.mustChangePassword, true, 'mustChangePassword is reset to true');
});

// -----------------------------------------------------------------------------
// TEST 8: Multiple Data Submission Prevention (Permanent Locking & MEO Unlock)
// -----------------------------------------------------------------------------
runTest('Multiple Data Submission Prevention: Lock on final submission & unlock by admin', () => {
  const testUdise = '28222591359';
  const mandalUser = db.users.get('282225');

  // Clear previous test submission
  db.awpSubmissions.delete(testUdise);

  // 1. First save as DRAFT should succeed and NOT lock
  const draftRes = db.saveAWP(testUdise, {
    hmName: 'P. Ramanathan',
    hmPhone: '9848012345',
    budget_csg_total: 50000
  }, 'DRAFT', 'SCHOOL');
  assert.strictEqual(draftRes.status, 'DRAFT');
  assert.strictEqual(draftRes.isLocked, false, 'Draft should not lock the submission');

  // 2. Final Submission should succeed and LOCK the school
  const finalRes = db.saveAWP(testUdise, {
    hmName: 'P. Ramanathan',
    hmPhone: '9848012345',
    budget_csg_total: 50000
  }, 'SUBMITTED', 'SCHOOL');
  assert.strictEqual(finalRes.status, 'SUBMITTED');
  assert.strictEqual(finalRes.isLocked, true, 'Final submission must be locked');

  // 3. Attempting a second submission should throw an error to prevent multiple submissions
  let multipleBlocked = false;
  try {
    db.saveAWP(testUdise, {
      hmName: 'P. Ramanathan Modified',
      hmPhone: '9848099999'
    }, 'SUBMITTED', 'SCHOOL');
  } catch (err) {
    multipleBlocked = true;
    assert(err.message.includes('Multiple data submissions are not allowed') || err.message.includes('locked'), 'Expected locked error message');
  }
  assert.strictEqual(multipleBlocked, true, 'Second data submission must be strictly blocked by the backend');

  // 4. Mandal Admin (MEO) unlocks the school
  const unlockRes = db.unlockSchoolSubmission(mandalUser, testUdise, 'HM requested update of enrolment data');
  assert.strictEqual(unlockRes.success, true, 'MEO unlock must succeed');
  assert.strictEqual(unlockRes.isLocked, false, 'Submission is now unlocked');

  // 5. School can now submit updated data
  const reSubmitRes = db.saveAWP(testUdise, {
    hmName: 'P. Ramanathan',
    hmPhone: '9848012345',
    budget_csg_total: 75000
  }, 'SUBMITTED', 'SCHOOL');
  assert.strictEqual(reSubmitRes.status, 'SUBMITTED');
  assert.strictEqual(reSubmitRes.isLocked, true, 'Re-submitted form is locked again');
});

// -----------------------------------------------------------------------------
// TEST 9: Mandal Submitted vs Pending School Counts & Filtering
// -----------------------------------------------------------------------------
runTest('Mandal Tier: Correctly tracks Submitted and Pending school counts', () => {
  const mCode = '282225'; // Anantapur mandal
  const schools = db.getSchoolsForMandal(mCode);
  assert(schools.length > 0, 'Mandal 282225 must have schools');

  const submittedCount = schools.filter(s => s.awpStatus === 'SUBMITTED').length;
  const pendingCount = schools.length - submittedCount;

  assert(submittedCount >= 1, 'At least 1 school was submitted in previous test');
  assert(pendingCount >= 0, 'Pending count must be non-negative');
  assert.strictEqual(submittedCount + pendingCount, schools.length, 'Submitted + Pending must equal total schools');

  const submittedSchool = schools.find(s => s.udiseCode === '28222591359');
  assert.strictEqual(submittedSchool.awpStatus, 'SUBMITTED');
  assert.strictEqual(submittedSchool.isLocked, true);
  assert.strictEqual(submittedSchool.hmName, 'P. Ramanathan');
});

// -----------------------------------------------------------------------------
// TEST 10: 32-Mandal Comparison Report
// -----------------------------------------------------------------------------
runTest('32-Mandal Comparative Report: Accurate rankings, percentages, and indicators', () => {
  const dist = db.districts.get('2822');
  assert.strictEqual(dist.mandalCodes.length, 32, 'Anantapur district must have exactly 32 mandals');

  const comparisonList = dist.mandalCodes.map(mCode => {
    const sum = db.getMandalSummary(mCode);
    const submitted = sum.awpStats.submitted;
    const total = sum.totalSchools || 1;
    return {
      mandalCode: sum.mandalCode,
      mandalName: sum.mandalName,
      totalSchools: sum.totalSchools,
      submittedCount: submitted,
      pendingCount: sum.totalSchools - submitted,
      submissionRate: Math.round((submitted / total) * 100)
    };
  });

  comparisonList.sort((a, b) => b.submissionRate - a.submissionRate);
  comparisonList.forEach((item, idx) => { item.rank = idx + 1; });

  assert.strictEqual(comparisonList.length, 32, 'Comparison report must contain all 32 mandals');
  assert.strictEqual(comparisonList[0].rank, 1, 'First item must have rank #1');
  assert.strictEqual(comparisonList[31].rank, 32, 'Last item must have rank #32');
  assert(comparisonList[0].submissionRate >= comparisonList[31].submissionRate, 'Must be sorted by submission rate descending');
});

console.log('\n================================================================');
console.log(` TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
}
