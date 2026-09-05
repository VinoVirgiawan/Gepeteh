const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DB = path.join('/tmp', 'cheatgpt_keys.json');

function loadDB() {
  try { if (fs.existsSync(DB)) return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch(e) {}
  return { keys: {}, history: [], settings: { currency: 999999999 } };
}
function saveDB(d) { try { fs.writeFileSync(DB, JSON.stringify(d, null, 2)); } catch(e) {} }
function parseCookies(h) {
  const c = {}; if (!h) return c;
  h.split(';').forEach(s => { const [k, ...v] = s.trim().split('='); c[k] = decodeURIComponent(v.join('=')); });
  return c;
}
function genKey(days) {
  const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = ''; for (let i = 0; i < 8; i++) r += ch[Math.floor(Math.random() * ch.length)];
  return 'CHEATGPT-PAYFURY-' + days + 'DAY-' + r;
}
async function readBody(req) {
  const bufs = []; for await (const c of req) bufs.push(c);
  const raw = Buffer.concat(bufs).toString();
  try { return JSON.parse(raw); } catch(e) {
    const p = new URLSearchParams(raw); const o = {};
    for (const [k, v] of p) o[k] = v; return o;
  }
}

const HTML = String.raw;
const L = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CheatGPT Admin</title>';
const CSS = HTML_CLOSE = '</head><body>';

function loginPage(err) {
  return L + '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;background:#0a0a0f;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.lb{background:rgba(18,18,26,.85);backdrop-filter:blur(20px);border:1px solid #1e1e2e;border-radius:20px;padding:48px 40px;width:100%;max-width:420px}.lb h1{text-align:center;font-size:28px;margin-bottom:8px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.lb .sub{text-align:center;color:#888;margin-bottom:32px;font-size:14px}.lb .logo{text-align:center;font-size:48px;margin-bottom:16px}.fg{margin-bottom:20px}.fg label{display:block;font-size:13px;color:#888;margin-bottom:6px}.fg input{width:100%;padding:12px 16px;background:rgba(255,255,255,.05);border:1px solid #1e1e2e;border-radius:10px;color:#e0e0e0;font-size:14px;outline:none}.fg input:focus{border-color:#6c5ce7}.btn{width:100%;padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#6c5ce7,#8b5cf6);color:#fff}.btn:hover{transform:translateY(-2px)}.em{background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);border-radius:10px;padding:10px 14px;color:#ff6b6b;font-size:13px;margin-bottom:16px;text-align:center}</style></head><body><div class="lb"><div class="logo">&#x1F510;</div><h1>CheatGPT Admin</h1><p class="sub">License Key Management</p>' + (err ? '<div class="em">&#x26A0;&#xFE0F Invalid username or password</div>' : '') + '<form method="POST" action="/api/admin?do=login"><div class="fg"><label>&#x1F464; Username</label><input type="text" name="username" required autofocus></div><div class="fg"><label>&#x1F511; Password</label><input type="password" name="password" required></div><button type="submit" class="btn">&#x1F680; Sign In</button></form></div></body></html>';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const ck = parseCookies(req.headers.cookie);
  const logged = ck.cgp === '1';
  const url = new URL(req.url, 'http://localhost');
  const act = url.searchParams.get('action');
  const dp = url.searchParams.get('do');
  if (req.method === 'POST' && dp === 'login') {
    const b = await readBody(req);
    if (b.username === 'pay' && b.password === 'imudbanget') {
      res.setHeader('Set-Cookie', 'cgp=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400');
      return res.redirect(302, '/api/admin');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(loginPage(1));
  }
  if (dp === 'logout') {
    res.setHeader('Set-Cookie', 'cgp=; Path=/; HttpOnly; Max-Age=0');
    return res.redirect(302, '/api/admin');
  }
  if (act && logged) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const db = loadDB();
    if (act === 'list') {
      const keys = Object.entries(db.keys).map(([k, v]) => ({
        key: k, is_active: v.is_active, expires_at: v.expires_at,
        expires_human: new Date(v.expires_at * 1000).toISOString().replace('T', ' ').slice(0, 19),
        max_devices: v.max_devices || 1, device_count: Object.keys(v.devices || {}).length,
        use_count: v.use_count || 0, currency: v.currency || 999999999,
        days_left: Math.max(0, Math.floor((v.expires_at - Date.now() / 1000) / 86400))
      }));
      return res.json({ ok: true, keys, settings: db.settings || { currency: 999999999 } });
    }
    if (act === 'history') return res.json({ ok: true, history: (db.history || []).slice(-100).reverse() });
    if (act === 'create') {
      const b = await readBody(req);
      const days = Math.max(1, parseInt(b.days) || 1);
      const key = (b.custom_key && b.custom_key.trim()) || genKey(days);
      const md = Math.max(0, parseInt(b.max_devices) || 1);
      const cr = parseInt(b.currency) || 999999999;
      if (db.keys[key]) return res.json({ ok: false, error: 'Key already exists' });
      const now = Math.floor(Date.now() / 1000);
      db.keys[key] = { key, is_active: true, created_at: now, expires_at: now + days * 86400, max_devices: md, devices: {}, use_count: 0, currency: cr };
      if (!db.history) db.history = [];
      db.history.push({ key, days, max_devices: md, currency: cr, created_at: now, created_human: new Date(now * 1000).toISOString().replace('T', ' ').slice(0, 19) });
      saveDB(db);
      return res.json({ ok: true, key, days, max_devices: md, currency: cr, expires_human: new Date((now + days * 86400) * 1000).toISOString().replace('T', ' ').slice(0, 19) });
    }
    if (act === 'delete') { const b = await readBody(req); if (db.keys[b.key]) { delete db.keys[b.key]; saveDB(db); return res.json({ ok: true }); } return res.json({ ok: false, error: 'Key not found' }); }
    if (act === 'toggle') { const b = await readBody(req); if (db.keys[b.key]) { db.keys[b.key].is_active = !db.keys[b.key].is_active; saveDB(db); return res.json({ ok: true, is_active: db.keys[b.key].is_active }); } return res.json({ ok: false, error: 'Key not found' }); }
    if (act === 'edit') { const b = await readBody(req); if (db.keys[b.key]) { if (b.days) db.keys[b.key].expires_at = Math.floor(Date.now() / 1000) + Math.max(1, parseInt(b.days)) * 86400; if (b.max_devices) db.keys[b.key].max_devices = Math.max(1, parseInt(b.max_devices)); if (b.currency) db.keys[b.key].currency = parseInt(b.currency); saveDB(db); return res.json({ ok: true }); } return res.json({ ok: false, error: 'Key not found' }); }
    if (act === 'devices') { const b = await readBody(req); if (db.keys[b.key]) return res.json({ ok: true, devices: db.keys[b.key].devices || {} }); return res.json({ ok: false, error: 'Key not found' }); }
    return res.json({ ok: false, error: 'Unknown action' });
  }
  if (logged && !act) { return res.redirect(302, '/'); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(loginPage(0));
};

