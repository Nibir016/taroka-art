// ══════════════════════════════════════════
// Taroka — Competition Detail Page Logic
// ══════════════════════════════════════════

/**
 * Return the Cloudinary URL as-is (Strict Transformations is enabled on the
 * account, so unsigned on-the-fly transforms return 401).
 * @param {string} url  – Raw Cloudinary secure_url
 * @returns {string} The original URL
 */
function cloudinaryUrl(url) {
  return url || '';
}

let COMP = null;               // current competition data
let registeredUser = { name: '', email: '', phone: '' };

let currentRegType = 'single';
let groupMemberCounter = 0;

// ── Load competition ──
const slug = new URLSearchParams(window.location.search).get('slug');
if (!slug) { window.location.href = '/'; }

async function loadCompetition() {
  try {
    const res = await fetch(`/api/competitions/${slug}`);
    if (!res.ok) { window.location.href = '/'; return; }
    COMP = await res.json();
    document.title = `${COMP.title} — Taroka`;
    renderHero();
    renderSidebar();
    renderPrizes();
    renderSteps();
    renderJudges();
    renderRules();
    renderCountdown();
    renderFee();
    renderFormMode();
  } catch { window.location.href = '/'; }
}

function formatDate(d) { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
function formatFee(paise) { return (!paise || paise === 0) ? 'Free' : '₹' + (paise / 100).toLocaleString('en-IN'); }

// ── Renderers ──
function renderHero() {
  const hero = document.getElementById('compHero');
  if (COMP.coverImage) hero.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.3),rgba(0,0,0,0.6)), url('${cloudinaryUrl(COMP.coverImage, 'cover')}')`;
  else hero.style.background = 'linear-gradient(135deg, #1C1005 0%, #4A3520 100%)';

  document.getElementById('heroContent').innerHTML = `
    <div class="hero-eyebrow">${COMP.type ? COMP.type.toUpperCase() + ' COMPETITION' : 'COMPETITION'}</div>
    <h1>${COMP.title}</h1>
    <p class="comp-hero-desc">${COMP.description || ''}</p>
    <div class="comp-hero-meta">
      ${(COMP.badges || []).map(b => `<span class="badge" style="background:rgba(255,255,255,0.15);border-color:rgba(255,255,255,0.3);color:#fff;"><span class="badge-dot" style="background:#4ADE80;"></span>${b}</span>`).join('')}
    </div>
  `;
}

function renderSidebar() {
  const isOffline = COMP.onlinePayment === false;
  const feeDisplay = isOffline
    ? (COMP.offlineFeeLabel || 'Pay at venue')
    : formatFee(COMP.entryFee);

  document.getElementById('sidebar').innerHTML = `
    <h3>Competition Details</h3>
    ${COMP.totalPrizePool ? `<div style="font-family:'Playfair Display',serif; font-size:2rem; font-weight:700; color:var(--orange); margin-bottom:0.5rem;">${COMP.totalPrizePool}</div>` : ''}
    ${(COMP.allowGroupRegistration && COMP.groupPrizeAmount) ? `<div style="font-size:1.1rem; font-weight:600; color:var(--gold); margin-bottom:1rem;">Group Prize: ${COMP.groupPrizeAmount}</div>` : ''}
    <div class="sidebar-stat"><span class="label">Entry Fee</span><span class="value">${feeDisplay}</span></div>
    ${isOffline ? '<div class="sidebar-stat"><span class="label">Payment</span><span class="value" style="color:#1E40AF;">Offline / At Venue</span></div>' : ''}
    ${COMP.eventDate ? `<div class="sidebar-stat"><span class="label">Event Date</span><span class="value" style="color:#166534;font-weight:700;">${formatDate(COMP.eventDate)}</span></div>` : ''}
    <div class="sidebar-stat"><span class="label">Deadline</span><span class="value">${formatDate(COMP.submissionDeadline)}</span></div>
    <div class="sidebar-stat"><span class="label">Type</span><span class="value" style="text-transform:capitalize;">${COMP.type}</span></div>
    <div class="sidebar-stat"><span class="label">Entries</span><span class="value">${COMP.entryCount || 0}</span></div>
    <div class="sidebar-stat"><span class="label">Status</span><span class="value" style="text-transform:capitalize;">${COMP.status}</span></div>
    <a href="#apply" class="btn-submit" style="margin-top:1.5rem; text-align:center; text-decoration:none;">${isOffline ? 'Book Seat →' : 'Register Now →'}</a>
  `;
}

function renderPrizes() {
  if (!COMP.prizes || COMP.prizes.length === 0) return;
  document.getElementById('prizesSection').style.display = '';
  const tiers = ['gold-prize', 'silver-prize', 'bronze-prize'];
  document.getElementById('prizesGrid').innerHTML = COMP.prizes.map((p, i) => `
    <div class="prize-card ${tiers[i] || ''}">
      <span class="prize-medal">${p.emoji || '🏆'}</span>
      <div class="prize-rank">${p.rank}</div>
      <div class="prize-amount">${p.amount}</div>
      <div class="prize-winners">${p.winners} Winner${p.winners > 1 ? 's' : ''}</div>
    </div>
  `).join('');
}

function renderSteps() {
  if (!COMP.steps || COMP.steps.length === 0) return;
  document.getElementById('stepsSection').style.display = '';
  document.getElementById('stepsGrid').innerHTML = COMP.steps.map((s, i) => `
    <div class="step-item">
      <div class="step-num">${i + 1}</div>
      <div class="step-title">${s.title}</div>
      <p class="step-desc">${s.description}</p>
    </div>
  `).join('');
}

function renderJudges() {
  if (!COMP.hasJudges || !COMP.judges || COMP.judges.length === 0) return;
  document.getElementById('judgesSection').style.display = '';
  const defaultPhoto = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#FEF3E2"/><text x="60" y="68" text-anchor="middle" fill="#D97706" font-size="40">👤</text></svg>')}`;
  document.getElementById('judgesGrid').innerHTML = COMP.judges.map(j => `
    <div class="judge-card">
      <div class="judge-photo-wrap">
        <img src="${j.photo || defaultPhoto}" alt="${j.name}" onerror="this.src='${defaultPhoto}'">
      </div>
      <div class="judge-name">${j.name}</div>
      ${j.designation ? `<div class="judge-designation">${j.designation}</div>` : ''}
    </div>
  `).join('');
}

