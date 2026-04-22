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

// ─────────────────────────────────────────────
// 1. ENV VALIDATION
// ─────────────────────────────────────────────
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
  console.error('❌  Missing env vars:', missing.join(', '));
  process.exit(1);
}
console.log('✅  All env vars found');

// Artwork upload deadline — change this in Railway vars if needed
// Format: any string that JavaScript's Date() can parse
const DEADLINE = new Date(process.env.SUBMISSION_DEADLINE || '2026-05-14T23:59:59+05:30');

// ─────────────────────────────────────────────
// 2. RAZORPAY
// ─────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id    : process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ─────────────────────────────────────────────
// 3. CLOUDINARY
// ─────────────────────────────────────────────
cloudinary.config({
  cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
  api_key    : process.env.CLOUDINARY_API_KEY,
  api_secret : process.env.CLOUDINARY_API_SECRET,
});

// ─────────────────────────────────────────────
// 4. MONGODB — UPDATED SCHEMA
// ─────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅  MongoDB connected'))
  .catch(err => { console.error('❌  MongoDB error:', err.message); process.exit(1); });

const entrySchema = new mongoose.Schema({
  // --- Step 1: Collected at registration / payment ---
  name               : { type: String, required: true, trim: true },
  email              : { type: String, required: true, lowercase: true, trim: true },
  phone              : { type: String, required: true },
  age                : { type: String, required: true },

  // --- Payment fields ---
  razorpayOrderId    : { type: String, required: true },
  razorpayPaymentId  : { type: String, required: true },
  paymentStatus      : { type: String, default: 'pending' },  // 'pending' | 'paid'

  // --- Step 2: Filled when artwork is uploaded ---
  artworkTitle       : { type: String, trim: true, default: '' },
  artworkUrl         : { type: String, default: '' },
  cloudinaryPublicId : { type: String, default: '' },
  hasSubmittedArtwork: { type: Boolean, default: false },

  registeredAt       : { type: Date, default: Date.now },
  artworkSubmittedAt : { type: Date },
});

const Entry = mongoose.model('Entry', entrySchema);

// ─────────────────────────────────────────────
// 5. MULTER — memory storage for Cloudinary
// ─────────────────────────────────────────────
const upload = multer({
  storage   : multer.memoryStorage(),
  limits    : { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG and PNG files are allowed'));
  },
});

// ─────────────────────────────────────────────
// 6. MIDDLEWARE
// ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// 7. ROUTES
// ─────────────────────────────────────────────

// ── 7a. Create Razorpay order ─────────────────
// Called before opening the payment modal.
// Checks for duplicate email upfront.
app.post('/api/create-order', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const existing = await Entry.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: 'An entry with this email already exists.' });
    }

    const order = await razorpay.orders.create({
      amount  : 9900,          // ₹99 in paise
      currency: 'INR',
      receipt : `taroka_${Date.now()}`,
      notes   : { competition: 'Taroka Bohag Bihu 2026' },
    });

    console.log(`📦  Order created: ${order.id}`);

    res.json({
      orderId : order.id,
      amount  : order.amount,
      currency: order.currency,
      keyId   : process.env.RAZORPAY_KEY_ID,
    });

  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Could not initiate payment. Please try again.' });
  }
});


// ── 7b. Register after payment ────────────────
// NEW ROUTE — saves user + payment details.
// Does NOT require artwork at this point.
app.post('/api/register', async (req, res) => {
  try {
    const {
      name, email, phone, age,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // Basic field validation
    if (!name || !email || !phone || !age) {
      return res.status(400).json({ error: 'All fields (name, email, phone, age) are required.' });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Payment details missing.' });
    }

    // Verify Razorpay signature — proves payment is genuine
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      console.warn(`⚠️  Signature mismatch for order ${razorpay_order_id}`);
      return res.status(400).json({ error: 'Payment verification failed. Contact support.' });
    }

    console.log(`✅  Payment verified: ${razorpay_payment_id}`);

    // Duplicate check (safety net)
    const existing = await Entry.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: 'An entry with this email already exists.' });
    }

    // Save registration — no artwork yet
    const entry = await Entry.create({
      name,
      email,
      phone,
      age,
      razorpayOrderId  : razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      paymentStatus    : 'paid',
    });

    console.log(`🎉  Registered: ${entry._id} — ${name}`);

    res.status(201).json({
      success : true,
      message : 'Registration successful! You can now upload your artwork.',
      entryId : entry._id,
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
});


