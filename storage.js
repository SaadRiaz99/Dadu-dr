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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
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
    return rows;
  }
  return json.appointments.slice().reverse();
}

async function create(data) {
  if (pool) {
    const { rows } = await pool.query(
      `INSERT INTO appointments (ref, name, phone, email, doctor, service, charge, date, time, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [data.ref, data.name, data.phone, data.email, data.doctor, data.service || 'ENT Consultation', data.charge || '', data.date, data.time, data.message || '', data.status || 'Pending']
    );
    return rows[0];
  }
  const appointment = {
    id: json.seq++,
    ref: data.ref,
    name: data.name,
    phone: data.phone,
    email: data.email,
    doctor: data.doctor,
    service: data.service || 'ENT Consultation',
    charge: data.charge || '',
    date: data.date,
    time: data.time,
    message: data.message || '',
    status: data.status || 'Pending',
    created_at: new Date().toISOString()
  };
  json.appointments.push(appointment);
  saveJson();
  return appointment;
}

async function getByRef(ref) {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM appointments WHERE ref = $1', [ref]);
    return rows[0] || null;
  }
  return json.appointments.find((x) => x.ref === ref) || null;
}

async function updateStatus(id, status) {
  if (pool) {
    const { rows } = await pool.query('UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    return rows[0] || null;
  }
  const a = json.appointments.find((x) => x.id === Number(id));
  if (!a) return null;
  a.status = status;
  saveJson();
  return a;
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
  return {
    total: all.length,
    pending: all.filter((x) => x.status === 'Pending').length,
    confirmed: all.filter((x) => x.status === 'Confirmed').length,
    today: all.filter((x) => x.date === today && x.status !== 'Cancelled').length
  };
}

module.exports = { init, list, create, getByRef, updateStatus, remove, stats };
