/* ============================================================
   Follow-up Manager
   GET /followups -> table + counts
   POST /followup  -> manual creation
   ============================================================ */
(function () {
  const $ = (s) => document.querySelector(s);
  const state = { items: [], status: 'ALL' };
  const channelIco = { phone: '📞', email: '✉️', sms: '💬', general: '📋' };

  async function load() {
    setLoading(true);
    try {
      const data = await API.getFollowups();
      state.items = Norm.followups(data);
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

  function renderStats() {
    const total = state.items.length;
    const pending = state.items.filter((f) => f.status !== 'completed').length;
    const done = total - pending;
    const rate = total ? Math.round((done / total) * 100) + '%' : '—';
    $('#statTotal').textContent = total;
    $('#statPending').textContent = pending;
    $('#statDone').textContent = done;
    $('#statRate').textContent = rate;
  }

  function filtered() {
    const list = state.status === 'ALL'
      ? state.items
      : state.items.filter((f) => state.status === 'pending' ? f.status !== 'completed' : f.status === 'completed');
    // pending + soonest-scheduled first
    return list.slice().sort((a, b) => {
      if ((a.status === 'completed') !== (b.status === 'completed')) return a.status === 'completed' ? 1 : -1;
      const ta = a.scheduled ? new Date(a.scheduled).getTime() : Infinity;
      const tb = b.scheduled ? new Date(b.scheduled).getTime() : Infinity;
      return ta - tb;
    });
  }

  function renderTable() {
    const body = $('#fuBody');
    const rows = filtered();
    $('#rowCount').textContent = rows.length + (rows.length === 1 ? ' item' : ' items');

    if (!state.items.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="ico">🗓️</div><h4>No follow-ups yet</h4><p>Chat with the AI receptionist to generate recommended follow-ups, or create one manually on the left.</p></div></td></tr>';
      return;
    }
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="ico">✅</div><h4>Nothing here</h4><p>No follow-ups match this filter.</p></div></td></tr>';
      return;
    }

    body.innerHTML = rows.map((f) => {
      const cust = (f.name && f.name !== '—') ? f.name : (f.customer_id || '—');
      const ch = channelIco[f.channel] || '📋';
      const statusBadge = f.status === 'completed'
        ? '<span class="badge sentiment pos">✅ Completed</span>'
        : '<span class="badge status warm">⏳ Pending</span>';
      return (
        '<tr>' +
          '<td><div class="nm">' + UI.esc(cust) + '</div><div class="cid">' + UI.esc(f.customer_id || '—') + '</div></td>' +
          '<td style="max-width:280px">' + UI.esc(f.reason) + '</td>' +
          '<td>' + ch + ' ' + UI.cap(f.channel) + '</td>' +
          '<td>' + UI.fmtDate(f.scheduled) + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '<td>' + UI.timeAgo(f.created) + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderError(msg) {
    $('#fuBody').innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="ico">⚠️</div><h4>Couldn\'t load follow-ups</h4><p>' + UI.esc(msg) + '</p></div></td></tr>';
  }

  /* ---- manual creation -> POST /followup ---- */
  $('#fuForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const payload = {
      customer_id: $('#fuCustomer').value.trim(),
      reason: $('#fuReason').value.trim(),
      channel: $('#fuChannel').value,
    };
    const when = $('#fuWhen').value;
    if (when) payload.scheduled_time = new Date(when).toISOString();

    btn.disabled = true;
    const old = btn.innerHTML;
    btn.innerHTML = '<span class="spinner sm"></span> Scheduling…';
    try {
      await API.createFollowup(payload);
      UI.toast('Follow-up scheduled for ' + (payload.customer_id || 'customer'), 'success');
      $('#fuReason').value = '';
      $('#fuWhen').value = '';
      await load();
    } catch (err) {
      UI.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  });

  /* ---- events ---- */
  $('#refreshBtn').addEventListener('click', load);
  $('#statusFilter').addEventListener('change', (e) => { state.status = e.target.value; renderTable(); });
  window.addEventListener('demo:reset', load);

  load();
  setInterval(load, AppConfig.healthPollMs);
})();
