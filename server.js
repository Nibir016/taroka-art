require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');
const cors       = require('cors');
const path       = require('path');

const app = express();

// ── ENV VALIDATION (catches Railway mismatches instantly) ────
const REQUIRED_VARS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'MONGO_URI',
];

const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length) {
  console.error('❌  Missing environment variables:', missing.join(', '));
  console.error('    Check your Railway Variables tab — names must match exactly.');
  process.exit(1);
}

console.log('✅  All env vars found:', REQUIRED_VARS.join(', '));

// ── CLOUDINARY ───────────────────────────────────────────────
cloudinary.config({
  cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
  api_key    : process.env.CLOUDINARY_API_KEY,
  api_secret : process.env.CLOUDINARY_API_SECRET,
});

// ── MONGODB ──────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅  MongoDB connected'))
  .catch(err => { console.error('❌  MongoDB error:', err.message); process.exit(1); });

const entrySchema = new mongoose.Schema({
  name              : { type: String, required: true, trim: true },
  email             : { type: String, required: true, lowercase: true, trim: true },
  phone             : { type: String, required: true },
  age               : { type: String, required: true },
  artworkTitle      : { type: String, required: true, trim: true },
  artworkUrl        : { type: String, required: true },
  cloudinaryPublicId: { type: String },
  submittedAt       : { type: Date, default: Date.now },
});

const Entry = mongoose.model('Entry', entrySchema);

// ── MULTER (memory storage → stream to Cloudinary) ───────────
const upload = multer({
  storage   : multer.memoryStorage(),
  limits    : { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG and PNG files are allowed'));
  },
});

// ── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── ROUTES ───────────────────────────────────────────────────

// POST /api/submit
app.post('/api/submit', upload.single('artwork'), async (req, res) => {
  try {
    const { name, email, phone, age, artworkTitle } = req.body;

    if (!name || !email || !phone || !age || !artworkTitle) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Artwork file is required.' });
    }

    // Duplicate check
    const existing = await Entry.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'An entry with this email already exists.' });
    }

    // Upload to Cloudinary
    const cloudResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder        : 'taroka-bohag-bihu-2025',
          resource_type : 'image',
          transformation: [{ width: 2000, crop: 'limit' }],
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    // Save to MongoDB
    const entry = await Entry.create({
      name,
      email,
      phone,
      age,
      artworkTitle,
      artworkUrl        : cloudResult.secure_url,
      cloudinaryPublicId: cloudResult.public_id,
    });

    console.log(`✅  New entry: ${entry._id} — ${name} — ${cloudResult.secure_url}`);

    res.status(201).json({
      success   : true,
      message   : 'Entry submitted successfully! 🎉',
      entryId   : entry._id,
      artworkUrl: cloudResult.secure_url,
    });

  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
  }
});

// GET /api/entries  (admin)
app.get('/api/entries', async (_req, res) => {
  try {
    const entries = await Entry.find().sort({ submittedAt: -1 }).select('-__v');
    res.json({ count: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/entries/:id  (admin)
app.get('/api/entries/:id', async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id).select('-__v');
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback → serve index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀  Taroka server running → http://localhost:${PORT}`)
);
