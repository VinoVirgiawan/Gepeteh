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
  h.split(';').forEach(s => { const p = s.trim().split('='); c[p[0]] = decodeURIComponent(p.slice(1).join('=')); });
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

/* ============================================================
   LOGIN PAGE
   ============================================================ */
const loginHTML = (err) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CheatGPT Admin</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui;background:#0a0a0f;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.b{background:rgba(18,18,26,.85);backdrop-filter:blur(20px);border:1px solid #1e1e2e;border-radius:20px;padding:48px 40px;width:100%;max-width:420px}
.b h1{text-align:center;font-size:28px;margin-bottom:8px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.b .sub{text-align:center;color:#888;margin-bottom:32px;font-size:14px}
.b .logo{text-align:center;font-size:48px;margin-bottom:16px}
.fg{margin-bottom:20px}.fg label{display:block;font-size:13px;color:#888;margin-bottom:6px}
.fg input{width:100%;padding:12px 16px;background:rgba(255,255,255,.05);border:1px solid #1e1e2e;border-radius:10px;color:#e0e0e0;font-size:14px;outline:none}
.fg input:focus{border-color:#6c5ce7}
.btn{width:100%;padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#6c5ce7,#8b5cf6);color:#fff;transition:all .3s}
.btn:hover{transform:translateY(-2px)}
.em{background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);border-radius:10px;padding:10px 14px;color:#ff6b6b;font-size:13px;margin-bottom:16px;text-align:center}
</style></head><body>
<div class="b"><div class="logo">&#x1F510;</div><h1>CheatGPT Admin</h1><p class="sub">License Key Management</p>
${err ? '<div class="em">&#x26A0;&#xFE0F; Invalid username or password</div>' : ''}
<form method="POST" action="/?do=login">
<div class="fg"><label>&#x1F464; Username</label><input type="text" name="username" required autofocus></div>
<div class="fg"><label>&#x1F511; Password</label><input type="password" name="password" required></div>
<button type="submit" class="btn">&#x1F680; Sign In</button>
</form></div></body></html>`;

/* ============================================================
   DASHBOARD PAGE
   ============================================================ */
const dashHTML = () => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CheatGPT Dashboard</title>
<link rel="stylesheet" href="/style.css">
</head><body>
<div class="d">
  <div class="hdr"><h1>&#x26A1; CheatGPT Dashboard</h1>
  <div class="ha"><span style="color:var(--t2);font-size:13px">&#x1F4B0; <span id="curD" style="color:var(--green);font-weight:700">999,999,999</span></span>
  <a href="/?do=logout" class="bs" style="text-decoration:none;color:var(--red);border-color:var(--red)">&#x1F6AA; Logout</a></div></div>
  <div class="st">
    <div class="sc"><div class="i">&#x1F511;</div><div class="v" id="tK">0</div><div class="l">Total Keys</div></div>
    <div class="sc"><div class="i">&#x2705;</div><div class="v" id="aK">0</div><div class="l">Active</div></div>
    <div class="sc"><div class="i">&#x1F4F1;</div><div class="v" id="tD">0</div><div class="l">Devices</div></div>
    <div class="sc"><div class="i">&#x1F4CA;</div><div class="v" id="tU">0</div><div class="l">Uses</div></div>
  </div>
  <div class="tb">
    <button class="tbb on" id="tabK" onclick="sw('keys')">&#x1F4CB; Keys</button>
    <button class="tbb" id="tabH" onclick="sw('history')">&#x1F4DA; History</button>
  </div>
  <div id="tabKeys" class="ks">
    <div class="kh"><h2>&#x1F4CB; License Keys</h2>
    <button class="bt bp" style="width:auto;padding:10px 20px;font-size:13px" onclick="openM('cM')">&#x2795; Create Key</button></div>
    <table><thead><tr><th>Key</th><th>Status</th><th>Expires</th><th>Devices</th><th>Uses</th><th>Actions</th></tr></thead>
    <tbody id="kB"></tbody></table>
    <div class="es" id="eS" style="display:none"><p>&#x1F4ED; No keys yet</p></div>
  </div>
  <div id="tabHistory" class="ks" style="display:none">
    <div class="kh"><h2>&#x1F4DA; History</h2></div>
    <div id="hL"></div>
    <div class="es" id="eH" style="display:none"><p>&#x1F4DA; No history</p></div>
  </div>
  <!-- Create Modal -->
  <div class="mo" id="cM"><div class="md">
    <h3>&#x2728; Create Key</h3>
    <div class="fg"><label>Custom Key (empty = auto)</label><input type="text" id="cK" placeholder="CHEATGPT-PAYFURY-1DAY-XXXXXXXX"></div>
    <div class="fg"><label>&#x1F4C5; Days</label><input type="number" id="kD" value="1" min="1"></div>
    <div class="fg"><label>&#x1F4F1; Max Devices (0=unlimited)</label><input type="number" id="kM" value="1" min="0"></div>
    <div class="fg"><label>&#x1F4B0; Currency</label><input type="number" id="kC" value="999999999" min="0"></div>
    <div class="ma"><button class="bs" onclick="closeM('cM')">Cancel</button>
    <button class="bt bp" style="width:auto;padding:10px 24px;font-size:13px" onclick="doCreate()">&#x1F511; Create</button></div>
  </div></div>
  <!-- Receipt Modal -->
  <div class="mo" id="rM"><div class="md" style="max-width:460px">
    <h3>&#x1F4C3; Receipt</h3>
    <div class="rct" id="rCt"></div>
    <div class="ma"><button class="bs" onclick="closeM('rM')">Close</button>
    <button class="bt bp" style="width:auto;padding:10px 24px;font-size:13px" onclick="dlRct()">&#x1F4BE; Download</button></div>
  </div></div>
  <!-- Edit Modal -->
  <div class="mo" id="eM"><div class="md">
    <h3>&#x270F;&#xFE0F; Edit Key</h3><input type="hidden" id="eKI">
    <div class="fg"><label>&#x1F4C5; Days</label><input type="number" id="eD" min="1"></div>
    <div class="fg"><label>&#x1F4F1; Max Devices</label><input type="number" id="eDV" min="0"></div>
    <div class="fg"><label>&#x1F4B0; Currency</label><input type="number" id="eC" min="0"></div>
    <div class="ma"><button class="bs" onclick="closeM('eM')">Cancel</button>
    <button class="bt bp" style="width:auto;padding:10px 24px;font-size:13px" onclick="doEdit()">&#x1F4BE; Save</button></div>
  </div></div>
  <!-- Devices Modal -->
  <div class="mo" id="dM"><div class="md">
    <h3>&#x1F4F1; Devices</h3>
    <p style="color:var(--t2);font-size:13px;margin-bottom:16px" id="dKL"></p>
    <ul class="dl" id="dL"></ul>
    <div class="ma"><button class="bs" onclick="closeM('dM')">Close</button></div>
  </div></div>
  <div class="toast" id="toast"></div>
</div>
<script>
var KD=[],HD=[],lastRct=null;
function S(m,t){t=t||"success";var e=document.getElementById("toast");e.textContent=(t==="success"?"OK: ":"ERR: ")+m;e.className="ts "+(t==="success"?"tss":"tse");e.style.display="block";setTimeout(function(){e.style.display="none"},3000)}
function openM(id){document.getElementById(id).classList.add("on")}
function closeM(id){document.getElementById(id).classList.remove("on")}
document.querySelectorAll(".mo").forEach(function(m){m.addEventListener("click",function(e){if(e.target===this)this.classList.remove("on")})});
function sw(t){document.getElementById("tabKeys").style.display=t==="keys"?"block":"none";document.getElementById("tabHistory").style.display=t==="history"?"block":"none";document.getElementById("tabK").className=t==="keys"?"tbb on":"tbb";document.getElementById("tabH").className=t==="history"?"tbb on":"tbb";if(t==="history")loadH()}
function esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML}
function gS(k){if(!k.is_active)return '<span class="bd bi">Disabled</span>';if(k.days_left<=0)return '<span class="bd be">Expired</span>';return '<span class="bd ba">Active ('+k.days_left+'d)</span>'}
function loadK(){fetch("/?action=list").then(function(r){return r.json()}).then(function(d){if(!d.ok)return;KD=d.keys;document.getElementById("curD").textContent=(d.settings&&d.settings.currency?d.settings.currency:999999999).toLocaleString();var total=d.keys.length,act=0,dev=0,uses=0;for(var i=0;i<total;i++){if(d.keys[i].is_active&&d.keys[i].days_left>0)act++;dev+=d.keys[i].device_count;uses+=d.keys[i].use_count}document.getElementById("tK").textContent=total;document.getElementById("aK").textContent=act;document.getElementById("tD").textContent=dev;document.getElementById("tU").textContent=uses;var tb=document.getElementById("kB"),em=document.getElementById("eS");if(total===0){tb.innerHTML="";em.style.display="block";return}em.style.display="none";var h="";for(var i=0;i<total;i++){var k=d.keys[i];h+='<tr style="animation:fade .3s ease"><td><span class="kt">'+esc(k.key)+"</span></td><td>"+gS(k)+'</td><td style="font-size:12px;color:var(--t2)">'+k.expires_human+'</td><td><span style="color:var(--a2);font-weight:600">'+k.device_count+"</span>/"+(k.max_devices===0?"inf":k.max_devices)+"</td><td>"+k.use_count+'</td><td><div class="ac"><button class="bs" data-a="dev" data-k="'+esc(k.key)+'">Dev</button><button class="bs" data-a="edit" data-k="'+esc(k.key)+'">Edit</button><button class="bs" data-a="tog" data-k="'+esc(k.key)+'">'+(k.is_active?"Off":"On")+'</button><button class="bdl" data-a="del" data-k="'+esc(k.key)+'">Del</button></div></td></tr>'}tb.innerHTML=h;bindBtns()}).catch(function(e){console.error("loadK:",e)})}
function bindBtns(){var btns=document.querySelectorAll("[data-a]");for(var i=0;i<btns.length;i++){btns[i].addEventListener("click",function(){var a=this.getAttribute("data-a"),k=this.getAttribute("data-k");if(a==="dev")viewDev(k);else if(a==="edit")editK(k);else if(a==="tog")togK(k);else if(a==="del")delK(k)})}}
function loadH(){fetch("/?action=history").then(function(r){return r.json()}).then(function(d){if(!d.ok)return;HD=d.history;var el=document.getElementById("hL"),em=document.getElementById("eH");if(!d.history||d.history.length===0){el.innerHTML="";em.style.display="block";return}em.style.display="none";var h="";for(var i=0;i<d.history.length;i++){var x=d.history[i];h+='<div class="hi"><div><div style="font-family:monospace;color:var(--a2);font-size:12px">'+esc(x.key)+'</div></div><div style="color:var(--t2);font-size:11px;margin-left:auto">'+x.days+"d | "+x.max_devices+" dev | "+(x.currency||999999999).toLocaleString()+" | "+x.created_human+"</div></div>"}el.innerHTML=h}).catch(function(e){console.error("loadH:",e)})}
function doCreate(){var bk=document.getElementById("cK").value.trim(),dy=parseInt(document.getElementById("kD").value),md=parseInt(document.getElementById("kM").value),cr=parseInt(document.getElementById("kC").value);fetch("/?action=create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({custom_key:bk,days:dy,max_devices:md,currency:cr})}).then(function(r){return r.json()}).then(function(d){if(d.ok){showRct(d);closeM("cM");loadK();S("Key created: "+d.key)}else S(d.error||"Failed","error")}).catch(function(e){console.error(e);S("Network error","error")})}
function showRct(d){lastRct=d;var now=new Date().toLocaleString();var h='<div class="rh"><h3>CheatGPT Key</h3><p>Payment Receipt</p></div>';h+='<div class="rr"><span class="rl">Key</span><span class="rv" style="font-family:monospace;font-size:11px">'+esc(d.key)+"</span></div>";h+='<div class="rr"><span class="rl">Duration</span><span class="rv">'+d.days+" Day(s)</span></div>";h+='<div class="rr"><span class="rl">Max Devices</span><span class="rv">'+(d.max_devices===0?"Unlimited":d.max_devices)+"</span></div>";h+='<div class="rr"><span class="rl">Currency</span><span class="rv">'+(d.currency||999999999).toLocaleString()+"</span></div>";h+='<div class="rr"><span class="rl">Expires</span><span class="rv">'+d.expires_human+"</span></div>";h+='<div class="rr"><span class="rl">Created</span><span class="rv">'+now+"</span></div>";h+='<div class="rf">CheatGPT License Server</div>';document.getElementById("rCt").innerHTML=h;openM("rM")}
function dlRct(){if(!lastRct)return;var c=document.createElement("canvas");c.width=500;c.height=520;var x=c.getContext("2d");var g=x.createLinearGradient(0,0,500,520);g.addColorStop(0,"#0a0a1a");g.addColorStop(1,"#1a1a3e");x.fillStyle=g;x.fillRect(0,0,500,520);x.strokeStyle="#6c5ce7";x.lineWidth=3;x.strokeRect(10,10,480,500);x.setLineDash([8,4]);x.strokeStyle="rgba(108,92,231,.3)";x.beginPath();x.moveTo(30,140);x.lineTo(470,140);x.stroke();x.beginPath();x.moveTo(30,440);x.lineTo(470,440);x.stroke();x.setLineDash([]);x.fillStyle="#a29bfe";x.font="bold 24px system-ui";x.textAlign="center";x.fillText("CheatGPT Key",250,50);x.fillStyle="#888";x.font="12px system-ui";x.fillText("Payment Receipt",250,72);x.fillStyle="#6c5ce7";x.font="bold 14px monospace";x.fillText(lastRct.key,250,110);var rows=[["Duration",lastRct.days+" Day(s)"],["Max Devices",lastRct.max_devices===0?"Unlimited":String(lastRct.max_devices)],["Currency",(lastRct.currency||999999999).toLocaleString()],["Expires",lastRct.expires_human],["Created",new Date().toLocaleString()]];var ry=170;for(var i=0;i<rows.length;i++){x.fillStyle="#888";x.font="13px system-ui";x.textAlign="left";x.fillText(rows[i][0],40,ry);x.fillStyle="#e0e0e0";x.font="bold 13px system-ui";x.textAlign="right";x.fillText(rows[i][1],460,ry);ry+=36}x.fillStyle="#555";x.font="11px system-ui";x.textAlign="center";x.fillText("CheatGPT License Server",250,470);var link=document.createElement("a");link.download="receipt-"+lastRct.key+".png";link.href=c.toDataURL("image/png");link.click();S("Receipt downloaded!")}
function delK(key){if(!confirm("Delete: "+key+"?"))return;fetch("/?action=delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:key})}).then(function(r){return r.json()}).then(function(d){if(d.ok){S("Deleted");loadK()}else S(d.error,"error")})}
function togK(key){fetch("/?action=toggle",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:key})}).then(function(r){return r.json()}).then(function(d){if(d.ok){S(d.is_active?"Activated":"Disabled");loadK()}})}
function editK(key){var k=null;for(var i=0;i<KD.length;i++){if(KD[i].key===key){k=KD[i];break}}if(!k)return;document.getElementById("eKI").value=key;document.getElementById("eD").value=k.days_left||1;document.getElementById("eDV").value=k.max_devices||1;document.getElementById("eC").value=k.currency||999999999;openM("eM")}
function doEdit(){var key=document.getElementById("eKI").value;fetch("/?action=edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:key,days:parseInt(document.getElementById("eD").value),max_devices:parseInt(document.getElementById("eDV").value),currency:parseInt(document.getElementById("eC").value)})}).then(function(r){return r.json()}).then(function(d){if(d.ok){S("Updated");closeM("eM");loadK()}else S(d.error,"error")})}
function viewDev(key){document.getElementById("dKL").textContent="Key: "+key;fetch("/?action=devices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:key})}).then(function(r){return r.json()}).then(function(d){var l=document.getElementById("dL");if(!d.ok||!d.devices||Object.keys(d.devices).length===0){l.innerHTML='<li class="di">No devices registered</li>'}else{var h="";var entries=Object.entries(d.devices);for(var i=0;i<entries.length;i++){var dev=entries[i][1];h+='<li class="di"><div><div style="font-weight:500">'+esc(dev.name||"Unknown")+'</div><div style="color:var(--t2);font-size:11px">First: '+new Date(dev.first_use*1000).toLocaleString()+'</div></div><span style="color:var(--t2);font-size:11px;margin-left:auto">Last: '+new Date(dev.last_use*1000).toLocaleString()+"</span></li>"}l.innerHTML=h}openM("dM")}).catch(function(e){console.error("viewDev:",e)})}
loadK();setInterval(loadK,30000);
</script></body></html>`;

/* ============================================================
   STYLE CSS (served inline)
   ============================================================ */
const styleCSS = `*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0a0a0f;--card:#12121a;--border:#1e1e2e;--accent:#6c5ce7;--a2:#a29bfe;--green:#00b894;--red:#ff6b6b;--text:#e0e0e0;--t2:#888}
@keyframes fade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes up{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
body{font-family:system-ui;background:var(--bg);color:var(--text);min-height:100vh}
.d{max-width:1200px;margin:0 auto;padding:24px}
.hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:12px}
.hdr h1{font-size:24px;background:linear-gradient(135deg,var(--accent),var(--a2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.ha{display:flex;gap:10px;align-items:center}
.st{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:32px}
.sc{background:rgba(18,18,26,.85);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:16px;padding:20px;animation:fade .5s ease;transition:all .3s}
.sc:hover{border-color:var(--accent);transform:translateY(-3px)}
.sc .i{font-size:28px;margin-bottom:8px}
.sc .v{font-size:28px;font-weight:700;margin-bottom:4px}
.sc .l{font-size:13px;color:var(--t2)}
.ks{background:rgba(18,18,26,.85);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:16px;padding:24px;animation:fade .6s ease;margin-bottom:24px}
.kh{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px}
.kh h2{font-size:18px;font-weight:600}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:12px 16px;font-size:12px;color:var(--t2);text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border);font-weight:600}
td{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px;vertical-align:middle}
tr{transition:all .2s}tr:hover{background:rgba(108,92,231,.05)}
.kt{font-family:monospace;font-size:12px;background:rgba(108,92,231,.1);padding:4px 10px;border-radius:6px;color:var(--a2);word-break:break-all}
.bd{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600}
.ba{background:rgba(0,184,148,.15);color:var(--green)}.be{background:rgba(255,107,107,.15);color:var(--red)}.bi{background:rgba(253,203,110,.15);color:#fdcb6e}
.ac{display:flex;gap:6px;flex-wrap:wrap}
.mo{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:1000;padding:20px}
.mo.on{display:flex}
.md{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:32px;width:100%;max-width:500px;animation:up .3s ease}
.md h3{font-size:20px;margin-bottom:20px}
.ma{display:flex;gap:10px;justify-content:flex-end;margin-top:24px}
.bt{padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all .3s ease}
.bp{background:linear-gradient(135deg,var(--accent),#8b5cf6);color:#fff;width:100%}
.bp:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(108,92,231,.35)}
.bs{padding:6px 14px;width:auto;font-size:12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;transition:all .3s}
.bs:hover{border-color:var(--accent);color:var(--a2)}
.bdl{background:linear-gradient(135deg,var(--red),#ee5a24);color:#fff;padding:8px 16px;width:auto;font-size:12px;border-radius:8px;border:none;cursor:pointer}
.fg{margin-bottom:16px}.fg label{display:block;font-size:13px;color:var(--t2);margin-bottom:6px}
.fg input{width:100%;padding:10px 14px;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none}
.fg input:focus{border-color:var(--accent)}
.dl{list-style:none;padding:0}
.di{display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,.03);border-radius:10px;margin-bottom:8px;font-size:13px}
.toast{position:fixed;bottom:24px;right:24px;padding:14px 24px;border-radius:12px;font-size:14px;font-weight:500;z-index:2000;animation:up .3s ease;display:none}
.tss{background:var(--green);color:#fff}.tse{background:var(--red);color:#fff}
.rct{background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid var(--accent);border-radius:16px;padding:32px;max-width:400px;margin:0 auto}
.rct .rh{text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px dashed rgba(108,92,231,.3)}
.rct .rh h3{font-size:20px;color:var(--a2);margin-bottom:4px}.rct .rh p{color:var(--t2);font-size:12px}
.rct .rr{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px}
.rct .rr .rl{color:var(--t2)}.rct .rr .rv{color:var(--text);font-weight:600;text-align:right;max-width:60%;word-break:break-all}
.rct .rf{text-align:center;margin-top:20px;padding-top:16px;border-top:2px dashed rgba(108,92,231,.3);color:var(--t2);font-size:11px}
.tb{display:flex;gap:8px;margin-bottom:24px}
.tbb{padding:10px 20px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--t2);cursor:pointer;font-size:13px;font-weight:500;transition:all .3s}
.tbb.on{background:rgba(108,92,231,.15);border-color:var(--accent);color:var(--a2)}
.hi{padding:12px 16px;background:rgba(255,255,255,.03);border-radius:10px;margin-bottom:8px;display:flex;align-items:center;gap:12px;font-size:13px;animation:fade .3s ease}
.es{text-align:center;padding:48px 20px;color:var(--t2)}
@media(max-width:768px){th,td{padding:8px 10px}.hdr{flex-direction:column;align-items:flex-start}.st{grid-template-columns:1fr 1fr}.md{margin:10px}}
@media(max-width:480px){.st{grid-template-columns:1fr}table{display:block;overflow-x:auto}}`;

/* ============================================================
   MAIN HANDLER
   ============================================================ */
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

  // Serve payload files
  if (url.pathname.startsWith('/payload/')) {
    const fileName = url.pathname.replace('/payload/', '');
    const filePath = path.join(__dirname, '..', 'public', 'payload', fileName);
    if (fileName && fs.existsSync(filePath)) {
      const ext = path.extname(fileName).toLowerCase();
      const types = { '.xz': 'application/x-xz', '.gz': 'application/gzip', '.so': 'application/octet-stream', '.zip': 'application/zip' };
      res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
      return res.status(200).send(fs.readFileSync(filePath));
    }
    res.setHeader('Content-Type', 'application/json');
    return res.status(404).json({ error: 'Payload not found' });
  }

  // Auth API (/v1) - binary calls this
  if (url.pathname === '/v1' || url.pathname.startsWith('/v1/')) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET') return res.status(200).send('OK');

    const bufs = [];
    for await (const c of req) bufs.push(c);
    const body = Buffer.concat(bufs).toString();
    let params = {};
    try { params = JSON.parse(body); } catch(e) {
      const usp = new URLSearchParams(body);
      for (const [k, v] of usp) params[k] = v;
    }

    const p_key = params.p_key || params.key || '';
    const p_hdi = params.p_hdi || '';

    if (!p_key) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({ message: 'Invalid parameters', error: 'Not Found', statusCode: 404 });
    }

    const db = loadDB();
    const kd = db.keys[p_key];

    if (!kd) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({ message: 'Key is not exist', error: 'Not Found', statusCode: 404 });
    }

    if (kd.expires_at == null || isNaN(kd.expires_at)) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({ ok: false, status: 'failed', reason: 'invalid_key_data', message: 'Key data is corrupted', error: 'Bad Request', statusCode: 400 });
    }

    const now = Math.floor(Date.now() / 1000);

    if (!kd.is_active) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({ ok: false, status: 'failed', reason: 'key_disabled', message: 'Key has been disabled', error: 'Forbidden', statusCode: 403 });
    }

    if (now > kd.expires_at) {
      kd.is_active = false;
      saveDB(db);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({ ok: false, status: 'failed', reason: 'key_expired', message: 'Key has expired',      expired_at: (kd.expires_at != null && !isNaN(kd.expires_at)) ? new Date(kd.expires_at * 1000).toISOString().replace('T', ' ').slice(0, 19) : 'Invalid', error: 'Gone', statusCode: 410 });
    }

    // Device check
    const deviceId = crypto.createHash('md5').update(`${p_hdi}|${params.device_name || ''}|${params.serial || ''}`).digest('hex');
    const deviceName = params.device_name || params.device || 'Unknown Device';
    const maxDev = kd.max_devices || 1;
    if (!kd.devices) kd.devices = {};

    if (!kd.devices[deviceId]) {
      const count = Object.keys(kd.devices).length;
      if (maxDev > 0 && count >= maxDev) {
        const locked = Object.values(kd.devices)[0];
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(200).json({ ok: false, status: 'failed', reason: 'device_limit_exceeded', message: 'Device limit reached', locked_to: (locked && locked.name) || 'Unknown', error: 'Forbidden', statusCode: 403 });
      }
      kd.devices[deviceId] = { name: deviceName, first_use: now, last_use: now };
    } else {
      kd.devices[deviceId].last_use = now;
    }

    kd.last_use = now;
    kd.use_count = (kd.use_count || 0) + 1;
    saveDB(db);

    const exp = (kd.expires_at != null && !isNaN(kd.expires_at)) ? new Date(kd.expires_at * 1000).toISOString().replace('T', ' ').slice(0, 19) : 'Invalid';
    const PAYLOAD_URL = 'https://payfury-gpt.vercel.app/payload/libBEZO.so.xz';
    const PACKAGE = 'com.dts.freefiremax';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(PAYLOAD_URL + '\u00D7' + exp + '\u00D7' + PACKAGE);
  }

  // Serve CSS
  if (url.pathname === '/style.css') {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    return res.status(200).send(styleCSS);
  }

  // Login
  if (req.method === 'POST' && dp === 'login') {
    const b = await readBody(req);
    if (b.username === 'pay' && b.password === 'imudbanget') {
      res.setHeader('Set-Cookie', 'cgp=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400');
      return res.redirect(302, '/');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(loginHTML(1));
  }

  // Logout
  if (dp === 'logout') {
    res.setHeader('Set-Cookie', 'cgp=; Path=/; HttpOnly; Max-Age=0');
    return res.redirect(302, '/');
  }

  // API actions
  if (act) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!logged) return res.status(401).json({ ok: false, error: 'Not logged in' });

    const db = loadDB();

    if (act === 'list') {
      const keys = Object.entries(db.keys).map(([k, v]) => ({
        key: k, is_active: v.is_active, expires_at: v.expires_at,
        expires_human: (v.expires_at != null && !isNaN(v.expires_at)) ? new Date(v.expires_at * 1000).toISOString().replace('T', ' ').slice(0, 19) : 'Invalid',
        max_devices: v.max_devices || 1, device_count: Object.keys(v.devices || {}).length,
        use_count: v.use_count || 0, currency: v.currency || 999999999,
        days_left: (v.expires_at != null && !isNaN(v.expires_at)) ? Math.max(0, Math.floor((v.expires_at - Date.now() / 1000) / 86400)) : 0
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
      db.history.push({ key, days, max_devices: md, currency: cr, created_at: now, created_human: (now != null && !isNaN(now)) ? new Date(now * 1000).toISOString().replace('T', ' ').slice(0, 19) : 'Invalid' });
      saveDB(db);
      const expTs = (now != null && !isNaN(now) && days != null && !isNaN(days)) ? now + days * 86400 : null;      return res.json({ ok: true, key, days, max_devices: md, currency: cr, expires_human: expTs != null ? new Date(expTs * 1000).toISOString().replace('T', ' ').slice(0, 19) : 'Invalid' });
    }
    if (act === 'delete') { const b = await readBody(req); if (db.keys[b.key]) { delete db.keys[b.key]; saveDB(db); return res.json({ ok: true }); } return res.json({ ok: false, error: 'Key not found' }); }
    if (act === 'toggle') { const b = await readBody(req); if (db.keys[b.key]) { db.keys[b.key].is_active = !db.keys[b.key].is_active; saveDB(db); return res.json({ ok: true, is_active: db.keys[b.key].is_active }); } return res.json({ ok: false, error: 'Key not found' }); }
    if (act === 'edit') {
      const b = await readBody(req);
      if (db.keys[b.key]) {
        if (b.days) db.keys[b.key].expires_at = Math.floor(Date.now() / 1000) + Math.max(1, parseInt(b.days)) * 86400;
        if (b.max_devices !== undefined) db.keys[b.key].max_devices = Math.max(0, parseInt(b.max_devices));
        if (b.currency) db.keys[b.key].currency = parseInt(b.currency);
        saveDB(db); return res.json({ ok: true });
      }
      return res.json({ ok: false, error: 'Key not found' });
    }
    if (act === 'devices') { const b = await readBody(req); if (db.keys[b.key]) return res.json({ ok: true, devices: db.keys[b.key].devices || {} }); return res.json({ ok: false, error: 'Key not found' }); }
    return res.json({ ok: false, error: 'Unknown action' });
  }

  // No action, no login → login page
  if (!logged) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(loginHTML(0));
  }

  // Logged in, no action → dashboard
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(dashHTML());
};
