const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/* ── Multer setup — store in server/uploads, limit 20MB per file, max 10 files ── */
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_EXTS = new Set(['.pdf', '.txt', '.csv', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.docx']);

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_TYPES.has(file.mimetype) || ALLOWED_EXTS.has(ext)) return cb(null, true);
    cb(new Error(`File type not allowed: ${file.mimetype} / ${ext}`));
  },
});

/* ── PDF text extraction ── */
let pdfParse;
try { pdfParse = require('pdf-parse'); } catch { pdfParse = null; }
let mammoth;
try { mammoth = require('mammoth'); } catch { mammoth = null; }

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function extractText(filePath, mime) {
  // PDF
  if (mime === 'application/pdf' && pdfParse) {
    const buf = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    return (data.text || '').trim();
  }
  // DOCX — use mammoth for proper extraction
  if ((mime === DOCX_MIME || filePath.endsWith('.docx')) && mammoth) {
    const result = await mammoth.extractRawText({ path: filePath });
    return (result.value || '').trim();
  }
  // Plain text / CSV
  if (mime.startsWith('text/') || mime === 'text/csv') {
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  return null; // images handled separately via vision
}

/* ── Gemini AI visit parser (free tier) ── */
const SYSTEM_PROMPT = `You are a medical document parser. Given text or images from doctor visit records (MyChart PDFs, discharge summaries, lab results, clinical notes, etc.), extract ALL medical visits found and return a JSON array.

Each visit object must have this exact shape:
{
  "date": "YYYY-MM-DD",
  "visit_type": "er" | "doctor" | "specialist" | "urgent_care" | "telehealth",
  "facility": "string or null",
  "provider": "string or null",
  "specialty": "string or null",
  "chief_complaint": "string or null",
  "diagnoses": ["array of diagnosis strings"],
  "vitals": {"BP": "...", "HR": "...", "Resp": "...", "SpO2": "...", "Temp": "...", "Weight": "..."} or null,
  "labs": [{"name": "...", "value": "...", "range": "...", "flag": "LOW"|"HIGH"|"CRITICAL"|""}] or null,
  "ecgs": [{"time": "...", "rate": number, "interpretation": "...", "critical": boolean}] or null,
  "medications": ["med strings"] or null,
  "notes": "clinical narrative string or null",
  "disposition": "string or null",
  "follow_up": "string or null"
}

Rules:
- If a document contains multiple visits, return each as a separate object.
- If it's just lab results without a clear visit, still create a visit entry with the date and labs.
- Use the most specific visit_type you can determine from context.
- For labs, always include name, value, reference range, and flag (LOW/HIGH/CRITICAL or empty string for normal).
- For vitals, only include those actually mentioned.
- Keep notes concise but include key clinical details.
- If you can't determine a date, use "unknown" and the user will fix it.
- Return ONLY the JSON array, no markdown fencing, no explanation.`;

async function parseWithAI(texts, imageFiles) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const parts = [];

  // System instruction as first text part
  parts.push({ text: SYSTEM_PROMPT });

  // Add text content
  for (const { filename, text } of texts) {
    parts.push({ text: `--- Document: ${filename} ---\n${text}` });
  }

  // Add images via inline_data
  for (const img of imageFiles) {
    const buf = fs.readFileSync(img.path);
    const base64 = buf.toString('base64');
    const mimeType = img.mimetype.startsWith('image/') ? img.mimetype : 'image/png';
    parts.push({ inline_data: { mime_type: mimeType, data: base64 } });
    parts.push({ text: `(Image: ${img.originalname})` });
  }

  if (parts.length <= 1) throw new Error('No processable content found in uploaded files');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts }],
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
    },
  };

  /* Retry with backoff for 429 rate limits (common with new API keys) */
  let resp;
  for (let attempt = 0; attempt < 3; attempt++) {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.status !== 429) break;
    const wait = (attempt + 1) * 10000; /* 10s, 20s, 30s */
    console.log(`Gemini 429 rate limited, retrying in ${wait / 1000}s (attempt ${attempt + 1}/3)`);
    await new Promise(r => setTimeout(r, wait));
  }

  if (!resp.ok) {
    const errBody = await resp.text();
    if (resp.status === 429) {
      throw new Error('AI rate limited — wait a minute and try again.');
    }
    throw new Error(`Gemini API error ${resp.status}: ${errBody.slice(0, 200)}`);
  }

  const json = await resp.json();
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  // Strip markdown fencing if present
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

