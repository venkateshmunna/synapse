let currentDebateResult = null;
let currentMode = 'standard';

// Engine configurations dictionary
const ENGINE_MODELS = {
  groq: {
    name: "Groq Cloud (Fast)",
    privacyTag: '<span class="chip-dot" style="background:var(--accent);"></span>Cloud Active',
    alpha: { name: "GPT-OSS 20B", role: "Agent Alpha", reb: "GPT-OSS Rebuttal" },
    beta:  { name: "Qwen 3.8 27B", role: "Agent Beta",  reb: "Qwen Rebuttal" },
    gamma: { name: "Allam 2 7B",  role: "Agent Gamma", reb: "Allam Rebuttal" },
    judge: "GPT-OSS 120B"
  },
  ollama: {
    name: "Ollama Local (100% Private)",
    privacyTag: '<span class="chip-dot" style="background:var(--accent3);"></span>100% Local (Ollama)',
    alpha: { name: "Llama 3.2 3B", role: "Agent Alpha", reb: "Llama 3.2 Rebuttal" },
    beta:  { name: "Qwen 2.5 3B",  role: "Agent Beta",  reb: "Qwen 2.5 Rebuttal" },
    gamma: { name: "Gemma 2 2B",   role: "Agent Gamma", reb: "Gemma 2 Rebuttal" },
    judge: "Llama 3.2 3B"
  }
};

function applyEngineUI(engineKey) {
  const cfg = ENGINE_MODELS[engineKey] || ENGINE_MODELS.groq;

  // 1. Sync dropdowns
  const s1 = document.getElementById('engine-selector');
  const s2 = document.getElementById('settings-engine-mode');
  if (s1) s1.value = engineKey;
  if (s2) s2.value = engineKey;

  // 2. Sync Privacy Tag
  const tag = document.getElementById('privacy-tag');
  if (tag) tag.innerHTML = cfg.privacyTag;

  // 3. Sync Models Bar
  const names = document.querySelectorAll('.model-name');
  if (names.length >= 3) {
    names[0].textContent = cfg.alpha.name;
    names[1].textContent = cfg.beta.name;
    names[2].textContent = cfg.gamma.name;
  }

  // 4. Sync Round 1 Arena Headers
  const r1Cards = document.querySelectorAll('#round1-section .agent-card');
  if (r1Cards.length >= 3) {
    r1Cards[0].querySelector('.agent-header div div:first-child').textContent = cfg.alpha.name;
    r1Cards[1].querySelector('.agent-header div div:first-child').textContent = cfg.beta.name;
    r1Cards[2].querySelector('.agent-header div div:first-child').textContent = cfg.gamma.name;
  }

  // 5. Sync Round 2 Arena Headers
  const r2Cards = document.querySelectorAll('#round2-section .agent-card');
  if (r2Cards.length >= 3) {
    r2Cards[0].querySelector('.agent-header div div:first-child').textContent = cfg.alpha.reb;
    r2Cards[1].querySelector('.agent-header div div:first-child').textContent = cfg.beta.reb;
    r2Cards[2].querySelector('.agent-header div div:first-child').textContent = cfg.gamma.reb;
  }

  // 6. Sync Scoreboard Names
  const scoreNames = document.querySelectorAll('.score-agent-name');
  if (scoreNames.length >= 3) {
    scoreNames[0].textContent = `α ${cfg.alpha.name}`;
    scoreNames[1].textContent = `β ${cfg.beta.name}`;
    scoreNames[2].textContent = `γ ${cfg.gamma.name}`;
  }

  // 7. Save preference to localStorage
  localStorage.setItem('synapse_engine_pref', engineKey);
}

function showPage(id) {
  // Enforce mandatory login before loading protected routes
  if (typeof RouteGuard !== 'undefined' && !RouteGuard.check(id)) {
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + id);
  if (target) {
    target.classList.add('active');
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(`'${id}'`));
  });

  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('onclick')?.includes(`'${id}'`));
  });

  if (id === 'history') renderHistoryList();
  if (id === 'saved') renderSavedList();
  if (id === 'explore') renderExploreGrid();
  if (id === 'leaderboard') updateDynamicLeaderboard();
  if (id === 'profile' || id === 'analytics') updateProfileStats();
}

