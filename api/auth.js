const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join('/tmp', 'cheatgpt_keys.json');
const PAYLOAD_URL = '/payload/libBEZO.so.xz';
const PACKAGE = 'com.dts.freefiremax';

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {}
  return { keys: {}, history: [], settings: { currency: 999999999 } };
}

function saveDB(db) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
}

function getDeviceId(p) {
  const raw = `${p.p_hdi || ''}|${p.device_name || ''}|${p.serial || ''}`;
  return crypto.createHash('md5').update(raw).digest('hex');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let params = {};
  if (req.method === 'POST') {
    const bufs = [];
    for await (const c of req) bufs.push(c);
    const body = Buffer.concat(bufs).toString();
    try { params = JSON.parse(body); } catch (e) {
      const usp = new URLSearchParams(body);
      for (const [k, v] of usp) params[k] = v;
    }
  } else {
    params = req.query || {};
  }

  const p_hdi = params.p_hdi || '';
  const p_key = params.p_key || params.key || '';

  if (!p_hdi || !p_key) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(400).json({ message: 'Invalid parameters', error: 'Not Found', statusCode: 404 });
  }

  const db = loadDB();

  if (!db.keys[p_key]) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(404).json({
      ok: false, status: 'failed', reason: 'key_not_found',
      message: 'Key is not exist', error: 'Not Found', statusCode: 404
    });
  }

  const kd = db.keys[p_key];
  const now = Math.floor(Date.now() / 1000);

  if (!kd.is_active) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(403).json({
      ok: false, status: 'failed', reason: 'key_disabled',
      message: 'Key has been disabled', error: 'Forbidden', statusCode: 403
    });
  }

  if (now > kd.expires_at) {
    kd.is_active = false;
    saveDB(db);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(410).json({
      ok: false, status: 'failed', reason: 'key_expired',
      message: 'Key has expired',
      expired_at: new Date(kd.expires_at * 1000).toISOString().replace('T', ' ').slice(0, 19),
      error: 'Gone', statusCode: 410
    });
  }

  const deviceId = getDeviceId(params);
  const deviceName = params.device_name || params.device || 'Unknown Device';
  const maxDev = kd.max_devices || 1;
  if (!kd.devices) kd.devices = {};

  if (!kd.devices[deviceId]) {
    const count = Object.keys(kd.devices).length;
    if (maxDev > 0 && count >= maxDev) {
      const locked = Object.values(kd.devices)[0];
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(403).json({
        ok: false, status: 'failed', reason: 'device_limit_exceeded',
        message: 'Device limit reached. This key is locked to another device.',
        locked_to: (locked && locked.name) || 'Unknown',
        error: 'Forbidden', statusCode: 403
      });
    }
    kd.devices[deviceId] = { name: deviceName, first_use: now, last_use: now };
  } else {
    kd.devices[deviceId].last_use = now;
  }

  kd.last_use = now;
  kd.use_count = (kd.use_count || 0) + 1;
  saveDB(db);

  const exp = new Date(kd.expires_at * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const sep = '\u00D7';

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(`${PAYLOAD_URL}${sep}${exp}${sep}${PACKAGE}`);
};
