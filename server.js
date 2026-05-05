require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const dns = require('dns');

const app = express();

// ─────────────────────────────────────────────
// 1. ENV VALIDATION
// ─────────────────────────────────────────────
const REQUIRED_VARS = [
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
  'MONGO_URI', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
];
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length) {
  console.error('❌  Missing env vars:', missing.join(', '));
  console.error('💡  Create a .env file in the project root. See .env.example for the template.');
  process.exit(1);
}
console.log('✅  All env vars found');

// ─────────────────────────────────────────────
// PHONE NORMALIZER
// ─────────────────────────────────────────────
function normalizePhone(raw = '') {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

// ─────────────────────────────────────────────
// 2. RAZORPAY  (lazy-initialized singleton)
// ─────────────────────────────────────────────
let _razorpay = null;
function getRazorpay() {
  if (!_razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials are not configured.');
    }
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
}

// ─────────────────────────────────────────────
// 3. CLOUDINARY
// ─────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─────────────────────────────────────────────
// 4. MONGODB — ROBUST CONNECTION WITH RETRY
// ─────────────────────────────────────────────
const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  retryWrites: true,
  retryReads: true,
};
const MAX_RETRIES = 5;

async function connectMongo(attempt = 1) {
  let uri = process.env.MONGO_URI;
  if (uri && !uri.includes('mongodb.net/')) {
    uri = uri.replace('mongodb.net', 'mongodb.net/taroka');
  } else if (uri && uri.endsWith('mongodb.net/')) {
    uri += 'taroka';
  }
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
    console.log('🔧  Using public DNS servers for MongoDB SRV resolution');
    await mongoose.connect(uri, MONGO_OPTIONS);
    console.log('✅  MongoDB connected');
    try {
      await mongoose.connection.collection('entries').dropIndex('competitionId_1_email_1');
      console.log('✅  Dropped old email index');
    } catch (e) { }
  } catch (err) {
    console.error(`❌  MongoDB attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
    if (err.message.includes('querySrv') || err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
      console.error('💡  DNS SRV lookup failed. Try a different network or VPN.');
    }
    if (attempt < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
      console.log(`⏳  Retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
      return connectMongo(attempt + 1);
    }
    console.error('❌  All MongoDB connection attempts failed. Exiting.');
    process.exit(1);
  }
}

// ─────────────────────────────────────────────
// 5. SCHEMAS
// ─────────────────────────────────────────────

// ── Competition Schema ──
const competitionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  type: { type: String, default: 'art', enum: ['art', 'photography', 'writing', 'quiz', 'dance', 'music', 'song', 'modeling', 'craft', 'cooking', 'general'] },
  description: { type: String, default: '' },
  shortDescription: { type: String, default: '', maxlength: 200 },

  // Visual
  coverImage: { type: String, default: '' },
  coverImagePublicId: { type: String, default: '' },

  // Config
  hasJudges: { type: Boolean, default: false },
  entryFee: { type: Number, default: 0 },       // in paise (9900 = ₹99)
  allowGroupRegistration: { type: Boolean, default: false },
  groupEntryFee: { type: Number, default: 0 },  // fee for group registration
  maxGroupMembers: { type: Number, default: 5 }, // max allowed members in a group
  groupPrizeAmount: { type: String, default: '' }, // prize amount for groups
  categories: [{ type: String }], // dynamically added sub-categories e.g. Modern, Classical
  currency: { type: String, default: 'INR' },
  onlinePayment: { type: Boolean, default: true },  // true = Razorpay, false = offline/manual
  offlineFeeLabel: { type: String, default: '' },    // display text when offline e.g. "₹99 (pay at venue)"
  submissionType: { type: String, default: 'image', enum: ['image', 'text', 'file', 'none'] },
  maxFileSize: { type: Number, default: 5 * 1024 * 1024 },
  allowedFormats: { type: [String], default: ['image/jpeg', 'image/png'] },

  // Prizes
  prizes: [{
    rank: String,
    amount: String,
    winners: { type: Number, default: 1 },
    emoji: { type: String, default: '🏆' },
  }],
  totalPrizePool: { type: String, default: '' },

  // Rules & Steps
  rules: [String],
  steps: [{ title: String, description: String }],

  // Judges
  judges: [{
    name: { type: String, required: true },
    designation: { type: String, default: '' },
    photo: { type: String, default: '' },
    photoPublicId: { type: String, default: '' },
  }],

  // Badges
  badges: [String],

  // Dates
  eventDate: { type: Date },
  registrationOpen: { type: Date, default: Date.now },
  submissionDeadline: { type: Date, required: true },
  resultsDate: { type: Date },

  // Status
  status: { type: String, default: 'draft', enum: ['draft', 'upcoming', 'ongoing', 'judging', 'completed'] },
  isPublished: { type: Boolean, default: false },

  // Stats
  entryCount: { type: Number, default: 0 },
}, { timestamps: true });

