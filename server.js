const express = require('express');
const path = require('path');
const crypto = require('crypto');
const storage = require('./storage');
const notifications = require('./notifications');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const TOKENS = new Map();

const STATIC_DIR = path.join(__dirname, 'public');

app.use(express.json());
app.use(express.static(STATIC_DIR));

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

function appointmentDate(dateStr, timeStr) {
  return new Date(dateStr + 'T' + (timeStr || '00:00') + ':00');
}

function hoursUntil(dateStr, timeStr) {
  return (appointmentDate(dateStr, timeStr) - new Date()) / 3600000;
}

const AUTO_CONFIRM_HOURS = 6;
const AUTO_CONFIRM_INTERVAL = Number(process.env.AUTO_CONFIRM_INTERVAL_MS) || 5 * 60 * 1000;

const PAYMENT_METHODS = ['Cash at Clinic', 'JazzCash', 'EasyPaisa', 'Bank Transfer'];

const SERVICES = {
  'ENT Consultation': '',
  'Career Counseling': 'Rs 1,200 / hour'
};

const SERVICE_FEES = {
  'ENT Consultation': 0,
  'Career Counseling': 1200
};

const PAYMENT_ACCOUNTS = {
  JazzCash: process.env.JAZZCASH_NUMBER || '03XX-XXXXXXX',
  EasyPaisa: process.env.EASYPAISA_NUMBER || '03XX-XXXXXXX',
  Bank: process.env.BANK_DETAILS || 'Ask the clinic for bank transfer details.'
};

function paymentInfo(method) {
  const map = {
    'Cash at Clinic': 'Pay in cash when you arrive at the clinic.',
    'JazzCash': 'Pay via JazzCash to ' + PAYMENT_ACCOUNTS.JazzCash + ' before your visit.',
    'EasyPaisa': 'Pay via EasyPaisa to ' + PAYMENT_ACCOUNTS.EasyPaisa + ' before your visit.',
    'Bank Transfer': 'Bank transfer — ' + PAYMENT_ACCOUNTS.Bank + '.'
  };
  return map[method] || map['Cash at Clinic'];
}

function makeRef() {
  return 'APT-' + Date.now().toString(36).toUpperCase().slice(-6) + crypto.randomBytes(2).toString('hex').toUpperCase();
}

async function bookedTimes(date) {
  const appts = await storage.list();
  return appts
    .filter((a) => a.date === date && a.status !== 'Cancelled')
    .map((a) => a.time);
}

/* ---------- API: slots ---------- */
app.get('/api/slots', async (req, res) => {
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
  const booked = await bookedTimes(date);
  res.json({ date, available: all.filter((t) => !booked.includes(t)) });
});

/* ---------- API: services & payment info ---------- */
app.get('/api/services', (req, res) => {
  res.json({
    services: Object.keys(SERVICES).map((name) => ({
      name,
      charge: SERVICES[name],
      fee: SERVICE_FEES[name] || 0,
      paymentMethods: PAYMENT_METHODS,
      paymentInfo: Object.fromEntries(PAYMENT_METHODS.map((m) => [m, paymentInfo(m)]))
    }))
  });
});

/* ---------- API: create appointment ---------- */
app.post('/api/appointments', async (req, res) => {
  const { name, phone, email, date, time, message, service, payment_method } = req.body || {};

  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
  if (!phone || !String(phone).trim()) return res.status(400).json({ error: 'Phone is required' });
  if (!email || !/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'Pick a date' });
  if (dateInPast(date)) return res.status(400).json({ error: 'Pick a future date' });

  const all = slotsForDate(date);
  if (all.length === 0) return res.status(400).json({ error: 'Clinic is closed on that day' });
  const booked = await bookedTimes(date);
  const available = all.filter((t) => !booked.includes(t));
  if (!available.includes(time)) return res.status(409).json({ error: 'That time was just taken — pick another slot' });

  const serviceName = SERVICES[service] !== undefined ? service : 'ENT Consultation';
  const charge = SERVICES[serviceName];
  const fee = SERVICE_FEES[serviceName] || 0;
  const method = PAYMENT_METHODS.includes(payment_method) ? payment_method : 'Cash at Clinic';

  const autoConfirm = hoursUntil(date, time) <= AUTO_CONFIRM_HOURS;
  const appointment = await storage.create({
    ref: makeRef(),
    name: String(name).trim(),
    phone: String(phone).trim(),
    email: String(email).trim(),
    doctor: 'Prof. Dr. Javed Iqbal',
    service: serviceName,
    charge,
    fee,
    payment_method: method,
    payment_status: 'Unpaid',
    date,
    time,
    message: (message || '').trim(),
    status: autoConfirm ? 'Confirmed' : 'Pending'
  });

  if (autoConfirm) notifications.notifyConfirmed(appointment);
  notifications.notifyNewAppointment(appointment);
  res.json({ success: true, appointment });
});

