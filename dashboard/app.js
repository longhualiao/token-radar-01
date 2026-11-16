// Token Radar's dashboard: a static page over window.RADAR, no framework and no network.
// The board ranks pre-token protocols by the implied value the model in lib/model.ts computes
// from the snapshot's own figures; the detail view shows that arithmetic row by row, and the
// methodology tab states the model in full. Screenshots are taken with ?shot=board (the board),
// ?shot=detail&slug=<slug> (one protocol's detail view) and ?shot=filter&category=<name>
// (a filtered board); each sets window.__shotReady once the page is rendered.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.getElementById('board').textContent = 'No radar data.'; return; }

  var params = new URLSearchParams(location.search);
  var shot = params.get('shot') || 'board';

  var state = {
    view: 'board',
    q: params.get('q') || '',
    category: params.get('category') || '',
    chain: params.get('chain') || '',
    watchOnly: params.get('watchlist') === '1',
    sort: params.get('sort') || 'rank',
    detail: params.get('slug') || null,
  };
  if (shot === 'filter' && state.category) state.view = 'board';
  if (shot === 'detail' && state.detail) state.view = 'board';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtUsd(v) {
    if (v == null) return '—';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function fmtInt(v) { return v == null ? '—' : Math.round(v).toLocaleString('en-US'); }
  function fmtPct(v) {
    if (v == null) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return s;
  }
  function pctClass(v) { return v == null ? '' : v >= 0 ? 'pos' : 'neg'; }
  function ageLabel(d) {
    if (d == null) return 'unknown';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }
  function chainsLabel(chains) { return chains.length ? chains.slice(0, 3).join(', ') + (chains.length > 3 ? ' +' + (chains.length - 3) : '') : '—'; }

  var maxImplied = D.rows.length ? D.rows[0].implied_value_usd : 1;
  var categories = [];
  var seenCat = {};
  D.rows.forEach(function (r) { if (r.category && !seenCat[r.category]) { seenCat[r.category] = 1; categories.push(r.category); } });
  categories.sort();
  var chains = [];
  var seenChain = {};
  D.rows.forEach(function (r) { r.chains.forEach(function (c) { if (!seenChain[c]) { seenChain[c] = 1; chains.push(c); } }); });
  chains.sort();

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var by = {
      rank: function (a, b) { return a.rank - b.rank; },
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d == null ? -1e9 : b.change_7d) - (a.change_7d == null ? -1e9 : a.change_7d); },
      age: function (a, b) { return (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days); },
    }[state.sort] || function (a, b) { return a.rank - b.rank; };
    return rows.slice().sort(by);
  }

  function rowHtml(r) {
    var bar = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
    return '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' data-selected="true"' : '') + '>' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><span class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Uncategorized') + (r.watchlist ? ' · <span class="badge watch">WATCHLIST</span>' : '') + '</span></span></td>' +
      '<td>' + esc(chainsLabel(r.chains)) + '</td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
      '<td class="num">' + ageLabel(r.age_days) + '</td>' +
      '<td><span class="implied"><b class="num">' + fmtUsd(r.implied_value_usd) + '</b><span class="bar"><i style="width:' + bar + '%"></i></span></span></td>' +
      '</tr>';
  }

  function boardHtml() {
    var rows = filteredRows();
    var body = rows.length ? rows.map(rowHtml).join('') :
      '<tr><td colspan="7"><div class="empty"><h2>Nothing matches</h2><p>Loosen the filters to see the board again.</p></div></td></tr>';
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<thead><tr><th>#</th><th>Protocol</th><th>Chains</th><th>TVL</th><th>7d</th><th>Age</th><th>Implied value</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></div>';
  }

  function liveHtml() {
    var body = D.live.map(function (p) {
      return '<tr><td><span class="name"><b>' + esc(p.name) + '</b><span class="sub">' + esc(p.category || 'Uncategorized') + '</span></span></td>' +
        '<td>' + esc(chainsLabel(p.chains)) + '</td>' +
        '<td class="num">' + fmtUsd(p.tvl_usd) + '</td>' +
        '<td class="num">' + fmtUsd(p.mcap_usd) + '</td>' +
        '<td class="num">' + (p.mcap_tvl == null ? '—' : p.mcap_tvl.toFixed(3)) + '</td>' +
        '<td class="num ' + pctClass(p.change_7d) + '">' + fmtPct(p.change_7d) + '</td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<thead><tr><th>Protocol</th><th>Chains</th><th>TVL</th><th>Market cap</th><th>MCap / TVL</th><th>7d</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></div>' +
      '<div class="panel method"><h2>Why this list is here</h2>' +
      '<p>These protocols already have a token, so the board never ranks them: their market cap is the market\u2019s own value, not a model\u2019s. They are the comparables the model prices the pre-token board against \u2014 each category\u2019s multiple is the median market-cap-to-TVL ratio of its live-token protocols.</p></div>';
  }

  function methodHtml() {
    var compRows = D.comparables.map(function (c) {
      var src = c.basis === 'category' ? 'category median' : c.basis === 'blended' ? 'blended with overall' : 'overall median';
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.count + '</td><td class="num">' + c.median.toFixed(3) + '</td><td class="num">' + c.used.toFixed(3) + '</td><td>' + src + '</td></tr>';
    }).join('');
    return '<div class="panel method"><h2>How the value is computed</h2>' +
      '<p>Every row is priced the same way, from the snapshot\u2019s own figures only. No protocol name is ever special-cased: the same function scores all ' + fmtInt(D.board_size) + ' rows.</p>' +
      '<div class="formula"><b>comparable</b> = median market-cap / TVL of the live-token protocols in the same category<br>' +
      '(at least ' + D.model.min_comparables + ' of them; fewer are shrunk toward the overall median of ' + D.overall_median.toFixed(3) + ', none means the overall median), clamped to [' + D.model.multiple_floor + ', ' + D.model.multiple_cap + ']<br>' +
      '<b>base</b> = TVL \u00d7 comparable<br>' +
      '<b>growth</b> = 1 + clamp(7d change, ' + D.model.growth_floor + '%, ' + D.model.growth_cap + '%) / 100 \u00d7 ' + D.model.growth_weight + '<br>' +
      '<b>maturity</b> = ' + D.model.maturity_floor + ' + min(age, ' + D.model.maturity_days + 'd) / ' + D.model.maturity_days + ' \u00d7 ' + D.model.maturity_range + ' &nbsp;(age unknown: ' + D.model.unknown_age_days + 'd)<br>' +
      '<b>breadth</b> = 1 + min(chains \u2212 1, ' + D.model.breadth_max_chains + ') \u00d7 ' + D.model.breadth_per_chain + '<br>' +
      '<b>implied value</b> = base \u00d7 growth \u00d7 maturity \u00d7 breadth</div>' +
      '<p>The comparable is the model\u2019s one judgement call, and it is computed from the snapshot itself: a lending protocol that has not launched yet is priced the way the market prices the lending protocols that have. A category with too few live tokens to trust is shrunk toward the overall median, and a category with none is priced at the overall median outright \u2014 the model invents no price where it has no data. Every multiple is clamped so a thin category cannot set an absurd price.</p>' +
      '<h3>Comparable multiples by category</h3>' +
      '<div class="table-wrap"><table><thead><tr><th>Category</th><th>Live tokens</th><th>Median</th><th>Multiple used</th><th>Source</th></tr></thead><tbody>' + compRows + '</tbody></table></div>' +
      '<h3>What the board leaves out, and why</h3>' +
      '<p>A protocol records no token yet is not the same as a protocol with no token to launch. Exchanges, wrapped products (WBTC is Bitcoin on Ethereum), staked products (Binance staked ETH is ETH in a staking product), bridged products and versioned pools of another protocol are left out: their token already trades under another name. The watchlist is the floor, never the ceiling \u2014 the board also ranks the ' + fmtInt(D.board_size - D.watchlist_size) + ' rankable protocols below it, on the same terms.</p>' +
      '<p class="note">Implied value is this entry\u2019s own claim, never one make.fun makes. The watchlist is DefiLlama\u2019s record, not proof: an entry says a protocol records no token, never that it has none. Snapshot: ' + esc(D.source) + '.</p></div>';
  }

  function parseStep(s) {
    var ci = s.lastIndexOf(' Cost: ');
    var ti = s.lastIndexOf(' Time: ');
    if (ci < 0 || ti < 0) return { text: s, cost: '', time: '' };
    return { text: s.slice(0, ci), cost: s.slice(ci + 7, ti), time: s.slice(ti + 7).replace(/\.$/, '') };
  }

  function detailHtml(r) {
    var steps = r.farm_steps.map(function (s) {
      var p = parseStep(s);
      return '<li><b>' + esc(p.text) + '</b><span class="cost">Cost: ' + esc(p.cost) + ' \u00b7 Time: ' + esc(p.time) + '</span></li>';
    }).join('');
    var multNote = r.comparable_basis === 'category'
      ? r.comparable_category + ' multiple (' + r.comparable_count + ' live tokens)'
      : r.comparable_basis === 'blended'
        ? r.comparable_category + ' multiple, blended (' + r.comparable_count + ' live tokens)'
        : 'overall median (no live token in this category)';
    return '<aside class="detail" id="detail" role="dialog" aria-label="Protocol detail">' +
      '<div class="detail-head"><div><span class="sub">Rank #' + r.rank + ' \u00b7 ' + esc(r.category || 'Uncategorized') + '</span>' +
      '<h2>' + esc(r.name) + '</h2><span class="sub">' + esc(r.slug) + ' \u00b7 ' + esc(r.chains.join(', ') || 'no chain listed') + (r.watchlist ? ' \u00b7 <span class="badge watch">WATCHLIST</span>' : '') + '</span></div>' +
      '<button class="close" id="detail-close" type="button">Close \u00d7</button></div>' +
      '<div class="detail-section"><h3>Implied value</h3><div class="equation">' +
      '<div><span>TVL</span><b>' + fmtUsd(r.tvl_usd) + '</b></div>' +
      '<div><span>\u00d7 ' + esc(multNote) + '</span><b>' + r.comparable_multiple.toFixed(3) + '</b></div>' +
      '<div><span>= base value</span><b>' + fmtUsd(r.base_usd) + '</b></div>' +
      '<div><span>\u00d7 growth (' + fmtPct(r.change_7d) + ' over 7d)</span><b>' + r.growth_multiplier.toFixed(3) + '</b></div>' +
      '<div><span>\u00d7 maturity (' + ageLabel(r.age_days) + ' with no token)</span><b>' + r.maturity_multiplier.toFixed(3) + '</b></div>' +
      '<div><span>\u00d7 breadth (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</span><b>' + r.breadth_multiplier.toFixed(3) + '</b></div>' +
      '<div class="total"><span>Implied value</span><b>' + fmtUsd(r.implied_value_usd) + '</b></div>' +
      '</div><p style="margin-top:12px">The multiple is the median market-cap-to-TVL ratio of the live-token protocols in the same category, computed from this snapshot. The implied value is this entry\u2019s own claim.</p></div>' +
      '<div class="detail-section"><h3>How to farm it</h3><ol class="steps">' + steps + '</ol></div>' +
      '<div class="detail-section"><h3>At a glance</h3><div class="kv">' +
      '<div><span>TVL</span><b class="num">' + fmtUsd(r.tvl_usd) + '</b></div>' +
      '<div><span>7-day change</span><b class="num ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</b></div>' +
      '<div><span>Listed</span><b>' + esc(r.listed_at || 'unknown') + '</b></div>' +
      '<div><span>Age with no token</span><b>' + ageLabel(r.age_days) + '</b></div>' +
      '<div><span>Chains</span><b>' + esc(r.chains.join(', ') || '—') + '</b></div>' +
      '</div></div></aside>';
  }

  function render() {
    var top = D.rows[0];
    var med = D.rows.length ? D.rows[Math.floor(D.rows.length / 2)].implied_value_usd : 0;
    var html = '<div class="shell">' +
      '<div class="top"><div class="brand"><span class="mark"></span><span class="brand-name">Token Radar \u00b7 ' + esc(D.model_version) + '</span></div>' +
      '<div class="top-meta"><span>Snapshot <b>' + esc(D.as_of) + '</b></span><span>Floor <b>' + fmtUsd(D.floor_usd) + '</b></span><span>Source <b>DefiLlama</b></span></div></div>' +
      '<div class="lede"><div><h1>Which pre-token protocol is worth farming next?</h1>' +
      '<p><b>' + fmtInt(D.board_size) + ' protocols</b> with no token on record, ranked by what a launch could be worth \u2014 priced off the market caps of the tokens that already trade, not off a list of names. Every row carries a farm plan: concrete steps, what they cost, how long they take.</p></div>' +
      '<div class="facts"><div class="fact"><span>Watchlist covered</span><b>' + D.watchlist_size + ' / ' + D.watchlist_size + '</b></div>' +
      '<div class="fact"><span>Board rows</span><b>' + fmtInt(D.board_size) + '</b></div>' +
      '<div class="fact"><span>Top implied value</span><b>' + fmtUsd(top ? top.implied_value_usd : 0) + '</b></div>' +
      '<div class="fact"><span>Median implied value</span><b>' + fmtUsd(med) + '</b></div></div></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + fmtInt(D.board_size) + '</b><span>pre-token protocols ranked</span></div>' +
      '<div class="stat"><b>' + D.watchlist_size + '</b><span>on the DefiLlama watchlist, all covered</span></div>' +
      '<div class="stat"><b>' + fmtInt(D.board_size - D.watchlist_size) + '</b><span>ranked below the watchlist floor</span></div>' +
      '<div class="stat"><b>' + D.live_size + '</b><span>live-token comparables priced by the market</span></div></div>' +
      '<div class="controls"><div class="tabs" role="group" aria-label="View">' +
      '<button type="button" data-view="board" aria-pressed="' + (state.view === 'board') + '">Board</button>' +
      '<button type="button" data-view="live" aria-pressed="' + (state.view === 'live') + '">Live tokens</button>' +
      '<button type="button" data-view="method" aria-pressed="' + (state.view === 'method') + '">How it works</button></div>' +
      '<div class="field"><label for="q">Search</label><input id="q" type="search" placeholder="Name, slug or category" value="' + esc(state.q) + '"></div>' +
      '<div class="field"><label for="cat">Category</label><select id="cat"><option value="">All categories</option>' +
      categories.map(function (c) { return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain"><option value="">All chains</option>' +
      chains.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="sort">Sort by</label><select id="sort">' +
      '<option value="rank"' + (state.sort === 'rank' ? ' selected' : '') + '>Rank</option>' +
      '<option value="tvl"' + (state.sort === 'tvl' ? ' selected' : '') + '>TVL</option>' +
      '<option value="growth"' + (state.sort === 'growth' ? ' selected' : '') + '>7-day growth</option>' +
      '<option value="age"' + (state.sort === 'age' ? ' selected' : '') + '>Age</option></select></div>' +
      '<label class="check"><input type="checkbox" id="watch" ' + (state.watchOnly ? 'checked' : '') + '> Watchlist only</label>' +
      '<span class="count" id="count"></span></div>' +
      '<div id="view">' + (state.view === 'live' ? liveHtml() : state.view === 'method' ? methodHtml() : boardHtml()) + '</div>' +
      '</div>';
    var main = document.getElementById('board');
    main.innerHTML = html;
    main.setAttribute('aria-busy', 'false');
    var count = document.getElementById('count');
    if (count) count.textContent = state.view === 'board' ? filteredRows().length + ' of ' + D.board_size + ' rows' : state.view === 'live' ? D.live_size + ' live-token protocols' : 'Model ' + D.model_version;

    var detailRow = state.detail ? D.rows.find(function (r) { return r.slug === state.detail; }) : null;
    if (detailRow) {
      main.insertAdjacentHTML('beforeend', detailHtml(detailRow));
    } else if (state.detail) {
      state.detail = null;
    }

    main.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { state.view = b.getAttribute('data-view'); state.detail = null; render(); });
    });
    main.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { state.detail = tr.getAttribute('data-slug'); render(); });
    });
    var close = document.getElementById('detail-close');
    if (close) close.addEventListener('click', function () { state.detail = null; render(); });
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; state.view = 'board'; render(); });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; state.view = 'board'; render(); });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; state.view = 'board'; render(); });
    var sort = document.getElementById('sort');
    if (sort) sort.addEventListener('change', function () { state.sort = sort.value; state.view = 'board'; render(); });
    var watch = document.getElementById('watch');
    if (watch) watch.addEventListener('change', function () { state.watchOnly = watch.checked; state.view = 'board'; render(); });

    window.__shotReady = true;
    window.__shotState = state.view + (state.detail ? ' detail:' + state.detail : '') + (state.category ? ' category:' + state.category : '') + ' rows:' + (state.view === 'board' ? filteredRows().length : 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