// ── 7c. Verify user before artwork upload ─────
// NEW ROUTE — checks if user can upload artwork.
// Frontend calls this when user returns to upload later.
app.post('/api/verify-user', async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email || !phone) {
      return res.status(400).json({ error: 'Email and phone are required.' });
    }

    const entry = await Entry.findOne({ email: email.toLowerCase().trim() });

    // User not found
    if (!entry) {
      return res.status(404).json({ error: 'No registration found with this email. Please register first.' });
    }

    // Phone mismatch — simple security check
    if (entry.phone !== phone.trim()) {
      return res.status(403).json({ error: 'Phone number does not match our records.' });
    }

    // Payment not complete
    if (entry.paymentStatus !== 'paid') {
      return res.status(403).json({ error: 'Payment not completed. Please contact support.' });
    }

    // Artwork already submitted
    if (entry.hasSubmittedArtwork) {
      return res.status(409).json({ error: 'You have already submitted your artwork.' });
    }

    // Deadline check
    if (new Date() > DEADLINE) {
      return res.status(403).json({ error: 'The artwork submission deadline has passed.' });
    }

    // All good — allow upload
    res.json({
      success : true,
      message : `Welcome back, ${entry.name}! You can now upload your artwork.`,
      name    : entry.name,
    });

  } catch (err) {
    console.error('Verify user error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});


// ── 7d. Upload artwork ────────────────────────
// NEW ROUTE — multer + Cloudinary upload.
// Requires email, phone, artworkTitle, and the file.
app.post('/api/upload-artwork', upload.single('artwork'), async (req, res) => {
  try {
    const { email, phone, artworkTitle } = req.body;

    // Field validation
    if (!email || !phone || !artworkTitle) {
      return res.status(400).json({ error: 'Email, phone, and artwork title are required.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Artwork file is required.' });
    }

    // Deadline check
    if (new Date() > DEADLINE) {
      return res.status(403).json({ error: 'The artwork submission deadline has passed.' });
    }

    // Find and validate the entry
    const entry = await Entry.findOne({ email: email.toLowerCase().trim() });

    if (!entry) {
      return res.status(404).json({ error: 'No registration found with this email.' });
    }
    if (entry.phone !== phone.trim()) {
      return res.status(403).json({ error: 'Phone number does not match our records.' });
    }
    if (entry.paymentStatus !== 'paid') {
      return res.status(403).json({ error: 'Payment not completed.' });
    }
    if (entry.hasSubmittedArtwork) {
      return res.status(409).json({ error: 'Artwork already submitted for this account.' });
    }

    // Upload to Cloudinary
    const cloudResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder        : 'taroka-bohag-bihu-2026',
          resource_type : 'image',
          transformation: [{ width: 2000, crop: 'limit' }],
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    // Update entry in MongoDB
    entry.artworkTitle        = artworkTitle.trim();
    entry.artworkUrl          = cloudResult.secure_url;
    entry.cloudinaryPublicId  = cloudResult.public_id;
    entry.hasSubmittedArtwork = true;
    entry.artworkSubmittedAt  = new Date();
    await entry.save();

    console.log(`🎨  Artwork uploaded: ${entry._id} — ${entry.name} — ${cloudResult.secure_url}`);

    res.status(200).json({
      success   : true,
      message   : 'Artwork submitted successfully! 🎉 Good luck!',
      artworkUrl: cloudResult.secure_url,
    });

  } catch (err) {
    console.error('Upload artwork error:', err);
    res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
  }
});


// ── 7e. Admin routes (unchanged) ─────────────
app.get('/api/entries', async (_req, res) => {
  try {
    const entries = await Entry.find().sort({ registeredAt: -1 }).select('-__v');
    res.json({ count: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/entries/:id', async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id).select('-__v');
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback → serve frontend
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────────
// 8. START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀  Taroka server running → http://localhost:${PORT}`)
);
