const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join('/tmp', 'cheatgpt_keys.json');
const ADMIN_USER = 'pay';
const ADMIN_PASS = 'imudbanget';

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

function parseCookies(h) {
  const c = {};
  if (!h) return c;
  h.split(';').forEach(s => {
    const [k, ...v] = s.trim().split('=');
    c[k] = decodeURIComponent(v.join('='));
  });
  return c;
}

function genKey(days) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = '';
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return 'CHEATGPT-PAYFURY-' + days + 'DAY-' + r;
}

async function readBody(req) {
  const bufs = [];
  for await (const c of req) bufs.push(c);
  const body = Buffer.concat(bufs).toString();
  try { return JSON.parse(body); } catch (e) { return {}; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookies = parseCookies(req.headers.cookie);
  const loggedIn = cookies.cgp_admin === '1';
  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action');
  const doParam = url.searchParams.get('do');

  if (req.method === 'POST' && doParam === 'login') {
    const body = await readBody(req);
    const u = body.username || '';
    const p = body.password || '';
    if (u === ADMIN_USER && p === ADMIN_PASS) {
      res.setHeader('Set-Cookie', 'cgp_admin=1; Path=/api/admin; HttpOnly; SameSite=Lax; Max-Age=86400');
      return res.redirect(302, '/api/admin');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(loginHTML(true));
  }

  if (doParam === 'logout') {
    res.setHeader('Set-Cookie', 'cgp_admin=; Path=/api/admin; HttpOnly; Max-Age=0');
    return res.redirect(302, '/api/admin');
  }

  if (action && loggedIn) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const db = loadDB();

    if (action === 'list') {
      const keys = Object.entries(db.keys).map(([k, v]) => ({
        key: k,
        is_active: v.is_active,
        expires_at: v.expires_at,
        expires_human: new Date(v.expires_at * 1000).toISOString().replace('T', ' ').slice(0, 19),
        max_devices: v.max_devices || 1,
        device_count: Object.keys(v.devices || {}).length,
        use_count: v.use_count || 0,
        created_at: v.created_at || 0,
        currency: v.currency || 999999999,
        days_left: Math.max(0, Math.floor((v.expires_at - Date.now() / 1000) / 86400))
      }));
      return res.json({ ok: true, keys: keys, settings: db.settings || { currency: 999999999 } });
    }

    if (action === 'history') {
      const h = (db.history || []).slice(-100).reverse();
      return res.json({ ok: true, history: h });
    }

    if (action === 'create') {
      const body = await readBody(req);
      const days = Math.max(1, parseInt(body.days) || 1);
      const key = (body.custom_key && body.custom_key.trim()) || genKey(days);
      const maxDev = Math.max(0, parseInt(body.max_devices) || 1);
      const currency = parseInt(body.currency) || 999999999;
      if (db.keys[key]) return res.json({ ok: false, error: 'Key already exists' });

      const now = Math.floor(Date.now() / 1000);
      db.keys[key] = {
        key: key, is_active: true, created_at: now,
        expires_at: now + days * 86400,
        max_devices: maxDev, devices: {}, use_count: 0, currency: currency
      };

      if (!db.history) db.history = [];
      db.history.push({
        key: key, days: days, max_devices: maxDev, currency: currency,
        created_at: now, created_human: new Date(now * 1000).toISOString().replace('T', ' ').slice(0, 19)
      });

      saveDB(db);
      return res.json({
        ok: true, key: key, days: days, max_devices: maxDev, currency: currency,
        expires_human: new Date((now + days * 86400) * 1000).toISOString().replace('T', ' ').slice(0, 19)
      });
    }

    if (action === 'delete') {
      const body = await readBody(req);
      if (db.keys[body.key]) { delete db.keys[body.key]; saveDB(db); return res.json({ ok: true }); }
      return res.json({ ok: false, error: 'Key not found' });
    }

    if (action === 'toggle') {
      const body = await readBody(req);
      if (db.keys[body.key]) {
        db.keys[body.key].is_active = !db.keys[body.key].is_active;
        saveDB(db);
        return res.json({ ok: true, is_active: db.keys[body.key].is_active });
      }
      return res.json({ ok: false, error: 'Key not found' });
    }

    if (action === 'edit') {
      const body = await readBody(req);
      if (db.keys[body.key]) {
        if (body.days) db.keys[body.key].expires_at = Math.floor(Date.now() / 1000) + Math.max(1, parseInt(body.days)) * 86400;
        if (body.max_devices) db.keys[body.key].max_devices = Math.max(1, parseInt(body.max_devices));
        if (body.currency) db.keys[body.key].currency = parseInt(body.currency);
        saveDB(db);
        return res.json({ ok: true });
      }
      return res.json({ ok: false, error: 'Key not found' });
    }

    if (action === 'devices') {
      const body = await readBody(req);
      if (db.keys[body.key]) return res.json({ ok: true, devices: db.keys[body.key].devices || {} });
      return res.json({ ok: false, error: 'Key not found' });
    }

    return res.json({ ok: false, error: 'Unknown action' });
  }

  if (loggedIn && !action) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(dashboardHTML());
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(loginHTML(false));
};

function loginHTML(err) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>CheatGPT Admin</title><style>'
+'*{margin:0;padding:0;box-sizing:border-box}:root{--bg:#0a0a0f;--card:#12121a;--border:#1e1e2e;--accent:#6c5ce7;--accent2:#a29bfe;--green:#00b894;--red:#ff6b6b;--text:#e0e0e0;--text2:#888;--glass:rgba(18,18,26,0.85)}'
+'@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}'
+'@keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}'
+'@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}'
+'body{font-family:"Segoe UI",system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}'
+'body::before{content:"";position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle at 30% 20%,rgba(108,92,231,0.08) 0%,transparent 50%),radial-gradient(circle at 70% 80%,rgba(0,184,148,0.06) 0%,transparent 50%);z-index:-1;animation:float 20s ease-in-out infinite}'
+'.lc{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}'
+'.lb{background:var(--glass);backdrop-filter:blur(20px);border:1px solid var(--border);border-radius:20px;padding:48px 40px;width:100%;max-width:420px;animation:slideUp 0.6s ease}'
+'.lb h1{text-align:center;font-size:28px;margin-bottom:8px;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}'
+'.lb .sub{text-align:center;color:var(--text2);margin-bottom:32px;font-size:14px}'
+'.lb .logo{text-align:center;font-size:48px;margin-bottom:16px;animation:float 3s ease-in-out infinite}'
+'.fg{margin-bottom:20px}.fg label{display:block;font-size:13px;color:var(--text2);margin-bottom:6px;font-weight:500}'
+'.fg input{width:100%;padding:12px 16px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;transition:all 0.3s ease;outline:none}'
+'.fg input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(108,92,231,0.15)}'
+'.btn{width:100%;padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.3s ease}'
+'.bp{background:linear-gradient(135deg,var(--accent),#8b5cf6);color:#fff}'
+'.bp:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(108,92,231,0.35)}'
+'.em{background:rgba(255,107,107,0.1);border:1px solid rgba(255,107,107,0.3);border-radius:10px;padding:10px 14px;color:var(--red);font-size:13px;margin-bottom:16px;text-align:center;animation:fadeIn 0.3s ease}'
+'</style></head><body><div class="lc"><div class="lb"><div class="logo">\uD83D\uDD10</div><h1>CheatGPT Admin</h1><p class="sub">License Key Management Panel</p>'
+(err ? '<div class="em">\u26A0\uFE0F Invalid username or password</div>' : '')
+'<form method="POST" action="/api/admin?do=login"><div class="fg"><label>\uD83D\uDC64 Username</label><input type="text" name="username" placeholder="Enter username" required autofocus></div>'
+'<div class="fg"><label>\uD83D\uDD11 Password</label><input type="password" name="password" placeholder="Enter password" required></div>'
+'<button type="submit" class="btn bp">\uD83D\uDE80 Sign In</button></form></div></div></body></html>';
}