function renderRules() {
  if (!COMP.rules || COMP.rules.length === 0) return;
  document.getElementById('rulesSection').style.display = '';
  document.getElementById('rulesList').innerHTML = COMP.rules.map(r => `<li><span class="rule-check"></span>${r}</li>`).join('');
}

function renderFee() {
  const isOffline = COMP.onlinePayment === false;
  const isGroup = currentRegType === 'group' && COMP.allowGroupRegistration;
  
  // Hide the bottom fee-note bar when group is selected (fee badge is at top of group panel)
  const feeNote = document.querySelector('#regFields .fee-note');
  const feeSubtext = document.querySelector('#regFields .fee-subtext');
  if (feeNote) feeNote.style.display = isGroup ? 'none' : '';
  if (feeSubtext) feeSubtext.style.display = isGroup ? 'none' : '';

  let currentFee = COMP.entryFee;
  if (isGroup) {
    currentFee = COMP.groupEntryFee;
  }

  if (isOffline) {
    const feeLabel = COMP.offlineFeeLabel || 'Pay at venue';
    document.getElementById('feeDisplay').textContent = feeLabel;
    document.getElementById('regCardDesc').textContent = `Fill in your details to book your seat. Payment will be collected at the venue/offline.`;
    document.getElementById('regBtn').textContent = `Book Seat →`;
    // Update tab text
    document.getElementById('tabRegister').innerHTML = '1 · Book Seat';
    // Hide Razorpay trust badge, show offline info
    const trustDiv = document.querySelector('#panelRegister .form-trust');
    if (trustDiv) {
      trustDiv.innerHTML = '<div class="form-trust-item"><span class="trust-shield"></span>Offline payment at venue</div><div class="form-trust-item"><span class="trust-shield"></span>Data safely stored</div>';
    }
    // Hide fee subtext about Razorpay
    if (feeSubtext) feeSubtext.textContent = 'Payment will be collected offline at the venue.';
  } else {
    const fee = formatFee(currentFee);
    document.getElementById('feeDisplay').textContent = fee;
    if (isGroup) {
      document.getElementById('regCardDesc').textContent = `Fill in your group details and pay the group fee to register.`;
      document.getElementById('regBtn').textContent = `Pay ${fee} & Register Group →`;
    } else {
      document.getElementById('regCardDesc').textContent = `Pay ${fee} to secure your spot. You can upload artwork right after or come back before the deadline.`;
      document.getElementById('regBtn').textContent = `Pay ${fee} & Register →`;
    }
  }
}