/* ---------- API: public lookup by reference ---------- */
app.get('/api/appointments/:ref', async (req, res) => {
  const a = await storage.getByRef(String(req.params.ref));
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ appointment: a });
});

/* ---------- API: public status lookup (ref + phone) ---------- */
app.post('/api/appointments/lookup', async (req, res) => {
  const { ref, phone } = req.body || {};
  const a = await storage.getByRef(String(ref || '').trim());
  if (!a) return res.status(404).json({ error: 'No appointment found with that reference' });
  const norm = (s) => String(s || '').trim().replace(/[\s-]/g, '');
  if (norm(phone).length === 0 || norm(phone) !== norm(a.phone)) {
    return res.status(403).json({ error: 'Reference and phone number do not match' });
  }
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
app.get('/api/admin/appointments', requireAdmin, async (req, res) => {
  res.json({ appointments: await storage.list() });
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  res.json(await storage.stats());
});

app.patch('/api/admin/appointments/:id', requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!['Pending', 'Confirmed', 'Completed', 'Cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const a = await storage.updateStatus(Number(req.params.id), status);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ success: true, appointment: a });
});

app.patch('/api/admin/appointments/:id/payment', requireAdmin, async (req, res) => {
  const { payment_status } = req.body || {};
  if (!['Paid', 'Unpaid'].includes(payment_status)) {
    return res.status(400).json({ error: 'Invalid payment status' });
  }
  const a = await storage.updatePayment(Number(req.params.id), payment_status);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ success: true, appointment: a });
});

app.delete('/api/admin/appointments/:id', requireAdmin, async (req, res) => {
  await storage.remove(Number(req.params.id));
  res.json({ success: true });
});

/* ---------- pages ---------- */
app.get('/admin', (req, res) => res.sendFile(path.join(STATIC_DIR, 'admin.html')));

/* ---------- auto-confirm soon appointments ---------- */
async function autoConfirmSoon() {
  try {
    const all = await storage.list();
    for (const a of all) {
      if (a.status !== 'Pending') continue;
      const h = hoursUntil(a.date, a.time);
      if (h < 0 || h > AUTO_CONFIRM_HOURS) continue;
      const updated = await storage.updateStatus(a.id, 'Confirmed');
      if (updated) {
        console.log('[auto-confirm] ' + a.ref + ' confirmed (' + h.toFixed(1) + 'h before)');
        notifications.notifyConfirmed(updated);
      }
    }
  } catch (e) {
    console.error('[auto-confirm] job failed:', e.message);
  }
}

/* ---------- boot ---------- */
storage.init().then(({ mode }) => {
  app.listen(PORT, () => {
    console.log('Doctor site running on http://localhost:' + PORT + ' (storage: ' + mode + ')');
    console.log('Change the admin password with the ADMIN_PASSWORD environment variable.');
    console.log('Notifications: set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM + NOTIFY_TO (SMS).');
    console.log('Appointments within ' + AUTO_CONFIRM_HOURS + 'h are auto-confirmed; job runs every ' + (AUTO_CONFIRM_INTERVAL / 60000) + ' min.');
  });
  autoConfirmSoon();
  setInterval(autoConfirmSoon, AUTO_CONFIRM_INTERVAL);
});
