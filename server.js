require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');
const cors       = require('cors');
const path       = require('path');
const Razorpay   = require('razorpay');
const crypto     = require('crypto');

const app = express();

// ── ENV VALIDATION ───────────────────────────────────────────
const REQUIRED_VARS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'MONGO_URI',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
];

const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length) {
  console.error('❌  Missing environment variables:', missing.join(', '));
  console.error('    Check your Railway Variables tab — names must match exactly.');
  process.exit(1);
}

console.log('✅  All env vars found');

// ── RAZORPAY ─────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id    : process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
  name               : { type: String, required: true, trim: true },
  email              : { type: String, required: true, lowercase: true, trim: true },
  phone              : { type: String, required: true },
  age                : { type: String, required: true },
  artworkTitle       : { type: String, required: true, trim: true },
  artworkUrl         : { type: String, required: true },
  cloudinaryPublicId : { type: String },
  razorpayOrderId    : { type: String, required: true },
  razorpayPaymentId  : { type: String, required: true },
  paymentVerified    : { type: Boolean, default: false },
  submittedAt        : { type: Date, default: Date.now },
});

const Entry = mongoose.model('Entry', entrySchema);

// ── MULTER ───────────────────────────────────────────────────
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

/**
 * POST /api/create-order
 * Called before the Razorpay modal opens.
 * Creates a Razorpay order for ₹99 and returns the order_id to the frontend.
 */
app.post('/api/create-order', async (req, res) => {
  try {
    const { email } = req.body;

    // Prevent duplicate entries before even charging
    if (email) {
      const existing = await Entry.findOne({ email: email.toLowerCase().trim() });
      if (existing) {
        return res.status(409).json({ error: 'An entry with this email already exists.' });
      }
    }

    const order = await razorpay.orders.create({
      amount  : 9900,        // ₹99 in paise
      currency: 'INR',
      receipt : `taroka_${Date.now()}`,
      notes   : { competition: 'Taroka Bohag Bihu 2025' },
    });

    console.log(`📦  Razorpay order created: ${order.id}`);

    res.json({
      orderId : order.id,
      amount  : order.amount,
      currency: order.currency,
      keyId   : process.env.RAZORPAY_KEY_ID,  // safe to expose — it's the public key
    });

  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Could not initiate payment. Please try again.' });
  }
});

/**
 * POST /api/submit
 * Called AFTER successful Razorpay payment.
 * 1. Verifies Razorpay signature (proves payment is genuine)
 * 2. Uploads artwork to Cloudinary
 * 3. Saves entry to MongoDB
 */
app.post('/api/submit', upload.single('artwork'), async (req, res) => {
  try {
    const {
      name, email, phone, age, artworkTitle,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // ── 1. Validate fields ──
    if (!name || !email || !phone || !age || !artworkTitle) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Artwork file is required.' });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Payment details missing. Please complete payment first.' });
    }

    // ── 2. Verify Razorpay signature ──
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.warn(`⚠️  Signature mismatch for order ${razorpay_order_id}`);
      return res.status(400).json({ error: 'Payment verification failed. Please contact support.' });
    }

    console.log(`✅  Payment verified: ${razorpay_payment_id}`);

    // ── 3. Duplicate check (belt + suspenders) ──
    const existing = await Entry.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: 'An entry with this email already exists.' });
    }

    // ── 4. Upload artwork to Cloudinary ──
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

    // ── 5. Save to MongoDB ──
    const entry = await Entry.create({
      name,
      email,
      phone,
      age,
      artworkTitle,
      artworkUrl        : cloudResult.secure_url,
      cloudinaryPublicId: cloudResult.public_id,
      razorpayOrderId   : razorpay_order_id,
      razorpayPaymentId : razorpay_payment_id,
      paymentVerified   : true,
    });

    console.log(`🎉  Entry saved: ${entry._id} — ${name} — ₹99 paid`);

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