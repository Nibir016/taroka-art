// ══════════════════════════════════════════
// Taroka — Homepage Logic
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

const TYPE_LABELS = { art: '🎨 Art', photography: '📷 Photography', writing: '✍️ Writing', quiz: '🧠 Quiz', dance: '💃 Dance', music: '🎵 Music', song: '🎤 Song', modeling: '🌟 Modeling', craft: '🧶 Craft', cooking: '🍳 Cooking', general: '🌟 General' };
const STATUS_LABELS = { ongoing: 'Ongoing', upcoming: 'Upcoming', judging: 'Judging', completed: 'Completed' };

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatFee(paise) {
  if (!paise || paise === 0) return 'Free';
  return '₹' + (paise / 100).toLocaleString('en-IN');
}

function createCompCard(comp) {
  const statusClass = `status-${comp.status}`;
  const imgSrc = cloudinaryUrl(comp.coverImage, 'cover') || `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="%23FEF3E2"/><text x="200" y="105" text-anchor="middle" fill="%23D97706" font-size="40">' + (TYPE_LABELS[comp.type] || '🌟').split(' ')[0] + '</text></svg>')}`;

  return `
    <a href="/competition?slug=${comp.slug}" class="comp-card" id="comp-${comp.slug}">
      <div class="comp-card-img">
        <div class="comp-card-badges">
          <span class="pill" style="color:var(--orange);">${TYPE_LABELS[comp.type] || comp.type}</span>
          <span class="pill ${statusClass}">${STATUS_LABELS[comp.status] || comp.status}</span>
        </div>
        <img src="${imgSrc}" alt="${comp.title}" loading="lazy"
             onerror="this.style.background='linear-gradient(135deg,#FFF7ED,#FEF3E2)'; this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="%23FEF3E2"/><text x="200" y="110" text-anchor="middle" fill="%23D97706" font-family="serif" font-size="24">Taroka</text></svg>')}';">
      </div>
      <div class="comp-card-content">
        <h3>${comp.title}</h3>
        <p class="comp-card-desc">${comp.shortDescription || comp.description || ''}</p>
        <div class="comp-card-meta">
          ${comp.totalPrizePool ? `<span class="comp-card-prize">🏆 ${comp.totalPrizePool}</span>` : ''}
          <span>📅 ${formatDate(comp.submissionDeadline)}</span>
          ${comp.onlinePayment === false ? `<span style="color:#1E40AF;">💳 Offline</span>` : `<span>💰 ${formatFee(comp.entryFee)}</span>`}
        </div>
      </div>
    </a>
  `;
}

async function loadCompetitions() {
  try {
    const res = await fetch('/api/competitions');
    const data = await res.json();
    const comps = data.competitions || [];

    const ongoing = comps.filter(c => c.status === 'ongoing' || c.status === 'judging');
    const upcoming = comps.filter(c => c.status === 'upcoming');
    const completed = comps.filter(c => c.status === 'completed');

    // Ongoing
    const ongoingGrid = document.getElementById('ongoingGrid');
    const ongoingEmpty = document.getElementById('ongoingEmpty');
    if (ongoing.length > 0) {
      ongoingGrid.innerHTML = ongoing.map(createCompCard).join('');
      ongoingEmpty.style.display = 'none';
    } else {
      ongoingGrid.innerHTML = '';
      ongoingEmpty.style.display = '';
    }

    // Upcoming
    const upcomingSection = document.getElementById('upcomingSection');
    if (upcoming.length > 0) {
      upcomingSection.style.display = '';
      document.getElementById('upcomingGrid').innerHTML = upcoming.map(createCompCard).join('');
    }

    // Completed
    const completedSection = document.getElementById('completedSection');
    if (completed.length > 0) {
      completedSection.style.display = '';
      document.getElementById('completedGrid').innerHTML = completed.map(createCompCard).join('');
    }

  } catch (err) {
    console.error('Failed to load competitions:', err);
    document.getElementById('ongoingGrid').innerHTML = '';
    document.getElementById('ongoingEmpty').style.display = '';
  }
}

// Load on page ready
loadCompetitions();

// Scroll Reveal Animation
document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        // Optional: unobserve if you only want it to animate once
        // observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});
