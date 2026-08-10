const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const TOKENS = new Map();

const STATIC_DIR = path.join(__dirname, 'public');

app.use(express.json());
app.use(express.static(STATIC_DIR));

/* ---------- tiny JSON storage (atomic writes) ---------- */
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to read data.json:', e.message);
  }
  return { appointments: [], seq: 1 };
}

function saveData(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let db = loadData();

/* ---------- appointment slots ---------- */
function slotsForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  if (day === 0) return []; // Sunday closed
  const end = day === 6 ? 13 : 17; // Saturday half day
  const slots = [];
  for (let h = 9; h < end; h++) {
    slots.push(String(h).padStart(2, '0') + ':00');
  }
  return slots;
}

function dateInPast(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return d < today;
}

function bookedTimes(date) {
  return db.appointments
    .filter((a) => a.date === date && a.status !== 'Cancelled')
    .map((a) => a.time);
}

function makeRef() {
  return 'APT-' + Date.now().toString(36).toUpperCase().slice(-6) + crypto.randomBytes(2).toString('hex').toUpperCase();
}

/* ---------- API: slots ---------- */
app.get('/api/slots', (req, res) => {
  const date = req.query.date || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date' });
  }
  if (dateInPast(date)) {
    return res.json({ date, available: [], closed: true, past: true });
  }
  const all = slotsForDate(date);
  if (all.length === 0) {
    return res.json({ date, available: [], closed: true });
  }
  const booked = bookedTimes(date);
  res.json({ date, available: all.filter((t) => !booked.includes(t)) });
});

/* ---------- API: create appointment ---------- */
app.post('/api/appointments', (req, res) => {
  const { name, phone, email, date, time, message } = req.body || {};

  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
  if (!phone || !String(phone).trim()) return res.status(400).json({ error: 'Phone is required' });
  if (!email || !/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'Pick a date' });
  if (dateInPast(date)) return res.status(400).json({ error: 'Pick a future date' });

  const all = slotsForDate(date);
  if (all.length === 0) return res.status(400).json({ error: 'Clinic is closed on that day' });
  const available = all.filter((t) => !bookedTimes(date).includes(t));
  if (!available.includes(time)) return res.status(409).json({ error: 'That time was just taken — pick another slot' });

  const appointment = {
    id: db.seq++,
    ref: makeRef(),
    name: String(name).trim(),
    phone: String(phone).trim(),
    email: String(email).trim(),
    doctor: 'Prof. Dr. Javed Iqbal',
    date,
    time,
    message: (message || '').trim(),
    status: 'Pending',
    created_at: new Date().toISOString()
  };

  db.appointments.push(appointment);
  saveData(db);
  res.json({ success: true, appointment });
});

/* ---------- API: public lookup by reference ---------- */
app.get('/api/appointments/:ref', (req, res) => {
  const a = db.appointments.find((x) => x.ref === String(req.params.ref));
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ appointment: a });
});

/* ---------- API: admin login ---------- */
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(24).toString('hex');
    TOKENS.set(token, Date.now());
    return res.json({ success: true, token });
  }
  res.status(401).json({ error: 'Wrong password' });
});

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || !TOKENS.has(token)) {
    return res.status(401).json({ error: 'Not authorized' });
  }
  next();
}

/* ---------- API: admin appointments ---------- */
app.get('/api/admin/appointments', requireAdmin, (req, res) => {
  res.json({ appointments: db.appointments.slice().reverse() });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const a = db.appointments;
  res.json({
    total: a.length,
    pending: a.filter((x) => x.status === 'Pending').length,
    confirmed: a.filter((x) => x.status === 'Confirmed').length,
    today: a.filter((x) => x.date === todayStr && x.status !== 'Cancelled').length
  });
});

app.patch('/api/admin/appointments/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['Pending', 'Confirmed', 'Completed', 'Cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const a = db.appointments.find((x) => x.id === id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  a.status = status;
  saveData(db);
  res.json({ success: true, appointment: a });
});

app.delete('/api/admin/appointments/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.appointments = db.appointments.filter((x) => x.id !== id);
  saveData(db);
  res.json({ success: true });
});

/* ---------- pages ---------- */
app.get('/admin', (req, res) => res.sendFile(path.join(STATIC_DIR, 'admin.html')));

app.listen(PORT, () => {
  console.log('Doctor site running on http://localhost:' + PORT);
  console.log('Change the admin password with the ADMIN_PASSWORD environment variable.');
});
