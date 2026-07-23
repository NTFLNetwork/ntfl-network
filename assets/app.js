
const SITE_DATA_URL = 'data/site-data.json?v=' + Date.now();
const STORAGE_DRAFT = 'ntfl_draft_state_v1';
const STORAGE_SUPABASE = 'ntfl_supabase_config_v1';

const state = {
  data: null,
  page: document.body.dataset.page || 'home',
  team: new URLSearchParams(location.search).get('team') || '',
  week: Number(new URLSearchParams(location.search).get('week') || 0),
  draftMode: false,
  tabs: {},
  filters: {
    division: 'All',
    search: ''
  },
  dragIndex: null,
  toastTimer: null,
};

const el = {};
const TEAM_ORDER = ['BUF','MIA','NE','NYJ','BAL','CIN','CLE','PIT','HOU','IND','JAX','TEN','KC','LAC','DEN','LV','DAL','PHI','NYG','WSH','DET','GB','MIN','CHI','TB','ATL','NO','CAR','SF','SEA','LAR','ARI'];

function $(sel, root=document){ return root.querySelector(sel); }
function $$(sel, root=document){ return [...root.querySelectorAll(sel)]; }

function escapeHtml(v){
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function safeSlug(v){
  return String(v ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function loadLocalDraft(){
  try { return JSON.parse(localStorage.getItem(STORAGE_DRAFT) || 'null'); } catch { return null; }
}
function saveLocalDraft(data){
  localStorage.setItem(STORAGE_DRAFT, JSON.stringify(data));
}
function clearLocalDraft(){
  localStorage.removeItem(STORAGE_DRAFT);
}
function saveSupabaseConfig(cfg){
  localStorage.setItem(STORAGE_SUPABASE, JSON.stringify(cfg));
}
function loadSupabaseConfig(){
  try { return JSON.parse(localStorage.getItem(STORAGE_SUPABASE) || 'null'); } catch { return null; }
}
function showToast(msg){
  const t = $('#toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(()=>t.classList.remove('show'), 2400);
}
function teamMeta(abbr){
  const t = state.data?.teams?.[abbr];
  return t || null;
}
function teamColor(abbr){
  const t = teamMeta(abbr);
  return t?.colors?.primary || '#4f8cff';
}
function teamAccent(abbr){
  const t = teamMeta(abbr);
  return t?.colors?.secondary || '#7c9cff';
}
function teamLogo(abbr){
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${String(abbr || '').toLowerCase()}.png`;
}
function logoFallback(){
  return 'assets/logo.svg';
}
function abbreviationList(){
  const teams = Object.values(state.data?.teams || {});
  return teams.sort((a,b)=> TEAM_ORDER.indexOf(a.abbr) - TEAM_ORDER.indexOf(b.abbr) || a.name.localeCompare(b.name));
}
function currentWeek(){
  return Number(state.data?.site?.currentWeek || 1);
}
function currentSeason(){
  return state.data?.site?.season || 'Season 3';
}
function weekSort(a,b){
  return (a.weekNumber||0) - (b.weekNumber||0) || String(a.home||'').localeCompare(String(b.home||''));
}
function sortStandings(rows){
  return [...rows].sort((a,b)=> b.wins - a.wins || b.pointDiff - a.pointDiff || b.pointsFor - a.pointsFor || a.name.localeCompare(b.name));
}

function parseGameStatus(game){
  if(game.status) return game.status;
  if(Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore)) return 'final';
  return 'scheduled';
}

function computeDerived(data){
  const teams = data.teams || {};
  Object.values(teams).forEach(t => {
    t.schedule = [];
    t.gamesPlayed = 0;
    t.wins = 0; t.losses = 0; t.ties = 0;
    t.pointsFor = 0; t.pointsAgainst = 0;
    t.homeWins = 0; t.homeLosses = 0; t.awayWins = 0; t.awayLosses = 0;
    t.results = [];
  });

  const unique = new Map();
  (data.games || []).forEach(g => {
    const home = g.home;
    const away = g.away;
    const key = `${g.division}-${g.weekNumber}-${[home,away].sort().join('-')}`;
    const existing = unique.get(key);
    const scoreGame = Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore);
    const normalized = {
      ...g,
      status: parseGameStatus(g),
      note: g.note || '',
      result: scoreGame ? (g.homeScore > g.awayScore ? home : g.awayScore > g.homeScore ? away : 'T') : '',
    };
    if(!existing || (normalized.status === 'final' && existing.status !== 'final')) {
      unique.set(key, normalized);
    }
  });
  const games = [...unique.values()].sort((a,b)=> a.weekNumber - b.weekNumber || a.division.localeCompare(b.division) || a.home.localeCompare(b.home));

  // schedule per team and stats
  games.forEach(g => {
    const home = teams[g.home];
    const away = teams[g.away];
    const hs = Number(g.homeScore);
    const as = Number(g.awayScore);
    const final = g.status === 'final' || Number.isFinite(hs) && Number.isFinite(as);
    const display = final ? `${hs} - ${as}` : (g.note || g.raw || 'Scheduled');

    if(home){
      home.schedule.push({
        ...g, perspective: 'home', opponent: g.away, display,
      });
    }
    if(away){
      away.schedule.push({
        ...g, perspective: 'away', opponent: g.home, display,
      });
    }
    if(final && Number.isFinite(hs) && Number.isFinite(as)){
      if(home){
        home.gamesPlayed++;
        home.pointsFor += hs;
        home.pointsAgainst += as;
        if(hs>as){ home.wins++; home.homeWins++; home.results.push('W'); }
        else if(hs<as){ home.losses++; home.homeLosses++; home.results.push('L'); }
        else { home.ties++; home.results.push('T'); }
      }
      if(away){
        away.gamesPlayed++;
        away.pointsFor += as;
        away.pointsAgainst += hs;
        if(as>hs){ away.wins++; away.awayWins++; away.results.push('W'); }
        else if(as<hs){ away.losses++; away.awayLosses++; away.results.push('L'); }
        else { away.ties++; away.results.push('T'); }
      }
    }
  });

  Object.values(teams).forEach(t => {
    t.pointDiff = t.pointsFor - t.pointsAgainst;
    t.ppg = t.gamesPlayed ? +(t.pointsFor / t.gamesPlayed).toFixed(1) : 0;
    t.oppg = t.gamesPlayed ? +(t.pointsAgainst / t.gamesPlayed).toFixed(1) : 0;
    t.record = `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ''}`;
    t.homeRecord = `${t.homeWins}-${t.homeLosses}`;
    t.awayRecord = `${t.awayWins}-${t.awayLosses}`;
    t.streak = (() => {
      if(!t.results.length) return '—';
      const last = t.results[t.results.length-1];
      let n = 1;
      for(let i=t.results.length-2; i>=0; i--){
        if(t.results[i] !== last) break;
        n++;
      }
      return `${last}${n}`;
    })();
    t.last5 = t.results.slice(-5).reverse();
    t.rank = 0;
    t.schedule.sort((a,b)=> a.weekNumber - b.weekNumber || a.home.localeCompare(b.home));
    t.schedule = t.schedule.map(g => ({
      ...g,
      status: parseGameStatus(g),
      opponentShort: teams[g.opponent]?.shortName || teams[g.opponent]?.name || g.opponent,
    }));
  });

  const standings = sortStandings(Object.values(teams).map(t => ({
    abbr: t.abbr,
    name: t.name,
    division: t.division,
    record: t.record,
    wins: t.wins,
    losses: t.losses,
    ties: t.ties,
    pointsFor: t.pointsFor,
    pointsAgainst: t.pointsAgainst,
    pointDiff: t.pointDiff,
    ppg: t.ppg,
    oppg: t.oppg,
    color: t.colors.primary,
    logo: t.logo,
  })));
  standings.forEach((r,i)=>r.rank = i+1);

  data.teams = teams;
  data.games = games;
  data.standings = standings;
  if(!Array.isArray(data.rankings) || !data.rankings.length){
    data.rankings = standings.map(r => ({
      rank: r.rank,
      abbr: r.abbr,
      name: r.name,
      division: r.division,
      record: r.record,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      pointsFor: r.pointsFor,
      pointsAgainst: r.pointsAgainst,
      pointDiff: r.pointDiff,
      ppg: r.ppg,
      oppg: r.oppg
    }));
  } else {
    data.rankings = data.rankings.map((r, idx) => {
      const t = teams[r.abbr || r.name] || standings.find(s => s.abbr === r.abbr);
      return {
        ...r,
        rank: idx+1,
        abbr: t?.abbr || r.abbr,
        name: t?.name || r.name,
        division: t?.division || r.division,
        record: t?.record || r.record,
        wins: t?.wins ?? r.wins ?? 0,
        losses: t?.losses ?? r.losses ?? 0,
        ties: t?.ties ?? r.ties ?? 0,
        pointsFor: t?.pointsFor ?? r.pointsFor ?? 0,
        pointsAgainst: t?.pointsAgainst ?? r.pointsAgainst ?? 0,
        pointDiff: t?.pointDiff ?? r.pointDiff ?? 0,
        ppg: t?.ppg ?? r.ppg ?? 0,
        oppg: t?.oppg ?? r.oppg ?? 0
      };
    });
  }
  return data;
}

async function loadJson(url){
  const res = await fetch(url, { cache: 'no-store' });
  if(!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return await res.json();
}

async function loadState(){
  const bootstrap = await loadJson(SITE_DATA_URL);
  let data = computeDerived(structuredClone(bootstrap));
  if(state.page === 'admin'){
    const draft = loadLocalDraft();
    if(draft){
      data = computeDerived(structuredClone(draft));
      state.draftMode = true;
    }
  }
  // if Supabase is configured in bootstrap, try loading live state
  const cfg = bootstrap.site?.supabase;
  if(cfg?.url && cfg?.anonKey && cfg?.table){
    try{
      const remote = await loadRemoteState(cfg);
      if(remote){
        data = computeDerived(structuredClone(remote));
      }
    } catch (e) {
      console.warn('Remote load failed', e);
    }
  }
  state.data = data;
  saveSupabaseConfig(state.data.site.supabase || cfg || {});
  return data;
}

async function ensureSupabaseLoaded(){
  if(window.supabase) return window.supabase;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.supabase;
}
async function getSupabaseClient(cfg){
  if(!cfg?.url || !cfg?.anonKey) return null;
  await ensureSupabaseLoaded();
  return window.supabase.createClient(cfg.url, cfg.anonKey);
}
async function loadRemoteState(cfg){
  const client = await getSupabaseClient(cfg);
  if(!client) return null;
  const { data, error } = await client.from(cfg.table || 'ntfl_site_state').select('data').eq('id', Number(cfg.rowId || 1)).maybeSingle();
  if(error) throw error;
  return data?.data || null;
}
async function saveRemoteState(cfg, payload){
  const client = await getSupabaseClient(cfg);
  if(!client) throw new Error('Supabase not configured');
  const { error } = await client.from(cfg.table || 'ntfl_site_state').upsert({ id: Number(cfg.rowId || 1), data: payload }, { onConflict: 'id' });
  if(error) throw error;
  return true;
}

function teamRecordText(t){
  return `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ''}`;
}

function teamHeader(team){
  return `
    <section class="card team-header" style="border-left:4px solid ${team.colors.primary}">
      <div class="team-logo" style="box-shadow:0 0 0 6px color-mix(in srgb, ${team.colors.primary} 20%, transparent);">
        <img src="${team.logo}" alt="${escapeHtml(team.name)} logo" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\'team-mark\' style=\'background:${team.colors.primary}\'>${escapeHtml(team.abbr)}</div>';">
      </div>
      <div>
        <div class="pill-row">
          <span class="eyebrow">${escapeHtml(team.abbr)}</span>
          <span class="pill">${escapeHtml(team.division)}</span>
          <span class="pill">${escapeHtml(teamRecordText(team))}</span>
        </div>
        <h1>${escapeHtml(team.name)}</h1>
        <p>${escapeHtml(team.headCoach || 'TBD')}${team.assistantCoach ? ` • ${escapeHtml(team.assistantCoach)}` : ''}</p>
      </div>
      <div class="pill-row">
        <span class="pill">PPG ${team.ppg.toFixed(1)}</span>
        <span class="pill">OPPG ${team.oppg.toFixed(1)}</span>
      </div>
    </section>
  `;
}

function metricCard(label, value, color){
  return `<div class="stat-card" style="border-color:${color}22"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderTopbar(){
  return `
    <header class="topbar">
      <div class="container topbar-inner">
        <a class="brand" href="index.html">
          <img src="assets/league-logo.jpeg" alt="NTFL logo" onerror="this.src='assets/logo.svg'">
          <div class="brand-copy">
            <strong>${escapeHtml(state.data.site.name)}</strong>
            <span>${escapeHtml(state.data.site.season)} • Week ${currentWeek()}</span>
          </div>
        </a>
        <nav class="nav">
          <a class="nav-pill" href="index.html">Home</a>
          <details class="menu-wrap">
            <summary class="menu-toggle">Menu</summary>
            <div class="menu-panel">
              <div class="menu-group">
                <span>League</span>
                <a href="teams.html">Teams</a>
                <a href="schedule.html">Schedule</a>
                <a href="standings.html">Standings</a>
                <a href="rankings.html">Rankings</a>
              </div>
              <div class="menu-group">
                <span>Archive</span>
                <a href="awards.html">Awards</a>
                <a href="history.html">History</a>
                <a href="hof.html">Hall of Fame</a>
              </div>
              <div class="menu-group">
                <span>Tools</span>
                <a href="admin.html">Admin</a>
              </div>
            </div>
          </details>
          <a class="nav-pill" href="admin.html">Admin</a>
        </nav>
      </div>
    </header>
  `;
}

function homePage(){
  const live = state.data.games.filter(g => parseGameStatus(g)==='scheduled' && g.weekNumber === currentWeek()).slice(0,4);
  const recent = [...state.data.games].filter(g => g.status === 'final').slice(-4).reverse();
  const top4 = state.data.standings.slice(0,4);
  return `
    <section class="hero">
      <div class="hero-card">
        <div class="hero-top">
          <div class="hero-logo">
            <img src="assets/league-logo.jpeg" alt="League logo" onerror="this.src='assets/logo.svg'">
          </div>
          <div>
            <span class="eyebrow">${escapeHtml(state.data.site.season)} • Week ${currentWeek()} • ${escapeHtml(state.data.site.version)}</span>
            <h1>${escapeHtml(state.data.site.name)}</h1>
            <p>${escapeHtml(state.data.site.subtitle)}</p>
            <div class="hero-actions">
              <a class="btn primary" href="teams.html">Browse Teams</a>
              <a class="btn" href="schedule.html">View Schedule</a>
              <a class="btn" href="standings.html">Standings</a>
            </div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="section-head"><div><h2>Quick Notes</h2><p>Public hub with live updates through Supabase.</p></div></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
          ${metricCard('Teams', String(Object.keys(state.data.teams).length), '#4f8cff')}
          ${metricCard('Live Week', String(currentWeek()), '#7c9cff')}
          ${metricCard('Final Games', String(state.data.games.filter(g => g.status==='final').length), '#21c55d')}
          ${metricCard('Top Team', state.data.standings[0]?.name || '—', '#f59e0b')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Featured Week ${currentWeek()} Games</h2><p>Clean cards for every matchup.</p></div>
        <a href="schedule.html">Full schedule</a>
      </div>
      <div class="grid cards-2">
        ${live.map(gameCard).join('') || '<div class="empty">No featured games.</div>'}
      </div>
    </section>

    <section class="section two-col grid">
      <div>
        <div class="section-head"><div><h2>Latest Results</h2><p>Recent final scores.</p></div></div>
        <div class="stack">
          ${recent.map(gameCard).join('') || '<div class="empty">No final games yet.</div>'}
        </div>
      </div>
      <div>
        <div class="section-head"><div><h2>Standings Preview</h2><p>Auto-built from final scores.</p></div><a href="standings.html">Full table</a></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>#</th><th>Team</th><th>Rec</th><th>Diff</th></tr></thead>
            <tbody>
              ${top4.map(r=>`
                <tr>
                  <td>${r.rank}</td>
                  <td><a href="team.html?team=${r.abbr}">${escapeHtml(r.name)}</a></td>
                  <td><strong>${escapeHtml(r.record)}</strong></td>
                  <td class="${r.pointDiff>=0?'good':'bad'}">${r.pointDiff>=0?'+':''}${r.pointDiff}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>Teams</h2><p>Click any team for a full rundown.</p></div>
        <a href="teams.html">All teams</a>
      </div>
      <div class="grid team-grid">
        ${abbreviationList().slice(0,12).map(teamCard).join('')}
      </div>
    </section>
  `;
}

function teamCard(t){
  return `
    <a class="team-card" href="team.html?team=${t.abbr}" style="border-left:4px solid ${t.colors.primary}">
      <div class="team-logo" style="box-shadow:0 0 0 5px color-mix(in srgb, ${t.colors.primary} 18%, transparent);">
        <img src="${t.logo}" alt="${escapeHtml(t.name)} logo" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\'team-mark\' style=\'background:${t.colors.primary}\'>${escapeHtml(t.abbr)}</div>';">
      </div>
      <div class="team-body">
        <strong>${escapeHtml(t.abbr)}</strong>
        <span>${escapeHtml(t.name)}</span>
        <small>${escapeHtml(t.division)}</small>
        <small>${escapeHtml(t.record)} • PPG ${t.ppg.toFixed(1)}</small>
      </div>
    </a>
  `;
}

function gameCard(g){
  const home = state.data.teams[g.home];
  const away = state.data.teams[g.away];
  const status = parseGameStatus(g);
  const scoreText = Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore) ? `${g.homeScore} - ${g.awayScore}` : (g.note || 'Scheduled');
  const homeWinner = status === 'final' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore) && g.homeScore > g.awayScore;
  const awayWinner = status === 'final' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore) && g.awayScore > g.homeScore;
  return `
    <article class="card schedule-card ${status}" style="border-left-color:${status==='final' ? '#21c55d' : status==='live' ? '#ef4444' : '#f59e0b'}">
      <div class="row between">
        <div class="row tight">
          <span class="pill">${escapeHtml(g.week)}</span>
          <span class="pill ${status}">${status === 'final' ? 'FINAL' : status === 'live' ? 'LIVE' : (g.note || 'UPCOMING')}</span>
        </div>
        <span class="pill">${escapeHtml(g.division)}</span>
      </div>
      <div class="game-line">
        <a class="game-team ${homeWinner ? 'winner' : ''}" href="team.html?team=${home.abbr}">
          <div class="team-logo" style="width:46px;height:46px">
            <img src="${home.logo}" alt="${escapeHtml(home.name)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\'team-mark\' style=\'background:${home.colors.primary};width:46px;height:46px;font-size:.86rem\'>${escapeHtml(home.abbr)}</div>';">
          </div>
          <div>
            <strong>${escapeHtml(home.abbr)}</strong>
            <small>${escapeHtml(home.name)}</small>
          </div>
        </a>
        <div class="game-score ${status}">${escapeHtml(scoreText)}</div>
        <a class="game-team ${awayWinner ? 'winner' : ''}" href="team.html?team=${away.abbr}">
          <div class="team-logo" style="width:46px;height:46px">
            <img src="${away.logo}" alt="${escapeHtml(away.name)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\'team-mark\' style=\'background:${away.colors.primary};width:46px;height:46px;font-size:.86rem\'>${escapeHtml(away.abbr)}</div>';">
          </div>
          <div>
            <strong>${escapeHtml(away.abbr)}</strong>
            <small>${escapeHtml(away.name)}</small>
          </div>
        </a>
      </div>
    </article>
  `;
}

function teamsPage(){
  const q = state.filters.search.toLowerCase();
  const divs = [...new Set(Object.values(state.data.teams).map(t=>t.division))];
  const teams = abbreviationList().filter(t => {
    const s = `${t.abbr} ${t.name} ${t.headCoach} ${t.assistantCoach} ${t.division}`.toLowerCase();
    const divOk = state.filters.division === 'All' || t.division === state.filters.division;
    return divOk && (!q || s.includes(q));
  });
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">League</span>
        <h1>Teams</h1>
        <p>Every team has a page with stats, schedule, coaches, and notes.</p>
      </div>
      <div class="page-tools">
        <input class="search" placeholder="Search teams or coaches" value="${escapeHtml(state.filters.search)}" oninput="NTFL.searchTeams(this.value)">
      </div>
    </section>
    <div class="chip-row section">
      <button class="chip ${state.filters.division==='All'?'active':''}" onclick="NTFL.setDivision('All')">All</button>
      ${divs.map(d=>`<button class="chip ${state.filters.division===d?'active':''}" onclick="NTFL.setDivision('${escapeHtml(d)}')">${escapeHtml(d)}</button>`).join('')}
    </div>
    <section class="section grid team-grid cards-4">
      ${teams.map(teamCard).join('') || '<div class="empty">No teams found.</div>'}
    </section>
  `;
}

function teamPage(){
  const team = state.data.teams[state.team] || state.data.teams[decodeURIComponent(state.team)] || null;
  if(!team){
    return `<div class="empty">Team not found.</div>`;
  }
  const tab = state.tabs[team.abbr] || 'overview';
  const overview = `
    <div class="grid stats-grid">
      ${metricCard('Record', team.record, team.colors.primary)}
      ${metricCard('Points For', String(team.pointsFor), team.colors.primary)}
      ${metricCard('Points Against', String(team.pointsAgainst), team.colors.secondary)}
      ${metricCard('Point Diff', `${team.pointDiff >= 0 ? '+' : ''}${team.pointDiff}`, team.colors.primary)}
      ${metricCard('PPG', team.ppg.toFixed(1), team.colors.primary)}
      ${metricCard('OPPG', team.oppg.toFixed(1), team.colors.secondary)}
      ${metricCard('Home Record', team.homeRecord, team.colors.primary)}
      ${metricCard('Away Record', team.awayRecord, team.colors.secondary)}
    </div>
    <div class="grid two-col section">
      <div class="card">
        <h3>Quick Snapshot</h3>
        <p class="notes-box">${escapeHtml(team.notes || '')}</p>
        <div class="pill-row">
          <span class="pill">Streak ${escapeHtml(team.streak)}</span>
          <span class="pill">Rank #${team.rank || '—'}</span>
          <span class="pill">${escapeHtml(team.division)}</span>
        </div>
      </div>
      <div class="card">
        <h3>Last 5</h3>
        <div class="stack">
          ${(team.last5 || []).map(r => `
            <div class="mini-row">
              <div class="mini-rank ${r==='W'?'good':r==='L'?'bad':''}">${r}</div>
              <div class="mini-body">
                <strong>${escapeHtml(team.name)}</strong>
                <span>Recent result</span>
              </div>
            </div>
          `).join('') || '<div class="empty">No completed games yet.</div>'}
        </div>
      </div>
    </div>
  `;
  const schedule = `
    <div class="stack section">
      ${(team.schedule || []).map(g => `
        <article class="card schedule-card ${g.status}" style="border-left-color:${g.status==='final' ? '#21c55d' : g.status==='live' ? '#ef4444' : '#f59e0b'}">
          <div class="row between">
            <div class="row tight">
              <span class="pill">${escapeHtml(g.week)}</span>
              <span class="pill ${g.status}">${g.status==='final' ? 'FINAL' : g.status==='live' ? 'LIVE' : (g.note || 'UPCOMING')}</span>
              <span class="pill">${escapeHtml(g.division)}</span>
            </div>
            <span class="muted tiny">${g.perspective === 'home' ? 'Home' : 'Away'}</span>
          </div>
          <div class="game-line">
            <a class="game-team" href="team.html?team=${g.home}">
              <div class="team-logo" style="width:40px;height:40px"><img src="${state.data.teams[g.home].logo}" alt="" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\'team-mark\' style=\'background:${state.data.teams[g.home].colors.primary};width:40px;height:40px;font-size:.82rem\'>${escapeHtml(g.home)}</div>';"></div>
              <div><strong>${escapeHtml(g.home)}</strong><small>Home</small></div>
            </a>
            <div class="game-score ${g.status}">${escapeHtml(Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore) ? `${g.homeScore} - ${g.awayScore}` : (g.note || 'Scheduled'))}</div>
            <a class="game-team" href="team.html?team=${g.away}">
              <div class="team-logo" style="width:40px;height:40px"><img src="${state.data.teams[g.away].logo}" alt="" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\'team-mark\' style=\'background:${state.data.teams[g.away].colors.primary};width:40px;height:40px;font-size:.82rem\'>${escapeHtml(g.away)}</div>';"></div>
              <div><strong>${escapeHtml(g.away)}</strong><small>Away</small></div>
            </a>
          </div>
        </article>
      `).join('') || '<div class="empty">No schedule available.</div>'}
    </div>
  `;
  const stats = `
    <div class="grid stats-grid">
      ${metricCard('Wins', String(team.wins), team.colors.primary)}
      ${metricCard('Losses', String(team.losses), team.colors.secondary)}
      ${metricCard('Points For', String(team.pointsFor), team.colors.primary)}
      ${metricCard('Points Against', String(team.pointsAgainst), team.colors.secondary)}
      ${metricCard('PPG', team.ppg.toFixed(1), team.colors.primary)}
      ${metricCard('OPPG', team.oppg.toFixed(1), team.colors.secondary)}
      ${metricCard('Point Diff', `${team.pointDiff >= 0 ? '+' : ''}${team.pointDiff}`, team.colors.primary)}
      ${metricCard('Games Played', String(team.gamesPlayed), team.colors.secondary)}
    </div>
  `;
  const coaches = `
    <div class="grid cards-2 section">
      <div class="card"><h3>Head Coach</h3><p>${escapeHtml(team.headCoach || 'TBD')}</p></div>
      <div class="card"><h3>Assistant Coach</h3><p>${escapeHtml(team.assistantCoach || 'TBD')}</p></div>
    </div>
  `;
  const notes = `<div class="card section"><h3>Team Notes</h3><p class="notes-box">${escapeHtml(team.notes || 'No notes yet.')}</p></div>`;

  const content = tab === 'overview' ? overview
    : tab === 'schedule' ? schedule
    : tab === 'stats' ? stats
    : tab === 'coaches' ? coaches
    : notes;

  return `
    ${teamHeader(team)}
    <div class="tabs">
      ${['overview','schedule','stats','coaches','notes'].map(t => `<button class="tab ${tab===t ? 'active' : ''}" onclick="NTFL.setTeamTab('${team.abbr}','${t}')">${t.toUpperCase()}</button>`).join('')}
    </div>
    ${content}
  `;
}

function standingsPage(){
  const rows = state.data.standings;
  const divisions = [...new Set(rows.map(r=>r.division))];
  const filtered = state.filters.division === 'All' ? rows : rows.filter(r => r.division === state.filters.division);
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">League</span>
        <h1>Standings</h1>
        <p>Automatically calculated from final scores.</p>
      </div>
    </section>
    <div class="chip-row section">
      <button class="chip ${state.filters.division==='All'?'active':''}" onclick="NTFL.setDivision('All')">All</button>
      ${divisions.map(d=>`<button class="chip ${state.filters.division===d?'active':''}" onclick="NTFL.setDivision('${escapeHtml(d)}')">${escapeHtml(d)}</button>`).join('')}
    </div>
    <div class="table-wrap section">
      <table class="table">
        <thead><tr><th>#</th><th>Team</th><th>Div</th><th>Rec</th><th>PF</th><th>PA</th><th>Diff</th><th>PPG</th></tr></thead>
        <tbody>
          ${filtered.map(r=>`
            <tr>
              <td>${r.rank}</td>
              <td><a href="team.html?team=${r.abbr}">${escapeHtml(r.name)}</a></td>
              <td>${escapeHtml(r.division)}</td>
              <td><strong>${escapeHtml(r.record)}</strong></td>
              <td>${r.pointsFor}</td>
              <td>${r.pointsAgainst}</td>
              <td class="${r.pointDiff>=0 ? 'good':'bad'}">${r.pointDiff >= 0 ? '+' : ''}${r.pointDiff}</td>
              <td>${Number(r.ppg).toFixed(1)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function rankingsPage(){
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">League</span>
        <h1>Rankings</h1>
        <p>Drag to reorder in Admin. Rankings are public immediately after publish.</p>
      </div>
    </section>
    <div class="stack section">
      ${state.data.rankings.map(r => `
        <a class="card rank-item" href="team.html?team=${r.abbr}">
          <div class="drag">#${r.rank}</div>
          <div class="rank-meta">
            <strong>${escapeHtml(r.abbr)} • ${escapeHtml(r.name)}</strong>
            <span>${escapeHtml(r.division)} • ${escapeHtml(r.record)} • ${r.pointDiff >= 0 ? '+' : ''}${r.pointDiff} diff</span>
          </div>
          <div class="pill">${r.ppg.toFixed ? r.ppg.toFixed(1) : Number(r.ppg).toFixed(1)} PPG</div>
        </a>
      `).join('')}
    </div>
  `;
}

function awardsPage(){
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">Archive</span>
        <h1>Awards</h1>
        <p>Editable honors and season awards.</p>
      </div>
    </section>
    <div class="grid cards-2 section">
      ${state.data.awards.map(a => `
        <div class="card">
          <h3>${escapeHtml(a.category)}</h3>
          <p><strong>${escapeHtml(a.winner)}</strong></p>
          <p>${escapeHtml(a.team || '')}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function historyPage(){
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">Archive</span>
        <h1>History</h1>
        <p>Past seasons, champions, and notes.</p>
      </div>
    </section>
    <div class="stack section">
      ${state.data.history.map(h => `
        <div class="card">
          <div class="row between">
            <h3>${escapeHtml(h.season)}</h3>
            <span class="pill">${escapeHtml(h.record || 'TBD')}</span>
          </div>
          <p><strong>Champion:</strong> ${escapeHtml(h.champion || 'TBD')}</p>
          <p>${escapeHtml(h.notes || '')}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function hofPage(){
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">Archive</span>
        <h1>Hall of Fame</h1>
        <p>Special honors and league legends.</p>
      </div>
    </section>
    <div class="stack section">
      ${(state.data.hallOfFame || []).length ? state.data.hallOfFame.map(h => `
        <div class="card">
          <h3>${escapeHtml(h.name || 'Honoree')}</h3>
          <p>${escapeHtml(h.team || '')}</p>
          <p>${escapeHtml(h.honor || '')}</p>
          <p>${escapeHtml(h.notes || '')}</p>
        </div>
      `).join('') : '<div class="empty">No Hall of Fame entries yet.</div>'}
    </div>
  `;
}

function schedulePage(){
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">League</span>
        <h1>Schedule</h1>
        <p>Week-by-week game cards.</p>
      </div>
    </section>
    <div class="stack section">
      ${state.data.games.slice().sort(weekSort).map(gameCard).join('')}
    </div>
  `;
}

function adminTopCard(){
  const cfg = state.data.site.supabase || {};
  return `
    <div class="admin-card">
      <div class="section-head">
        <div>
          <h2>Public Saving</h2>
          <p>Connect Supabase once, then updates can be saved publicly.</p>
        </div>
      </div>
      <div class="supabase-grid">
        <label>Supabase URL<input id="sb-url" value="${escapeHtml(cfg.url || '')}" placeholder="https://xxxx.supabase.co"></label>
        <label>Anon Key<input id="sb-key" value="${escapeHtml(cfg.anonKey || '')}" placeholder="eyJ..."></label>
        <label>Table<input id="sb-table" value="${escapeHtml(cfg.table || 'ntfl_site_state')}" placeholder="ntfl_site_state"></label>
        <label>Row ID<input id="sb-row" type="number" value="${escapeHtml(cfg.rowId || 1)}" min="1"></label>
      </div>
      <div class="row right" style="margin-top:12px">
        <button class="btn" onclick="NTFL.saveDraftOnly()">Save Draft</button>
        <button class="btn primary" onclick="NTFL.publishPublic()">Publish Public</button>
        <button class="btn" onclick="NTFL.downloadData()">Download site-data.json</button>
      </div>
      <p class="help">You will still do one initial GitHub upload of site-data.json with the Supabase settings filled in. After that, public saves go straight to Supabase.</p>
    </div>
  `;
}

function adminPage(){
  return `
    <section class="page-head">
      <div>
        <span class="eyebrow">Admin</span>
        <h1>Dashboard</h1>
        <p>Edit scores, team rundowns, rankings, awards, history, and public settings.</p>
      </div>
      <div class="page-tools">
        <button class="btn" onclick="NTFL.reloadLive()">Load Live</button>
        <button class="btn" onclick="NTFL.loadDraft()">Load Draft</button>
        <button class="btn danger" onclick="NTFL.clearDraft()">Clear Draft</button>
      </div>
    </section>

    ${adminTopCard()}

    <div class="admin-layout section">
      <div class="admin-panel">
        <div class="admin-card">
          <div class="section-head">
            <div><h2>Site Settings</h2><p>Title, subtitle, and current week.</p></div>
          </div>
          <div class="form-grid">
            <label>League Name<input id="site-name" value="${escapeHtml(state.data.site.name)}"></label>
            <label>Season<input id="site-season" value="${escapeHtml(state.data.site.season)}"></label>
            <label>Current Week<input id="site-week" type="number" min="1" value="${escapeHtml(state.data.site.currentWeek)}"></label>
            <label>Subtitle<input id="site-subtitle" value="${escapeHtml(state.data.site.subtitle)}"></label>
          </div>
          <div class="row right" style="margin-top:12px"><button class="btn primary" onclick="NTFL.saveSite()">Save Site</button></div>
        </div>

        <div class="admin-card">
          <div class="section-head">
            <div><h2>Schedule Editor</h2><p>Edit score and status. Finals update standings automatically.</p></div>
            <select id="admin-week-filter" onchange="NTFL.setAdminWeek(this.value)">
              ${[...new Set(state.data.games.map(g=>g.weekNumber))].sort((a,b)=>a-b).map(w=>`<option value="${w}">Week ${w}</option>`).join('')}
            </select>
          </div>
          <div class="stack" id="game-editor">
            ${state.data.games.filter(g => g.weekNumber === (state.adminWeek || currentWeek())).sort(weekSort).map((g, idx) => `
              <div class="card" data-game-id="${g.id}">
                <div class="row between">
                  <div>
                    <strong>${escapeHtml(g.home)} vs ${escapeHtml(g.away)}</strong>
                    <p class="muted tiny">${escapeHtml(g.week)} • ${escapeHtml(g.division)}</p>
                  </div>
                  <span class="pill">${escapeHtml(g.note || g.status || 'scheduled')}</span>
                </div>
                <div class="form-grid compact">
                  <label>Home Score<input data-field="homeScore" type="number" value="${g.homeScore ?? ''}"></label>
                  <label>Away Score<input data-field="awayScore" type="number" value="${g.awayScore ?? ''}"></label>
                  <label>Status
                    <select data-field="status">
                      <option value="scheduled" ${parseGameStatus(g)==='scheduled' ? 'selected' : ''}>Scheduled</option>
                      <option value="live" ${parseGameStatus(g)==='live' ? 'selected' : ''}>Live</option>
                      <option value="final" ${parseGameStatus(g)==='final' ? 'selected' : ''}>Final</option>
                    </select>
                  </label>
                  <label>Note<input data-field="note" value="${escapeHtml(g.note || '')}" placeholder="MNF / SNF / OT"></label>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="row right" style="margin-top:12px"><button class="btn primary" onclick="NTFL.saveGames()">Save Games</button></div>
        </div>

        <div class="admin-card">
          <div class="section-head">
            <div><h2>Team Rundowns</h2><p>Coaches, notes, and colors.</p></div>
          </div>
          <div class="form-grid">
            <label>Team<select id="team-select" onchange="NTFL.setTeam(this.value)">${abbreviationList().map(t=>`<option value="${t.abbr}" ${t.abbr===state.adminTeam ? 'selected' : ''}>${t.abbr} • ${t.name}</option>`).join('')}</select></label>
          </div>
          <div class="form-grid">
            <label>Head Coach<input id="team-head" value="${escapeHtml(state.data.teams[state.adminTeam]?.headCoach || '')}"></label>
            <label>Assistant Coach<input id="team-ac" value="${escapeHtml(state.data.teams[state.adminTeam]?.assistantCoach || '')}"></label>
            <label>Primary Color<input id="team-primary" value="${escapeHtml(state.data.teams[state.adminTeam]?.colors.primary || '')}" placeholder="#00338D"></label>
            <label>Secondary Color<input id="team-secondary" value="${escapeHtml(state.data.teams[state.adminTeam]?.colors.secondary || '')}" placeholder="#C60C30"></label>
          </div>
          <label class="field"><span class="label">Notes</span><textarea id="team-notes">${escapeHtml(state.data.teams[state.adminTeam]?.notes || '')}</textarea></label>
          <div class="row right" style="margin-top:12px"><button class="btn primary" onclick="NTFL.saveTeam()">Save Team</button></div>
        </div>
      </div>

      <div class="admin-panel">
        <div class="admin-card">
          <div class="section-head">
            <div><h2>Rankings</h2><p>Drag to reorder the public list.</p></div>
          </div>
          <div class="rank-list" id="rank-list">
            ${state.data.rankings.map((r, i) => `
              <div class="rank-item" draggable="true" data-rank-index="${i}" ondragstart="NTFL.dragStart(event, ${i})" ondragover="NTFL.dragOver(event)" ondrop="NTFL.dropRank(event, ${i})">
                <div class="drag">☰</div>
                <div class="rank-meta">
                  <strong>#${i+1} ${escapeHtml(r.abbr)} • ${escapeHtml(r.name)}</strong>
                  <span>${escapeHtml(r.division)} • ${escapeHtml(r.record)}</span>
                </div>
                <div class="pill">${r.ppg.toFixed ? r.ppg.toFixed(1) : Number(r.ppg).toFixed(1)} PPG</div>
              </div>
            `).join('')}
          </div>
          <div class="row right" style="margin-top:12px"><button class="btn primary" onclick="NTFL.saveRankings()">Save Rankings</button></div>
        </div>

        <div class="admin-card">
          <div class="section-head">
            <div><h2>Awards</h2><p>Season honors and winners.</p></div>
          </div>
          <div class="stack" id="awards-editor">
            ${state.data.awards.map((a, i) => `
              <div class="card" data-award-index="${i}">
                <div class="form-grid compact">
                  <label>Category<input data-field="category" value="${escapeHtml(a.category || '')}"></label>
                  <label>Winner<input data-field="winner" value="${escapeHtml(a.winner || '')}"></label>
                  <label>Team<input data-field="team" value="${escapeHtml(a.team || '')}"></label>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="row between" style="margin-top:12px">
            <button class="btn" onclick="NTFL.addAward()">Add Award</button>
            <button class="btn primary" onclick="NTFL.saveAwards()">Save Awards</button>
          </div>
        </div>

        <div class="admin-card">
          <div class="section-head">
            <div><h2>History</h2><p>Past seasons and champions.</p></div>
          </div>
          <div class="stack" id="history-editor">
            ${state.data.history.map((h, i) => `
              <div class="card" data-history-index="${i}">
                <div class="form-grid compact">
                  <label>Season<input data-field="season" value="${escapeHtml(h.season || '')}"></label>
                  <label>Champion<input data-field="champion" value="${escapeHtml(h.champion || '')}"></label>
                  <label>Record<input data-field="record" value="${escapeHtml(h.record || '')}"></label>
                  <label>Notes<input data-field="notes" value="${escapeHtml(h.notes || '')}"></label>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="row between" style="margin-top:12px">
            <button class="btn" onclick="NTFL.addHistory()">Add History</button>
            <button class="btn primary" onclick="NTFL.saveHistory()">Save History</button>
          </div>
        </div>

        <div class="admin-card">
          <div class="section-head">
            <div><h2>Hall of Fame</h2><p>Special honors and legends.</p></div>
          </div>
          <div class="stack" id="hof-editor">
            ${(state.data.hallOfFame || []).map((h, i) => `
              <div class="card" data-hof-index="${i}">
                <div class="form-grid compact">
                  <label>Name<input data-field="name" value="${escapeHtml(h.name || '')}"></label>
                  <label>Team<input data-field="team" value="${escapeHtml(h.team || '')}"></label>
                  <label>Honor<input data-field="honor" value="${escapeHtml(h.honor || '')}"></label>
                  <label>Notes<input data-field="notes" value="${escapeHtml(h.notes || '')}"></label>
                </div>
              </div>
            `).join('') || '<div class="empty">No Hall of Fame entries yet.</div>'}
          </div>
          <div class="row between" style="margin-top:12px">
            <button class="btn" onclick="NTFL.addHOF()">Add HOF</button>
            <button class="btn primary" onclick="NTFL.saveHOF()">Save HOF</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function setPageTitle(){
  const map = {
    home: 'Home',
    teams: 'Teams',
    team: 'Team',
    schedule: 'Schedule',
    standings: 'Standings',
    rankings: 'Rankings',
    awards: 'Awards',
    history: 'History',
    hof: 'Hall of Fame',
    admin: 'Admin',
  };
  document.title = `${state.data.site.name} • ${map[state.page] || 'NTFL'}`;
}

function render(){
  setPageTitle();
  let body = '';
  if(state.page === 'home') body = homePage();
  else if(state.page === 'teams') body = teamsPage();
  else if(state.page === 'team') body = teamPage();
  else if(state.page === 'schedule') body = schedulePage();
  else if(state.page === 'standings') body = standingsPage();
  else if(state.page === 'rankings') body = rankingsPage();
  else if(state.page === 'awards') body = awardsPage();
  else if(state.page === 'history') body = historyPage();
  else if(state.page === 'hof') body = hofPage();
  else if(state.page === 'admin') body = adminPage();
  else body = `<div class="empty">Page not found.</div>`;

  $('#app').innerHTML = `
    <div class="shell">
      ${renderTopbar()}
      <main class="main container">
        ${body}
      </main>
      <footer class="footer container">
        <div>
          <strong>${escapeHtml(state.data.site.name)}</strong>
          <div>${escapeHtml(state.data.site.season)} • Last updated ${escapeHtml(state.data.site.lastUpdated)} • Version ${escapeHtml(state.data.site.version)}</div>
        </div>
        <div class="pill-row">
          <a class="pill" href="admin.html">Admin</a>
          <a class="pill" href="history.html">History</a>
          <a class="pill" href="awards.html">Awards</a>
        </div>
      </footer>
      <div id="toast" class="toast"></div>
    </div>
  `;
}

function getCurrentTeam(){
  return state.data.teams[state.team] || null;
}

function setDivision(div){
  state.filters.division = div;
  if(state.page === 'teams' || state.page === 'standings') render();
}
function searchTeams(v){
  state.filters.search = v;
  if(state.page === 'teams') render();
}
function setTeamTab(teamAbbr, tab){
  state.tabs[teamAbbr] = tab;
  render();
}
function setTeam(teamAbbr){
  state.adminTeam = teamAbbr;
  render();
}
function setAdminWeek(v){
  state.adminWeek = Number(v);
  render();
}

function saveSiteFromInputs(){
  const cfg = state.data.site.supabase || {};
  state.data.site.name = $('#site-name').value.trim() || state.data.site.name;
  state.data.site.season = $('#site-season').value.trim() || state.data.site.season;
  state.data.site.currentWeek = Number($('#site-week').value || state.data.site.currentWeek || 1);
  state.data.site.subtitle = $('#site-subtitle').value.trim() || state.data.site.subtitle;
  state.data.site.supabase = {
    url: $('#sb-url').value.trim(),
    anonKey: $('#sb-key').value.trim(),
    table: $('#sb-table').value.trim() || 'ntfl_site_state',
    rowId: Number($('#sb-row').value || 1),
  };
  saveSupabaseConfig(state.data.site.supabase);
}

function saveGames(){
  const week = Number($('#admin-week-filter')?.value || state.adminWeek || currentWeek());
  state.data.games = state.data.games.map(g => {
    if(g.weekNumber !== week) return g;
    const card = document.querySelector(`[data-game-id="${g.id}"]`);
    if(!card) return g;
    const get = f => card.querySelector(`[data-field="${f}"]`)?.value ?? '';
    const hs = get('homeScore').trim();
    const as = get('awayScore').trim();
    return {
      ...g,
      homeScore: hs === '' ? null : Number(hs),
      awayScore: as === '' ? null : Number(as),
      status: get('status'),
      note: get('note').trim(),
    };
  });
  state.data.site.lastUpdated = new Date().toISOString().slice(0,10);
  computeDerived(state.data);
  saveLocalDraft(state.data);
  render();
  showToast('Games saved to draft. Publish to make public.');
}

function saveTeam(){
  const team = getCurrentTeam();
  if(!team) return;
  team.headCoach = $('#team-head').value.trim() || 'TBD';
  team.assistantCoach = $('#team-ac').value.trim();
  team.colors.primary = $('#team-primary').value.trim() || team.colors.primary;
  team.colors.secondary = $('#team-secondary').value.trim() || team.colors.secondary;
  team.notes = $('#team-notes').value.trim() || team.notes;
  state.data.site.lastUpdated = new Date().toISOString().slice(0,10);
  computeDerived(state.data);
  saveLocalDraft(state.data);
  render();
  showToast('Team saved.');
}

function saveRankings(){
  const list = [...state.data.rankings];
  list.forEach((r, i) => r.rank = i+1);
  state.data.rankings = list;
  saveLocalDraft(state.data);
  state.data.site.lastUpdated = new Date().toISOString().slice(0,10);
  render();
  showToast('Rankings saved.');
}

function saveAwards(){
  const rows = $$('#awards-editor [data-award-index]');
  state.data.awards = rows.map((row) => ({
    category: row.querySelector('[data-field="category"]').value.trim(),
    winner: row.querySelector('[data-field="winner"]').value.trim(),
    team: row.querySelector('[data-field="team"]').value.trim(),
  }));
  saveLocalDraft(state.data);
  showToast('Awards saved.');
}
function saveHistory(){
  const rows = $$('#history-editor [data-history-index]');
  state.data.history = rows.map((row) => ({
    season: row.querySelector('[data-field="season"]').value.trim(),
    champion: row.querySelector('[data-field="champion"]').value.trim(),
    record: row.querySelector('[data-field="record"]').value.trim(),
    notes: row.querySelector('[data-field="notes"]').value.trim(),
  }));
  saveLocalDraft(state.data);
  showToast('History saved.');
}
function saveHOF(){
  const rows = $$('#hof-editor [data-hof-index]');
  state.data.hallOfFame = rows.map((row) => ({
    name: row.querySelector('[data-field="name"]').value.trim(),
    team: row.querySelector('[data-field="team"]').value.trim(),
    honor: row.querySelector('[data-field="honor"]').value.trim(),
    notes: row.querySelector('[data-field="notes"]').value.trim(),
  }));
  saveLocalDraft(state.data);
  showToast('Hall of Fame saved.');
}

function addAward(){
  state.data.awards.push({ category:'', winner:'', team:'' });
  saveLocalDraft(state.data);
  render();
}
function addHistory(){
  state.data.history.push({ season:'', champion:'', record:'', notes:'' });
  saveLocalDraft(state.data);
  render();
}
function addHOF(){
  state.data.hallOfFame.push({ name:'', team:'', honor:'', notes:'' });
  saveLocalDraft(state.data);
  render();
}

function downloadData(){
  saveSiteFromInputs();
  computeDerived(state.data);
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'site-data.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1200);
  showToast('Downloaded site-data.json');
}

async function publishPublic(){
  try{
    saveSiteFromInputs();
    computeDerived(state.data);
    saveLocalDraft(state.data);
    const cfg = state.data.site.supabase;
    if(!cfg.url || !cfg.anonKey){
      downloadData();
      showToast('Supabase not set yet — downloaded site-data.json instead.');
      return;
    }
    await saveRemoteState(cfg, state.data);
    showToast('Published publicly to Supabase.');
  } catch (err){
    console.error(err);
    downloadData();
    showToast('Publish failed — downloaded site-data.json instead.');
  }
}

function saveDraftOnly(){
  saveSiteFromInputs();
  computeDerived(state.data);
  saveLocalDraft(state.data);
  showToast('Draft saved locally.');
}

function loadDraftOnly(){
  const d = loadLocalDraft();
  if(!d){ showToast('No draft found.'); return; }
  state.data = computeDerived(structuredClone(d));
  render();
  showToast('Draft loaded.');
}
function clearDraftOnly(){
  clearLocalDraft();
  state.draftMode = false;
  showToast('Draft cleared.');
}
async function reloadLive(){
  const bootstrap = await loadJson(SITE_DATA_URL);
  const cfg = bootstrap.site?.supabase;
  let data = computeDerived(structuredClone(bootstrap));
  if(cfg?.url && cfg?.anonKey && cfg?.table){
    try{
      const remote = await loadRemoteState(cfg);
      if(remote) data = computeDerived(structuredClone(remote));
      showToast('Loaded live data.');
    } catch (e) {
      console.warn(e);
      showToast('Could not load live data — showing bootstrap.');
    }
  } else {
    showToast('No Supabase config yet — showing bootstrap.');
  }
  state.data = data;
  render();
}

function dragStart(ev, idx){
  state.dragIndex = idx;
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.setData('text/plain', String(idx));
}
function dragOver(ev){
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
}
function dropRank(ev, idx){
  ev.preventDefault();
  const from = Number(ev.dataTransfer.getData('text/plain') || state.dragIndex);
  if(!Number.isFinite(from) || from === idx) return;
  const arr = [...state.data.rankings];
  const [item] = arr.splice(from, 1);
  arr.splice(idx, 0, item);
  state.data.rankings = arr.map((r, i) => ({ ...r, rank: i+1 }));
  saveLocalDraft(state.data);
  render();
}

window.NTFL = {
  setDivision,
  searchTeams,
  setTeamTab,
  setTeam,
  setAdminWeek,
  saveSite: saveDraftOnly,
  saveGames,
  saveTeam,
  saveRankings,
  saveAwards,
  saveHistory,
  saveHOF,
  addAward,
  addHistory,
  addHOF,
  downloadData,
  publishPublic,
  saveDraftOnly,
  loadDraft: loadDraftOnly,
  clearDraft: clearDraftOnly,
  reloadLive,
  dragStart,
  dragOver,
  dropRank
};

(async function init(){
  try{
    state.data = await loadState();
    if(state.page === 'admin'){
      state.adminTeam = Object.keys(state.data.teams)[0] || 'BUF';
      state.adminWeek = currentWeek();
    }
    render();
  } catch (err){
    console.error(err);
    document.body.innerHTML = `<pre style="color:#fff;padding:20px">Failed to load NTFL data: ${escapeHtml(err.message || err)}</pre>`;
  }
})();