const Competition = mongoose.model('Competition', competitionSchema);

// ── Entry Schema (updated with competitionId) ──
const entrySchema = new mongoose.Schema({
  competitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition', required: true },

  name: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true, default: '' },
  phone: { type: String, required: true },
  age: { type: Number, required: true },
  category: { type: String, default: '' }, // selected sub-category e.g. Modern Dance

  registrationType: { type: String, enum: ['single', 'group'], default: 'single' },
  groupMembers: [{ name: String, phone: String }],

  razorpayOrderId: { type: String, default: '' },
  razorpayPaymentId: { type: String, default: '' },
  paymentStatus: { type: String, default: 'pending' },
  bookingType: { type: String, default: 'online', enum: ['online', 'offline'] },

  artworkTitle: { type: String, trim: true, default: '' },
  artworkUrl: { type: String, default: '' },
  cloudinaryPublicId: { type: String, default: '' },
  hasSubmittedArtwork: { type: Boolean, default: false },

  registeredAt: { type: Date, default: Date.now },
  artworkSubmittedAt: { type: Date },
});

// Compound index: one entry per phone per competition
entrySchema.index({ competitionId: 1, phone: 1 }, { unique: true });

const Entry = mongoose.model('Entry', entrySchema);

// ─────────────────────────────────────────────
// 6. MULTER
// ─────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WebP files are allowed'));
  },
});

// ─────────────────────────────────────────────
// 7. MIDDLEWARE
// ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Admin auth middleware
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!process.env.ADMIN_SECRET || token !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─────────────────────────────────────────────
// 8. PUBLIC COMPETITION ROUTES
// ─────────────────────────────────────────────

