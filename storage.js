const fs = require('fs');
const path = require('path');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const USE_PG = !!process.env.DATABASE_URL;

let pool = null;
let json = null;

function loadJson() {
  if (json) return json;
  try {
    if (fs.existsSync(DATA_FILE)) {
      json = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to read data.json:', e.message);
  }
  if (!json) json = { appointments: [], seq: 1 };
  return json;
}

function saveJson() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(json, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

async function initPg() {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    ref TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    doctor TEXT NOT NULL,
    service TEXT NOT NULL DEFAULT 'ENT Consultation',
    charge TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending',
    charge TEXT NOT NULL DEFAULT '',
    fee INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'Cash at Clinic',
    payment_status TEXT NOT NULL DEFAULT 'Unpaid',
    serial INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Cash at Clinic'`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Unpaid'`);
  await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS serial INTEGER NOT NULL DEFAULT 0`);
}

function normalize(a) {
  if (!a) return a;
  a.charge = a.charge || '';
  a.fee = a.fee != null ? Number(a.fee) : 0;
  a.payment_method = a.payment_method || 'Cash at Clinic';
  a.payment_status = a.payment_status || 'Unpaid';
  a.serial = a.serial != null ? Number(a.serial) : 0;
  return a;
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function init() {
  if (USE_PG) {
    try {
      await initPg();
      console.log('Storage: PostgreSQL');
      return { mode: 'postgres' };
    } catch (e) {
      console.error('PostgreSQL connection failed — falling back to JSON file:', e.message);
      pool = null;
    }
  }
  loadJson();
  return { mode: 'json' };
}

async function list() {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM appointments ORDER BY created_at DESC');
    return assignSerials(rows.map(normalize));
  }
  return assignSerials(json.appointments.slice().reverse().map(normalize));
}

async function nextSerial(date, time) {
  if (pool) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM appointments WHERE date = $1 AND status <> 'Cancelled' AND time < $2`,
      [date, time]
    );
    return (rows[0] && rows[0].n ? rows[0].n : 0) + 1;
  }
  const earlier = json.appointments.filter(
    (a) => a.date === date && a.status !== 'Cancelled' && (a.time || '00:00') < (time || '00:00')
  );
  return earlier.length + 1;
}

function assignSerials(appointments) {
  const groups = {};
  for (const a of appointments) {
    (groups[a.date] = groups[a.date] || []).push(a);
  }
  for (const date in groups) {
    groups[date]
      .filter((x) => x.status !== 'Cancelled')
      .sort((x, y) => (x.time || '00:00').localeCompare(y.time || '00:00'))
      .forEach((a, i) => { a.serial = i + 1; });
  }
  return appointments;
}

async function create(data) {
  const serial = await nextSerial(data.date, data.time);
  if (pool) {
    const { rows } = await pool.query(
      `INSERT INTO appointments (ref, name, phone, email, doctor, service, charge, fee, payment_method, payment_status, date, time, message, status, serial)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [data.ref, data.name, data.phone, data.email, data.doctor, data.service || 'ENT Consultation', data.charge || '', data.fee || 0, data.payment_method || 'Cash at Clinic', data.payment_status || 'Unpaid', data.date, data.time, data.message || '', data.status || 'Pending', serial]
    );
    return normalize(rows[0]);
  }
  const appointment = normalize({
    id: json.seq++,
    ref: data.ref,
    name: data.name,
    phone: data.phone,
    email: data.email,
    doctor: data.doctor,
    service: data.service || 'ENT Consultation',
    charge: data.charge || '',
    fee: data.fee || 0,
    payment_method: data.payment_method || 'Cash at Clinic',
    payment_status: data.payment_status || 'Unpaid',
    date: data.date,
    time: data.time,
    message: data.message || '',
    status: data.status || 'Pending',
    serial,
    created_at: new Date().toISOString()
  });
  json.appointments.push(appointment);
  saveJson();
  return appointment;
}

async function getByRef(ref) {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM appointments WHERE ref = $1', [ref]);
    if (!rows[0]) return null;
    return assignSerials(rows.map(normalize))[0];
  }
  const found = json.appointments.find((x) => x.ref === ref);
  if (!found) return null;
  return assignSerials([normalize(found)])[0];
}

async function updateStatus(id, status) {
  if (pool) {
    const { rows } = await pool.query('UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    return normalize(rows[0] || null);
  }
  const a = json.appointments.find((x) => x.id === Number(id));
  if (!a) return null;
  a.status = status;
  saveJson();
  return normalize(a);
}

async function updatePayment(id, payment_status) {
  if (pool) {
    const { rows } = await pool.query('UPDATE appointments SET payment_status = $1 WHERE id = $2 RETURNING *', [payment_status, id]);
    return normalize(rows[0] || null);
  }
  const a = json.appointments.find((x) => x.id === Number(id));
  if (!a) return null;
  a.payment_status = payment_status;
  saveJson();
  return normalize(a);
}

async function remove(id) {
  if (pool) {
    await pool.query('DELETE FROM appointments WHERE id = $1', [Number(id)]);
    return;
  }
  json.appointments = json.appointments.filter((x) => x.id !== Number(id));
  saveJson();
}

async function stats() {
  const all = await list();
  const today = todayStr();
  const paid = all.filter((x) => x.payment_status === 'Paid');
  return {
    total: all.length,
    pending: all.filter((x) => x.status === 'Pending').length,
    confirmed: all.filter((x) => x.status === 'Confirmed').length,
    today: all.filter((x) => x.date === today && x.status !== 'Cancelled').length,
    paid: paid.length,
    unpaid: all.filter((x) => x.payment_status !== 'Paid').length,
    revenue: paid.reduce((sum, x) => sum + (Number(x.fee) || 0), 0)
  };
}

module.exports = { init, list, create, getByRef, updateStatus, updatePayment, remove, stats };