function toggleDropdown(header) {
  const content = header.nextElementSibling;
  const toggle = header.querySelector('.dropdown-toggle');
  if (content) {
    content.classList.toggle('active');
    if (toggle) toggle.classList.toggle('active');
  }
}

function setMode(mode) {
  currentMode = mode;
  ['standard', 'deep', 'quick'].forEach(m => {
    document.getElementById('mode-' + m)?.classList.toggle('active', m === mode);
  });
}

function setStatus(i, state) {
  const el = document.getElementById('status-' + i);
  if (!el) return;
  el.className = 'model-status';
  if (state === 'thinking') { el.classList.add('status-thinking'); el.textContent = 'THINKING'; }
  else if (state === 'done') { el.classList.add('status-done'); el.textContent = 'DONE'; }
  else { el.classList.add('status-ready'); el.textContent = 'READY'; }
}

async function executeDebateFlow() {
  const qInput = document.getElementById('question-input');
  const question = qInput ? qInput.value.trim() : '';
  if (!question) {
    alert('Please enter a motion or question to debate.');
    return;
  }

  const engineSelect = document.getElementById('engine-selector');
  const engine = engineSelect ? engineSelect.value : 'groq';
  const startBtn = document.getElementById('debate-btn');

  startBtn.disabled = true;
  startBtn.textContent = '⏳ Debating...';

  for (let i = 1; i <= 3; i++) {
    setStatus(i, 'thinking');
    const ph = document.getElementById('placeholder-' + i);
    const txt = document.getElementById('agent-text-' + i);
    if (ph) { ph.style.display = 'block'; ph.textContent = 'Analyzing motion...'; }
    if (txt) { txt.style.display = 'none'; txt.textContent = ''; }
  }

  document.getElementById('round-1-pill')?.classList.add('active');
  document.getElementById('round-2-pill')?.classList.remove('active', 'done');
  document.getElementById('round-judge-pill')?.classList.remove('active', 'done');
  document.getElementById('round2-section').style.display = 'none';
  document.getElementById('score-section').style.display = 'none';
  document.getElementById('final-section').style.display = 'none';

  try {
    const res = await API.runDebate(question, engine);

    // ── ROUND 1 RENDER ──
    document.getElementById('placeholder-1').style.display = 'none';
    document.getElementById('placeholder-2').style.display = 'none';
    document.getElementById('placeholder-3').style.display = 'none';

    const t1 = document.getElementById('agent-text-1');
    const t2 = document.getElementById('agent-text-2');
    const t3 = document.getElementById('agent-text-3');

    t1.style.display = 'block'; t1.textContent = res.round1.alpha;
    t2.style.display = 'block'; t2.textContent = res.round1.beta;
    t3.style.display = 'block'; t3.textContent = res.round1.gamma;

    for (let i = 1; i <= 3; i++) setStatus(i, 'done');
    document.getElementById('round-1-pill')?.classList.add('done');

    // ── ROUND 2 RENDER ──
    document.getElementById('round-2-pill')?.classList.add('active');
    document.getElementById('round2-section').style.display = 'block';
    document.getElementById('rebuttal-1').textContent = res.round2.alpha;
    document.getElementById('rebuttal-2').textContent = res.round2.beta;
    document.getElementById('rebuttal-3').textContent = res.round2.gamma;
    document.getElementById('round-2-pill')?.classList.add('done');

    // ── JUDGE & SCORES ──
    document.getElementById('round-judge-pill')?.classList.add('active');
    document.getElementById('score-section').style.display = 'block';

    const renderScoreboardAgent = (containerId, totalId, metrics, color) => {
      const el = document.getElementById(containerId);
      if (!el || !metrics) return;
      const keys = ['factual', 'clarity', 'depth', 'originality'];
      el.innerHTML = keys.map(k => `
        <div class="score-metric">
          <span style="text-transform:capitalize;">${k}</span>
          <div class="score-bar-wrap">
            <div class="score-bar-fill" style="width:${(metrics[k]||7)*10}%;background:${color};"></div>
          </div>
        </div>
      `).join('');
      const total = ((metrics.factual + metrics.clarity + metrics.depth + metrics.originality) / 4).toFixed(1);
      document.getElementById(totalId).textContent = total;
    };

    renderScoreboardAgent('scores-1', 'total-1', res.evaluation.scores.A, 'var(--llm1)');
    renderScoreboardAgent('scores-2', 'total-2', res.evaluation.scores.B, 'var(--llm2)');
    renderScoreboardAgent('scores-3', 'total-3', res.evaluation.scores.C, 'var(--llm3)');

    // ── FINAL SYNTHESIS ──
    const cfg = ENGINE_MODELS[engine] || ENGINE_MODELS.groq;
    document.getElementById('final-section').style.display = 'block';
    document.getElementById('final-text').textContent = res.evaluation.synthesis;
    document.getElementById('final-attribution').innerHTML = `
      <span class="attr-tag" style="background:rgba(0,212,255,0.1);color:var(--llm1);">α ${cfg.alpha.name}</span>
      <span class="attr-tag" style="background:rgba(0,255,157,0.1);color:var(--llm2);">β ${cfg.beta.name}</span>
      <span class="attr-tag" style="background:rgba(168,85,247,0.1);color:var(--llm3);">γ ${cfg.gamma.name}</span>
    `;

    document.getElementById('round-judge-pill')?.classList.add('done');

    currentDebateResult = {
      question,
      mode: engine,
      r1: res.round1,
      r2: res.round2,
      scores: res.evaluation.scores,
      synthesis: res.evaluation.synthesis,
      timestamp: new Date().toISOString()
    };
    await API.persistDebate(currentDebateResult);
    updateBadgesAndStats();
    updateDynamicLeaderboard();

  } catch (err) {
    alert(`Execution Error: ${err.message}`);
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = '⚔ Start Debate';
  }
}