// GET /api/medical-visits — list all visits for user
router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await db('medical_visits')
      .where({ user_id: req.user.id })
      .orderBy('date', 'desc');
    res.json({ data: rows });
  } catch (err) {
    console.error('medical-visits GET error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/medical-visits — create a new visit
router.post('/', authenticate, async (req, res) => {
  try {
    const { date, visit_type, facility, provider, specialty, chief_complaint, diagnoses_json, vitals_json, labs_json, ecgs_json, notes, disposition, follow_up, medications_json } = req.body;
    if (!date || !visit_type) return res.status(400).json({ error: 'date and visit_type required' });
    const toJson = v => typeof v === 'string' ? v : JSON.stringify(v || null);
    const [id] = await db('medical_visits').insert({
      user_id: req.user.id,
      date,
      visit_type,
      facility: facility || null,
      provider: provider || null,
      specialty: specialty || null,
      chief_complaint: chief_complaint || null,
      diagnoses_json: toJson(diagnoses_json),
      vitals_json: toJson(vitals_json),
      labs_json: toJson(labs_json),
      ecgs_json: toJson(ecgs_json),
      notes: notes || null,
      disposition: disposition || null,
      follow_up: follow_up || null,
      medications_json: toJson(medications_json),
      created_at: new Date().toISOString(),
    });
    res.json({ id });
  } catch (err) {
    console.error('medical-visits POST error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/medical-visits/:id — update a visit
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { date, visit_type, facility, provider, specialty, chief_complaint, diagnoses_json, vitals_json, labs_json, ecgs_json, notes, disposition, follow_up, medications_json } = req.body;
    const toJson = v => typeof v === 'string' ? v : JSON.stringify(v || null);
    await db('medical_visits').where({ id: req.params.id, user_id: req.user.id }).update({
      date, visit_type,
      facility: facility || null,
      provider: provider || null,
      specialty: specialty || null,
      chief_complaint: chief_complaint || null,
      diagnoses_json: toJson(diagnoses_json),
      vitals_json: toJson(vitals_json),
      labs_json: toJson(labs_json),
      ecgs_json: toJson(ecgs_json),
      notes: notes || null,
      disposition: disposition || null,
      follow_up: follow_up || null,
      medications_json: toJson(medications_json),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('medical-visits PUT error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/medical-visits/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await db('medical_visits').where({ id: req.params.id, user_id: req.user.id }).del();
    res.json({ ok: true });
  } catch (err) {
    console.error('medical-visits DELETE error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// Public: GET /api/medical-visits/shared/:shareToken
router.get('/shared/:shareToken', async (req, res) => {
  try {
    const profile = await db('user_profiles').where({ share_token: req.params.shareToken }).first();
    if (!profile) return res.status(404).json({ error: 'not found' });
    const rows = await db('medical_visits')
      .where({ user_id: profile.user_id })
      .orderBy('date', 'desc');
    res.json({ data: rows });
  } catch (err) {
    console.error('medical-visits shared GET error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/medical-visits/upload — upload files, AI parse into visits
router.post('/upload', authenticate, upload.array('files', 10), async (req, res) => {
  const uploadedPaths = [];
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Track files for cleanup
    for (const f of req.files) uploadedPaths.push(f.path);

    // Separate text-extractable files from images
    const texts = [];
    const images = [];
    for (const file of req.files) {
      const mime = file.mimetype || '';
      if (mime.startsWith('image/')) {
        images.push(file);
      } else {
        const text = await extractText(file.path, mime);
        if (text && text.trim().length > 0) {
          texts.push({ filename: file.originalname, text: text.slice(0, 50000) }); // limit per doc
        } else {
          // If text extraction fails, try as image (e.g. scanned PDFs)
          images.push(file);
        }
      }
    }

    if (texts.length === 0 && images.length === 0) {
      return res.status(400).json({ error: 'Could not extract any content from uploaded files' });
    }

    const visits = await parseWithAI(texts, images);

    if (!Array.isArray(visits) || visits.length === 0) {
      return res.json({ visits: [], message: 'AI could not identify any visits in the uploaded documents.' });
    }

    // Normalize and sanitize each parsed visit
    const sanitized = visits.map(v => ({
      date: String(v.date || 'unknown'),
      visit_type: ['er', 'doctor', 'specialist', 'urgent_care', 'telehealth'].includes(v.visit_type) ? v.visit_type : 'doctor',
      facility: v.facility || null,
      provider: v.provider || null,
      specialty: v.specialty || null,
      chief_complaint: v.chief_complaint || null,
      diagnoses: Array.isArray(v.diagnoses) ? v.diagnoses : [],
      vitals: v.vitals && typeof v.vitals === 'object' ? v.vitals : null,
      labs: Array.isArray(v.labs) ? v.labs.map(l => ({
        name: String(l.name || ''),
        value: String(l.value ?? ''),
        range: String(l.range || ''),
        flag: ['LOW', 'HIGH', 'CRITICAL'].includes(String(l.flag || '').toUpperCase()) ? String(l.flag).toUpperCase() : '',
      })) : null,
      ecgs: Array.isArray(v.ecgs) ? v.ecgs : null,
      medications: Array.isArray(v.medications) ? v.medications : null,
      notes: v.notes || null,
      disposition: v.disposition || null,
      follow_up: v.follow_up || null,
    }));

    res.json({ visits: sanitized, fileCount: req.files.length });
  } catch (err) {
    console.error('medical-visits upload/parse error:', err);
    const msg = err.message || 'server error';
    if (msg.includes('GEMINI_API_KEY')) {
      return res.status(500).json({ error: 'AI service not configured. Set GEMINI_API_KEY on the server.' });
    }
    res.status(500).json({ error: `AI parsing failed: ${msg}` });
  } finally {
    // Clean up uploaded files
    for (const p of uploadedPaths) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
  }
});

module.exports = router;
