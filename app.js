/* SCOPE Application Arena v2
   Static client + Supabase backend. The app has a demo mode so the UI can be
   previewed without credentials, and a production mode using Supabase Auth,
   PostgreSQL RLS, RPCs and Realtime Broadcast.
*/
(() => {
  const CFG = window.SCOPE_CONFIG || {};
  const CONTENT = window.SCOPE_CONTENT || { defaultQuestions: [] };
  const hasBackend = Boolean(CFG.supabaseUrl && CFG.supabasePublishableKey);
  const demo = CFG.demoMode !== false && !hasBackend;
  const sb = hasBackend ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  const state = {
    user: null, profile: null, route: location.hash || '#/', game: null, rounds: [],
    currentRound: null, players: [], leaderboard: [], channel: null, timer: null,
    timerStartedAt: null, playerVote: null, demoGame: null
  };

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const toast = (msg, good=false) => { const x=document.createElement('div'); x.className='toast'; x.textContent=msg; document.body.appendChild(x); setTimeout(()=>x.remove(),2800); };
  const fmt = n => new Intl.NumberFormat().format(Number(n||0));
  const slugCode = () => Math.random().toString(36).slice(2,6).toUpperCase();
  const timeAgo = iso => { const d=(Date.now()-new Date(iso).getTime())/1000; if(d<60)return `${Math.max(1,Math.floor(d))}s ago`; if(d<3600)return `${Math.floor(d/60)}m ago`; if(d<86400)return `${Math.floor(d/3600)}h ago`; return `${Math.floor(d/86400)}d ago`; };

  function shell(inner, opts={}) {
    const nav = opts.player ? '' : `<header class="nav"><div class="brand"><img src="assets/scope-logo.png" alt="SCOPE"/><small>${esc(opts.admin?'Admin Console':'Application Arena')}</small></div><div class="nav-actions">${opts.admin ? '<span class="badge live">ADMIN</span>' : ''}${state.user ? '<button class="btn btn-secondary" id="logoutBtn">Sign out</button>' : ''}</div></header>`;
    document.querySelector('#app').innerHTML = `<div class="shell">${nav}${inner}</div>`;
    $('#logoutBtn')?.addEventListener('click', async()=>{ if(sb) await sb.auth.signOut(); location.hash='#/'; });
  }

  async function getSession(){
    if(!sb) return null;
    const { data } = await sb.auth.getSession();
    state.user = data.session?.user || null;
    if(state.user){ const {data:p}=await sb.rpc('get_my_staff_profile'); state.profile=p||null; }
    return state.user;
  }

  function landing(){
    shell(`<main class="container"><section class="hero"><div class="hero-card"><div class="eyebrow">KazMSA • SCOPE Professional Exchange</div><h1>Application<br><span class="gradient">Arena.</span></h1><p>${esc(CONTENT.subtitle)}</p><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px"><button class="btn btn-primary" id="joinBtn">Join a game</button><button class="btn btn-secondary" id="staffBtn">Staff / Admin</button></div><div class="section" style="margin-top:34px"><div class="grid grid-3"><div><b>50+</b><div class="muted">live players</div></div><div><b>20 sec</b><div class="muted">decision window</div></div><div><b>8 rounds</b><div class="muted">application skills</div></div></div></div></div><div class="hero-art"><img src="assets/scope-logo.png" alt="SCOPE logo"><div class="quote">Judge the application.<br>Learn the rule.<br>Climb the leaderboard.</div><div class="mini"><span class="pill">⚡ Live realtime</span><span class="pill">🏆 Ranked</span><span class="pill">📊 Results saved</span></div></div></section><section class="section grid grid-3"><div class="panel"><div class="eyebrow">CV</div><h3>Be specific</h3><p class="muted">Spot vague roles, missing dates and unsupported claims.</p></div><div class="panel"><div class="eyebrow">Motivation</div><h3>Personalize</h3><p class="muted">Separate a general exchange letter from an LC/department letter.</p></div><div class="panel"><div class="eyebrow">Goals</div><h3>Connect the dots</h3><p class="muted">Experience → motivation → goals, then bring value back home.</p></div></section></main>`);
    $('#joinBtn').onclick=()=>location.hash='#/play'; $('#staffBtn').onclick=()=>location.hash='#/staff';
  }

  function staffLogin(){
    shell(`<main class="auth"><img class="logo" src="assets/scope-logo.png" alt="SCOPE"><div class="panel auth-card"><div class="eyebrow">Secure staff access</div><h1>Host / Admin</h1><p class="muted">Sign in with your staff account. Player accounts never see the answer key.</p><div id="authMsg"></div><div class="field"><label>Email</label><input id="email" type="email" autocomplete="username" placeholder="host@example.com"></div><div class="field"><label>Password</label><input id="password" type="password" autocomplete="current-password" placeholder="••••••••"></div><button class="btn btn-primary btn-block" id="login">Sign in</button><p style="margin-top:16px;text-align:center"><button class="btn btn-ghost" id="back">Back to game</button></p></div></main>`);
    $('#back').onclick=()=>location.hash='#/';
    $('#login').onclick=async()=>{
      if(!sb){ toast('Backend is not configured. Demo mode has no staff login.'); return; }
      const email=$('#email').value.trim(), password=$('#password').value;
      if(!email||!password){ $('#authMsg').innerHTML='<div class="notice error">Enter both email and password.</div>'; return; }
      const {error}=await sb.auth.signInWithPassword({email,password});
      if(error){ $('#authMsg').innerHTML=`<div class="notice error">${esc(error.message)}</div>`; return; }
      await getSession(); if(!state.profile){ await sb.auth.signOut(); $('#authMsg').innerHTML='<div class="notice error">This account is not approved as staff.</div>'; return; }
      location.hash=state.profile.role==='admin'?'#/admin':'#/host';
    };
  }

  async function adminDashboard(){
    if(!state.user) return staffLogin();
    if(state.profile?.role!=='admin') return hostDashboard();
    shell(`<main class="container"><div class="dashboard-head"><div><div class="eyebrow">Control center</div><h1>Admin Dashboard</h1><p class="muted">Create multiple live rooms, manage question sets and export every result.</p></div><button class="btn btn-primary" id="newGame">＋ New game</button></div><div class="grid grid-4" id="stats"></div><section class="section"><div class="tabs"><button class="tab active" data-tab="games">Live games</button><button class="tab" data-tab="results">Results</button><button class="tab" data-tab="questions">Question bank</button></div><div id="tabContent"></div></section></main>`,{admin:true});
    $('#newGame').onclick=()=>openCreateGameModal();
    $$('.tab').forEach(b=>b.onclick=()=>switchAdminTab(b.dataset.tab,b));
    await switchAdminTab('games',$('.tab.active'));
  }

  async function switchAdminTab(tab, btn){
    $$('.tab').forEach(x=>x.classList.toggle('active',x===btn));
    const root=$('#tabContent'); root.innerHTML='<div class="panel empty">Loading…</div>';
    if(tab==='games') return loadAdminGames(root);
    if(tab==='results') return loadResults(root);
    return loadQuestions(root);
  }

  async function loadAdminGames(root){
    if(!sb){ return demoAdminGames(root); }
    const {data,error}=await sb.from('games').select('id,title,room_code,status,current_round,total_rounds,player_count,created_at,owner_id').order('created_at',{ascending:false}).limit(50);
    if(error){ root.innerHTML=`<div class="notice error">${esc(error.message)}</div>`; return; }
    const live=(data||[]).filter(g=>g.status==='live').length, waiting=(data||[]).filter(g=>g.status==='lobby').length;
    $('#stats').innerHTML=`<div class="stat"><div class="num">${data?.length||0}</div><div class="label">Games</div></div><div class="stat"><div class="num">${live}</div><div class="label">Live now</div></div><div class="stat"><div class="num">${waiting}</div><div class="label">Lobby</div></div><div class="stat"><div class="num">${fmt((data||[]).reduce((a,g)=>a+Number(g.player_count||0),0))}</div><div class="label">Players connected</div></div>`;
    root.innerHTML=`<div class="grid grid-2">${(data||[]).map(gameCard).join('')||'<div class="panel empty">No games yet. Create your first room.</div>'}</div>`;
    $$('.openGame',root).forEach(b=>b.onclick=()=>location.hash=`#/host/${b.dataset.id}`);
    $$('.exportGame',root).forEach(b=>b.onclick=()=>exportGame(b.dataset.id));
  }
  function demoAdminGames(root){
    $('#stats').innerHTML='<div class="stat"><div class="num">2</div><div class="label">Games</div></div><div class="stat"><div class="num">1</div><div class="label">Live now</div></div><div class="stat"><div class="num">1</div><div class="label">Lobby</div></div><div class="stat"><div class="num">74</div><div class="label">Players connected</div></div>';
    const demo=[{id:'demo-1',title:'SCOPE Masterclass — Main Hall',room_code:'SCP7',status:'live',current_round:4,total_rounds:8,player_count:48,created_at:new Date().toISOString()},{id:'demo-2',title:'Practice Room',room_code:'CV22',status:'lobby',current_round:0,total_rounds:8,player_count:26,created_at:new Date(Date.now()-3600000).toISOString()}];
    root.innerHTML=`<div class="grid grid-2">${demo.map(gameCard).join('')}</div>`; $$('.openGame',root).forEach(b=>b.onclick=()=>demoHost(b.dataset.id));
  }
  function gameCard(g){ return `<article class="panel game-card"><div class="game-top"><div><div class="game-title">${esc(g.title)}</div><div class="game-meta"><span>Room <b>${esc(g.room_code)}</b></span><span>•</span><span>${g.current_round||0}/${g.total_rounds||8}</span><span>•</span><span>${g.player_count||0} players</span></div></div><span class="badge ${g.status==='live'?'live':g.status==='finished'?'end':'wait'}">${esc(g.status)}</span></div><div class="game-meta">Created ${timeAgo(g.created_at)}</div><div class="game-actions"><button class="btn btn-primary openGame" data-id="${g.id}">Open host</button><button class="btn btn-secondary exportGame" data-id="${g.id}">Export results</button></div></article>`; }

  async function openCreateGameModal(){
    let qs=[];
    if(sb){ const {data}=await sb.from('question_bank').select('id,title').eq('active',true).order('created_at'); qs=data||[]; }
    else qs=CONTENT.defaultQuestions.map((q,i)=>({id:`demo-q${i}`,title:q.title}));
    const html=`<div class="modal-backdrop" id="modal"><div class="modal"><div class="modal-head"><h2>Create a game</h2><button class="x" id="close">×</button></div><p class="muted">Each game gets its own room code and isolated player/result set. You can run several rooms at once.</p><div class="field"><label>Game title</label><input id="gameTitle" value="SCOPE Application Arena — ${new Date().toLocaleDateString()}" maxlength="80"></div><div class="field"><label>Seconds per round</label><input id="seconds" type="number" min="10" max="60" value="20"></div><div class="field"><label>Questions</label><div style="display:grid;gap:8px;max-height:250px;overflow:auto">${qs.map((q,i)=>`<label style="display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:12px"><input class="qpick" type="checkbox" value="${q.id}" checked> <span>${i+1}. ${esc(q.title)}</span></label>`).join('')}</div></div><button class="btn btn-primary btn-block" id="create">Create game</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend',html); $('#close').onclick=()=>$('#modal').remove();
    $('#create').onclick=async()=>{
      const title=$('#gameTitle').value.trim(), seconds=Number($('#seconds').value), ids=$$('.qpick').filter(x=>x.checked).map(x=>x.value);
      if(ids.length===0){toast('Select at least one question.');return;}
      if(!sb){ const id='demo-'+Date.now(); $('#modal').remove(); toast('Demo game created'); demoHost(id,true,title); return; }
      const {data,error}=await sb.rpc('create_game',{p_title:title,p_seconds:seconds,p_question_ids:ids});
      if(error){toast(error.message);return;} $('#modal').remove(); toast(`Game created — room ${data.room_code}`,true); location.hash=`#/host/${data.id}`;
    };
  }

  async function loadResults(root){
    if(!sb){ root.innerHTML=`<div class="panel"><h2>Demo results</h2><div class="table-wrap"><table class="table"><thead><tr><th>Rank</th><th>Player</th><th>Game</th><th>Score</th><th>Correct</th><th>Time</th></tr></thead><tbody>${[['1','Danish','Main Hall','38','8/8','68.4s'],['2','Sara','Main Hall','37','8/8','71.9s'],['3','Aiman','Main Hall','36','7/8','80.1s']].map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`; return; }
    const {data,error}=await sb.from('game_results').select('rank,nickname,score,correct_verdicts,total_rounds,total_time_ms,game_id,games(title,room_code)').order('created_at',{ascending:false}).limit(300);
    if(error){root.innerHTML=`<div class="notice error">${esc(error.message)}</div>`;return;}
    root.innerHTML=`<div class="panel"><div class="section-title"><div><h2>All results</h2><p>Every finished game is preserved.</p></div><button class="btn btn-secondary" id="exportAll">Export all CSV</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Rank</th><th>Player</th><th>Game</th><th>Room</th><th>Score</th><th>Correct</th><th>Time</th></tr></thead><tbody>${(data||[]).map(r=>`<tr><td>${r.rank}</td><td>${esc(r.nickname)}</td><td>${esc(r.games?.title||'')}</td><td>${esc(r.games?.room_code||'')}</td><td>${r.score}</td><td>${r.correct_verdicts}/${r.total_rounds}</td><td>${(Number(r.total_time_ms||0)/1000).toFixed(1)}s</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No results yet.</td></tr>'}</tbody></table></div></div>`;
    $('#exportAll').onclick=()=>downloadCSV('scope-all-results.csv',(data||[]).map(r=>({rank:r.rank,nickname:r.nickname,game:r.games?.title||'',room:r.games?.room_code||'',score:r.score,correct:`${r.correct_verdicts}/${r.total_rounds}`,time_seconds:(Number(r.total_time_ms||0)/1000).toFixed(1)})));
  }

  async function loadQuestions(root){
    if(!sb){ root.innerHTML=`<div class="panel"><h2>Question bank</h2><p class="muted">Demo mode uses the eight built-in SCOPE questions. Configure Supabase to edit and persist your own bank.</p><div class="grid grid-2">${CONTENT.defaultQuestions.map((q,i)=>`<div class="panel"><b>${i+1}. ${esc(q.title)}</b><p class="muted">${esc(q.lesson)}</p></div>`).join('')}</div></div>`; return; }
    const {data,error}=await sb.from('question_bank').select('*').order('created_at');
    if(error){root.innerHTML=`<div class="notice error">${esc(error.message)}</div>`;return;}
    root.innerHTML=`<div class="panel"><div class="section-title"><div><h2>Question bank</h2><p>Create reusable content for future games.</p></div><button class="btn btn-primary" id="newQuestion">＋ Add question</button></div><div class="grid grid-2">${(data||[]).map(q=>`<article class="panel"><div class="game-top"><b>${esc(q.title)}</b><span class="badge ${q.active?'live':'end'}">${q.active?'active':'off'}</span></div><p class="muted">${esc(q.lesson||'')}</p><button class="btn btn-secondary editQ" data-id="${q.id}">Edit</button></article>`).join('')}</div></div>`;
    $('#newQuestion').onclick=()=>questionModal(); $$('.editQ',root).forEach(b=>b.onclick=()=>questionModal(b.dataset.id));
  }
  async function questionModal(id){
    let q={title:'',excerpt:'',options:['Strong','Needs work'],correct_verdict:'Strong',correct_tag:'',explanation:'',lesson:'',active:true};
    if(id&&sb){const {data}=await sb.from('question_bank').select('*').eq('id',id).single();if(data)q=data;}
    const html=`<div class="modal-backdrop" id="modal"><div class="modal"><div class="modal-head"><h2>${id?'Edit':'New'} question</h2><button class="x" id="close">×</button></div><div class="field"><label>Title</label><input id="qt" value="${esc(q.title)}"></div><div class="field"><label>Excerpt</label><textarea id="qe" rows="5">${esc(q.excerpt)}</textarea></div><div class="field"><label>Options (one per line)</label><textarea id="qo" rows="5">${esc((q.options||[]).join('\n'))}</textarea></div><div class="grid grid-2"><div class="field"><label>Correct answer</label><input id="qcv" value="${esc(q.correct_verdict||'')}"></div><div class="field"><label>Correct tag</label><input id="qct" value="${esc(q.correct_tag||'')}"></div></div><div class="field"><label>Explanation</label><textarea id="qx" rows="4">${esc(q.explanation||'')}</textarea></div><div class="field"><label>Lesson</label><textarea id="ql" rows="3">${esc(q.lesson||'')}</textarea></div><button class="btn btn-primary btn-block" id="saveQ">Save question</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend',html);$('#close').onclick=()=>$('#modal').remove();$('#saveQ').onclick=async()=>{
      if(!sb){$('#modal').remove();toast('Demo question editing is preview-only.');return;}
      const payload={title:$('#qt').value.trim(),excerpt:$('#qe').value,options:$('#qo').value.split('\n').map(s=>s.trim()).filter(Boolean),correct_verdict:$('#qcv').value.trim(),correct_tag:$('#qct').value.trim(),explanation:$('#qx').value,lesson:$('#ql').value,active:true};
      const res=id?await sb.from('question_bank').update(payload).eq('id',id):await sb.from('question_bank').insert(payload); if(res.error){toast(res.error.message);return;} $('#modal').remove();toast('Question saved',true);switchAdminTab('questions',$$('.tab').find(x=>x.dataset.tab==='questions'));
    };
  }

  async function hostDashboard(){
    if(!state.user){ return staffLogin(); }
    shell(`<main class="container"><div class="dashboard-head"><div><div class="eyebrow">Host console</div><h1>My Games</h1><p class="muted">Run multiple rooms and keep every result.</p></div><button class="btn btn-primary" id="newGame">＋ New game</button></div><div id="hostGames" class="grid grid-2"></div></main>`);
    $('#newGame').onclick=()=>openCreateGameModal();
    if(!sb){ return demoHostList(); }
    const {data,error}=await sb.from('games').select('*').eq('owner_id',state.user.id).order('created_at',{ascending:false});
    if(error){$('#hostGames').innerHTML=`<div class="notice error">${esc(error.message)}</div>`;return;}
    $('#hostGames').innerHTML=(data||[]).map(gameCard).join('')||'<div class="panel empty">No games yet.</div>';
    $$('.openGame').forEach(b=>b.onclick=()=>location.hash=`#/host/${b.dataset.id}`); $$('.exportGame').forEach(b=>b.onclick=()=>exportGame(b.dataset.id));
  }
  function demoHostList(){const data=[{id:'demo-1',title:'SCOPE Masterclass — Main Hall',room_code:'SCP7',status:'live',current_round:4,total_rounds:8,player_count:48,created_at:new Date().toISOString()}];$('#hostGames').innerHTML=data.map(gameCard).join('');$$('.openGame').forEach(b=>b.onclick=()=>demoHost(b.dataset.id));}

  async function hostGame(gameId){
    if(!state.user && !gameId.startsWith('demo-')) return staffLogin();
    if(gameId.startsWith('demo-')) return demoHost(gameId);
    if(state.profile?.role!=='admin' && state.profile?.role!=='host') return staffLogin();
    const {data,error}=await sb.from('games').select('*').eq('id',gameId).single();
    if(error||!data){toast(error?.message||'Game not found');location.hash='#/host';return;}
    state.game=data;
    await refreshHostGame();
    shell(`<main class="container"><div class="dashboard-head"><div><div class="eyebrow">Room ${esc(data.room_code)}</div><h1>${esc(data.title)}</h1><p class="muted">Host control • ${data.current_round||0}/${data.total_rounds} rounds</p></div><div style="display:flex;gap:8px"><button class="btn btn-secondary" id="copyJoin">Copy join link</button><button class="btn btn-secondary" id="back">All games</button></div></div><div class="host-grid"><section class="panel host-stage" id="hostStage"></section><aside class="grid"><div class="panel"><div class="section-title"><div><h3>Room</h3><p class="muted">Players and response status</p></div><span class="live-dot"></span></div><div class="code">${esc(data.room_code)}</div><p class="muted" style="text-align:center">${location.origin}${location.pathname}#/play/${esc(data.room_code)}</p><div id="playerCount" class="stat" style="margin-top:14px"></div><div id="players" class="players-list" style="margin-top:14px"></div></div><div class="panel"><h3>Round control</h3><div class="grid"><button class="btn btn-primary" id="startRound">Start / resume round</button><button class="btn btn-secondary" id="lockRound">Lock responses</button><button class="btn btn-secondary" id="revealRound">Reveal answer</button><button class="btn btn-secondary" id="nextRound">Next round</button><button class="btn btn-danger" id="finishGame">Finish game</button></div></div></aside></div></main>`);
    $('#back').onclick=()=>location.hash='#/host'; $('#copyJoin').onclick=async()=>{await navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/play/${data.room_code}`);toast('Join link copied',true)};
    $('#startRound').onclick=()=>hostAction('start_round');$('#lockRound').onclick=()=>hostAction('lock_round');$('#revealRound').onclick=()=>hostAction('reveal_round');$('#nextRound').onclick=()=>hostAction('next_round');$('#finishGame').onclick=()=>hostAction('finish_game');
    await renderHostStage(); subscribeGame(data.id); refreshHostGame();
  }

  async function refreshHostGame(){
    if(!state.game) return;
    if(sb){
      const [p,r,k] = await Promise.all([sb.from('game_players').select('id,nickname,joined_at,has_voted').eq('game_id',state.game.id).order('joined_at'), sb.from('game_rounds').select('*').eq('game_id',state.game.id).order('round_number'), sb.from('round_keys').select('*').eq('game_id',state.game.id).order('round_id')]);
      state.players=p.data||[]; const keys=k.data||[]; state.rounds=(r.data||[]).map(x=>({...x,...(keys.find(y=>y.round_id===x.id)||{})})); state.currentRound=state.rounds.find(x=>x.round_number===state.game.current_round)||null;
      if($('#playerCount')) $('#playerCount').innerHTML=`<div class="num">${state.players.length}/${state.game.max_players}</div><div class="label">Players joined</div>`;
      if($('#players')) $('#players').innerHTML=state.players.map(p=>`<span class="player-chip ${p.has_voted?'voted':''}">${esc(p.nickname)}${p.has_voted?' ✓':''}</span>`).join('')||'<span class="muted">Waiting for players…</span>';
    }
  }

  async function renderHostStage(){
    const root=$('#hostStage'); if(!root)return;
    const g=state.game, r=state.currentRound;
    if(g.status==='lobby' || !r){root.innerHTML=`<div class="waiting"><div class="icon">🎮</div><h2>Lobby ready</h2><p class="muted">Share the room code <b>${esc(g.room_code)}</b>. When everyone is ready, start Round 1.</p><div class="panel" style="margin-top:20px"><div class="eyebrow">Players</div><h3>${state.players.length} joined</h3><p class="muted">Late joining can be locked from the database after the first round.</p></div></div>`;return;}
    const isActive=g.status==='live' && r.status==='active'; const locked=['locked','revealed'].includes(r.status);
    root.innerHTML=`<div class="control-bar"><div><b>Round ${r.round_number}</b><span class="muted"> / ${g.total_rounds}</span></div><div><span class="badge ${isActive?'live':'wait'}">${esc(r.status)}</span></div></div><div class="question-card"><div class="round-kicker">${esc(r.category||'SCOPE')}</div><div class="question-title">${esc(r.title)}</div><div class="excerpt">${esc(r.excerpt)}</div><div class="timer-big" id="hostTimer">${isActive?'20':'—'}</div><div class="progress"><div id="hostProgress" style="width:${locked?'100%':'0%'}"></div></div>${r.revealed?`<div class="reveal"><h3>${esc(r.correct_verdict)}</h3><b>${esc(r.correct_tag||'')}</b><p>${esc(r.explanation)}</p><p><strong>Lesson:</strong> ${esc(r.lesson)}</p></div>`:''}</div>`;
    if(isActive) startVisualTimer(r); 
  }
  function startVisualTimer(r){
    clearInterval(state.timer); state.timerStartedAt = state.timerStartedAt || Date.now(); const seconds=state.game.round_seconds||20; const tick=()=>{const elapsed=(Date.now()-state.timerStartedAt)/1000;const left=Math.max(0,seconds-elapsed);if($('#hostTimer'))$('#hostTimer').textContent=Math.ceil(left);if($('#hostProgress'))$('#hostProgress').style.width=`${Math.min(100,elapsed/seconds*100)}%`;if(left<=0)clearInterval(state.timer)};tick();state.timer=setInterval(tick,100);
  }

  async function hostAction(action){
    if(!sb){ toast('Demo controls are active.'); return demoHostAction(action); }
    const {data,error}=await sb.rpc('host_action',{p_game_id:state.game.id,p_action:action});
    if(error){toast(error.message);return;} state.game=data; state.timerStartedAt=Date.now(); await refreshHostGame(); await renderHostStage(); toast(action.replace('_',' '),true); if(action==='finish_game') await exportGame(state.game.id);
  }
  function subscribeGame(gameId){ if(!sb)return; if(state.channel)sb.removeChannel(state.channel); state.channel=sb.channel(`game:${gameId}`,{config:{broadcast:{ack:true}}}).on('broadcast',{event:'game_state'},async()=>{const {data}=await sb.from('games').select('*').eq('id',gameId).single();state.game=data;state.timerStartedAt=Date.now();await refreshHostGame();await renderHostStage();}).subscribe(); }

  async function playerPage(codeParam){
    const code=(codeParam||'').toUpperCase();
    if(!code){ return playerJoin(); }
    if(!sb){return demoPlayer(code);}
    let user=state.user; if(!user){const {data}=await sb.auth.getSession();user=data.session?.user||null;} if(!user){const {data,error:e}=await sb.auth.signInAnonymously({options:{data:{app:'scope-arena'}}});if(e)return playerJoin(e.message);user=data.user;state.user=user;}
    const {data:game,error}=await sb.from('games').select('id,title,room_code,status,current_round,total_rounds,round_seconds,max_players').eq('room_code',code).single();
    if(error||!game){return playerJoin('Room not found. Check the code.');}
    const stored=localStorage.getItem(`scope_player_${code}`); if(stored){ try{ const {data:p}=await sb.from('game_players').select('*').eq('id',stored).eq('game_id',game.id).single(); if(p) return playerGame(game,p); }catch{} }
    return playerJoin('',game);
  }
  function playerJoin(msg='',game=null){
    shell(`<main class="phone-shell"><div class="phone-top"><img src="assets/scope-logo.png" alt="SCOPE"><span>LIVE GAME</span></div><div class="phone-card"><div class="eyebrow">Join room</div><h1 style="font-family:'Space Grotesk';font-size:36px;margin:8px 0">Ready?</h1><p class="muted">Enter the room code shown on the big screen.</p>${msg?`<div class="notice error">${esc(msg)}</div>`:''}<div class="field"><label>Room code</label><input id="room" maxlength="8" placeholder="SCP7" value="${esc(location.hash.split('/')[2]||'')}"></div><div class="field"><label>Nickname</label><input id="nick" maxlength="16" placeholder="Danish"></div><button class="btn btn-primary btn-block" id="join">Join game</button><div class="notice" style="margin-top:14px">Use a short nickname. Results are tied to this game only.</div></div></main>`,{player:true});
    $('#join').onclick=async()=>{const c=$('#room').value.trim().toUpperCase(),n=$('#nick').value.trim();if(!c||!n){toast('Enter room code and nickname');return;}if(!sb)return demoPlayer(c,n);if(!state.user){const {data,error}=await sb.auth.signInAnonymously({options:{data:{app:'scope-arena'}}});if(error){toast(error.message);return}state.user=data.user;}const {data,error}=await sb.rpc('join_game',{p_room_code:c,p_nickname:n});if(error){toast(error.message);return;}localStorage.setItem(`scope_player_${c}`,data.player_id);playerGame(data.game,data.player);};
  }
  async function playerGame(game,player){
    state.game=game;state.playerVote=null;
    if(sb){const {data:r}=await sb.from('game_rounds').select('*').eq('game_id',game.id).eq('round_number',game.current_round).single();state.currentRound=r||null;}
    renderPlayer(); subscribePlayer(game.id);
  }
  function renderPlayer(){
    const g=state.game,r=state.currentRound;
    shell(`<main class="phone-shell"><div class="phone-top"><img src="assets/scope-logo.png" alt="SCOPE"><span>${esc(g.room_code)}</span></div><div class="phone-card" id="playerCard"></div></main>`,{player:true});
    drawPlayerCard();
  }
  function drawPlayerCard(){
    const root=$('#playerCard'),g=state.game,r=state.currentRound;
    if(!r||g.status==='lobby'){root.innerHTML=`<div class="waiting"><div class="icon">⏳</div><h2>You're in, ${esc(localStorage.getItem(`scope_name_${g.room_code}`)||'player')}!</h2><p class="muted">Waiting for the host to start the game.</p><div class="progress"><div style="width:100%"></div></div></div>`;return;}
    if(g.status==='finished'){root.innerHTML=`<div class="waiting"><div class="icon">🏆</div><h2>Game finished</h2><p class="muted">Thanks for playing. The host has the full results.</p><button class="btn btn-primary btn-block" onclick="location.hash='#/play'">Join another game</button></div>`;return;}
    if(r.status==='revealed'){root.innerHTML=`<div class="waiting"><div class="icon">${r.correct_verdict===state.playerVote?.verdict?'🎯':'🧠'}</div><div class="eyebrow">Round ${r.round_number} reveal</div><h2>${esc(r.correct_verdict)}</h2><p class="muted">${esc(r.explanation)}</p><div class="notice success"><b>Lesson</b><br>${esc(r.lesson)}</div><button class="btn btn-primary btn-block" id="waitNext">Waiting for next round…</button></div>`;return;}
    if(state.playerVote){root.innerHTML=`<div class="waiting"><div class="icon">🔒</div><h2>Locked in!</h2><p class="muted">Your answer reached the game. Watch the big screen for the reveal.</p><div class="notice success">${esc(state.playerVote.verdict)}${state.playerVote.tag?` • ${esc(state.playerVote.tag)}`:''}</div></div>`;return;}
    root.innerHTML=`<div class="round-kicker">Round ${r.round_number} / ${g.total_rounds}</div><h2 class="question-title" style="font-size:27px">${esc(r.title)}</h2><div class="excerpt">${esc(r.excerpt)}</div><div class="player-timer" id="ptimer">${g.round_seconds||20}</div><div class="progress"><div id="pbar" style="width:0"></div></div><div class="choice-grid" id="choices">${(r.options||[]).map(o=>`<button class="player-choice" data-value="${esc(o)}">${esc(o)}</button>`).join('')}</div>${r.tags?.length?`<div class="section-title" style="margin-top:18px"><div><h3 style="font-size:16px">Why?</h3><p class="muted">Pick the best diagnosis.</p></div></div><div class="choice-grid" id="tags">${r.tags.map(o=>`<button class="player-choice" data-value="${esc(o)}">${esc(o)}</button>`).join('')}</div>`:''}<button class="submit-btn" id="submit" disabled>LOCK IT IN</button>`;
    let verdict=null,tag=null; $$('#choices .player-choice').forEach(b=>b.onclick=()=>{$$('#choices .player-choice').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');verdict=b.dataset.value;$('#submit').disabled=!verdict;}); $$('#tags .player-choice').forEach(b=>b.onclick=()=>{$$('#tags .player-choice').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');tag=b.dataset.value;});
    const start=Date.now(), seconds=g.round_seconds||20; const timer=setInterval(()=>{const left=Math.max(0,seconds-(Date.now()-start)/1000);if($('#ptimer'))$('#ptimer').textContent=Math.ceil(left);if($('#pbar'))$('#pbar').style.width=`${Math.min(100,(seconds-left)/seconds*100)}%`;if(left<=0){clearInterval(timer);$('#submit')?.setAttribute('disabled','true')}},100);
    $('#submit').onclick=async()=>{clearInterval(timer); if(!verdict)return; const elapsed=Math.round(Date.now()-start); if(!sb){state.playerVote={verdict,tag};drawPlayerCard();return;}const {data,error}=await sb.rpc('submit_vote',{p_game_id:g.id,p_round_id:r.id,p_verdict:verdict,p_tag:tag||null,p_response_ms:elapsed});if(error){toast(error.message);return;}state.playerVote={verdict,tag};drawPlayerCard();};
  }
  function subscribePlayer(gameId){if(!sb)return;if(state.channel)sb.removeChannel(state.channel);state.channel=sb.channel(`game:${gameId}`,{config:{broadcast:{ack:true}}}).on('broadcast',{event:'game_state'},async()=>{const {data:g}=await sb.from('games').select('id,title,room_code,status,current_round,total_rounds,round_seconds,max_players').eq('id',gameId).single();if(!g)return;state.game=g;const {data:r}=await sb.from('game_rounds').select('*').eq('game_id',gameId).eq('round_number',g.current_round).single();state.currentRound=r||null;if(r?.status==='active')state.playerVote=null;drawPlayerCard();}).subscribe();}

  function demoHost(id='demo-1',fresh=false,title='SCOPE Masterclass — Main Hall'){
    const rounds=CONTENT.defaultQuestions.map((q,i)=>({...q,id:`dr${i+1}`,round_number:i+1,status:i===0?'active':'waiting',revealed:false,category:i<4?'CV':'Motivation',tags:q.tags||[]}));
    state.game={id,title,room_code:'SCP7',status:'live',current_round:1,total_rounds:rounds.length,round_seconds:20,max_players:50};state.rounds=rounds;state.currentRound=rounds[0];state.players=Array.from({length:Math.floor(Math.random()*20)+28},(_,i)=>({id:i,nickname:['Danish','Sara','Aiman','Ali','Fatima','Mira'][i%6]+(i>5?` ${Math.floor(i/6)+1}`:''),has_voted:false}));
    shell(`<main class="container"><div class="dashboard-head"><div><div class="eyebrow">Demo host</div><h1>${esc(title)}</h1><p class="muted">Room SCP7 • ${state.players.length}/50 players</p></div><button class="btn btn-secondary" id="back">All games</button></div><div class="host-grid"><section class="panel host-stage" id="hostStage"></section><aside class="grid"><div class="panel"><div class="code">SCP7</div><div id="playerCount" class="stat" style="margin-top:14px"></div><div id="players" class="players-list" style="margin-top:14px"></div></div><div class="panel"><h3>Round control</h3><div class="grid"><button class="btn btn-primary" id="startRound">Start / resume</button><button class="btn btn-secondary" id="lockRound">Lock</button><button class="btn btn-secondary" id="revealRound">Reveal</button><button class="btn btn-secondary" id="nextRound">Next round</button><button class="btn btn-danger" id="finishGame">Finish</button></div></div></aside></div></main>`);
    $('#back').onclick=()=>location.hash='#/host';$('#startRound').onclick=()=>demoHostAction('start_round');$('#lockRound').onclick=()=>demoHostAction('lock_round');$('#revealRound').onclick=()=>demoHostAction('reveal_round');$('#nextRound').onclick=()=>demoHostAction('next_round');$('#finishGame').onclick=()=>demoHostAction('finish_game');refreshDemoUI();
  }
  function refreshDemoUI(){if($('#playerCount'))$('#playerCount').innerHTML=`<div class="num">${state.players.length}/50</div><div class="label">Players joined</div>`;if($('#players'))$('#players').innerHTML=state.players.map(p=>`<span class="player-chip ${p.has_voted?'voted':''}">${esc(p.nickname)}${p.has_voted?' ✓':''}</span>`).join('');renderHostStage();}
  function demoHostAction(a){const r=state.currentRound;if(a==='start_round'){r.status='active';state.game.status='live';state.timerStartedAt=Date.now();}if(a==='lock_round')r.status='locked';if(a==='reveal_round'){r.status='revealed';r.revealed=true;}if(a==='next_round'){const n=state.game.current_round+1;if(n>state.game.total_rounds){state.game.status='finished';toast('Game finished',true);return;}state.game.current_round=n;state.rounds[n-1].status='active';state.currentRound=state.rounds[n-1];state.timerStartedAt=Date.now();}if(a==='finish_game')state.game.status='finished';refreshDemoUI();toast(a.replace('_',' '),true);}
  function demoPlayer(code,nick='Danish'){
    const game={id:'demo-1',title:'Demo SCOPE Game',room_code:code||'SCP7',status:'live',current_round:1,total_rounds:8,round_seconds:20,max_players:50};state.game=game;state.currentRound={...CONTENT.defaultQuestions[0],id:'dr1',round_number:1,status:'active',revealed:false};localStorage.setItem(`scope_name_${game.room_code}`,nick);renderPlayer();}
  async function exportGame(gameId){
    if(!sb){return downloadCSV(`scope-demo-results.csv`,[{rank:1,nickname:'Danish',score:38,correct:'8/8',time_seconds:'68.4'},{rank:2,nickname:'Sara',score:37,correct:'8/8',time_seconds:'71.9'},{rank:3,nickname:'Aiman',score:36,correct:'7/8',time_seconds:'80.1'}]);}
    const {data,error}=await sb.from('game_results').select('rank,nickname,score,correct_verdicts,total_rounds,total_time_ms').eq('game_id',gameId).order('rank'); if(error){toast(error.message);return;}downloadCSV(`scope-${gameId}-results.csv`,(data||[]).map(r=>({rank:r.rank,nickname:r.nickname,score:r.score,correct:`${r.correct_verdicts}/${r.total_rounds}`,time_seconds:(Number(r.total_time_ms||0)/1000).toFixed(1)})));
  }
  function downloadCSV(name,rows){if(!rows.length){toast('No results yet.');return;}const headers=Object.keys(rows[0]);const csv=[headers.join(','),...rows.map(r=>headers.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}

  async function boot(){
    window.addEventListener('hashchange',boot); if(sb) await getSession();
    const parts=(location.hash||'#/' ).replace(/^#\/?/,'').split('/'); const route=parts[0]||'';
    if(route==='staff')return staffLogin(); if(route==='admin')return adminDashboard(); if(route==='host')return parts[1]?hostGame(parts[1]):hostDashboard(); if(route==='play')return playerPage(parts[1]); return landing();
  }
  boot();
})();
