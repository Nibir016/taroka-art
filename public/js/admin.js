// ══════════════════════════════════════════
// Taroka — Admin Panel Logic
// ══════════════════════════════════════════

let TOKEN = localStorage.getItem('taroka_admin_token') || '';
let allComps = [];
let pendingFeaturedImage = null; // File waiting to upload after save

// ── Auth ──
function headers() { return { 'Content-Type': 'application/json', 'x-admin-token': TOKEN }; }

async function login() {
  const secret = document.getElementById('loginSecret').value.trim();
  if (!secret) { showErr('loginError', 'Enter the admin secret.'); return; }
  TOKEN = secret;
  try {
    const res = await fetch('/api/admin/competitions', { headers: { 'x-admin-token': TOKEN } });
    if (!res.ok) throw new Error('Invalid secret');
    localStorage.setItem('taroka_admin_token', TOKEN);
    showDashboard();
  } catch {
    TOKEN = '';
    showErr('loginError', 'Invalid admin secret. Please try again.');
  }
}

function logout() { TOKEN = ''; localStorage.removeItem('taroka_admin_token'); location.reload(); }

function showDashboard() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('adminView').style.display = '';
  document.getElementById('logoutBtn').style.display = '';
  loadComps();
}

// Auto-login if token saved
if (TOKEN) {
  fetch('/api/admin/competitions', { headers: { 'x-admin-token': TOKEN } })
    .then(r => { if (r.ok) showDashboard(); else { TOKEN = ''; localStorage.removeItem('taroka_admin_token'); } })
    .catch(() => {});
}

// ── Helpers ──
function showErr(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function hideErr(id) { document.getElementById(id).classList.remove('visible'); }
function formatDate(d) { return new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }); }
function formatFee(p) { return (!p || p === 0) ? 'Free' : '₹' + (p/100); }

/**
 * Return the Cloudinary URL as-is (Strict Transformations is enabled on the
 * account, so unsigned on-the-fly transforms return 401).
 * @param {string} url  – Raw Cloudinary secure_url
 * @returns {string} The original URL
 */
function cloudinaryUrl(url) {
  return url || '';
}

const STATUS_COLORS = {
  draft: 'background:#F3F4F6;color:#4B5563;', ongoing: 'background:#DCFCE7;color:#166534;',
  upcoming: 'background:#EFF6FF;color:#1E40AF;', judging: 'background:#FFFBEB;color:#92400E;',
  completed: 'background:#F3F4F6;color:#4B5563;'
};

function getOrdinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Load competitions ──
async function loadComps() {
  try {
    const res = await fetch('/api/admin/competitions', { headers: { 'x-admin-token': TOKEN } });
    const data = await res.json();
    allComps = data.competitions || [];
    renderStats();
    renderTable();
  } catch (err) { console.error(err); }
}

function renderStats() {
  const total = allComps.length;
  const ongoing = allComps.filter(c => c.status === 'ongoing').length;
  const entries = allComps.reduce((s, c) => s + (c.entryCount || 0), 0);
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total Competitions</div></div>
    <div class="stat-card"><div class="stat-value">${ongoing}</div><div class="stat-label">Ongoing</div></div>
    <div class="stat-card"><div class="stat-value">${entries}</div><div class="stat-label">Total Entries</div></div>
  `;
}

function renderTable() {
  if (allComps.length === 0) {
    document.getElementById('compsTable').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">No competitions yet. Create one!</td></tr>';
    return;
  }
  document.getElementById('compsTable').innerHTML = allComps.map(c => `
    <tr>
      <td><strong>${c.title}</strong><br><span style="font-size:0.75rem;color:var(--text-muted);">/${c.slug}</span></td>
      <td style="text-transform:capitalize;">${c.type}</td>
      <td><span class="pill" style="${STATUS_COLORS[c.status] || ''}">${c.status}</span></td>
      <td>${c.onlinePayment === false ? '<span style="font-size:0.72rem;color:#1E40AF;">Offline</span>' : formatFee(c.entryFee)}</td>
      <td>${c.entryCount || 0}</td>
      <td>${formatDate(c.submissionDeadline)}</td>
      <td>
        <div class="admin-actions">
          <button class="btn-view" onclick="viewEntries('${c._id}','${c.title}')">Entries</button>
          <button class="btn-edit" onclick="openEditModal('${c._id}')">Edit</button>
          <button class="btn-del" onclick="deleteComp('${c._id}','${c.title}')">Del</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ══════════════════════════════════════════
// FEATURED IMAGE HANDLING
// ══════════════════════════════════════════

document.getElementById('featuredImageInput').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  pendingFeaturedImage = file;
  const area = document.getElementById('featuredUploadArea');
  const preview = document.getElementById('featuredPreview');
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.innerHTML = `<img src="${e.target.result}" alt="Featured image preview">`;
    area.classList.add('has-preview');
  };
  reader.readAsDataURL(file);
});

