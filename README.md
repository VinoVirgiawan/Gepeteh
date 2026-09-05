# 🔧 CheatGPT Patched Server (Vercel + Node.js)

## 📁 Structure

```
patched_gpt/
├── api/
│   ├── auth.js        ← Auth API (binary calls this)
│   └── admin.js       ← Admin Panel (browser)
├── public/
│   └── payload/
│       └── libBEZO.so.xz  ← Payload file (replace with real)
├── vercel.json
├── package.json
└── README.md
```

---

## 🚀 Deploy to Vercel

```bash
npm i -g vercel
vercel login
cd patched_gpt
vercel
vercel --prod
```

---

## 🔑 Auth API

**Endpoint:** `POST /api/auth`

**Request:**
```json
{"p_hdi": "device-id", "p_key": "CHEATGPT-PAYFURY-1DAY-SIHXSJXS8"}
```

**Response (Valid):** Raw string
```
/payload/libBEZO.so.xz×2026-12-31 23:59:59×com.dts.freefiremax
```

**Response (Expired):** JSON
```json
{"ok":false,"status":"failed","reason":"key_expired","statusCode":410}
```

**Response (Device Limit):** JSON
```json
{"ok":false,"status":"failed","reason":"device_limit_exceeded","locked_to":"device name","statusCode":403}
```

---

## 🖥️ Admin Panel

**URL:** `https://your-project.vercel.app/api/admin`

**Login:** `pay` / `imudbanget`

### Features
- 📊 Dashboard stats (total/active keys, devices, uses)
- ➕ Create keys (custom or auto `CHEATGPT-PAYFURY-{DAYS}DAY-{RANDOM8}`)
- 📅 Set expiry days
- 📱 Max devices (1 = lock to first device)
- 💰 Currency (default: 999,999,999)
- ✏️ Edit / ⏸ Disable / 🗑 Delete keys
- 📱 View registered devices per key
- 📋 **Receipt** after key creation
- 📥 **Download receipt as PNG image**
- 📜 **Key creation history** (riwayat)
- 🎨 Dark UI, smooth animations, responsive

---

## 🔑 Key Format

**Auto-generated:** `CHEATGPT-PAYFURY-{DAYS}DAY-{RANDOM8}`
**Example:** `CHEATGPT-PAYFURY-1DAY-SIHXSJXS8`

---

## ⚠️ Notes

1. Data in `/tmp` (ephemeral) — use Vercel KV for production
2. Replace `public/payload/libBEZO.so.xz` with real payload
3. Default currency: 999,999,999
4. Device limit 1 = first device auto-locks the key