function updateDynamicLeaderboard() {
  const history = JSON.parse(localStorage.getItem('synapse_history') || '[]');
  
  let totals = {
    qwen: { factual: 9.3, clarity: 8.9, depth: 9.5, count: 1 },
    gpt: { factual: 8.8, clarity: 9.2, depth: 8.5, count: 1 },
    allam: { factual: 8.4, clarity: 8.7, depth: 8.6, count: 1 }
  };

  history.forEach(item => {
    if (item.scores) {
      if (item.scores.B) {
        totals.qwen.factual += item.scores.B.factual || 9;
        totals.qwen.clarity += item.scores.B.clarity || 9;
        totals.qwen.depth += item.scores.B.depth || 9;
        totals.qwen.count++;
      }
      if (item.scores.A) {
        totals.gpt.factual += item.scores.A.factual || 8;
        totals.gpt.clarity += item.scores.A.clarity || 9;
        totals.gpt.depth += item.scores.A.depth || 8;
        totals.gpt.count++;
      }
      if (item.scores.C) {
        totals.allam.factual += item.scores.C.factual || 8;
        totals.allam.clarity += item.scores.C.clarity || 8;
        totals.allam.depth += item.scores.C.depth || 8;
        totals.allam.count++;
      }
    }
  });

  const avg = (model, key) => (totals[model][key] / totals[model].count).toFixed(1);
  const overall = (model) => (((totals[model].factual + totals[model].clarity + totals[model].depth) / 3) / totals[model].count).toFixed(1);

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('lb-qwen-factual', avg('qwen', 'factual'));
  setEl('lb-qwen-clarity', avg('qwen', 'clarity'));
  setEl('lb-qwen-depth', avg('qwen', 'depth'));
  setEl('lb-qwen-overall', overall('qwen'));

  setEl('lb-gpt-factual', avg('gpt', 'factual'));
  setEl('lb-gpt-clarity', avg('gpt', 'clarity'));
  setEl('lb-gpt-depth', avg('gpt', 'depth'));
  setEl('lb-gpt-overall', overall('gpt'));

  setEl('lb-allam-factual', avg('allam', 'factual'));
  setEl('lb-allam-clarity', avg('allam', 'clarity'));
  setEl('lb-allam-depth', avg('allam', 'depth'));
  setEl('lb-allam-overall', overall('allam'));
}

