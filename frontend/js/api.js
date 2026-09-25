/* ============================================================
   ReceptionAI — Shared API client + UI helpers
   Backend (FastAPI): http://127.0.0.1:8000
   No mock data. No backend code. Just fetch() + rendering.
   ============================================================ */

const API_BASE_URL = 'http://127.0.0.1:8000';

/* ---------- App-level config ---------- */
const AppConfig = {
  avgDealValue: 5000,     // assumed avg deal size for revenue estimates (CEO)
  healthPollMs: 30000,    // how often to refresh the health widget
};

/* ============================================================
   Low-level fetch wrapper (single source of truth for calls)
   ============================================================ */
async function apiRequest(path, { method = 'GET', body, headers } = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  };
  if (body !== undefined && body !== null) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(API_BASE_URL + path, opts);
  } catch (err) {
    throw new Error('Cannot reach backend at ' + API_BASE_URL + ' — is FastAPI running?');
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch (e) { data = text; }
  }

  if (!res.ok) {
    let detail = data && (data.detail || data.message || data.error);
    if (Array.isArray(detail)) detail = detail.map(d => d.msg || JSON.stringify(d)).join('; ');
    throw new Error((typeof detail === 'string' && detail)
      ? detail
      : ('Request failed (HTTP ' + res.status + ')'));
  }
  return data;
}

/* ============================================================
   API surface — exactly one function per documented endpoint
   ============================================================ */
const API = {
  BASE: API_BASE_URL,

  // GET /health
  health: () => apiRequest('/health'),

  // POST /chat  -> { customer_id, message }
  chat: (customer_id, message) =>
    apiRequest('/chat', { method: 'POST', body: { customer_id, message } }),

  // POST /score -> { customer_id }
  score: (customer_id) =>
    apiRequest('/score', { method: 'POST', body: { customer_id } }),

  // GET /leads
  getLeads: () => apiRequest('/leads'),

  // GET /leads/{customer_id}
  getLead: (id) => apiRequest('/leads/' + encodeURIComponent(id)),

  // GET /followups
  getFollowups: () => apiRequest('/followups'),

  // POST /followup
  createFollowup: (payload) =>
    apiRequest('/followup', { method: 'POST', body: payload }),

  // DELETE /demo/reset
  resetDemo: () => apiRequest('/demo/reset', { method: 'DELETE' }),
};

/* ============================================================
   Data normalisers — defensive against schema variations
   (field names may differ; we try the likely candidates)
   ============================================================ */
const Norm = {
  asArray(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    return data.leads || data.data || data.results || data.items ||
           data.followups || data.records || data.pending || [];
  },

  lead(l = {}) {
    const status = (l.status ?? l.lead_status ?? l.temperature ?? l.tier ?? l.category ?? '').toString();
    const sentiment = (l.sentiment ?? l.mood ?? l.emotion ?? '').toString();
    const rawScore = l.lead_score ?? l.score ?? l.score_value ?? l.lead_score_value ?? null;
    return {
      id: l.customer_id ?? l.id ?? l._id ?? l.phone ?? ('lead-' + Math.random().toString(36).slice(2, 7)),
      name: l.name ?? l.customer_name ?? l.full_name ?? l.display_name ?? (l.phone ? l.phone : 'Guest'),
      phone: l.phone ?? l.phone_number ?? l.mobile ?? l.contact ?? '—',
      score: (rawScore === null || rawScore === undefined || rawScore === '') ? null : Number(rawScore),
      status: status.toUpperCase(),
      sentiment: sentiment.toLowerCase(),
      interactions: Number(l.interaction_count ?? l.interactions ?? l.message_count ?? l.messages ?? l.turns ?? l.conversation_turns ?? 0),
      last_seen: l.last_seen ?? l.last_active ?? l.updated_at ?? l.created_at ?? l.timestamp ?? l.last_interaction ?? null,
      raw: l,
    };
  },

  leads(data) { return Norm.asArray(data).map(Norm.lead); },

  statusBucket(status = '') {
    const s = (status || '').toUpperCase();
    if (s.includes('HOT')) return 'HOT';
    if (s.includes('WARM')) return 'WARM';
    if (s.includes('COLD')) return 'COLD';
    return 'COLD';   // NEW / UNKNOWN / empty → bucket as cold so card totals add up
  },

  followup(f = {}) {
    const raw = (() => {
      if (f.status) return f.status;
      if (f.state) return f.state;
      if (f.completed !== undefined) return f.completed ? 'completed' : 'pending';
      if (f.done !== undefined) return f.done ? 'completed' : 'pending';
      return 'pending';
    })();
    return {
      id: f.id ?? f.followup_id ?? f._id ?? '',
      customer_id: f.customer_id ?? f.customer ?? f.lead_id ?? f.contact ?? '',
      name: f.name ?? f.customer_name ?? f.customer ?? '',
      reason: f.reason ?? f.note ?? f.notes ?? f.message ?? f.task ?? f.description ?? 'Follow-up',
      channel: (f.channel ?? f.method ?? f.type ?? f.medium ?? 'general').toString(),
      scheduled: f.scheduled_time ?? f.scheduled ?? f.follow_up_date ?? f.due_date ?? f.when ?? f.date ?? null,
      status: raw.toString().toLowerCase(),
      created: f.created_at ?? f.created ?? f.timestamp ?? null,
      raw: f,
    };
  },

  followups(data) {
    if (data && !Array.isArray(data) && (data.pending || data.completed)) {
      const pend = (data.pending || []).map(f => ({ ...f, status: f.status ?? 'pending' }));
      const comp = (data.completed || []).map(f => ({ ...f, status: f.status ?? 'completed' }));
      return [...pend, ...comp].map(Norm.followup);
    }
    return Norm.asArray(data).map(Norm.followup);
  },

  // memory = response.memory  (items_used highlighted for judging)
  memoryItems(memory = {}) {
    let items = memory.items_used ?? memory.retrieved ?? memory.memories ??
                memory.items ?? memory.context_used ?? memory.facts ?? memory.used ?? [];
    if (!Array.isArray(items)) items = items ? [items] : [];
    return items.map(it => typeof it === 'string'
      ? it
      : (it.text ?? it.content ?? it.fact ?? it.memory ?? it.summary ?? it.note ?? JSON.stringify(it)));
  },
};