function dashboardHTML() {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>CheatGPT Admin</title><style>'
+'*{margin:0;padding:0;box-sizing:border-box}:root{--bg:#0a0a0f;--card:#12121a;--border:#1e1e2e;--accent:#6c5ce7;--accent2:#a29bfe;--green:#00b894;--red:#ff6b6b;--orange:#fdcb6e;--text:#e0e0e0;--text2:#888;--glass:rgba(18,18,26,0.85)}'
+'@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}'
+'@keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}'
+'@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}'
+'@keyframes pop{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}'
+'body{font-family:"Segoe UI",system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}'
+'body::before{content:"";position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle at 30% 20%,rgba(108,92,231,0.08) 0%,transparent 50%),radial-gradient(circle at 70% 80%,rgba(0,184,148,0.06) 0%,transparent 50%);z-index:-1;animation:float 20s ease-in-out infinite}'
+'.dash{max-width:1200px;margin:0 auto;padding:24px}'
+'.hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:12px}'
+'.hdr h1{font-size:24px;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}'
+'.hdr-a{display:flex;gap:10px;align-items:center}'
+'.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:32px}'
+'.sc{background:var(--glass);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:16px;padding:20px;animation:fadeIn 0.5s ease;transition:all 0.3s}'
+'.sc:hover{border-color:var(--accent);transform:translateY(-3px)}'
+'.sc .ic{font-size:28px;margin-bottom:8px}.sc .vl{font-size:28px;font-weight:700;margin-bottom:4px}.sc .lb{font-size:13px;color:var(--text2)}'
+'.ks{background:var(--glass);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:16px;padding:24px;animation:fadeIn 0.6s ease;margin-bottom:24px}'
+'.kh{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px}'
+'.kh h2{font-size:18px;font-weight:600}'
+'.kt{width:100%;border-collapse:collapse}'
+'.kt th{text-align:left;padding:12px 16px;font-size:12px;color:var(--text2);text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border);font-weight:600}'
+'.kt td{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;vertical-align:middle}'
+'.kt tr{transition:all 0.2s}.kt tr:hover{background:rgba(108,92,231,0.05)}'
+'.kt-text{font-family:"SF Mono",Monaco,Consolas,monospace;font-size:12px;background:rgba(108,92,231,0.1);padding:4px 10px;border-radius:6px;color:var(--accent2);word-break:break-all}'
+'.bd{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600}'
+'.ba{background:rgba(0,184,148,0.15);color:var(--green)}.be{background:rgba(255,107,107,0.15);color:var(--red)}.bdis{background:rgba(253,203,110,0.15);color:var(--orange)}'
+'.acts{display:flex;gap:6px;flex-wrap:wrap}'
+'.mo{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:1000;padding:20px}'
+'.mo.on{display:flex}'
+'.md{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:32px;width:100%;max-width:500px;animation:slideUp 0.3s ease}'
+'.md h3{font-size:20px;margin-bottom:20px;display:flex;align-items:center;gap:8px}'
+'.ma{display:flex;gap:10px;justify-content:flex-end;margin-top:24px}'
+'.ma .btn{width:auto;padding:10px 24px}'
+'.btn{padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.3s ease}'
+'.bp{background:linear-gradient(135deg,var(--accent),#8b5cf6);color:#fff}'
+'.bp:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(108,92,231,0.35)}'
+'.bs{padding:6px 14px;width:auto;font-size:12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;transition:all 0.3s}'
+'.bs:hover{border-color:var(--accent);color:var(--accent2)}'
+'.bdel{background:linear-gradient(135deg,var(--red),#ee5a24);color:#fff;padding:8px 16px;width:auto;font-size:12px;border-radius:8px;border:none;cursor:pointer}'
+'.bdel:hover{box-shadow:0 4px 15px rgba(255,107,107,0.3)}'
+'.dl{list-style:none;padding:0}'
+'.di{display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:8px;font-size:13px}'
+'.di .dv{font-size:20px}.di .dn{font-weight:500}.di .dt{color:var(--text2);font-size:11px;margin-left:auto}'
+'.toast{position:fixed;bottom:24px;right:24px;padding:14px 24px;border-radius:12px;font-size:14px;font-weight:500;z-index:2000;animation:slideUp 0.3s ease;display:none}'
+'.ts{background:var(--green);color:#fff}.te{background:var(--red);color:#fff}'
+'.es{text-align:center;padding:48px 20px;color:var(--text2)}.es .ic{font-size:48px;margin-bottom:12px;animation:float 3s ease-in-out infinite}'
+'.tabs{display:flex;gap:8px;margin-bottom:24px}'
+'.tab{padding:10px 20px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text2);cursor:pointer;font-size:13px;font-weight:500;transition:all 0.3s}'
+'.tab.on{background:rgba(108,92,231,0.15);border-color:var(--accent);color:var(--accent2)}'
+'.tab:hover{border-color:var(--accent)}'
+'.rct{background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid var(--accent);border-radius:16px;padding:32px;max-width:400px;margin:0 auto;animation:pop 0.4s ease}'
+'.rct .r-hdr{text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px dashed rgba(108,92,231,0.3)}'
+'.rct .r-hdr h3{font-size:20px;color:var(--accent2);margin-bottom:4px}'
+'.rct .r-hdr p{color:var(--text2);font-size:12px}'
+'.rct .r-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px}'
+'.rct .r-row .rl{color:var(--text2)}.rct .r-row .rv{color:var(--text);font-weight:600;text-align:right;max-width:60%;word-break:break-all}'
+'.rct .r-key{background:rgba(108,92,231,0.15);border-radius:8px;padding:10px;text-align:center;margin:16px 0;font-family:monospace;font-size:13px;color:var(--accent2);letter-spacing:1px}'
+'.rct .r-ftr{text-align:center;margin-top:20px;padding-top:16px;border-top:2px dashed rgba(108,92,231,0.3);color:var(--text2);font-size:11px}'
+'.hi{padding:12px 16px;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:8px;display:flex;align-items:center;gap:12px;font-size:13px;animation:fadeIn 0.3s ease}'
+'.hi .h-ic{font-size:20px}.hi .h-key{font-family:monospace;color:var(--accent2);font-size:12px}.hi .h-info{color:var(--text2);font-size:11px;margin-left:auto}'
+'@media(max-width:768px){.kt th,.kt td{padding:8px 10px}.hdr{flex-direction:column;align-items:flex-start}.stats{grid-template-columns:1fr 1fr}.md{margin:10px}}'
+'@media(max-width:480px){.stats{grid-template-columns:1fr}.kt{display:block;overflow-x:auto}}'
+'</style></head><body><div class="dash">'
+'<div class="hdr"><h1>\u26A1 CheatGPT Dashboard</h1><div class="hdr-a">'
+'<span style="color:var(--text2);font-size:13px">\uD83D\uDCB0 Currency: <span id="curD" style="color:var(--green);font-weight:700">999,999,999</span></span>'
+'<a href="/api/admin?do=logout" class="bs" style="text-decoration:none;color:var(--red);border-color:var(--red)">\uD83D\uDEAA Logout</a></div></div>'
+'<div class="stats">'
+'<div class="sc"><div class="ic">\uD83D\uDD11</div><div class="vl" id="tK">0</div><div class="lb">Total Keys</div></div>'
+'<div class="sc"><div class="ic">\u2705</div><div class="vl" id="aK">0</div><div class="lb">Active Keys</div></div>'
+'<div class="sc"><div class="ic">\uD83D\uDCF1</div><div class="vl" id="tD">0</div><div class="lb">Total Devices</div></div>'
+'<div class="sc"><div class="ic">\uD83D\uDCCA</div><div class="vl" id="tU">0</div><div class="lb">Total Uses</div></div></div>'
+'<div class="tabs">'
+'<button class="tab on" onclick="switchTab(\'keys\')">\uD83D\uDCCB Keys</button>'
+'<button class="tab" onclick="switchTab(\'history\')">\uD83D\uDCDA History</button></div>'
+'<div id="tabKeys" class="ks"><div class="kh"><h2>\uD83D\uDCCB License Keys</h2>'
+'<button class="btn bp" style="width:auto;padding:10px 20px;font-size:13px" onclick="openModal(\'cM\')">\u2795 Create Key</button></div>'
+'<table class="kt"><thead><tr><th>Key</th><th>Status</th><th>Expires</th><th>Devices</th><th>Uses</th><th>Actions</th></tr></thead>'
+'<tbody id="kB"></tbody></table>'
+'<div class="es" id="eS" style="display:none"><div class="ic">\uD83D\uDCED</div><p>No keys yet. Create your first key!</p></div></div>'
+'<div id="tabHistory" class="ks" style="display:none"><div class="kh"><h2>\uD83D\uDCDA Key History</h2></div>'
+'<div id="hL"></div>'
+'<div class="es" id="eH" style="display:none"><div class="ic">\uD83D\uDCDA</div><p>No history yet.</p></div></div>'

+'<div class="mo" id="cM"><div class="md"><h3>\u2728 Create New Key</h3>'
+'<div class="fg"><label>Custom Key (leave empty = auto generate)</label><input type="text" id="cK" placeholder="CHEATGPT-PAYFURY-1DAY-XXXXXXXX"></div>'
+'<div class="fg"><label>\uD83D\uDCC5 Expiry Days</label><input type="number" id="kD" value="1" min="1" max="3650"></div>'
+'<div class="fg"><label>\uD83D\uDCF1 Max Devices (0 = unlimited)</label><input type="number" id="kM" value="1" min="0" max="999"></div>'
+'<div class="fg"><label>\uD83D\uDCB0 Currency</label><input type="number" id="kC" value="999999999" min="0"></div>'
+'<div class="ma"><button class="bs" onclick="closeModal(\'cM\')">Cancel</button>'
+'<button class="btn bp" style="width:auto;padding:10px 24px;font-size:13px" onclick="doCreate()">\uD83D\uDD11 Create</button></div></div></div>'

+'<div class="mo" id="rM"><div class="md" style="max-width:460px"><h3>\uD83D\uDCC3 Key Receipt</h3>'
+'<div class="rct" id="rCt"></div>'
+'<div class="ma"><button class="bs" onclick="closeModal(\'rM\')">Close</button>'
+'<button class="btn bp" style="width:auto;padding:10px 24px;font-size:13px" onclick="dlReceipt()">\uD83D\uDCBE Download Image</button></div></div></div>'

+'<div class="mo" id="eM"><div class="md"><h3>\u270F\uFE0F Edit Key</h3><input type="hidden" id="eKI">'
+'<div class="fg"><label>\uD83D\uDCC5 Expiry Days (from now)</label><input type="number" id="eD" min="1" max="3650"></div>'
+'<div class="fg"><label>\uD83D\uDCF1 Max Devices</label><input type="number" id="eDV" min="1" max="999"></div>'
+'<div class="fg"><label>\uD83D\uDCB0 Currency</label><input type="number" id="eC" min="0"></div>'
+'<div class="ma"><button class="bs" onclick="closeModal(\'eM\')">Cancel</button>'
+'<button class="btn bp" style="width:auto;padding:10px 24px;font-size:13px" onclick="doEdit()">\uD83D\uDCBE Save</button></div></div></div>'

+'<div class="mo" id="dM"><div class="md"><h3>\uD83D\uDCF1 Registered Devices</h3>'
+'<p style="color:var(--text2);font-size:13px;margin-bottom:16px" id="dKL"></p>'
+'<ul class="dl" id="dL"></ul>'
+'<div class="ma"><button class="bs" onclick="closeModal(\'dM\')">Close</button></div></div></div>'

+'<div class="toast" id="toast"></div></div>'
+'<script>'
+'var KD=[],HD=[],lastRct=null;'
+'function S(m,t){t=t||"success";var e=document.getElementById("toast");e.textContent=t==="success"?"\u2705 "+m:"\u274C "+m;e.className="toast "+(t==="success"?"ts":"te");e.style.display="block";setTimeout(function(){e.style.display="none"},3000)}'
+'function openModal(id){document.getElementById(id).classList.add("on")}'
+'function closeModal(id){document.getElementById(id).classList.remove("on")}'
+'var ovs=document.querySelectorAll(".mo");for(var i=0;i<ovs.length;i++){ovs[i].addEventListener("click",function(e){if(e.target===this)this.classList.remove("on")})}'
+'function getStatus(k){if(!k.is_active)return"<span class=\"bd bdis\">\u23F8 Disabled</span>";if(k.days_left<=0)return"<span class=\"bd be\">\u23F0 Expired</span>";return"<span class=\"bd ba\">\u2705 Active ("+k.days_left+"d)</span>"}'
+'function esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML}'
+'function switchTab(t){document.getElementById("tabKeys").style.display=t==="keys"?"block":"none";document.getElementById("tabHistory").style.display=t==="history"?"block":"none";var tabs=document.querySelectorAll(".tab");for(var i=0;i<tabs.length;i++)tabs[i].classList.remove("on");if(t==="keys")tabs[0].classList.add("on");else tabs[1].classList.add("on");if(t==="history")loadHistory()}'
+'function loadKeys(){fetch("/api/admin?action=list").then(function(r){return r.json()}).then(function(d){if(!d.ok)return;KD=d.keys;document.getElementById("curD").textContent=(d.settings&&d.settings.currency?d.settings.currency:999999999).toLocaleString();var t=d.keys.length,a=0,dev=0,uses=0;for(var i=0;i<d.keys.length;i++){if(d.keys[i].is_active&&d.keys[i].days_left>0)a++;dev+=d.keys[i].device_count;uses+=d.keys[i].use_count}document.getElementById("tK").textContent=t;document.getElementById("aK").textContent=a;document.getElementById("tD").textContent=dev;document.getElementById("tU").textContent=uses;var tb=document.getElementById("kB"),em=document.getElementById("eS");if(t===0){tb.innerHTML="";em.style.display="block";return}em.style.display="none";var h="";for(var i=0;i<d.keys.length;i++){var k=d.keys[i];h+="<tr style=\"animation:fadeIn 0.3s ease\">";h+="<td><span class=\"kt-text\">"+esc(k.key)+"</span></td>";h+="<td>"+getStatus(k)+"</td>";h+="<td style=\"font-size:12px;color:var(--text2)\">"+k.expires_human+"</td>";h+="<td><span style=\"color:var(--accent2);font-weight:600\">"+k.device_count+"</span> / "+(k.max_devices===0?"\u221E":k.max_devices)+"</td>";h+="<td>"+k.use_count+"</td>";h+="<td><div class=\"acts\">";h+="<button class=\"bs\" data-act=\"dev\" data-key=\""+esc(k.key)+"\">\uD83D\uDCF1</button>";h+="<button class=\"bs\" data-act=\"edit\" data-key=\""+esc(k.key)+"\">\u270F\uFE0F</button>";h+="<button class=\"bs\" data-act=\"tog\" data-key=\""+esc(k.key)+"\">"+(k.is_active?"\u23F8":"\u25B6\uFE0F")+"</button>";h+="<button class=\"bdel\" data-act=\"del\" data-key=\""+esc(k.key)+"\">\uD83D\uDDD1</button>";h+="</div></td></tr>"}tb.innerHTML=h;bindActions()}).catch(function(e){console.error(e)})}'
+'function bindActions(){var btns=document.querySelectorAll("[data-act]");for(var i=0;i<btns.length;i++){btns[i].addEventListener("click",function(){var act=this.getAttribute("data-act"),key=this.getAttribute("data-key");if(act==="dev")viewDevices(key);else if(act==="edit")editKey(key);else if(act==="tog")toggleKey(key);else if(act==="del")deleteKey(key)})}}'
+'function loadHistory(){fetch("/api/admin?action=history").then(function(r){return r.json()}).then(function(d){if(!d.ok)return;HD=d.history;var el=document.getElementById("hL"),em=document.getElementById("eH");if(!d.history||d.history.length===0){el.innerHTML="";em.style.display="block";return}em.style.display="none";var h="";for(var i=0;i<d.history.length;i++){var x=d.history[i];h+="<div class=\"hi\"><span class=\"h-ic\">\uD83D\uDCDD</span><div><div class=\"h-key\">"+esc(x.key)+"</div></div><div class=\"h-info\">"+x.days+"d | "+x.max_devices+" dev | \uD83D\uDCB0"+(x.currency||999999999).toLocaleString()+" | "+x.created_human+"</div></div>"}el.innerHTML=h}).catch(function(e){console.error(e)})}'
+'function doCreate(){var bk=document.getElementById("cK").value.trim(),dy=parseInt(document.getElementById("kD").value),md=parseInt(document.getElementById("kM").value),cr=parseInt(document.getElementById("kC").value);fetch("/api/admin?action=create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({custom_key:bk,days:dy,max_devices:md,currency:cr})}).then(function(r){return r.json()}).then(function(d){if(d.ok){showReceipt(d);closeModal("cM");loadKeys();S("Key created: "+d.key)}else S(d.error||"Failed","error")})}'
+'function showReceipt(d){lastRct=d;var now=new Date().toLocaleString();var html="<div class=\"r-hdr\"><h3>\uD83D\uDD11 CheatGPT Key</h3><p>Payment Receipt</p></div>";html+="<div class=\"r-row\"><span class=\"rl\">Key</span><span class=\"rv\" style=\"font-family:monospace;font-size:11px\">"+esc(d.key)+"</span></div>";html+="<div class=\"r-row\"><span class=\"rl\">Duration</span><span class=\"rv\">"+d.days+" Day(s)</span></div>";html+="<div class=\"r-row\"><span class=\"rl\">Max Devices</span><span class=\"rv\">"+(d.max_devices===0?"Unlimited":d.max_devices)+"</span></div>";html+="<div class=\"r-row\"><span class=\"rl\">Currency</span><span class=\"rv\">\uD83D\uDCB0 "+(d.currency||999999999).toLocaleString()+"</span></div>";html+="<div class=\"r-row\"><span class=\"rl\">Expires</span><span class=\"rv\">"+d.expires_human+"</span></div>";html+="<div class=\"r-row\"><span class=\"rl\">Created</span><span class=\"rv\">"+now+"</span></div>";html+="<div class=\"r-ftr\">CheatGPT License Server \u2022 Generated by Admin Panel</div>";document.getElementById("rCt").innerHTML=html;openModal("rM")}'
+'function dlReceipt(){if(!lastRct)return;var c=document.createElement("canvas");c.width=500;c.height=520;var x=c.getContext("2d");var g=x.createLinearGradient(0,0,500,520);g.addColorStop(0,"#0a0a1a");g.addColorStop(1,"#1a1a3e");x.fillStyle=g;x.fillRect(0,0,500,520);x.strokeStyle="#6c5ce7";x.lineWidth=3;x.strokeRect(10,10,480,500);x.setLineDash([8,4]);x.strokeStyle="rgba(108,92,231,0.3)";x.beginPath();x.moveTo(30,140);x.lineTo(470,140);x.stroke();x.beginPath();x.moveTo(30,440);x.lineTo(470,440);x.stroke();x.setLineDash([]);x.fillStyle="#a29bfe";x.font="bold 24px Segoe UI";x.textAlign="center";x.fillText("\uD83D\uDD11 CheatGPT Key",250,50);x.fillStyle="#888";x.font="12px Segoe UI";x.fillText("Payment Receipt",250,72);x.fillStyle="#6c5ce7";x.font="bold 14px SF Mono,monospace";x.fillText(lastRct.key,250,110);var rows=[["Duration",lastRct.days+" Day(s)"],["Max Devices",lastRct.max_devices===0?"Unlimited":String(lastRct.max_devices)],["Currency","\uD83D\uDCB0 "+(lastRct.currency||999999999).toLocaleString()],["Expires",lastRct.expires_human],["Created",new Date().toLocaleString()]];var ry=170;for(var i=0;i<rows.length;i++){x.fillStyle="#888";x.font="13px Segoe UI";x.textAlign="left";x.fillText(rows[i][0],40,ry);x.fillStyle="#e0e0e0";x.font="bold 13px Segoe UI";x.textAlign="right";x.fillText(rows[i][1],460,ry);ry+=36}x.fillStyle="#555";x.font="11px Segoe UI";x.textAlign="center";x.fillText("CheatGPT License Server \u2022 Generated by Admin Panel",250,470);x.fillStyle="#6c5ce7";x.font="10px Segoe UI";x.fillText(new Date().toISOString(),250,490);var link=document.createElement("a");link.download="cheatgpt-receipt-"+lastRct.key+".png";link.href=c.toDataURL("image/png");link.click();S("Receipt downloaded!")}'
+'function deleteKey(key){if(!confirm("\uD83D\uDDD1 Delete key: "+key+"?"))return;fetch("/api/admin?action=delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:key})}).then(function(r){return r.json()}).then(function(d){if(d.ok){S("Key deleted");loadKeys()}else S(d.error,"error")})}'
+'function toggleKey(key){fetch("/api/admin?action=toggle",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:key})}).then(function(r){return r.json()}).then(function(d){if(d.ok){S(d.is_active?"Key activated":"Key disabled");loadKeys()}})}'
+'function editKey(key){var k=null;for(var i=0;i<KD.length;i++){if(KD[i].key===key){k=KD[i];break}}if(!k)return;document.getElementById("eKI").value=key;document.getElementById("eD").value=k.days_left||1;document.getElementById("eDV").value=k.max_devices||1;document.getElementById("eC").value=k.currency||999999999;openModal("eM")}'
+'function doEdit(){var key=document.getElementById("eKI").value;var b={key:key,days:parseInt(document.getElementById("eD").value),max_devices:parseInt(document.getElementById("eDV").value),currency:parseInt(document.getElementById("eC").value)};fetch("/api/admin?action=edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json()}).then(function(d){if(d.ok){S("Key updated");closeModal("eM");loadKeys()}else S(d.error,"error")})}'
+'function viewDevices(key){document.getElementById("dKL").textContent="Key: "+key;fetch("/api/admin?action=devices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:key})}).then(function(r){return r.json()}).then(function(d){var l=document.getElementById("dL");if(!d.ok||Object.keys(d.devices).length===0){l.innerHTML="<li class=\"di\"><span class=\"dv\">\uD83D\uDCED</span><span>No devices registered yet</span></li>"}else{var h="";var entries=Object.entries(d.devices);for(var i=0;i<entries.length;i++){var dev=entries[i][1];h+="<li class=\"di\"><span class=\"dv\">\uD83D\uDCF1</span><div><div class=\"dn\">"+esc(dev.name||"Unknown")+"</div><div class=\"dt\">First: "+new Date(dev.first_use*1000).toLocaleString()+"</div></div><span class=\"dt\">Last: "+new Date(dev.last_use*1000).toLocaleString()+"</span></li>"}l.innerHTML=h}openModal("dM")})}'
+'loadKeys();setInterval(loadKeys,30000);'
+'</script></body></html>';
}