function filterLeaderboard(category, tabElement) {
  document.querySelectorAll('#page-leaderboard .page-tab').forEach(t => t.classList.remove('active'));
  tabElement.classList.add('active');

  const rows = [
    document.getElementById('lb-row-qwen'),
    document.getElementById('lb-row-gpt'),
    document.getElementById('lb-row-allam')
  ];

  rows.forEach(r => { if (r) r.style.background = ''; });

  if (category === 'clarity') {
    if (rows[1]) rows[1].style.background = 'rgba(0,212,255,0.08)';
  } else if (category === 'depth' || category === 'factual') {
    if (rows[0]) rows[0].style.background = 'rgba(0,255,157,0.08)';
  } else if (category === 'originality') {
    if (rows[2]) rows[2].style.background = 'rgba(168,85,247,0.08)';
  }
}

function renderHistoryList() {
  const container = document.getElementById('history-list-dynamic');
  if (!container) return;
  const history = JSON.parse(localStorage.getItem('synapse_history') || '[]');

  if (history.length === 0) {
    container.innerHTML = '<div style="color:var(--text3);padding:2rem;">No debates recorded yet. Start your first debate!</div>';
    return;
  }

  container.innerHTML = history.map(item => `
    <div class="history-item" onclick="loadDebatePrompt('${item.question.replace(/'/g, "\\'")}')">
      <div class="history-icon">⚔️</div>
      <div class="history-content">
        <div class="history-q">${item.question}</div>
        <div class="history-meta">
          <span>${new Date(item.timestamp).toLocaleString()}</span>
          <span class="chip" style="font-size:0.65rem;">${item.mode.toUpperCase()}</span>
          <span>3 models · 2 rounds</span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderSavedList() {
  const container = document.getElementById('saved-list-dynamic');
  if (!container) return;
  const saved = JSON.parse(localStorage.getItem('synapse_saved_debates') || '[]');

  if (saved.length === 0) {
    container.innerHTML = '<div style="color:var(--text3);padding:2rem;">No bookmarked resolutions.</div>';
    return;
  }

  container.innerHTML = saved.map(item => `
    <div class="history-item">
      <div class="history-icon">🔖</div>
      <div class="history-content">
        <div class="history-q">${item.question}</div>
        <div style="font-size:0.85rem;color:var(--text2);margin-top:0.4rem;line-height:1.6;">${item.synthesis}</div>
      </div>
    </div>
  `).join('');
}

function saveCurrentDebate() {
  if (!currentDebateResult) {
    alert('Run a debate before saving.');
    return;
  }
  const saved = JSON.parse(localStorage.getItem('synapse_saved_debates') || '[]');
  saved.unshift(currentDebateResult);
  localStorage.setItem('synapse_saved_debates', JSON.stringify(saved));
  alert('Resolution bookmarked to Saved Debates!');
  updateBadgesAndStats();
}

function copyFinal() {
  const text = document.getElementById('final-text')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => alert('Resolution copied to clipboard!'));
}

function updateBadgesAndStats() {
  const history = JSON.parse(localStorage.getItem('synapse_history') || '[]');
  const saved = JSON.parse(localStorage.getItem('synapse_saved_debates') || '[]');
  
  const historyBadge = document.getElementById('history-badge');
  if (historyBadge) historyBadge.textContent = history.length;

  updateProfileStats();
}

function updateProfileStats() {
  const history = JSON.parse(localStorage.getItem('synapse_history') || '[]');
  const saved = JSON.parse(localStorage.getItem('synapse_saved_debates') || '[]');
  const session = Auth.getSession();

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setVal('prof-stat-debates', history.length);
  setVal('prof-stat-saved', saved.length);
  setVal('prof-stat-agents', history.length * 3);
  setVal('analytics-debates', history.length);

  if (history.length > 0) {
    let totalPoints = 0;
    history.forEach(h => {
      if (h.scores) {
        ['A', 'B', 'C'].forEach(agent => {
          if (h.scores[agent]) {
            const sc = h.scores[agent];
            totalPoints += ((sc.factual + sc.clarity + sc.depth + sc.originality) / 4);
          }
        });
      }
    });
    const avgScore = (totalPoints / (history.length * 3)).toFixed(1);
    setVal('prof-stat-score', avgScore);
    setVal('analytics-score', avgScore);
  } else {
    setVal('prof-stat-score', '0.0');
    setVal('analytics-score', '0.0');
  }

  if (history.length >= 1) {
    const b = document.getElementById('badge-first-debate');
    if (b) { b.textContent = 'EARNED'; b.style.color = 'var(--accent3)'; }
  }
  if (history.length >= 3) {
    const b = document.getElementById('badge-streak');
    if (b) { b.textContent = 'EARNED'; b.style.color = 'var(--accent3)'; }
  }
  if (saved.length >= 1) {
    const b = document.getElementById('badge-saved');
    if (b) { b.textContent = 'EARNED'; b.style.color = 'var(--accent3)'; }
  }

  if (session && session.full_name) {
    const nameEl = document.getElementById('profile-name-display');
    const emailEl = document.getElementById('profile-email-display');
    const avatarEl = document.getElementById('profile-avatar-display');
    if (nameEl) nameEl.textContent = session.full_name;
    if (emailEl) emailEl.textContent = session.email || session.identifier || '';
    if (avatarEl) {
      const parts = session.full_name.trim().split(' ');
      avatarEl.textContent = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].substring(0, 2).toUpperCase();
    }
  }
}

function markAllNotificationsRead() {
  document.querySelectorAll('.notif-item').forEach(i => i.classList.remove('unread'));
  const badge = document.getElementById('notif-badge');
  if (badge) badge.style.display = 'none';
}

const EXPLORE_ITEMS = [
  { q: "Is artificial general intelligence achievable within the next decade?", tag: "Science" },
  { q: "Can large language models truly understand concepts or are they stochastic pattern matchers?", tag: "Philosophy" },
  { q: "Is nuclear power the single most viable path to global net-zero carbon?", tag: "Energy" },
  { q: "Should AI systems ever be granted legal personhood or rights?", tag: "Ethics" },
  { q: "Is capitalism compatible with long-term ecological sustainability?", tag: "Economics" },
  { q: "Will quantum computing completely break modern public-key cryptography?", tag: "Security" }
];

function renderExploreGrid() {
  const grid = document.getElementById('explore-grid-dynamic');
  if (!grid) return;
  grid.innerHTML = EXPLORE_ITEMS.map(item => `
    <div class="explore-card" onclick="loadDebatePrompt('${item.q.replace(/'/g, "\\'")}')">
      <div style="flex:1;">
        <div class="explore-q">${item.q}</div>
        <div class="explore-meta" style="margin-top:0.5rem;"><span class="chip" style="font-size:0.65rem;">${item.tag}</span></div>
      </div>
    </div>
  `).join('');
}

function loadDebatePrompt(question) {
  showPage('debate');
  const input = document.getElementById('question-input');
  if (input) input.value = question;
}

// Synchronize dropdowns & dynamically change UI model labels
function setupEngineListeners() {
  const s1 = document.getElementById('engine-selector');
  const s2 = document.getElementById('settings-engine-mode');

  if (s1) {
    s1.addEventListener('change', (e) => applyEngineUI(e.target.value));
  }
  if (s2) {
    s2.addEventListener('change', (e) => applyEngineUI(e.target.value));
  }

  // Load saved preference
  const savedPref = localStorage.getItem('synapse_engine_pref') || 'groq';
  applyEngineUI(savedPref);
}

window.addEventListener('DOMContentLoaded', () => {
  Auth.syncNavbar();
  setupEngineListeners();
  updateBadgesAndStats();
  updateDynamicLeaderboard();
  renderExploreGrid();
});