/* ============================================================
   Shared UI helpers
   ============================================================ */
const UI = {
  $(sel, root = document) { return root.querySelector(sel); },
  $$(sel, root = document) { return [...root.querySelectorAll(sel)]; },

  esc(s = '') {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  },
  cap(s = '') { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; },

  timeAgo(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 16);
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    const dd = Math.floor(h / 24); if (dd < 30) return dd + 'd ago';
    return d.toLocaleDateString();
  },
  fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  statusInfo(status = '') {
    const b = Norm.statusBucket(status);
    return ({
      HOT: { cls: 'hot', label: 'HOT', icon: '🔥' },
      WARM: { cls: 'warm', label: 'WARM', icon: '☀️' },
      COLD: { cls: 'cold', label: 'COLD', icon: '❄️' },
    })[b] || { cls: 'cold', label: b || 'NEW', icon: '•' };
  },
  statusBadge(status = '') {
    const i = UI.statusInfo(status);
    return '<span class="badge status ' + i.cls + '">' + i.icon + ' ' + i.label + '</span>';
  },
  sentimentBadge(sent = '') {
    const s = (sent || '').toString().toLowerCase();
    let cls = 'neu', label = s || 'neutral';
    if (s.includes('pos')) { cls = 'pos'; label = 'Positive'; }
    else if (s.includes('neg')) { cls = 'neg'; label = 'Negative'; }
    else if (s.includes('neu')) { cls = 'neu'; label = 'Neutral'; }
    else if (!s) { cls = 'neu'; label = '—'; }
    return '<span class="badge sentiment ' + cls + '">' + UI.cap(label) + '</span>';
  },

  scoreColor(score) {
    if (score === null || score === undefined || isNaN(score)) return '#94a3b8';
    if (score >= 70) return '#ef4444';
    if (score >= 40) return '#f59e0b';
    return '#3b82f6';
  },
  scorePill(score) {
    if (score === null || score === undefined || isNaN(score)) return '<span class="muted-txt">—</span>';
    const c = UI.scoreColor(score);
    return '<span class="score-pill" style="background:' + (score >= 70 ? 'var(--hot-bg)' : score >= 40 ? 'var(--warm-bg)' : 'var(--cold-bg)') + ';color:' + c + '">' + Math.round(score) + '</span>';
  },
  scoreRing(score, size = 116) {
    const has = (score !== null && score !== undefined && score !== '' && !isNaN(score));
    const val = has ? Math.max(0, Math.min(100, Number(score))) : null;
    const r = 42, c = 2 * Math.PI * r;
    const off = val === null ? c : c * (1 - val / 100);
    const color = val === null ? '#cbd5e1' : UI.scoreColor(val);
    const txt = val === null ? '—' : Math.round(val);
    return '' +
      '<div class="score-ring" style="width:' + size + 'px;height:' + size + 'px">' +
        '<svg viewBox="0 0 100 100">' +
          '<circle class="track" cx="50" cy="50" r="' + r + '"></circle>' +
          '<circle class="val" cx="50" cy="50" r="' + r + '" style="stroke:' + color + ';stroke-dasharray:' + c.toFixed(2) + ';stroke-dashoffset:' + off.toFixed(2) + '"></circle>' +
        '</svg>' +
        '<div class="score-ring-txt">' +
          '<span class="num" style="color:' + color + '">' + txt + '</span>' +
          '<span class="lbl">LEAD SCORE</span>' +
        '</div>' +
      '</div>';
  },

  /* ---- Toast notifications ---- */
  toast(message, type = 'info') {
    let host = document.getElementById('toastHost');
    if (!host) { host = document.createElement('div'); host.id = 'toastHost'; host.className = 'toast-host'; document.body.appendChild(host); }
    const t = document.createElement('div');
    t.className = 'toast-item ' + type;
    t.innerHTML = '<span class="toast-ico">' + (type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️') + '</span><span>' + UI.esc(message) + '</span>';
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 320); }, 4400);
  },

  /* ---- Health: navbar pill ---- */
  _healthOk(h) {
    const s = (h && (h.status ?? h.health ?? h.state ?? '')).toString().toLowerCase();
    if (!s) return true;   // reachable + no status field ⇒ assume ok
    return ['ok', 'healthy', 'up', 'running', 'alive', 'success', 'true', 'operational'].some(k => s.includes(k));
  },
  async renderHealthPill(el = 'healthPill') {
    const node = typeof el === 'string' ? document.getElementById(el) : el;
    if (!node) return;
    try {
      const h = await API.health();
      const ok = UI._healthOk(h);
      const model = h.model ?? h.ai_model ?? h.llm ?? h.model_name ?? 'AI';
      node.className = 'health-pill ' + (ok ? 'up' : 'down');
      node.innerHTML =
        '<span class="hp-dot"></span>' +
        '<span class="hp-text">' + (ok ? 'Backend Online' : 'Backend Issue') + '</span>' +
        '<span class="hp-model">' + UI.esc(String(model)) + '</span>';
      node.dataset.ok = ok ? '1' : '0';
    } catch (e) {
      node.className = 'health-pill down';
      node.innerHTML = '<span class="hp-dot"></span><span class="hp-text">Backend Offline</span>';
      node.dataset.ok = '0';
    }
  },

  /* ---- Health: full monitor widget ---- */
  _boolLabel(v) {
    if (v === true || v === 'true' || v === 1 || v === '1') return '✅ Enabled';
    if (v === false || v === 'false' || v === 0 || v === '0') return '⛔ Disabled';
    return (v === null || v === undefined) ? '—' : String(v);
  },
  async renderHealthCard(container = 'healthCard') {
    const node = typeof container === 'string' ? document.getElementById(container) : container;
    if (!node) return null;
    try {
      const h = await API.health();
      node.classList.remove('is-error');
      const ok = UI._healthOk(h);
      const rows = [
        { label: 'Backend Status', v: ok ? '● Operational' : '● Degraded', cls: ok ? 'good' : 'bad' },
        { label: 'AI Model', v: h.model ?? h.ai_model ?? h.llm ?? h.model_name ?? '—' },
        { label: 'Hindsight Memory', v: UI._boolLabel(h.hindsight_enabled ?? h.hindsight ?? h.memory_enabled ?? h.memory) },
        { label: 'Total Leads', v: h.lead_count ?? h.leads ?? h.total_leads ?? (h.stats && h.stats.leads) ?? '—' },
        { label: 'Pending Follow-ups', v: h.pending_followups ?? h.pending ?? h.followups_pending ?? (h.stats && h.stats.pending_followups) ?? '—' },
      ];
      node.innerHTML =
        '<div class="card-head">' +
          '<div class="card-title"><span class="card-ico pulse">🩺</span> System Health</div>' +
          '<span class="badge status ' + (ok ? 'hot' : 'cold') + '">' + (ok ? '● LIVE' : 'DOWN') + '</span>' +
        '</div>' +
        '<div class="health-grid">' +
          rows.map(r => '<div class="health-row"><span class="hr-label">' + UI.esc(r.label) + '</span><span class="hr-val ' + (r.cls || '') + '">' + UI.esc(String(r.v)) + '</span></div>').join('') +
        '</div>';
      return h;
    } catch (e) {
      node.classList.add('is-error');
      node.innerHTML =
        '<div class="card-head"><div class="card-title"><span class="card-ico">🩺</span> System Health</div></div>' +
        '<div class="health-down">' +
          '<p>⚠️ Cannot reach backend.</p>' +
          '<code>' + UI.esc(API_BASE_URL) + '</code>' +
          '<small>' + UI.esc(e.message) + '</small>' +
        '</div>';
      return null;
    }
  },
};

/* ============================================================
   Global bootstrap: health polling + reset button (all pages)
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  UI.renderHealthPill();
  setInterval(UI.renderHealthPill, AppConfig.healthPollMs);

  const hc = document.getElementById('healthCard');
  if (hc) {
    UI.renderHealthCard(hc);
    setInterval(() => UI.renderHealthCard(hc), AppConfig.healthPollMs);
  }

  // Global "Reset demo data" button (if present in navbar)
  const rb = document.getElementById('resetDemoBtn');
  if (rb) {
    rb.addEventListener('click', async () => {
      if (!confirm('Reset ALL demo data on the backend (leads, follow-ups, memory)?')) return;
      rb.disabled = true;
      const old = rb.innerHTML;
      rb.innerHTML = '<span class="spinner sm"></span> Resetting';
      try {
        await API.resetDemo();
        UI.toast('Demo data reset successfully', 'success');
        localStorage.removeItem('ra_customer_id');
        window.dispatchEvent(new CustomEvent('demo:reset'));
      } catch (e) {
        UI.toast(e.message, 'error');
      } finally {
        rb.disabled = false;
        rb.innerHTML = old;
      }
    });
  }
});
