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
  var SITE_ = "https://gyindustries.vercel.app/";
  function el(tag, css, text){ var n = document.createElement(tag); if(css) n.style.cssText = css; if(text != null) n.textContent = text; return n; }
  var INPUT = 'width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid #d9cdbb;border-radius:8px;font:inherit;background:#fff;color:#241b12';
  var LABEL = 'font-size:12px;font-weight:600;color:#6b5d4d;margin-bottom:4px;display:block';

  // A proper in-page log in / sign up box (replaces the old browser pop-ups).
  function login(startMode){
    if(document.getElementById('gy-login-overlay')) return;
    var mode = startMode || 'signin', pending = false;
    var ov = el('div', 'position:fixed;inset:0;z-index:100000;background:rgba(36,27,18,.55);display:flex;align-items:center;justify-content:center;padding:16px;font:14px system-ui,sans-serif');
    ov.id = 'gy-login-overlay';
    var card = el('form', 'background:#fffcf6;color:#241b12;border-radius:16px;padding:22px;width:100%;max-width:340px;max-height:92vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px');
    card.noValidate = true; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', 'GY Industries account');

    var head = el('div', 'display:flex;justify-content:space-between;align-items:center');
    var title = el('div', 'font-size:20px;font-weight:700');
    var x = el('button', 'border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#6b5d4d', '\u00d7'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
    head.appendChild(title); head.appendChild(x);

    var tabs = el('div', 'display:flex;gap:6px;background:#f3ecde;padding:4px;border-radius:10px');
    function tab(label, m){ var b = el('button', 'flex:1;padding:8px;border:0;border-radius:7px;font:inherit;font-weight:600;cursor:pointer', label); b.type = 'button'; b.onclick = function(){ mode = m; render(); }; return b; }
    var tIn = tab('Log in', 'signin'), tUp = tab('Sign up', 'signup'); tabs.appendChild(tIn); tabs.appendChild(tUp);

    function field(label, type, ac){
      var w = el('div'); var l = el('label', LABEL, label); var i = el('input', INPUT); i.type = type; i.autocomplete = ac; i.id = 'gy-f-' + label.replace(/\W/g, '').toLowerCase(); l.htmlFor = i.id;
      w.appendChild(l); w.appendChild(i); return { wrap: w, input: i };
    }
    var fUser = field('Username', 'text', 'username'); fUser.input.maxLength = 20; fUser.input.setAttribute('autocapitalize', 'off'); fUser.input.spellcheck = false;
    var fMail = field('Email', 'email', 'email'); fMail.input.setAttribute('autocapitalize', 'off'); fMail.input.spellcheck = false;
    var fPass = field('Password', 'password', 'current-password');
    var show = el('button', 'position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;color:#a4552a;font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:6px 8px', 'Show'); show.type = 'button';
    var pwrap = el('div', 'position:relative'); fPass.wrap.replaceChild(pwrap, fPass.input); pwrap.appendChild(fPass.input); pwrap.appendChild(show); fPass.input.style.paddingRight = '64px';
    show.onclick = function(){ var h = fPass.input.type === 'password'; fPass.input.type = h ? 'text' : 'password'; fConf.input.type = fPass.input.type; show.textContent = h ? 'Hide' : 'Show'; };
    var hint = el('div', 'font-size:12px;color:#6b5d4d;margin-top:4px', 'Use at least 8 characters.'); fPass.wrap.appendChild(hint);
    var fConf = field('Confirm password', 'password', 'new-password');
    var terms = el('label', 'display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.45;color:#4a3d2f');
    var chk = el('input'); chk.type = 'checkbox'; chk.style.marginTop = '2px';
    terms.appendChild(chk); terms.appendChild(el('span', null, 'I agree to the Terms and Privacy Policy (see gyindustries.vercel.app).'));
    var msg = el('div', 'font-size:13px;min-height:0'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
    var go = el('button', 'border:0;background:#c9713b;color:#fff;border-radius:10px;padding:11px;font:inherit;font-weight:700;cursor:pointer'); go.type = 'submit';
    var forgot = el('button', 'border:0;background:none;color:#a4552a;font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer;align-self:center', 'Forgot password?'); forgot.type = 'button';
    forgot.onclick = function(){ mode = 'forgot'; render(); };
    var back = el('button', 'border:0;background:none;color:#a4552a;font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer;align-self:center', 'Back to log in'); back.type = 'button';
    back.onclick = function(){ mode = 'signin'; render(); };

    [head, tabs, fUser.wrap, fMail.wrap, fPass.wrap, fConf.wrap, terms, msg, go, forgot, back].forEach(function(n){ card.appendChild(n); });
    ov.appendChild(card); document.body.appendChild(ov);

    function say(t, bad){ msg.textContent = t; msg.style.color = bad ? '#a4552a' : '#3f7a4a'; }
    function close(){ document.removeEventListener('keydown', onKey); if(ov.parentNode) ov.parentNode.removeChild(ov); }
    function onKey(e){ if(e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
    x.onclick = close;

    function render(){
      title.textContent = { signin: 'Log in', signup: 'Create account', forgot: 'Reset password' }[mode];
      tabs.style.display = mode === 'forgot' ? 'none' : 'flex';
      [[tIn, 'signin'], [tUp, 'signup']].forEach(function(p){ var on = mode === p[1]; p[0].style.background = on ? '#fffcf6' : 'transparent'; p[0].style.color = on ? '#241b12' : '#6b5d4d'; p[0].style.boxShadow = on ? '0 1px 3px rgba(36,27,18,.15)' : 'none'; });
      fUser.wrap.style.display = mode === 'signup' ? '' : 'none';
      fPass.wrap.style.display = mode === 'forgot' ? 'none' : '';
      hint.style.display = mode === 'signup' ? '' : 'none';
      fConf.wrap.style.display = mode === 'signup' ? '' : 'none';
      terms.style.display = mode === 'signup' ? 'flex' : 'none';
      forgot.style.display = mode === 'signin' ? '' : 'none';
      back.style.display = mode === 'forgot' ? '' : 'none';
      go.textContent = { signin: 'Log in', signup: 'Create account', forgot: 'Send reset link' }[mode];
      fPass.input.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
      fPass.input.type = 'password'; fConf.input.type = 'password'; show.textContent = 'Show';
      fConf.input.value = ''; chk.checked = false; say('');
      setTimeout(function(){ (mode === 'signup' ? fUser.input : fMail.input).focus(); }, 0);
    }
    function run(p){
      if(pending) return; pending = true; go.disabled = true; go.style.opacity = '.6';
      Promise.resolve(p).catch(function(){ say('Something went wrong. Please try again.', true); }).then(function(){ pending = false; go.disabled = false; go.style.opacity = '1'; });
    }
    card.onsubmit = function(e){
      e.preventDefault();
      var em = fMail.input.value.trim(), pw = fPass.input.value;
      if(!/^\S+@\S+\.\S+$/.test(em)) return say('Please enter a valid email.', true);
      if(mode === 'forgot'){
        return run(sb.auth.resetPasswordForEmail(em, { redirectTo: SITE_ }).then(function(r){
          say(r.error ? 'Something went wrong. Please try again.' : 'If that email has an account, a reset link is on its way.', !!r.error);
        }));
      }
      if(mode === 'signin'){
        if(!pw) return say('Please enter your password.', true);
        return run(sb.auth.signInWithPassword({ email: em, password: pw }).then(function(r){
          if(r.error){ say(/not confirmed/i.test(r.error.message || '') ? 'Please confirm your email first. Check your inbox.' : 'Incorrect email or password.', true); return; }
          close(); refresh();
        }));
      }
      var un = fUser.input.value.trim();
      if(!/^[A-Za-z0-9_]{3,20}$/.test(un)) return say('Username must be 3-20 letters, numbers or underscores.', true);
      if(pw.length < 8) return say('Password must be at least 8 characters.', true);
      if(pw !== fConf.input.value) return say('Passwords do not match.', true);
      if(!chk.checked) return say('Please agree to the Terms and Privacy Policy.', true);
      run(sb.rpc('username_available', { candidate: un }).then(function(c){
        if(!c.error && c.data === false){ say('That username is taken. Try another.', true); return; }
        return sb.auth.signUp({ email: em, password: pw, options: { data: { username: un }, emailRedirectTo: SITE_ } }).then(function(r){
          if(r.error){ say(r.error.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : 'Something went wrong. Please try again.', true); return; }
          var u = r.data && r.data.user;
          if(u && Array.isArray(u.identities) && u.identities.length === 0){ say('That email already has an account. Try logging in or resetting your password.', true); return; }
          if(r.data && r.data.session){ close(); refresh(); } else say('Almost there! Check your email to confirm your account.', false);
        });
      }));
    };
    render();
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
    login: function(){ if(!user) login(); },
    isSubscriber: function(){
      if(!sb || !user) return Promise.resolve(false);
      return sb.rpc('is_subscriber').then(function(r){ return r.data === true; }, function(){ return false; });
    },
    plan: function(){
      if(!sb || !user) return Promise.resolve(null);
      return sb.rpc('my_plan').then(function(r){ return typeof r.data === 'string' ? r.data : null; }, function(){ return null; });
    },
    perks: function(){
      if(!sb || !user) return Promise.resolve(null);
      return sb.rpc('my_perks').then(function(r){ return r.data || null; }, function(){ return null; });
    },
    sbux: function(){
      if(!sb || !user) return Promise.resolve(null);
      return sb.rpc('my_sbux').then(function(r){ return r.data || null; }, function(){ return null; });
    },
    isVip: function(game){
      return window.GY.perks().then(function(p){
        if(!p || !p.vip) return false;
        var g = game || GAME;
        return p.vip.indexOf('*') > -1 || p.vip.indexOf(g) > -1;
      });
    },
    inventory: function(){
      if(!sb || !user) return Promise.resolve([]);
      return sb.from('purchases').select('item_id').then(function(r){
        return (r.data || []).map(function(x){ return x.item_id; });
      }, function(){ return []; });
    },
    owns: function(itemId){
      return window.GY.inventory().then(function(a){ return a.indexOf(itemId) > -1; });
    },
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
