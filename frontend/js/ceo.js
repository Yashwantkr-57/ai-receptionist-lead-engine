/* ============================================================
   CEO Dashboard
   GET /leads -> KPIs, conversion funnel + Chart.js visuals
   ============================================================ */
(function () {
  const $ = (s) => document.querySelector(s);
  const charts = {};
  let leads = [];

  const money = (n) => '$' + Math.round(n).toLocaleString();

  async function load() {
    setLoading(true);
    try {
      leads = Norm.leads(await API.getLeads());
      renderKPIs();
      renderFunnel();
      renderCharts();
    } catch (e) {
      UI.toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function setLoading(b) {
    const btn = $('#refreshBtn');
    if (btn) { btn.disabled = b; btn.innerHTML = b ? '<span class="spinner sm"></span> Loading' : '<i class="bi bi-arrow-clockwise"></i> Refresh'; }
  }

  function buckets() {
    const c = { HOT: 0, WARM: 0, COLD: 0 };
    leads.forEach((l) => { c[Norm.statusBucket(l.status)]++; });
    return c;
  }
  function sentiments() {
    const c = { positive: 0, negative: 0, neutral: 0 };
    leads.forEach((l) => {
      const s = (l.sentiment || '');
      if (s.includes('pos')) c.positive++;
      else if (s.includes('neg')) c.negative++;
      else c.neutral++;
    });
    return c;
  }

  function renderKPIs() {
    const total = leads.length;
    const b = buckets();
    const scored = leads.filter((l) => l.score != null);
    const avg = scored.length ? Math.round(scored.reduce((a, l) => a + l.score, 0) / scored.length) : 0;
    // weighted revenue: sum of (score/100 * avg deal value)
    const revenue = scored.reduce((a, l) => a + (l.score / 100) * AppConfig.avgDealValue, 0);

    $('#kTotal').textContent = total;
    $('#kTotalSub').textContent = total + ' in pipeline';
    $('#kHot').textContent = b.HOT;
    $('#kHotSub').textContent = total ? Math.round((b.HOT / total) * 100) + '% of leads' : 'high-intent';
    $('#kRevenue').textContent = money(revenue);
    $('#kRevenueSub').textContent = 'score-weighted @ ' + money(AppConfig.avgDealValue) + '/deal';
    $('#kAvg').textContent = avg || '—';
    $('#kAvgSub').textContent = scored.length + ' scored leads';
  }

  function renderFunnel() {
    const total = leads.length || 1;
    const b = buckets();
    const contacted = leads.filter((l) => l.interactions >= 1).length;
    const engaged   = leads.filter((l) => l.interactions >= 3).length;
    const warm      = b.WARM + b.HOT;
    const hot       = b.HOT;

    const stages = [
      { label: 'Total Leads',   n: leads.length, c: '#6366f1' },
      { label: 'Contacted',     n: contacted,    c: '#7c3aed' },
      { label: 'Engaged (3+)',  n: engaged,      c: '#a855f7' },
      { label: 'Warm + Hot',    n: warm,         c: '#d946ef' },
      { label: 'Hot / Sales-ready', n: hot,      c: '#ef4444' },
    ];
    $('#funnel').innerHTML = stages.map((s) => {
      const pct = Math.round((s.n / total) * 100);
      return (
        '<div class="funnel-stage">' +
          '<div class="funnel-label">' + s.label + '</div>' +
          '<div class="funnel-bar-wrap"><div class="funnel-bar" style="width:' + Math.max(pct, 4) + '%;background:' + s.c + '">' + s.n + '</div></div>' +
          '<div class="funnel-pct">' + pct + '%</div>' +
        '</div>'
      );
    }).join('');

    const conv = leads.length ? Math.round((hot / leads.length) * 100) : 0;
    $('#funnelConv').textContent = conv + '% to hot';
  }

  function destroy(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }

  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 14, usePointStyle: true } } },
  };

  function renderCharts() {
    const b = buckets();
    const s = sentiments();

    // Lead distribution (doughnut)
    destroy('dist');
    charts.dist = new Chart($('#distChart'), {
      type: 'doughnut',
      data: {
        labels: ['Hot', 'Warm', 'Cold'],
        datasets: [{
          data: [b.HOT, b.WARM, b.COLD],
          backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6'],
          borderWidth: 0, hoverOffset: 6,
        }],
      },
      options: { ...baseOpts, cutout: '64%' },
    });

    // Leads by status (bar)
    destroy('status');
    charts.status = new Chart($('#statusChart'), {
      type: 'bar',
      data: {
        labels: ['Hot', 'Warm', 'Cold'],
        datasets: [{
          label: 'Leads',
          data: [b.HOT, b.WARM, b.COLD],
          backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6'],
          borderRadius: 8, maxBarThickness: 64,
        }],
      },
      options: { ...baseOpts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });

    // Sentiment distribution (doughnut)
    destroy('sent');
    charts.sent = new Chart($('#sentChart'), {
      type: 'doughnut',
      data: {
        labels: ['Positive', 'Neutral', 'Negative'],
        datasets: [{
          data: [s.positive, s.neutral, s.negative],
          backgroundColor: ['#10b981', '#94a3b8', '#ef4444'],
          borderWidth: 0, hoverOffset: 6,
        }],
      },
      options: { ...baseOpts, cutout: '64%' },
    });

    // Interaction trends (line)
    renderTrend();
  }

  function renderTrend() {
    destroy('trend');
    const byDay = {};
    leads.forEach((l) => {
      if (!l.last_seen) return;
      const d = new Date(l.last_seen);
      if (isNaN(d)) return;
      const k = d.toISOString().slice(0, 10);
      byDay[k] = (byDay[k] || 0) + 1;
    });

    let labels, values, note;
    const keys = Object.keys(byDay).sort();

    if (keys.length >= 2) {
      // last 10 active days
      const last = keys.slice(-10);
      labels = last.map((k) => {
        const d = new Date(k);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      });
      values = last.map((k) => byDay[k]);
      note = 'Leads active per day';
    } else {
      // fallback: interaction-count histogram
      const bins = { '0': 0, '1–2': 0, '3–5': 0, '6+': 0 };
      leads.forEach((l) => {
        const n = l.interactions || 0;
        if (n === 0) bins['0']++;
        else if (n <= 2) bins['1–2']++;
        else if (n <= 5) bins['3–5']++;
        else bins['6+']++;
      });
      labels = Object.keys(bins);
      values = Object.values(bins);
      note = 'Leads by interaction count';
    }

    charts.trend = new Chart($('#trendChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: note,
          data: values,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,.16)',
          fill: true, tension: 0.4,
          pointBackgroundColor: '#6366f1', pointRadius: 4, pointHoverRadius: 6, borderWidth: 3,
        }],
      },
      options: {
        ...baseOpts,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  /* ---- events ---- */
  $('#refreshBtn').addEventListener('click', load);
  window.addEventListener('demo:reset', load);

  load();
  setInterval(load, AppConfig.healthPollMs);
})();