async function uploadFeaturedImage(compId) {
  if (!pendingFeaturedImage) return;
  const fd = new FormData();
  fd.append('cover', pendingFeaturedImage);
  const res = await fetch(`/api/admin/competitions/${compId}/cover`, {
    method: 'POST',
    headers: { 'x-admin-token': TOKEN },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to upload featured image.');
  pendingFeaturedImage = null;
}

// ══════════════════════════════════════════
// PAYMENT TOGGLE
// ══════════════════════════════════════════

function togglePaymentFields() {
  const isOnline = document.getElementById('compOnlinePayment').checked;
  const status = document.getElementById('paymentToggleStatus');
  const feeWrap = document.getElementById('feeFieldWrap');
  const offlineHint = document.getElementById('offlineHint');

  if (isOnline) {
    status.textContent = 'ON';
    status.className = 'toggle-status on';
    feeWrap.style.display = '';
    offlineHint.style.display = 'none';
    document.getElementById('compDeadline').required = true;
    const offlineDeadline = document.getElementById('compDeadlineOffline');
    if (offlineDeadline) offlineDeadline.required = false;
  } else {
    status.textContent = 'OFF';
    status.className = 'toggle-status off';
    feeWrap.style.display = 'none';
    offlineHint.style.display = '';
    document.getElementById('compDeadline').required = false;
    const offlineDeadline = document.getElementById('compDeadlineOffline');
    if (offlineDeadline) offlineDeadline.required = true;
  }
}

function toggleGroupFields() {
  const allowGroup = document.getElementById('compAllowGroup').checked;
  const status = document.getElementById('groupToggleStatus');
  const wrap = document.getElementById('groupFieldWrap');

  if (allowGroup) {
    status.textContent = 'ON';
    status.className = 'toggle-status on';
    wrap.style.display = '';
  } else {
    status.textContent = 'OFF';
    status.className = 'toggle-status off';
    wrap.style.display = 'none';
  }
}

function toggleJudges() {
  const hasJudges = document.getElementById('compHasJudges').checked;
  const status = document.getElementById('judgesToggleStatus');
  const wrap = document.getElementById('judgesWrap');

  if (hasJudges) {
    status.textContent = 'ON';
    status.className = 'toggle-status on';
    wrap.style.display = '';
    if (document.getElementById('judgesContainer').children.length === 0) {
      addJudgeRow();
    }
  } else {
    status.textContent = 'OFF';
    status.className = 'toggle-status off';
    wrap.style.display = 'none';
  }
}

function togglePublished() {
  const isPub = document.getElementById('compPublished').checked;
  const status = document.getElementById('publishedToggleStatus');
  if (isPub) {
    status.textContent = 'PUBLIC';
    status.className = 'toggle-status on';
  } else {
    status.textContent = 'PRIVATE';
    status.className = 'toggle-status off';
  }
}

// ══════════════════════════════════════════
// DYNAMIC ROWS — Prizes, Steps, Judges, Rules
// ══════════════════════════════════════════

let prizeCounter = 0;
let stepCounter = 0;
let judgeCounter = 0;
let ruleCounter = 0;

// ── PRIZES ──
function addPrizeRow(data = {}) {
  prizeCounter++;
  const idx = prizeCounter;
  const container = document.getElementById('prizesContainer');
  const count = container.children.length + 1;
  const rank = data.rank || getOrdinal(count) + ' Prize';
  const amount = data.amount || '';
  const winners = data.winners || 1;
  const emoji = data.emoji || (count === 1 ? '🥇' : count === 2 ? '🥈' : count === 3 ? '🥉' : '🏆');

  const div = document.createElement('div');
  div.className = 'dynamic-row';
  div.id = `prize-row-${idx}`;
  div.innerHTML = `
    <div class="row-header">
      <span class="row-label">Prize #${count}</span>
      <button type="button" class="btn-remove-row" onclick="removePrizeRow(${idx})">✕ Remove</button>
    </div>
    <div class="row-fields four-col">
      <div class="form-group" style="margin-bottom:0;"><label style="font-size:0.75rem;">Rank Label</label><input type="text" data-field="rank" value="${rank}" placeholder="e.g. 1st Prize"></div>
      <div class="form-group" style="margin-bottom:0;"><label style="font-size:0.75rem;">Amount</label><input type="text" data-field="amount" value="${amount}" placeholder="e.g. ₹5,000"></div>
      <div class="form-group" style="margin-bottom:0;"><label style="font-size:0.75rem;">Winners</label><input type="number" data-field="winners" value="${winners}" min="1" placeholder="1"></div>
      <div class="form-group" style="margin-bottom:0;"><label style="font-size:0.75rem;">Emoji</label><input type="text" data-field="emoji" value="${emoji}" placeholder="🏆"></div>
    </div>
  `;
  container.appendChild(div);
  updateRemoveButtons('prizesContainer');
}

function removePrizeRow(idx) {
  const row = document.getElementById(`prize-row-${idx}`);
  if (row) row.remove();
  renumberRows('prizesContainer', 'Prize');
  updateRemoveButtons('prizesContainer');
}

// ── CATEGORIES ──
let categoryCounter = 0;
function addCategoryRow(categoryName = '') {
  categoryCounter++;
  const idx = categoryCounter;
  const container = document.getElementById('categoriesContainer');
  
  const div = document.createElement('div');
  div.className = 'dynamic-row';
  div.id = `category-row-${idx}`;
  div.innerHTML = `
    <div class="row-header">
      <span class="row-label">Category / Sub-type</span>
      <button type="button" class="btn-remove-row" onclick="removeCategoryRow(${idx})">✕ Remove</button>
    </div>
    <div class="row-fields">
      <div class="form-group" style="margin-bottom:0;"><input type="text" data-field="categoryName" value="${categoryName}" placeholder="e.g. Modern, Classical, Hindi"></div>
    </div>
  `;
  container.appendChild(div);
}

function removeCategoryRow(idx) {
  const row = document.getElementById(`category-row-${idx}`);
  if (row) row.remove();
}

function collectCategories() {
  const rows = document.getElementById('categoriesContainer').children;
  return Array.from(rows).map(row => row.querySelector('[data-field="categoryName"]').value.trim()).filter(Boolean);
}

// ── STEPS ──
function addStepRow(data = {}) {
  stepCounter++;
  const idx = stepCounter;
  const container = document.getElementById('stepsContainer');
  const count = container.children.length + 1;
  const title = data.title || '';
  const description = data.description || '';

  const div = document.createElement('div');
  div.className = 'dynamic-row';
  div.id = `step-row-${idx}`;
  div.innerHTML = `
    <div class="row-header">
      <span class="row-label">Step ${count}</span>
      <button type="button" class="btn-remove-row" onclick="removeStepRow(${idx})">✕ Remove</button>
    </div>
    <div class="row-fields">
      <div class="form-group" style="margin-bottom:0;"><label style="font-size:0.75rem;">Step Title</label><input type="text" data-field="title" value="${title}" placeholder="e.g. Register & Pay"></div>
      <div class="form-group" style="margin-bottom:0;"><label style="font-size:0.75rem;">Description</label><input type="text" data-field="description" value="${description}" placeholder="Brief description of this step"></div>
    </div>
  `;
  container.appendChild(div);
}

function removeStepRow(idx) {
  const row = document.getElementById(`step-row-${idx}`);
  if (row) row.remove();
  renumberRows('stepsContainer', 'Step');
}

// ── JUDGES ──
function addJudgeRow(data = {}) {
  judgeCounter++;
  const idx = judgeCounter;
  const container = document.getElementById('judgesContainer');
  const count = container.children.length + 1;
  const name = data.name || '';
  const designation = data.designation || '';
  const photo = data.photo || '';
  const photoPublicId = data.photoPublicId || '';

  const div = document.createElement('div');
  div.className = 'dynamic-row';
  div.id = `judge-row-${idx}`;
  div.innerHTML = `
    <div class="row-header">
      <span class="row-label">Judge ${count}</span>
      <button type="button" class="btn-remove-row" onclick="removeJudgeRow(${idx})">✕ Remove</button>
    </div>
    <div class="judge-row-content">
      <div class="judge-photo-area" id="judge-photo-area-${idx}" title="Click to upload photo">
        ${photo ? `<img src="${photo}" alt="Judge photo">` : '<span class="photo-placeholder">📷</span>'}
        <input type="file" accept=".jpg,.jpeg,.png,.webp" onchange="uploadJudgePhoto(${idx}, this)">
      </div>
      <div class="judge-row-fields">
        <div class="form-group" style="margin-bottom:0;"><label style="font-size:0.75rem;">Name *</label><input type="text" data-field="name" value="${name}" placeholder="Judge's full name"></div>
        <div class="form-group" style="margin-bottom:0;"><label style="font-size:0.75rem;">Designation</label><input type="text" data-field="designation" value="${designation}" placeholder="e.g. Art Professor"></div>
      </div>
    </div>
    <input type="hidden" data-field="photo" value="${photo}">
    <input type="hidden" data-field="photoPublicId" value="${photoPublicId}">
  `;
  container.appendChild(div);
}

function removeJudgeRow(idx) {
  const row = document.getElementById(`judge-row-${idx}`);
  if (row) row.remove();
  renumberRows('judgesContainer', 'Judge');
}

let judgePhotosUploading = 0;

async function uploadJudgePhoto(idx, input) {
  const file = input.files[0];
  if (!file) return;
  const area = document.getElementById(`judge-photo-area-${idx}`);
  area.innerHTML = '<span class="photo-placeholder" style="font-size:0.7rem;color:var(--text-muted);">Uploading…</span>';

  judgePhotosUploading++;
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Uploading photo...';

  try {
    const fd = new FormData();
    fd.append('photo', file);
    const res = await fetch('/api/admin/judge-photo', {
      method: 'POST',
      headers: { 'x-admin-token': TOKEN },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    area.innerHTML = `<img src="${data.url}" alt="Judge photo"><input type="file" accept=".jpg,.jpeg,.png,.webp" onchange="uploadJudgePhoto(${idx}, this)">`;
    const row = document.getElementById(`judge-row-${idx}`);
    row.querySelector('[data-field="photo"]').value = data.url;
    row.querySelector('[data-field="photoPublicId"]').value = data.publicId;
  } catch (err) {
    area.innerHTML = `<span class="photo-placeholder">📷</span><input type="file" accept=".jpg,.jpeg,.png,.webp" onchange="uploadJudgePhoto(${idx}, this)">`;
    alert('Photo upload failed: ' + err.message);
  } finally {
    judgePhotosUploading--;
    if (judgePhotosUploading <= 0) {
      judgePhotosUploading = 0;
      saveBtn.disabled = false;
      saveBtn.textContent = document.getElementById('editId').value ? 'Save Changes' : 'Create Competition';
    }
  }
}

// ── RULES ──
function addRuleRow(text = '') {
  ruleCounter++;
  const idx = ruleCounter;
  const container = document.getElementById('rulesContainer');
  const count = container.children.length + 1;

  const div = document.createElement('div');
  div.className = 'dynamic-row';
  div.id = `rule-row-${idx}`;
  div.innerHTML = `
    <div class="row-header">
      <span class="row-label">Rule ${count}</span>
      <button type="button" class="btn-remove-row" onclick="removeRuleRow(${idx})">✕ Remove</button>
    </div>
    <div class="form-group" style="margin-bottom:0;"><input type="text" data-field="rule" value="${text}" placeholder="Enter a rule or guideline…"></div>
  `;
  container.appendChild(div);
}

function removeRuleRow(idx) {
  const row = document.getElementById(`rule-row-${idx}`);
  if (row) row.remove();
  renumberRows('rulesContainer', 'Rule');
}

// ── Shared Helpers ──
function renumberRows(containerId, label) {
  const container = document.getElementById(containerId);
  Array.from(container.children).forEach((row, i) => {
    const lbl = row.querySelector('.row-label');
    if (lbl) lbl.textContent = `${label} #${i + 1}`;
  });
}

function updateRemoveButtons(containerId) {
  const container = document.getElementById(containerId);
  const rows = container.children;
  // If only 1 row, hide its remove button (at least 1 prize required)
  Array.from(rows).forEach(row => {
    const btn = row.querySelector('.btn-remove-row');
    if (btn) btn.style.display = rows.length <= 1 ? 'none' : '';
  });
}

// ── Collect dynamic data ──
function collectPrizes() {
  const rows = document.getElementById('prizesContainer').children;
  return Array.from(rows).map(row => ({
    rank: row.querySelector('[data-field="rank"]').value.trim(),
    amount: row.querySelector('[data-field="amount"]').value.trim(),
    winners: parseInt(row.querySelector('[data-field="winners"]').value) || 1,
    emoji: row.querySelector('[data-field="emoji"]').value.trim() || '🏆',
  })).filter(p => p.rank || p.amount);
}

function collectSteps() {
  const rows = document.getElementById('stepsContainer').children;
  return Array.from(rows).map(row => ({
    title: row.querySelector('[data-field="title"]').value.trim(),
    description: row.querySelector('[data-field="description"]').value.trim(),
  })).filter(s => s.title);
}

function collectJudges() {
  const rows = document.getElementById('judgesContainer').children;
  return Array.from(rows).map(row => ({
    name: row.querySelector('[data-field="name"]').value.trim(),
    designation: row.querySelector('[data-field="designation"]').value.trim(),
    photo: row.querySelector('[data-field="photo"]').value,
    photoPublicId: row.querySelector('[data-field="photoPublicId"]').value,
  })).filter(j => j.name);
}

function collectRules() {
  const rows = document.getElementById('rulesContainer').children;
  return Array.from(rows).map(row => row.querySelector('[data-field="rule"]').value.trim()).filter(Boolean);
}

// ══════════════════════════════════════════
// CREATE / EDIT MODAL
// ══════════════════════════════════════════

function resetDynamicSections() {
  document.getElementById('prizesContainer').innerHTML = '';
  document.getElementById('stepsContainer').innerHTML = '';
  document.getElementById('judgesContainer').innerHTML = '';
  document.getElementById('rulesContainer').innerHTML = '';
  prizeCounter = 0;
  stepCounter = 0;
  judgeCounter = 0;
  ruleCounter = 0;
}

function resetFeaturedImage() {
  pendingFeaturedImage = null;
  const area = document.getElementById('featuredUploadArea');
  const preview = document.getElementById('featuredPreview');
  area.classList.remove('has-preview');
  preview.innerHTML = `
    <span class="featured-upload-icon">📸</span>
    <p class="featured-upload-text"><strong>Click to upload</strong> · JPG, PNG or WebP · Recommended 1200×600</p>
  `;
  document.getElementById('featuredImageInput').value = '';
}

function openCreateModal() {
  document.getElementById('editId').value = '';
  document.getElementById('modalTitle').textContent = 'New Competition';
  document.getElementById('saveBtn').textContent = 'Create Competition';
  document.getElementById('compForm').reset();
  document.getElementById('compFee').value = 99;
  document.getElementById('compOnlinePayment').checked = true;
  togglePaymentFields();
  
  document.getElementById('compAllowGroup').checked = false;
  document.getElementById('compGroupFee').value = 199;
  document.getElementById('compMaxGroupMembers').value = 5;
  document.getElementById('compGroupPrize').value = '';
  toggleGroupFields();

  document.getElementById('categoriesContainer').innerHTML = '';
  
  document.getElementById('compHasJudges').checked = false;
  toggleJudges();
  document.getElementById('compPublished').checked = false;
  togglePublished();
  hideErr('modalError');
  resetDynamicSections();
  resetFeaturedImage();
  // Add default 1st prize row
  addPrizeRow({ rank: '1st Prize', emoji: '🥇' });
  document.getElementById('compModal').classList.add('active');
}

function openEditModal(id) {
  const c = allComps.find(x => x._id === id);
  if (!c) return;
  document.getElementById('editId').value = id;
  document.getElementById('modalTitle').textContent = 'Edit Competition';
  document.getElementById('saveBtn').textContent = 'Save Changes';
  document.getElementById('compTitle').value = c.title || '';
  document.getElementById('compSlug').value = c.slug || '';
  document.getElementById('compType').value = c.type || 'art';
  document.getElementById('compShortDesc').value = c.shortDescription || '';
  document.getElementById('compDesc').value = c.description || '';
  document.getElementById('compFee').value = c.entryFee ? c.entryFee / 100 : 0;
  document.getElementById('compPrizePool').value = c.totalPrizePool || '';
  document.getElementById('compStatus').value = c.status || 'draft';
  document.getElementById('compPublished').checked = c.isPublished || false;
  togglePublished();
  document.getElementById('compBadges').value = (c.badges || []).join(', ');

  document.getElementById('compAllowGroup').checked = c.allowGroupRegistration || false;
  document.getElementById('compGroupFee').value = c.groupEntryFee ? c.groupEntryFee / 100 : 0;
  document.getElementById('compMaxGroupMembers').value = c.maxGroupMembers || 5;
  document.getElementById('compGroupPrize').value = c.groupPrizeAmount || '';
  toggleGroupFields();

  // Payment toggle
  const isOnline = c.onlinePayment !== false; // default true
  document.getElementById('compOnlinePayment').checked = isOnline;
  togglePaymentFields();
  if (!isOnline) {
    document.getElementById('compOfflineFeeLabel').value = c.offlineFeeLabel || '';
  }

  document.getElementById('compHasJudges').checked = c.hasJudges === true;
  toggleJudges();

  if (c.submissionDeadline) {
    const d = new Date(c.submissionDeadline);
    const dateStr = d.toISOString().slice(0, 16);
    document.getElementById('compDeadline').value = dateStr;
    document.getElementById('compDeadlineOffline').value = dateStr;
  }

  if (c.eventDate) {
    document.getElementById('compEventDate').value = new Date(c.eventDate).toISOString().slice(0, 16);
  } else {
    document.getElementById('compEventDate').value = '';
  }

  // Featured image
  resetFeaturedImage();
  if (c.coverImage) {
    const area = document.getElementById('featuredUploadArea');
    const preview = document.getElementById('featuredPreview');
    preview.innerHTML = `<img src="${cloudinaryUrl(c.coverImage, 'cover')}" alt="Current featured image">`;
    area.classList.add('has-preview');
  }

  // Populate dynamic sections
  resetDynamicSections();

  // Prizes
  if (c.prizes && c.prizes.length > 0) {
    c.prizes.forEach(p => addPrizeRow(p));
  } else {
    addPrizeRow({ rank: '1st Prize', emoji: '🥇' });
  }

  // Steps
  if (c.steps && c.steps.length > 0) {
    c.steps.forEach(s => addStepRow(s));
  }

  // Judges
  if (c.judges && c.judges.length > 0) {
    c.judges.forEach(j => addJudgeRow(j));
  } else if (c.hasJudges) {
    addJudgeRow();
  }

  // Categories
  document.getElementById('categoriesContainer').innerHTML = '';
  if (c.categories && c.categories.length > 0) {
    c.categories.forEach(cat => addCategoryRow(cat));
  }

  // Rules
  if (c.rules && c.rules.length > 0) {
    c.rules.forEach(r => addRuleRow(r));
  }

  hideErr('modalError');
  document.getElementById('compModal').classList.add('active');
}

function closeModal() { document.getElementById('compModal').classList.remove('active'); }

async function saveCompetition(e) {
  e.preventDefault();
  hideErr('modalError');

  const prizes = collectPrizes();
  if (prizes.length === 0) {
    showErr('modalError', 'Please add at least one prize.');
    return;
  }

  const isOnlinePayment = document.getElementById('compOnlinePayment').checked;
  const hasJudges = document.getElementById('compHasJudges').checked;
  const id = document.getElementById('editId').value;
  
  const judges = collectJudges();
  if (hasJudges && judges.length === 0) {
    showErr('modalError', 'Please add at least one judge if the judges section is enabled.');
    return;
  }
  if (hasJudges) {
    for (let j of judges) {
      if (!j.name || (!j.photo && !j.photoPublicId)) {
        showErr('modalError', 'All judges must have a name and a photo.');
        return;
      }
    }
  }

  const allowGroupRegistration = document.getElementById('compAllowGroup').checked;
  const groupPrizeAmount = document.getElementById('compGroupPrize').value.trim();
  if (allowGroupRegistration && !groupPrizeAmount) {
    showErr('modalError', 'Please mention the Group Prize Winner Amount since group registration is enabled.');
    return;
  }

  // Get the deadline from the appropriate field
  let deadlineValue;
  if (isOnlinePayment) {
    deadlineValue = document.getElementById('compDeadline').value;
  } else {
    deadlineValue = document.getElementById('compDeadlineOffline').value;
  }
  if (!deadlineValue) {
    showErr('modalError', 'Please set a submission deadline.');
    return;
  }

  const body = {
    title: document.getElementById('compTitle').value.trim(),
    slug: document.getElementById('compSlug').value.trim() || undefined,
    type: document.getElementById('compType').value,
    shortDescription: document.getElementById('compShortDesc').value.trim(),
    description: document.getElementById('compDesc').value.trim(),
    entryFee: isOnlinePayment ? ((parseInt(document.getElementById('compFee').value) || 0) * 100) : 0,
    totalPrizePool: document.getElementById('compPrizePool').value.trim(),
    submissionDeadline: new Date(deadlineValue).toISOString(),
    status: document.getElementById('compStatus').value,
    isPublished: document.getElementById('compPublished').checked,
    badges: document.getElementById('compBadges').value.split(',').map(s => s.trim()).filter(Boolean),
    prizes: prizes,
    steps: collectSteps(),
    judges: hasJudges ? judges : [],
    hasJudges: hasJudges,
    allowGroupRegistration: document.getElementById('compAllowGroup').checked,
    groupEntryFee: (parseInt(document.getElementById('compGroupFee').value) || 0) * 100,
    maxGroupMembers: parseInt(document.getElementById('compMaxGroupMembers').value) || 5,
    groupPrizeAmount: document.getElementById('compGroupPrize').value.trim(),
    categories: collectCategories(),
    rules: collectRules(),
    onlinePayment: isOnlinePayment,
    offlineFeeLabel: !isOnlinePayment ? (document.getElementById('compOfflineFeeLabel').value.trim() || '') : '',
    eventDate: document.getElementById('compEventDate').value ? new Date(document.getElementById('compEventDate').value).toISOString() : null,
  };

  const saveBtn = document.getElementById('saveBtn');
  const originalBtnText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving Competition...';

  try {
    const url = id ? `/api/admin/competitions/${id}` : '/api/admin/competitions';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: headers(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save.');

    // Upload featured image if pending
    const compId = data._id || id;
    if (pendingFeaturedImage && compId) {
      saveBtn.textContent = 'Uploading Cover Image...';
      await uploadFeaturedImage(compId);
    }

    closeModal();
    loadComps();
  } catch (err) {
    showErr('modalError', err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalBtnText;
  }
}

// ── Delete ──
async function deleteComp(id, title) {
  if (!confirm(`Delete "${title}" and ALL its entries? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/admin/competitions/${id}`, { method: 'DELETE', headers: { 'x-admin-token': TOKEN } });
    if (!res.ok) throw new Error('Delete failed');
    loadComps();
    document.getElementById('entriesCard').style.display = 'none';
  } catch (err) { alert(err.message); }
}

// ── View Entries ──
function switchEntriesTab(tab) {
  const isGroup = tab === 'group';
  document.getElementById('singleEntriesTableWrap').style.display = isGroup ? 'none' : '';
  document.getElementById('groupEntriesTableWrap').style.display = isGroup ? '' : 'none';
  
  document.getElementById('tabSingle').className = isGroup ? 'btn-outline' : 'btn-outline active';
  document.getElementById('tabSingle').style.borderColor = isGroup ? 'var(--border)' : 'var(--orange)';
  document.getElementById('tabSingle').style.color = isGroup ? 'var(--text-mid)' : 'var(--orange)';

  document.getElementById('tabGroup').className = isGroup ? 'btn-outline active' : 'btn-outline';
  document.getElementById('tabGroup').style.borderColor = isGroup ? 'var(--orange)' : 'var(--border)';
  document.getElementById('tabGroup').style.color = isGroup ? 'var(--orange)' : 'var(--text-mid)';
}

async function viewEntries(compId, title) {
  const card = document.getElementById('entriesCard');
  document.getElementById('entriesTitle').textContent = `Entries — ${title}`;
  card.style.display = '';
  document.getElementById('entriesTable').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;">Loading…</td></tr>';
  document.getElementById('groupEntriesTable').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;">Loading…</td></tr>';
  card.scrollIntoView({ behavior: 'smooth' });

  const comp = allComps.find(c => c._id === compId);
  const allowGroup = comp && comp.allowGroupRegistration;

  if (allowGroup) {
    document.getElementById('entriesTabs').style.display = 'flex';
    switchEntriesTab('single');
  } else {
    document.getElementById('entriesTabs').style.display = 'none';
    document.getElementById('singleEntriesTableWrap').style.display = '';
    document.getElementById('groupEntriesTableWrap').style.display = 'none';
  }

  try {
    const res = await fetch(`/api/admin/entries?competitionId=${compId}`, { headers: { 'x-admin-token': TOKEN } });
    const data = await res.json();
    const entries = data.entries || [];
    
    const singleEntries = entries.filter(e => e.registrationType !== 'group');
    const groupEntries = entries.filter(e => e.registrationType === 'group');

    // Single Entries Render
    if (singleEntries.length === 0) {
      document.getElementById('entriesTable').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text-muted);">No single entries yet.</td></tr>';
    } else {
      document.getElementById('entriesTable').innerHTML = singleEntries.map(e => {
        const paymentColor = e.paymentStatus === 'paid' ? 'background:#DCFCE7;color:#166534;' : e.paymentStatus === 'offline' ? 'background:#EFF6FF;color:#1E40AF;' : 'background:#FEF2F2;color:#DC2626;';
        const paymentLabel = e.paymentStatus === 'offline' ? 'Offline' : e.paymentStatus;
        return `
        <tr>
          <td><strong>${e.name}</strong></td>
          <td>${e.email}</td>
          <td>${e.phone}</td>
          <td><span class="pill" style="background:#F3F4F6;color:#4B5563;">${e.category || '-'}</span></td>
          <td><span class="pill" style="${paymentColor}">${paymentLabel}</span></td>
          <td>${e.hasSubmittedArtwork ? `<a href="${cloudinaryUrl(e.artworkUrl, 'artwork')}" target="_blank" style="color:var(--orange);">View</a>` : '<span style="color:var(--text-muted);">Pending</span>'}</td>
          <td>${formatDate(e.registeredAt)}</td>
        </tr>
      `}).join('');
    }

    // Group Entries Render
    if (groupEntries.length === 0) {
      document.getElementById('groupEntriesTable').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1.5rem;color:var(--text-muted);">No group entries yet.</td></tr>';
    } else {
      document.getElementById('groupEntriesTable').innerHTML = groupEntries.map(e => {
        const paymentColor = e.paymentStatus === 'paid' ? 'background:#DCFCE7;color:#166534;' : e.paymentStatus === 'offline' ? 'background:#EFF6FF;color:#1E40AF;' : 'background:#FEF2F2;color:#DC2626;';
        const paymentLabel = e.paymentStatus === 'offline' ? 'Offline' : e.paymentStatus;
        
        const feeText = comp.onlinePayment === false ? (comp.offlineFeeLabel || 'Offline') : formatFee(comp.groupEntryFee);
        const membersList = (e.groupMembers || []).map(m => `<div><span style="color:var(--text-muted); font-size:0.75rem;">•</span> ${m.name}${m.isLeader ? ' <span style="color:var(--orange); font-size:0.7rem; font-weight:600;">Leader</span>' : ''}</div>`).join('');
        
        return `
        <tr>
          <td><strong>${e.name}</strong></td>
          <td><span class="pill" style="background:#F3F4F6;color:#4B5563;">${e.category || '-'}</span></td>
          <td>
            <div style="font-size:0.85rem;">${e.phone}</div>
            ${e.email ? `<div style="font-size:0.75rem; color:var(--text-muted);">${e.email}</div>` : ''}
          </td>
          <td><span style="font-size:0.85rem; font-weight:600;">${feeText}</span></td>
          <td>
            <div style="font-size:0.8rem; line-height:1.4;">
              ${membersList}
            </div>
          </td>
          <td><span class="pill" style="${paymentColor}">${paymentLabel}</span></td>
          <td>${e.hasSubmittedArtwork ? `<a href="${cloudinaryUrl(e.artworkUrl, 'artwork')}" target="_blank" style="color:var(--orange);">View</a>` : '<span style="color:var(--text-muted);">Pending</span>'}</td>
        </tr>
      `}).join('');
    }
  } catch { 
    document.getElementById('entriesTable').innerHTML = '<tr><td colspan="6" style="text-align:center;color:#DC2626;">Failed to load.</td></tr>'; 
    document.getElementById('groupEntriesTable').innerHTML = '<tr><td colspan="6" style="text-align:center;color:#DC2626;">Failed to load.</td></tr>'; 
  }
}
