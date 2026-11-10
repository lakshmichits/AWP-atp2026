const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const db = require('./database');
const authRoutes = require('./routes/auth');
const schoolRoutes = require('./routes/schools');
const mandalRoutes = require('./routes/mandals');
const districtRoutes = require('./routes/district');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS & JSON Body Parsing
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/mandals', mandalRoutes);
app.use('/api/district', districtRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'AP Samagra Shiksha AWP Portal',
    timestamp: new Date().toISOString(),
    stats: {
      districts: db.districts.size,
      mandals: db.mandals.size,
      schools: db.schools.size,
      provisionedUsers: db.users.size
    }
  });
});

// Fallback to index.html for SPA client-side routing
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Start Express server
const server = app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(` SAMAGRA SHIKSHA - ANDHRA PRADESH`);
  console.log(` ANNUAL WORK PLAN & BUDGET (AWP) PORTAL`);
  console.log(` Three-Level Authentication & Hierarchy System`);
  console.log(`================================================================`);
  console.log(` Server running on: http://localhost:${PORT}`);
  console.log(` District Login:   Code "2822"       | Password "2822@Admin"`);
  console.log(` Mandal Login:     Code "282225"     | Password "282225@AWP2026"`);
  console.log(` School Login:     UDISE "28222591359" | Password "1359@AWP2026"`);
  console.log(`================================================================`);
});

module.exports = { app, server };