// List published competitions (with optional status filter)
app.get('/api/competitions', async (req, res) => {
  try {
    const filter = { isPublished: true };
    if (req.query.status) filter.status = req.query.status;
    const competitions = await Competition.find(filter)
      .sort({ createdAt: -1 })
      .select('-__v');
    res.json({ count: competitions.length, competitions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single competition by slug
app.get('/api/competitions/:slug', async (req, res) => {
  try {
    const comp = await Competition.findOne({ slug: req.params.slug, isPublished: true }).select('-__v');
    if (!comp) return res.status(404).json({ error: 'Competition not found' });
    res.json(comp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// 9. ADMIN COMPETITION ROUTES
// ─────────────────────────────────────────────

// List ALL competitions (including drafts)
app.get('/api/admin/competitions', requireAdmin, async (_req, res) => {
  try {
    const competitions = await Competition.find().sort({ createdAt: -1 }).select('-__v');
    res.json({ count: competitions.length, competitions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create competition
app.post('/api/admin/competitions', requireAdmin, async (req, res) => {
  try {
    const data = req.body;
    // Auto-generate slug from title if not provided
    if (!data.slug && data.title) {
      data.slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    const comp = await Competition.create(data);
    console.log(`🏆  Competition created: ${comp.title} (${comp.slug})`);
    res.status(201).json(comp);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A competition with this slug already exists.' });
    res.status(500).json({ error: err.message });
  }
});

// Update competition
app.put('/api/admin/competitions/:id', requireAdmin, async (req, res) => {
  try {
    const comp = await Competition.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!comp) return res.status(404).json({ error: 'Competition not found' });
    res.json(comp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete competition
app.delete('/api/admin/competitions/:id', requireAdmin, async (req, res) => {
  try {
    const comp = await Competition.findByIdAndDelete(req.params.id);
    if (!comp) return res.status(404).json({ error: 'Competition not found' });
    // Also delete related entries
    await Entry.deleteMany({ competitionId: req.params.id });
    res.json({ success: true, message: 'Competition and all entries deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload cover image for competition
app.post('/api/admin/competitions/:id/cover', requireAdmin, upload.single('cover'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Cover image file is required.' });
    const comp = await Competition.findById(req.params.id);
    if (!comp) return res.status(404).json({ error: 'Competition not found' });

    // Delete old cover if exists
    if (comp.coverImagePublicId) {
      await cloudinary.uploader.destroy(comp.coverImagePublicId).catch(() => { });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'taroka-covers', resource_type: 'image', transformation: [{ width: 1200, crop: 'limit' }] },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    comp.coverImage = result.secure_url;
    comp.coverImagePublicId = result.public_id;
    await comp.save();

    res.json({ success: true, coverImage: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Upload judge photo
app.post('/api/admin/judge-photo', requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Photo file is required.' });

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'taroka-judges', resource_type: 'image', transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }] },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    res.json({ success: true, url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// 10. ENTRY ROUTES (competition-scoped)
// ─────────────────────────────────────────────

// Create Razorpay order for a competition
app.post('/api/create-order', async (req, res) => {
  try {
    const { phone, competitionId } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required.' });
    if (!competitionId) return res.status(400).json({ error: 'Competition ID is required.' });

    const comp = await Competition.findById(competitionId);
    if (!comp) return res.status(404).json({ error: 'Competition not found.' });
    if (!['ongoing', 'upcoming'].includes(comp.status)) return res.status(403).json({ error: 'This competition is not accepting registrations.' });

    const existing = await Entry.findOne({ competitionId, phone: normalizePhone(phone) });
    if (existing) return res.status(409).json({ error: 'You have already registered for this competition.' });

    if (new Date() > comp.submissionDeadline) {
      return res.status(403).json({ error: 'The registration deadline has passed.' });
    }

    let fee = comp.entryFee;
    if (req.body.registrationType === 'group' && comp.allowGroupRegistration) {
      fee = comp.groupEntryFee;
    }

    const order = await getRazorpay().orders.create({
      amount: fee,
      currency: comp.currency,
      receipt: `taroka_${comp.slug}_${Date.now()}`,
      notes: { competition: comp.title, competitionId: comp._id.toString() },
    });

    console.log(`📦  Order created: ${order.id} for ${comp.title}`);
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Could not initiate payment. Please try again.' });
  }
});

// Register after payment
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, age, category, competitionId, registrationType, groupMembers, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!name || !phone || !age) return res.status(400).json({ error: 'Name, phone, and age are required.' });
    if (!competitionId) return res.status(400).json({ error: 'Competition ID is required.' });
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ error: 'Payment details missing.' });

    // Verify signature
    const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed.' });
    }

    const existing = await Entry.findOne({ competitionId, phone: normalizePhone(phone) });
    if (existing) return res.status(409).json({ error: 'You have already registered for this competition.' });

    const entry = await Entry.create({
      competitionId,
      name, email, phone: normalizePhone(phone), age,
      registrationType: registrationType || 'single',
      groupMembers: Array.isArray(groupMembers) ? groupMembers : [],
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      paymentStatus: 'paid',
    });

    // Increment entry count
    await Competition.findByIdAndUpdate(competitionId, { $inc: { entryCount: 1 } });

    console.log(`🎉  Registered: ${entry._id} — ${name}`);
    res.status(201).json({ success: true, message: 'Registration successful!', entryId: entry._id });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
});

// Verify user for artwork upload
app.post('/api/verify-user', async (req, res) => {
  try {
    const { phone, competitionId } = req.body;
    if (!phone || !competitionId) return res.status(400).json({ error: 'Phone and competition ID are required.' });

    const comp = await Competition.findById(competitionId);
    if (!comp) return res.status(404).json({ error: 'Competition not found.' });

    const entry = await Entry.findOne({ competitionId, phone: normalizePhone(phone) });
    if (!entry) return res.status(404).json({ error: 'No registration found with this phone number for this competition.' });
    if (entry.paymentStatus !== 'paid') return res.status(403).json({ error: 'Payment not completed.' });
    if (entry.hasSubmittedArtwork) return res.status(409).json({ error: 'You have already submitted your artwork.' });
    if (new Date() > comp.submissionDeadline) return res.status(403).json({ error: 'The submission deadline has passed.' });

    res.json({ success: true, message: `Welcome back, ${entry.name}! You can now upload your artwork.`, name: entry.name });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// Upload artwork
app.post('/api/upload-artwork', upload.single('artwork'), async (req, res) => {
  try {
    const { phone, artworkTitle, competitionId } = req.body;
    if (!phone || !artworkTitle || !competitionId) return res.status(400).json({ error: 'All fields are required.' });
    if (!req.file) return res.status(400).json({ error: 'Artwork file is required.' });

    const comp = await Competition.findById(competitionId);
    if (!comp) return res.status(404).json({ error: 'Competition not found.' });
    if (new Date() > comp.submissionDeadline) return res.status(403).json({ error: 'The submission deadline has passed.' });

    const entry = await Entry.findOne({ competitionId, phone: normalizePhone(phone) });
    if (!entry) return res.status(404).json({ error: 'No registration found.' });
    if (entry.paymentStatus !== 'paid') return res.status(403).json({ error: 'Payment not completed.' });
    if (entry.hasSubmittedArtwork) return res.status(409).json({ error: 'Artwork already submitted.' });

    const cloudResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `taroka-${comp.slug}`, resource_type: 'image', transformation: [{ width: 2000, crop: 'limit' }] },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    entry.artworkTitle = artworkTitle.trim();
    entry.artworkUrl = cloudResult.secure_url;
    entry.cloudinaryPublicId = cloudResult.public_id;
    entry.hasSubmittedArtwork = true;
    entry.artworkSubmittedAt = new Date();
    await entry.save();

    console.log(`🎨  Artwork uploaded: ${entry._id} — ${entry.name}`);
    res.json({ success: true, message: 'Artwork submitted successfully! 🎉', artworkUrl: cloudResult.secure_url });
  } catch (err) {
    console.error('Upload artwork error:', err);
    res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
});

// Book seat (offline competition — no payment)
app.post('/api/book-seat', async (req, res) => {
  try {
    const { name, email, phone, age, category, competitionId, registrationType, groupMembers } = req.body;
    if (!name || !phone || !age) return res.status(400).json({ error: 'Name, phone, and age are required.' });
    if (!competitionId) return res.status(400).json({ error: 'Competition ID is required.' });

    const comp = await Competition.findById(competitionId);
    if (!comp) return res.status(404).json({ error: 'Competition not found.' });
    if (!['ongoing', 'upcoming'].includes(comp.status)) return res.status(403).json({ error: 'This competition is not accepting registrations.' });
    if (comp.onlinePayment) return res.status(400).json({ error: 'This competition requires online payment.' });

    const existing = await Entry.findOne({ competitionId, phone: normalizePhone(phone) });
    if (existing) return res.status(409).json({ error: 'You have already booked a seat for this competition.' });

    if (new Date() > comp.submissionDeadline) {
      return res.status(403).json({ error: 'The registration deadline has passed.' });
    }

    const entry = await Entry.create({
      competitionId,
      name, email, phone: normalizePhone(phone), age, category: category || '',
      registrationType: registrationType || 'single',
      groupMembers: Array.isArray(groupMembers) ? groupMembers : [],
      razorpayOrderId: 'offline',
      razorpayPaymentId: 'offline',
      paymentStatus: 'offline',
      bookingType: 'offline',
    });

    // Increment entry count
    await Competition.findByIdAndUpdate(competitionId, { $inc: { entryCount: 1 } });

    console.log(`📋  Seat booked (offline): ${entry._id} — ${name}`);
    res.status(201).json({ success: true, message: 'Seat booked successfully! Payment will be collected at the venue.', entryId: entry._id });
  } catch (err) {
    console.error('Book seat error:', err);
    if (err.code === 11000) return res.status(409).json({ error: 'You have already booked a seat for this competition.' });
    res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
});

// Admin: list entries for a competition
app.get('/api/admin/entries', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.competitionId) filter.competitionId = req.query.competitionId;
    const entries = await Entry.find(filter).sort({ registeredAt: -1 }).select('-__v');
    res.json({ count: entries.length, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/entries/:id', requireAdmin, async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id).select('-__v');
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// 11. SPA FALLBACK
// ─────────────────────────────────────────────
app.get('/competition', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'competition.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─────────────────────────────────────────────
// 12. START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
async function startServer() {
  await connectMongo();
  app.listen(PORT, () => console.log(`🚀  Taroka server running → http://localhost:${PORT}`));
}
startServer().catch(err => { console.error('💥  Fatal:', err); process.exit(1); });
