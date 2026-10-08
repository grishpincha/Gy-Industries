/* GY Industries — drop-in score tracking for games.
   Add to a game's HTML:
     <script src="https://gyindustries.vercel.app/gy-scores.js" data-game="acorn-dash"></script>
   Then call, when a round ends:   GY.submitScore(score);
   Players log in with the account they made on the GY Industries site. */
(function(){
  var URL_ = "https://ktactbpxwauyqtzbidus.supabase.co";
  var KEY_ = "sb_publishable_pNUtS2OttP2iuZYU4V7fSA_R3CskHZw"; // publishable key: safe in the browser
  var me = document.currentScript;
  var GAME = me && me.getAttribute('data-game');
  var sb = null, user = null, name = '', box, label, btn;

  function ui(){
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;font:13px system-ui,sans-serif;background:#fffcf6;color:#241b12;border:1px solid #d9cdbb;border-radius:12px;padding:8px 12px;display:flex;gap:10px;align-items:center;box-shadow:0 6px 18px rgba(36,27,18,.18)';
    label = document.createElement('span');
    btn = document.createElement('button');
    btn.style.cssText = 'border:0;background:#c9713b;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit';
    btn.onclick = function(){ user ? signOut() : login(); };
    box.appendChild(label); box.appendChild(btn); document.body.appendChild(box);
    paint();
  }
  function paint(){
    label.textContent = user ? ('Playing as ' + (name || 'player')) : 'Log in to save your score';
    btn.textContent = user ? 'Sign out' : 'Log in';
  }
  function login(){
    var email = window.prompt('Email for your GY Industries account:'); if(!email) return;
    var pw = window.prompt('Password:'); if(!pw) return;
    sb.auth.signInWithPassword({ email: email.trim(), password: pw }).then(function(r){
      if(r.error){ window.alert('Could not log in. Check your email and password (create an account on gyindustries.vercel.app first).'); return; }
      refresh();
    });
  }
  function signOut(){ sb.auth.signOut().then(function(){ user = null; name = ''; paint(); }); }
  function refresh(){
    return sb.auth.getSession().then(function(r){
      user = r.data && r.data.session ? r.data.session.user : null;
      if(!user){ name = ''; paint(); return; }
      return sb.from('profiles').select('username').eq('id', user.id).maybeSingle().then(function(p){
        name = p.data ? p.data.username : ''; paint();
      });
    });
  }
  window.GY = {
    submitScore: function(score){
      score = Math.floor(Number(score));
      if(!sb || !user || !GAME || !isFinite(score) || score < 0) return Promise.resolve(false);
      return sb.rpc('submit_score', { game: GAME, score: score }).then(function(r){ return !r.error; }, function(){ return false; });
    }
  };
  function start(){
    sb = window.supabase.createClient(URL_, KEY_);
    ui(); refresh();
  }
  if(window.supabase && window.supabase.createClient) start();
  else {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload = start; document.head.appendChild(s);
  }
})();
