/* ============================================================
   Employee Dashboard
   GET /leads -> stat cards + searchable / filterable lead table
   ============================================================ */
(function () {
  const $ = (s) => document.querySelector(s);
  const state = { leads: [], q: '', status: 'ALL' };

  async function load() {
    setLoading(true);
    try {
      const data = await API.getLeads();
      state.leads = Norm.leads(data);
      renderStats();
      renderTable();
    } catch (e) {
      UI.toast(e.message, 'error');
      renderError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function setLoading(b) {
    const btn = $('#refreshBtn');
    if (btn) { btn.disabled = b; btn.innerHTML = b ? '<span class="spinner sm"></span> Loading' : '<i class="bi bi-arrow-clockwise"></i> Refresh'; }
  }

  function counts() {
    const c = { TOTAL: state.leads.length, HOT: 0, WARM: 0, COLD: 0 };
    state.leads.forEach((l) => { c[Norm.statusBucket(l.status)]++; });
    return c;
  }

  function renderStats() {
    const c = counts();
    $('#statTotal').textContent = c.TOTAL;
    $('#statHot').textContent   = c.HOT;
    $('#statWarm').textContent  = c.WARM;
    $('#statCold').textContent  = c.COLD;
    $('#statTotalSub').textContent = c.TOTAL + ' visitors engaged';
    const pct = c.TOTAL ? Math.round((c.HOT / c.TOTAL) * 100) : 0;
    $('#statHotSub').textContent = c.TOTAL ? pct + '% of pipeline · priority' : 'score ≥ 70 · priority';
  }

  function filtered() {
    const q = state.q.toLowerCase();
    return state.leads
      .filter((l) => {
        if (state.status !== 'ALL' && Norm.statusBucket(l.status) !== state.status) return false;
        if (!q) return true;
        return (l.name + ' ' + l.phone + ' ' + l.id).toLowerCase().includes(q);
      })
      .sort((a, b) => {
        // hottest first; nulls last
        const sa = a.score == null ? -1 : a.score;
        const sb = b.score == null ? -1 : b.score;
        return sb - sa;
      });
  }

  function renderTable() {
    const body = $('#leadBody');
    const rows = filtered();
    $('#rowCount').textContent = rows.length + (rows.length === 1 ? ' lead' : ' leads');

    if (!state.leads.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="ico">📭</div><h4>No leads yet</h4><p>Start a conversation on the <a href="index.html">Chat page</a> — the AI receptionist will create leads here automatically.</p></div></td></tr>';
      return;
    }
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="ico">🔍</div><h4>No matches</h4><p>Adjust your search or status filter.</p></div></td></tr>';
      return;
    }

    body.innerHTML = rows.map((l) => {
      const nm = l.name && l.name !== '—' ? l.name : l.id;
      return (
        '<tr>' +
          '<td><div class="nm">' + UI.esc(nm) + '</div><div class="cid">' + UI.esc(l.id) + '</div></td>' +
          '<td>' + UI.esc(l.phone) + '</td>' +
          '<td>' + UI.scorePill(l.score) + '</td>' +
          '<td>' + UI.statusBadge(l.status) + '</td>' +
          '<td>' + UI.sentimentBadge(l.sentiment) + '</td>' +
          '<td>' + (l.interactions || 0) + '</td>' +
          '<td>' + UI.timeAgo(l.last_seen) + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderError(msg) {
    $('#leadBody').innerHTML =
      '<tr><td colspan="7"><div class="empty-state"><div class="ico">⚠️</div><h4>Couldn\'t load leads</h4><p>' + UI.esc(msg) + '</p></div></td></tr>';
  }

  /* ---- events ---- */
  $('#refreshBtn').addEventListener('click', load);
  $('#search').addEventListener('input', (e) => { state.q = e.target.value; renderTable(); });
  $('#statusFilter').addEventListener('change', (e) => { state.status = e.target.value; renderTable(); });
  window.addEventListener('demo:reset', load);

  /* ---- init + auto refresh ---- */
  load();
  setInterval(load, AppConfig.healthPollMs);
})();
