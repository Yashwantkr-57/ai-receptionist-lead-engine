/* ============================================================
   Chat page logic — AI Receptionist
   POST /chat -> renders reply, lead score, status, sentiment,
   Hindsight memory panel + follow-up recommendation.
   ============================================================ */
(function () {
  const $ = (s) => document.querySelector(s);

  const messagesEl   = $('#messages');
  const form         = $('#chatForm');
  const input        = $('#messageInput');
  const sendBtn      = $('#sendBtn');
  const customerIdEl = $('#customerId');

  /* ---- session / customer id (persisted) ---- */
  function genId() {
    return 'web-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  function getCustomerId() { return localStorage.getItem('ra_customer_id') || genId(); }
  function setCustomerId(v) {
    const id = (v || '').trim() || genId();
    localStorage.setItem('ra_customer_id', id);
    customerIdEl.value = id;
    return id;
  }
  let customerId = setCustomerId(getCustomerId());

  /* ---- rendering helpers ---- */
  function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

  function linkify(s) {
    return s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/(https?:\/\/[^\s]+)/g, (m) => '<a href="' + m + '" target="_blank" rel="noopener">' + m + '</a>')
      .replace(/\n/g, '<br>');
  }

  function addBubble(role, html) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    const avatar = role === 'bot'
      ? '<div class="av bot-av">A</div>'
      : '<div class="av user-av">You</div>';
    wrap.innerHTML = '<div class="msg-row">' + avatar + '<div class="bubble ' + role + '">' + html + '</div></div>';
    messagesEl.appendChild(wrap);
    scrollBottom();
    return wrap;
  }
  const addBotText  = (t) => addBubble('bot', linkify(t));
  const addUserText = (t) => addBubble('user', UI.esc(t));

  function typingIndicator() {
    return addBubble('bot', '<span class="typing"><i></i><i></i><i></i></span>');
  }

  function welcome() {
    messagesEl.innerHTML = '';
    const w = document.createElement('div');
    w.className = 'welcome-hero';
    w.innerHTML =
      '<div class="big-av">👋</div>' +
      '<h3 style="margin:0 0 8px">Hi, I\'m Aria — your AI receptionist</h3>' +
      '<p class="muted-txt" style="max-width:420px;margin:0 auto;line-height:1.55">' +
        'Ask me anything. I\'ll qualify your needs, score your lead potential live, and ' +
        'remember what matters using <b>Hindsight memory</b>. Watch the memory panel light up →</p>';
    messagesEl.appendChild(w);
    scrollBottom();
  }

  /* ---- sidebar updates from /chat response ---- */
  function updateSidebar(data) {
    const ls = data.lead_score || data.score || {};
    const score    = ls.score ?? data.score ?? null;
    const status   = ls.status ?? ls.lead_status ?? data.status ?? '';
    const sentiment = ls.sentiment ?? data.sentiment ?? '';

    // score card
    $('#scoreRingHolder').innerHTML = UI.scoreRing(score);
    $('#scoreStatus').innerHTML     = UI.statusBadge(status || (score === null ? '' : ''));
    $('#scoreSentiment').innerHTML  = UI.sentimentBadge(sentiment);

    // Hindsight memory panel
    const mem   = data.memory || {};
    const items = Norm.memoryItems(mem);
    const count = mem.items_used_count ?? mem.count ?? mem.used_count ?? items.length;
    renderMemory(items, count);

    // follow-up recommendation
    const fu = data.followup ?? data.follow_up ?? data.followup_recommendation ??
               data.recommendation ?? data.next_action ?? data.next_step ?? data.follow_up_recommendation ?? '';
    renderFollowup(fu, data);
  }

  function renderMemory(items, count) {
    const n = (count ?? items.length) || 0;
    $('#memCount').textContent = n;
    const list = $('#memList');
    if (!items.length) {
      list.innerHTML = '<div class="mem-empty">No memories recalled this turn. Share details (name, budget, timeline) and Hindsight will surface them here.</div>';
      return;
    }
    list.innerHTML = items.map((it, i) =>
      '<div class="mem-chip"><span class="mem-i">' + (i + 1) + '</span><span>' + UI.esc(it) + '</span></div>'
    ).join('');
    // gently flash the card so judges notice the memory update
    const card = $('#memoryCard');
    card.style.boxShadow = '0 16px 40px -18px rgba(168,85,247,.9)';
    setTimeout(() => { card.style.boxShadow = ''; }, 1100);
  }

  function renderFollowup(fu, data) {
    const body = $('#followupBody');
    if (fu && String(fu).trim()) {
      const when = data.followup_time ?? data.follow_up_time ?? data.scheduled_time ?? null;
      body.innerHTML =
        '<p class="fu-text">' + UI.esc(fu) + '</p>' +
        '<div class="fu-flag"><i class="bi bi-bell"></i> ' + (when ? 'Suggested: ' + UI.esc(when) : 'Recommended action') + '</div>';
    } else {
      body.innerHTML = '<p class="fu-empty">No follow-up recommended this turn — keep the conversation going.</p>';
    }
  }

  /* ---- send flow ---- */
  function setLoading(b) {
    form.classList.toggle('loading', b);
    sendBtn.disabled = b;
    input.disabled = b;
    if (!b) input.focus();
  }

  async function send(text) {
    text = (text || '').trim();
    if (!text || sendBtn.disabled) return;

    // clear welcome hero on first message
    const hero = messagesEl.querySelector('.welcome-hero');
    if (hero) messagesEl.innerHTML = '';

    addUserText(text);
    input.value = '';
    const typing = typingIndicator();
    setLoading(true);
    try {
      const data = await API.chat(customerId, text);
      typing.remove();
      const reply = data.reply ?? data.response ?? data.message ?? '…';
      addBotText(reply);
      updateSidebar(data);
    } catch (err) {
      typing.remove();
      addBubble('bot', '<span class="err">⚠️ ' + UI.esc(err.message) + '</span>');
      UI.toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  /* ---- quick reply chips ---- */
  const QUICK = [
    "Hi! I'm Alex — what does ReceptionAI actually do?",
    'I run a 40-person sales team, looking at pricing.',
    "You can reach me at 555-0142, call me anytime.",
    'Can I book a live demo for next week?',
    'Just exploring options right now, not ready to buy.',
    'What CRM integrations do you support?',
  ];
  $('#quickReplies').innerHTML = QUICK.map((q) =>
    '<button type="button" class="chip" data-q="' + UI.esc(q) + '">' + UI.esc(q) + '</button>'
  ).join('');
  $('#quickReplies').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (b) send(b.dataset.q);
  });

  /* ---- events ---- */
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });

  $('#newSession').addEventListener('click', () => {
    customerId = setCustomerId(genId());
    welcome();
    resetSidebar();
    UI.toast('New visitor session started: ' + customerId, 'success');
  });

  $('#applyCustomer').addEventListener('click', () => {
    customerId = setCustomerId(customerIdEl.value);
    welcome();
    resetSidebar();
    UI.toast('Loaded session: ' + customerId, 'success');
  });
  customerIdEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#applyCustomer').click(); }
  });

  function resetSidebar() {
    $('#scoreRingHolder').innerHTML = UI.scoreRing(null);
    $('#scoreStatus').innerHTML     = '<span class="badge status cold">• NEW</span>';
    $('#scoreSentiment').innerHTML  = '<span class="badge sentiment neu">—</span>';
    renderMemory([], 0);
    renderFollowup('', {});
  }

  // global demo reset (from navbar) -> fresh chat
  window.addEventListener('demo:reset', () => {
    customerId = setCustomerId(genId());
    welcome();
    resetSidebar();
    UI.renderHealthCard('healthCard');
  });

  /* ---- init ---- */
  welcome();
  resetSidebar();
})();
