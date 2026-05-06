/**
 * Seed script — creates the Bohag Bihu 2026 competition
 * and links any existing Entry documents to it.
 *
 * Usage: node seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');

async function main() {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

  let uri = process.env.MONGO_URI;
  if (uri && !uri.includes('mongodb.net/')) uri = uri.replace('mongodb.net', 'mongodb.net/taroka');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('✅  Connected to MongoDB');

  // ── Competition model (must match server.js) ──
  const competitionSchema = new mongoose.Schema({
    title: String, slug: { type: String, unique: true }, type: String,
    description: String, shortDescription: String,
    coverImage: String, coverImagePublicId: String,
    entryFee: Number, currency: String,
    submissionType: String, maxFileSize: Number, allowedFormats: [String],
    prizes: [{ rank: String, amount: String, winners: Number, emoji: String }],
    totalPrizePool: String, rules: [String],
    steps: [{ title: String, description: String }],
    badges: [String],
    registrationOpen: Date, submissionDeadline: Date, resultsDate: Date,
    status: String, isPublished: Boolean, entryCount: Number,
  }, { timestamps: true });

  const Competition = mongoose.models.Competition || mongoose.model('Competition', competitionSchema);

  // Check if already seeded
  const existing = await Competition.findOne({ slug: 'bohag-bihu-2026' });
  if (existing) {
    console.log('⚠️  Competition "bohag-bihu-2026" already exists. Skipping creation.');
  } else {
    const comp = await Competition.create({
      title: 'Taroka Bohag Bihu Drawing Competition',
      slug: 'bohag-bihu-2026',
      type: 'art',
      description: 'Submit your artwork inspired by Bohag Bihu and stand a chance to win exciting cash prizes, get featured in newspapers and media, and gain recognition across Assam.',
      shortDescription: 'Showcase your art inspired by Bohag Bihu. Win ₹25,000+ in prizes and media recognition across Assam.',
      entryFee: 9900,
      currency: 'INR',
      submissionType: 'image',
      maxFileSize: 5 * 1024 * 1024,
      allowedFormats: ['image/jpeg', 'image/png'],
      prizes: [
        { rank: '1st Prize', amount: '₹10,000', winners: 1, emoji: '🥇' },
        { rank: '2nd Prize', amount: '₹7,000', winners: 3, emoji: '🥈' },
        { rank: '3rd Prize', amount: '₹5,000', winners: 5, emoji: '🥉' },
      ],
      totalPrizePool: '₹25,000+',
      rules: [
        'Only original artwork accepted – no AI-generated or copied art.',
        'Theme must relate to Bohag Bihu or Assamese culture.',
        'One entry per participant only.',
        'Accepted formats: JPG and PNG files only.',
        'Maximum file size: 5MB per artwork.',
        'Decision of the judges is final and binding.',
      ],
      steps: [
        { title: 'Fill the Form', description: 'Enter your name, email, phone and age.' },
        { title: 'Pay ₹99', description: 'Secure your spot via Razorpay — UPI, cards, net banking accepted.' },
        { title: 'Upload Artwork', description: 'Upload your drawing right away — or come back before May 14 to submit it.' },
        { title: 'Await Results', description: 'Judges evaluate all entries. Winners announced on our official page.' },
      ],
      badges: ['Fair Judging', 'All Assam Participation', 'Digital Certificate', 'Media Coverage'],
      registrationOpen: new Date('2026-04-01T00:00:00+05:30'),
      submissionDeadline: new Date(process.env.SUBMISSION_DEADLINE || '2026-05-14T23:59:59+05:30'),
      resultsDate: new Date('2026-05-25T00:00:00+05:30'),
      status: 'ongoing',
      isPublished: true,
      entryCount: 0,
    });
    console.log(`🏆  Created competition: ${comp.title} (ID: ${comp._id})`);
  }

  // ── Link existing entries ──
  const comp = await Competition.findOne({ slug: 'bohag-bihu-2026' });

  // Check for entries without competitionId
  const entryCollection = mongoose.connection.db.collection('entries');
  const unlinked = await entryCollection.countDocuments({ competitionId: { $exists: false } });

  if (unlinked > 0) {
    const result = await entryCollection.updateMany(
      { competitionId: { $exists: false } },
      { $set: { competitionId: comp._id } }
    );
    console.log(`🔗  Linked ${result.modifiedCount} existing entries to "${comp.title}"`);

    // Update entry count
    const totalEntries = await entryCollection.countDocuments({ competitionId: comp._id });
    await Competition.findByIdAndUpdate(comp._id, { entryCount: totalEntries });
    console.log(`📊  Updated entry count: ${totalEntries}`);
  } else {
    console.log('✅  All entries already linked (or no entries exist).');
  }

  await mongoose.disconnect();
  console.log('✅  Done! You can now start the server.');
}

main().catch(err => { console.error('❌  Seed error:', err); process.exit(1); });
