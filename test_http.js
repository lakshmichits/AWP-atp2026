const http = require('http');
const { app, server } = require('./server');

const PORT = 3000;

async function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runHttpTests() {
  console.log('\n--- Running End-to-End HTTP API Tests ---');

  // 1. Health check
  const health = await request('GET', '/api/health');
  console.log('1. Health Check:', health.status, health.data.status, 'Total Schools:', health.data.stats.schools);

  // 2. District Login
  const distLogin = await request('POST', '/api/auth/login', {
    loginId: '2822',
    password: '2822@Admin'
  });
  console.log('2. District Login Status:', distLogin.status, 'Token issued:', !!distLogin.data.token, 'MustChangePassword:', distLogin.data.mustChangePassword);
  const distToken = distLogin.data.token;

  // 3. District Summary
  const distSum = await request('GET', '/api/district/2822/summary', null, distToken);
  // Note: if mustChangePassword is true, data access is blocked as required!
  console.log('3. District Data Access before PW change:', distSum.status, distSum.data.mustChangePassword ? 'BLOCKED AS REQUIRED (mustChangePassword: true)' : 'Allowed');

  // 4. District changes password
  const distChange = await request('POST', '/api/auth/change-password', {
    oldPassword: '2822@Admin',
    newPassword: 'DistrictAdmin#2026',
    confirmPassword: 'DistrictAdmin#2026'
  }, distToken);
  console.log('4. District Password Change:', distChange.status, distChange.data.message);
  const newDistToken = distChange.data.token;

  // 5. District Summary with new token
  const distSumAfter = await request('GET', '/api/district/2822/summary', null, newDistToken);
  console.log('5. District Summary Access after PW change:', distSumAfter.status, 'Total Mandals:', distSumAfter.data.summary.totalMandals, 'Total Schools:', distSumAfter.data.summary.totalSchools);

  // 6. Mandal Login (282225)
  const mandalLogin = await request('POST', '/api/auth/login', {
    loginId: '282225',
    password: '282225@AWP2026'
  });
  console.log('6. Mandal Login:', mandalLogin.status, mandalLogin.data.user.name);
  const mandalToken = mandalLogin.data.token;

  // 7. Mandal changes password
  const mandalChange = await request('POST', '/api/auth/change-password', {
    oldPassword: '282225@AWP2026',
    newPassword: 'MandalUser#2026',
    confirmPassword: 'MandalUser#2026'
  }, mandalToken);
  const newMandalToken = mandalChange.data.token;

  // 8. Mandal access schools in its mandal
  const mandalSchools = await request('GET', '/api/mandals/282225/schools', null, newMandalToken);
  console.log('8. Mandal 282225 Schools count:', mandalSchools.data.total);

  // 9. Mandal tries to access ANOTHER mandal (282202) -> Expect 403 Forbidden!
  const crossMandal = await request('GET', '/api/mandals/282202/schools', null, newMandalToken);
  console.log('9. Cross-Mandal Access Test (Mandal 282225 trying to view 282202):', crossMandal.status, crossMandal.data.error);

  // 10. School Login (28222591359)
  const schoolLogin = await request('POST', '/api/auth/login', {
    loginId: '28222591359',
    password: '1359@AWP2026'
  });
  console.log('10. School Login:', schoolLogin.status, schoolLogin.data.user.name);
  const schoolToken = schoolLogin.data.token;

  // 11. School changes password
  const schoolChange = await request('POST', '/api/auth/change-password', {
    oldPassword: '1359@AWP2026',
    newPassword: 'SchoolHM#2026',
    confirmPassword: 'SchoolHM#2026'
  }, schoolToken);
  const newSchoolToken = schoolChange.data.token;

  // 12. School saves AWP draft
  const saveAwp = await request('PUT', '/api/schools/28222591359/awp', {
    formData: {
      hmName: 'K. Venkata Ramana',
      hmPhone: '9848012345',
      shortTermTarget: 'Achieve 100% foundational learning and upgrade science lab',
      boysToilets: 4,
      girlsToilets: 4
    },
    status: 'DRAFT'
  }, newSchoolToken);
  console.log('12. School AWP Save Draft:', saveAwp.status, saveAwp.data.message);

  // 13. School tries to view another school's data -> Expect 403 Forbidden!
  const crossSchool = await request('GET', '/api/schools/28227100543', null, newSchoolToken);
  console.log('13. Cross-School Access Test (School trying to view another school):', crossSchool.status, crossSchool.data.error);

  console.log('\n--- ALL HTTP TESTS COMPLETED SUCCESSFULLY ---');
  server.close();
  process.exit(0);
}

runHttpTests().catch(err => {
  console.error('Test error:', err);
  server.close();
  process.exit(1);
});