function renderFormMode() {
  const isOffline = COMP.onlinePayment === false;

  if (COMP.allowGroupRegistration) {
    document.getElementById('regTypeWrap').style.display = '';
  }

  if (COMP.categories && COMP.categories.length > 0) {
    document.getElementById('regCategoryWrap').style.display = '';
    const catSelect = document.getElementById('regCategory');
    catSelect.innerHTML = '<option value="">Select a category</option>' + COMP.categories.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  if (isOffline) {
    // ── OFFLINE: Hide all upload-related UI ──
    // Hide the tab bar entirely (no upload tab needed)
    const tabBar = document.querySelector('.form-tabs');
    if (tabBar) tabBar.style.display = 'none';

    // Hide Tab 2 panel completely
    document.getElementById('panelUpload').style.display = 'none';

    // Update section subtitle
    const sub = document.querySelector('#apply .section-sub');
    if (sub) sub.textContent = 'Fill in your details to book your seat for this competition.';

    // Update section title
    const sectionTitle = document.querySelector('#apply .section-title');
    if (sectionTitle) sectionTitle.textContent = 'Book Your Seat';
  }
}

function renderCountdown() {
  const deadline = new Date(COMP.submissionDeadline);
  const section = document.getElementById('countdownSection');

  function update() {
    const now = new Date();
    const diff = deadline - now;
    if (diff <= 0) { section.innerHTML = '<p style="text-align:center;color:var(--red);font-weight:600;">⏰ Deadline has passed</p>'; return; }
    section.style.display = '';
    const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
    document.getElementById('countdown').innerHTML = [
      { v: d, l: 'Days' }, { v: h, l: 'Hours' }, { v: m, l: 'Mins' }, { v: s, l: 'Secs' }
    ].map(x => `<div class="countdown-item"><div class="countdown-value">${x.v}</div><div class="countdown-label">${x.l}</div></div>`).join('');
  }
  update();
  setInterval(update, 1000);
}

// ── Tab switching ──
function switchTab(tab) {
  document.getElementById('panelRegister').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('panelUpload').style.display = tab === 'upload' ? '' : 'none';
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('tabUpload').classList.toggle('active', tab === 'upload');
}

// ── Helpers ──
function showErr(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function hideErr(id) { document.getElementById(id).classList.remove('visible'); }
function setProgress(fId, lId, pct, label) { document.getElementById(fId).style.width = pct + '%'; document.getElementById(lId).textContent = label; }
function showProgress(id) { document.getElementById(id).classList.add('visible'); }
function hideProgress(id) { document.getElementById(id).classList.remove('visible'); }
function setBtn(id, text, disabled) { const b = document.getElementById(id); b.textContent = text; b.disabled = disabled; }

// ── Group Registration Logic ──
function selectRegType(type) {
  currentRegType = type;
  
  // Update toggle cards
  document.getElementById('cardSingle').classList.toggle('active', type === 'single');
  document.getElementById('cardGroup').classList.toggle('active', type === 'group');
  document.querySelector('#cardSingle input').checked = type === 'single';
  document.querySelector('#cardGroup input').checked = type === 'group';

  // Show/hide form sections
  document.getElementById('regFieldsSingle').style.display = type === 'single' ? '' : 'none';
  document.getElementById('regFieldsGroup').style.display = type === 'group' ? '' : 'none';

  // Populate group panel info
  if (type === 'group') {
    const maxM = COMP.maxGroupMembers || 5;
    const feeText = formatFee(COMP.groupEntryFee);
    document.getElementById('groupFeeBadge').textContent = `Fee: ${feeText}`;
    document.getElementById('groupSubtitle').textContent = `Max ${maxM} members · Fill in your group details below.`;
    updateMemberCount();
  }

  renderFee();
}

function addGroupMemberRow() {
  const container = document.getElementById('groupMembersContainer');
  const maxAdditional = (COMP.maxGroupMembers || 5) - 1; // -1 because leader counts
  if (container.children.length >= maxAdditional) {
    return alert(`Maximum group size of ${COMP.maxGroupMembers} reached.`);
  }

  groupMemberCounter++;
  const div = document.createElement('div');
  div.className = 'gm-row';
  div.id = `gm-row-${groupMemberCounter}`;
  div.innerHTML = `
    <div><label>Name *</label><input type="text" class="gm-name" placeholder="Member name"></div>
    <button type="button" class="gm-remove-btn" onclick="removeGroupMemberRow(${groupMemberCounter})">✕</button>
  `;
  container.appendChild(div);
  updateMemberCount();
}

function removeGroupMemberRow(idx) {
  const row = document.getElementById(`gm-row-${idx}`);
  if (row) row.remove();
  updateMemberCount();
}

function updateMemberCount() {
  const count = document.getElementById('groupMembersContainer').children.length;
  const max = COMP.maxGroupMembers || 5;
  document.getElementById('groupMemberCount').textContent = `Total Members: ${count + 1} / ${max}`;
}

// File pickers
function bindFilePicker(inputId, areaId, textId) {
  document.getElementById(inputId).addEventListener('change', function () {
    const file = this.files[0]; if (!file) return;
    document.getElementById(areaId).classList.add('has-file');
    document.getElementById(textId).innerHTML = `<strong>${file.name}</strong><br><span style="color:var(--orange)">✓ Selected</span>`;
  });
}
bindFilePicker('inlineArtwork', 'inlineUploadArea', 'inlineUploadText');
bindFilePicker('uploadArtworkFile', 'uploadAreaMain', 'uploadArtworkText');

// ══════════════════════════════════════════
// REGISTER & PAY (or BOOK SEAT for offline)
// ══════════════════════════════════════════
async function handleRegister() {
  hideErr('regError');
  
  const category = document.getElementById('regCategory').value.trim();
  if (COMP.categories && COMP.categories.length > 0 && !category) {
    return showErr('regError', 'Please select a category/sub-type.');
  }

  let name, email, phone, age;
  const groupMembers = [];

  if (currentRegType === 'group') {
    // ── GROUP: Read from group form ──
    const grpName = document.getElementById('grpName').value.trim();
    const leaderName = document.getElementById('grpLeaderName').value.trim();
    const leaderPhone = document.getElementById('grpLeaderPhone').value.trim();
    const leaderEmail = document.getElementById('grpLeaderEmail').value.trim();
    const leaderAge = document.getElementById('grpLeaderAge').value.trim();

    if (!grpName) return showErr('regError', 'Please enter your group name.');
    if (!leaderName) return showErr('regError', 'Please enter the group leader\'s name.');
    if (!leaderPhone) return showErr('regError', 'Please enter the group leader\'s phone number.');
    if (!leaderAge) return showErr('regError', 'Please enter the group leader\'s age.');
    if (leaderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leaderEmail)) return showErr('regError', 'Please enter a valid email for the leader.');

    name = grpName;          // Entry name = Group Name
    email = leaderEmail;     // Contact email = Leader's email
    phone = leaderPhone;     // Contact phone = Leader's phone
    age = leaderAge;

    // Add leader as first member
    groupMembers.push({ name: leaderName, phone: leaderPhone, age: leaderAge, isLeader: true });

    // Add additional members
    const container = document.getElementById('groupMembersContainer');
    for (let row of container.children) {
      const mName = row.querySelector('.gm-name').value.trim();
      if (!mName) return showErr('regError', 'Please fill in all group member names.');
      groupMembers.push({ name: mName });
    }

    if (groupMembers.length < 2) return showErr('regError', 'Please add at least 1 group member besides the leader.');
  } else {
    // ── SINGLE: Read from single form ──
    name = document.getElementById('regName').value.trim();
    email = document.getElementById('regEmail').value.trim();
    phone = document.getElementById('regPhone').value.trim();
    age = document.getElementById('regAge').value.trim();

    if (!name) return showErr('regError', 'Please enter your full name.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr('regError', 'Please enter a valid email if provided.');
    if (!phone) return showErr('regError', 'Please enter your phone number.');
    if (!age) return showErr('regError', 'Please enter your age.');
  }

  const isOffline = COMP.onlinePayment === false;

  if (isOffline) {
    // ── OFFLINE: Book seat without payment ──
    setBtn('regBtn', 'Booking seat…', true);
    showProgress('regProgress');
    setProgress('regProgressFill', 'regProgressLabel', 40, 'Booking your seat…');
    try {
      const res = await fetch('/api/book-seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, age, category, competitionId: COMP._id, registrationType: currentRegType, groupMembers })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProgress('regProgressFill', 'regProgressLabel', 100, 'Done!');
      registeredUser = { name, email, phone };
      setTimeout(() => {
        hideProgress('regProgress');
        document.getElementById('regFields').style.display = 'none';
        // Show booking confirmed (not payment confirmed)
        const successBox = document.getElementById('regSuccessBox');
        successBox.className = 'booking-confirmed-box visible';
        successBox.innerHTML = `
          <div class="success-icon" style="background:#DBEAFE;">📋</div>
          <h4>Seat Booked Successfully!</h4>
          <p>Your seat is reserved. Please pay ${COMP.offlineFeeLabel || 'the entry fee'} at the venue.</p>
          <p style="font-size:0.75rem;color:#6B7280;margin-top:0.6rem;">Booking confirmed for: ${name} (${phone})</p>
        `;
      }, 500);
    } catch (err) {
      hideProgress('regProgress');
      setBtn('regBtn', 'Book Seat →', false);
      showErr('regError', err.message);
    }
    return;
  }

  // ── ONLINE: Razorpay payment flow ──
  setBtn('regBtn', 'Creating order…', true);
  let orderData;
  try {
    const res = await fetch('/api/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone, competitionId: COMP._id, registrationType: currentRegType }) });
    orderData = await res.json();
    if (!res.ok) throw new Error(orderData.error);
  } catch (err) { setBtn('regBtn', document.getElementById('feeDisplay').textContent + ' & Register →', false); return showErr('regError', err.message); }

  const rzp = new Razorpay({
    key: orderData.keyId, amount: orderData.amount, currency: orderData.currency,
    name: 'Taroka', description: COMP.title + ' – Entry Fee', order_id: orderData.orderId,
    prefill: { name, email: email || 'noreply@taroka.in', contact: phone }, theme: { color: '#F97316' },
    handler: async function (response) {
      showProgress('regProgress'); setProgress('regProgressFill', 'regProgressLabel', 40, 'Confirming…');
      setBtn('regBtn', 'Registering…', true);
      try {
        const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, phone, age, category, competitionId: COMP._id, registrationType: currentRegType, groupMembers, razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setProgress('regProgressFill', 'regProgressLabel', 100, 'Done!');
        registeredUser = { name, email, phone };
        setTimeout(() => { hideProgress('regProgress'); document.getElementById('regFields').style.display = 'none'; document.getElementById('regSuccessBox').classList.add('visible'); document.getElementById('regPaymentId').textContent = 'Payment ID: ' + response.razorpay_payment_id; document.getElementById('inlineUploadSection').style.display = ''; }, 500);
      } catch (err) { hideProgress('regProgress'); setBtn('regBtn', document.getElementById('feeDisplay').textContent + ' & Register →', false); showErr('regError', 'Payment succeeded but registration failed. Contact contact@taroka.in with payment ID: ' + response.razorpay_payment_id); }
    },
    modal: { ondismiss: () => setBtn('regBtn', document.getElementById('feeDisplay').textContent + ' & Register →', false) }
  });
  rzp.on('payment.failed', (r) => { setBtn('regBtn', document.getElementById('feeDisplay').textContent + ' & Register →', false); showErr('regError', 'Payment failed: ' + (r.error.description || 'Please try again.')); });
  rzp.open();
}

// ══════════════════════════════════════════
// INLINE UPLOAD (after payment/booking)
// ══════════════════════════════════════════
async function handleInlineUpload() {
  hideErr('inlineUploadError');
  const title = document.getElementById('inlineArtworkTitle').value.trim();
  const file = document.getElementById('inlineArtwork').files[0];
  if (!title) return showErr('inlineUploadError', 'Please give your artwork a title.');
  if (!file) return showErr('inlineUploadError', 'Please upload your artwork.');
  if (!['image/jpeg', 'image/png'].includes(file.type)) return showErr('inlineUploadError', 'Only JPG and PNG allowed.');
  if (file.size > 5 * 1024 * 1024) return showErr('inlineUploadError', 'File must be under 5MB.');

  setBtn('inlineUploadBtn', 'Uploading…', true); showProgress('inlineUploadProgress');
  setProgress('inlineUploadFill', 'inlineUploadLabel', 30, 'Uploading…');
  try {
    const fd = new FormData(); fd.append('phone', registeredUser.phone); fd.append('artworkTitle', title); fd.append('artwork', file); fd.append('competitionId', COMP._id);
    setProgress('inlineUploadFill', 'inlineUploadLabel', 60, 'Saving to cloud…');
    const res = await fetch('/api/upload-artwork', { method: 'POST', body: fd });
    const data = await res.json(); if (!res.ok) throw new Error(data.error);
    setProgress('inlineUploadFill', 'inlineUploadLabel', 100, 'Done!');
    setTimeout(() => { hideProgress('inlineUploadProgress'); document.getElementById('inlineUploadFields').style.display = 'none'; document.getElementById('inlineUploadSuccess').classList.add('visible'); }, 500);
  } catch (err) { hideProgress('inlineUploadProgress'); setBtn('inlineUploadBtn', 'Submit Artwork →', false); showErr('inlineUploadError', err.message); }
}

// ══════════════════════════════════════════
// VERIFY (Tab 2)
// ══════════════════════════════════════════
async function handleVerify() {
  hideErr('uploadError');
  const phone = document.getElementById('uploadPhone').value.trim();
  if (!phone) return showErr('uploadError', 'Enter your phone number.');

  setBtn('verifyBtn', 'Verifying…', true); showProgress('verifyProgress');
  setProgress('verifyProgressFill', 'verifyProgressLabel', 50, 'Checking…');
  try {
    const res = await fetch('/api/verify-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, competitionId: COMP._id }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error);
    setProgress('verifyProgressFill', 'verifyProgressLabel', 100, 'Verified!');
    registeredUser = { phone, name: data.name };
    setTimeout(() => { hideProgress('verifyProgress'); document.getElementById('uploadVerifyStep').style.display = 'none'; document.getElementById('verifyWelcome').textContent = '👋 ' + data.message; document.getElementById('uploadArtworkStep').style.display = ''; }, 400);
  } catch (err) { hideProgress('verifyProgress'); setBtn('verifyBtn', 'Verify My Registration →', false); showErr('uploadError', err.message); }
}

// ══════════════════════════════════════════
// UPLOAD ARTWORK (Tab 2)
// ══════════════════════════════════════════
async function handleUploadArtwork() {
  hideErr('uploadError');
  const title = document.getElementById('uploadArtworkTitle').value.trim();
  const file = document.getElementById('uploadArtworkFile').files[0];
  if (!title) return showErr('uploadError', 'Give your artwork a title.');
  if (!file) return showErr('uploadError', 'Upload your artwork.');
  if (!['image/jpeg', 'image/png'].includes(file.type)) return showErr('uploadError', 'Only JPG and PNG allowed.');
  if (file.size > 5 * 1024 * 1024) return showErr('uploadError', 'File must be under 5MB.');

  setBtn('uploadArtworkBtn', 'Uploading…', true); showProgress('uploadProgress');
  setProgress('uploadProgressFill', 'uploadProgressLabel', 30, 'Uploading…');
  try {
    const fd = new FormData(); fd.append('phone', registeredUser.phone); fd.append('artworkTitle', title); fd.append('artwork', file); fd.append('competitionId', COMP._id);
    setProgress('uploadProgressFill', 'uploadProgressLabel', 65, 'Saving to cloud…');
    const res = await fetch('/api/upload-artwork', { method: 'POST', body: fd });
    const data = await res.json(); if (!res.ok) throw new Error(data.error);
    setProgress('uploadProgressFill', 'uploadProgressLabel', 100, 'All done!');
    setTimeout(() => { hideProgress('uploadProgress'); document.getElementById('uploadVerifyStep').style.display = 'none'; document.getElementById('uploadArtworkStep').style.display = 'none'; document.getElementById('uploadFinalSuccess').classList.add('visible'); }, 500);
  } catch (err) { hideProgress('uploadProgress'); setBtn('uploadArtworkBtn', 'Submit Artwork →', false); showErr('uploadError', err.message); }
}

// ── Init ──
loadCompetition();

// Scroll Reveal Animation
document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
      }
    });
  }, { threshold: 0.1 });

  // Delay starting observer slightly so sections rendered via JS can be observed
  setTimeout(() => {
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }, 500);
});
