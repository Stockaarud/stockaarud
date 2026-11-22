/* =====================================================================
   Stockaarud : branchement sur Supabase
   Ce fichier fournit à l'appli les mêmes outils que sur claude.ai
   (base de données partagée, comptes, photos, téléchargements),
   mais avec la base Supabase de la structure.
   ===================================================================== */
(function () {
  "use strict";
  const CFG = window.STOCKAARUD_CONFIG || {};
  const LS = {
    get(k, d) { try { const v = localStorage.getItem("skb:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("skb:" + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem("skb:" + k); } catch (e) {} }
  };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* ---------- Plusieurs CAARUD sur le même appareil ----------
     Chaque base a ses propres clés locales (rôle, cache, file d'attente hors ligne…). */
  const refOf = u => { const m = /^https:\/\/([a-z0-9-]+)\.supabase\.co/i.exec(u || ""); return m ? m[1].toLowerCase() : String(u || "").replace(/[^a-z0-9]/gi, "").slice(-24); };
  const lsKeys = p => { const o = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(p)) o.push(k); } } catch (e) {} return o; };
  const lsDrop = p => lsKeys(p).forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  function addBase(u, k, n) {
    const r = refOf(u); if (!r) return;
    const L = LS.get("bases", []), e = L.find(x => refOf(x.u) === r);
    if (e) { e.u = u; e.k = k; if (n) e.n = n; } else L.push({ u, k, n: n || "" });
    LS.set("bases", L);
  }
  if (LS.get("bases", null) === null) {
    const u0 = LS.get("url", "") || CFG.supabaseUrl || "", r0 = refOf(u0);
    LS.set("bases", []);
    if (r0) {
      ["role", "uid", "cache"].forEach(k => { const v = LS.get(k, null); if (v !== null) LS.set(r0 + ":" + k, v); LS.del(k); });
      lsKeys("stk:").forEach(k => { try { localStorage.setItem("stk@" + r0 + ":" + k.slice(4), localStorage.getItem(k)); localStorage.removeItem(k); } catch (e) {} });
      addBase(u0, LS.get("key", "") || CFG.supabaseKey || "");
    }
  }
  const params = new URLSearchParams(location.search);
  const urlCode = (params.get("code") || "").trim().toUpperCase();
  // La base du CAARUD voyage dans le lien d'invitation : ?b=<projet>&k=<clé publique>
  const pB = (params.get("b") || "").trim(), pK = (params.get("k") || "").trim();
  if (pB && pK) {
    const u = /^https:\/\//.test(pB) ? pB.replace(/\/+$/, "") : "https://" + pB.replace(/[^a-z0-9-]/gi, "") + ".supabase.co";
    LS.set("url", u); LS.set("key", pK); addBase(u, pK); LS.del("local");
  }
  if (urlCode) { LS.set("pendingCode", urlCode); LS.set("pendingFor", refOf(LS.get("url", "") || CFG.supabaseUrl || "")); }
  if (urlCode || pB || pK) history.replaceState(null, "", location.pathname + location.hash);

  let sbUrl = LS.get("url", "") || CFG.supabaseUrl || "";
  let sbKey = (LS.get("url", "") ? LS.get("key", "") : "") || CFG.supabaseKey || "";
  /* Mode sans compte : tout reste sur cet appareil, jusqu'à ce qu'on branche une base */
  const LOCAL = !!LS.get("local", false);
  const base = LOCAL ? "local" : refOf(sbUrl);
  if (base && !LOCAL) addBase(sbUrl, sbKey);
  window.STK_NS = base ? "stk@" + base + ":" : "stk:";
  const BK = { get: (k, d) => LS.get(base + ":" + k, d), set: (k, v) => LS.set(base + ":" + k, v), del: k => LS.del(base + ":" + k) };
  let sb = null, uid = null, role = BK.get("role", null), synced = false;

  /* ---------- Écran de connexion ---------- */
  const OV_STYLE = `
  #skb{position:fixed;inset:0;z-index:100;background:var(--bg,#f2f5f3);color:var(--fg,#14201d);overflow:auto;
    padding:calc(24px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) calc(24px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
  #skb .in{max-width:440px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
  #skb .logo{display:flex;align-items:center;gap:12px}#skb .logo img{width:52px;height:52px}
  #skb .logo b{font:800 24px var(--display,"Archivo",sans-serif);letter-spacing:.01em;text-transform:uppercase}
  #skb .logo b span{color:var(--brand-2,#f2b705);-webkit-text-stroke:3px var(--brand-ink,#14201d);paint-order:stroke fill}
  #skb .card{background:var(--surface,#fff);border:1px solid var(--line,#d0dbd5);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px}
  #skb h2{margin:0;font:800 19px var(--display,"Archivo",sans-serif)}#skb p{margin:0}
  #skb label{display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--muted,#53645d)}
  #skb .err{color:var(--crit,#b3332a);font-weight:700;min-height:1.2em}
  #skb .code{font:800 26px var(--display,"Archivo",sans-serif);letter-spacing:.25em;text-align:center;text-transform:uppercase}
  #skb .step{display:flex;gap:10px;align-items:flex-start}#skb .step .n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--accent,#1f4d3a);color:#fff;display:grid;place-items:center;font-weight:800}
  #skb .step .t{display:block;margin-bottom:2px}#skb .step p b{color:var(--fg,#14201d)}#skb .step p{font-size:14px;color:var(--muted,#53645d);margin:0 0 6px}
  #skb .row{display:flex;flex-wrap:wrap;gap:8px}#skb a.btn{text-decoration:none;display:inline-flex;align-items:center}
  #skb textarea{width:100%;box-sizing:border-box;font:13px ui-monospace,monospace;padding:8px;border:1px solid var(--line,#d0dbd5);border-radius:8px;word-break:break-all}
  #skb .alt{background:none;border:0;color:var(--accent,#1f4d3a);text-decoration:underline;font:inherit;cursor:pointer;padding:10px 0;min-height:44px;text-align:left}`;
  let ov = null;
  function show(html) {
    if (!document.getElementById("skbStyle")) { const st = document.createElement("style"); st.id = "skbStyle"; st.textContent = OV_STYLE; document.head.appendChild(st); }
    if (!ov) { ov = document.createElement("div"); ov.id = "skb"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); document.body.appendChild(ov); }
    ov.innerHTML = '<div class="in"><div class="logo"><img src="icons/icon-192.png" alt=""><b>Stock<span>aarud</span></b></div>' + html + "</div>";
    const f = ov.querySelector("input"); if (f) setTimeout(() => f.focus(), 50);
  }
  function hide() { if (ov) { ov.remove(); ov = null; } }
  const $ = s => ov && ov.querySelector(s);
  function busy(btn, on) { if (btn) { btn.disabled = on; btn.dataset.t = btn.dataset.t || btn.textContent; btn.textContent = on ? "Un instant…" : btn.dataset.t; } }

  const SB_DASH = "https://supabase.com/dashboard/project/_/";
  let setupSql = "";
  function refFromKey(k) {
    try { const p = JSON.parse(atob(k.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); return p.ref || ""; } catch (e) { return ""; }
  }
  function screenSetup(msg) {
    if (!setupSql) fetch("supabase/setup.sql").then(r => r.ok ? r.text() : "").then(t => { setupSql = t; }).catch(() => {});
    const st = (n, t, body) => `<div class="step"><span class="n">${n}</span><div><b class="t">${t}</b>${body}</div></div>`;
    const lk = (href, t) => `<a class="btn small" href="${href}" target="_blank" rel="noopener">${t}</a>`;
    const hasLocal = !!localStorage.getItem("skb:local:cache");
    show((LOCAL ? `<div class="card"><h2>Passer en ligne</h2><p>Crée la base de ton CAARUD avec les 4 étapes ci-dessous. À la fin, tout ce que tu as saisi sur cet appareil y sera envoyé, et tu pourras inviter l'équipe.</p><button class="alt" id="sBack">Plus tard : revenir à l'appli</button></div>` : `<div class="card"><h2>Essayer tout de suite, sans compte</h2><p>Rien à installer : le stock est gardé sur cet appareil. Pratique pour découvrir l'appli avec ton vrai matériel.</p><p><b>Les limites :</b> un seul appareil (l'équipe ne peut pas noter depuis ses téléphones), et tout est perdu si l'appareil casse ou si l'historique du navigateur est effacé. Pour un usage en équipe, il faudra passer en ligne : ce que tu auras saisi sera repris.</p><button class="btn primary big" id="sLocal">${hasLocal ? "Reprendre sur cet appareil" : "Commencer sur cet appareil"}</button></div>`) + `<div class="card"><h2>Tu fais partie d'une équipe ?</h2><p>Scanne le QR code donné par ton responsable stock, ou ouvre le lien qu'il t'a envoyé. Tout se règle tout seul.</p></div>
      <div class="card"><h2>Installer Stockaarud pour mon CAARUD</h2><p>Chaque CAARUD a sa propre base de données, gratuite, que personne d'autre ne voit. Compte 15 minutes, sur un ordinateur.</p>
      ${st(1, "Créer la base", `<p>Crée un compte gratuit Supabase, puis un projet « stockaarud » en Europe. Attends qu'il soit prêt (1 à 2 minutes).</p><div class="row">${lk("https://supabase.com/dashboard/new", "Créer le projet")}</div>`)}
      ${st(2, "Installer les tables", `<p>Copie le script, ouvre l'éditeur SQL, colle-le et clique sur <b>Run</b>. Note le <b>code d'installation</b> affiché en bas.</p><div class="row"><button class="btn small" id="sCopy">Copier le script</button>${lk(SB_DASH + "sql/new", "Ouvrir l'éditeur SQL")}</div><textarea id="sSql" readonly hidden rows="4" aria-label="Script d'installation"></textarea>`)}
      ${st(3, "Autoriser les connexions par code", `<p>Active <b>Allow anonymous sign-ins</b>, puis <b>Save</b>.</p><div class="row">${lk(SB_DASH + "auth/providers", "Ouvrir le réglage")}</div>`)}
      ${st(4, "Brancher l'appli", `<p>Copie la clé <b>anon public</b> (onglet « Legacy API keys ») et colle-la ici, avec le code d'installation.</p><div class="row">${lk(SB_DASH + "settings/api-keys/legacy", "Ouvrir la page des clés")}</div>`)}
      <label>Clé anon public<textarea id="sK" rows="3" autocomplete="off" spellcheck="false">${esc(sbKey)}</textarea></label>
      <label id="sUL" hidden>Adresse du projet (Project URL)<input id="sU" placeholder="https://xxxx.supabase.co" value="${esc(sbUrl)}" autocomplete="off"></label>
      <label>Code d'installation<input id="sC" class="code" maxlength="10" autocomplete="off" autocapitalize="characters"></label>
      <div class="err" id="sE">${esc(msg || "")}</div><button class="btn primary big" id="sGo">Installer</button>
      <button class="alt" id="sAcc">J'ai un compte responsable stock avec e-mail</button></div>`);
    if ($("#sLocal")) $("#sLocal").onclick = () => { LS.set("local", true); location.reload(); };
    if ($("#sBack")) $("#sBack").onclick = () => { hide(); };
    $("#sCopy").onclick = () => {
      const ta = $("#sSql");
      if (!setupSql) { $("#sE").textContent = "Le script n'est pas encore chargé : réessaie dans une seconde."; return; }
      const done = () => { $("#sCopy").textContent = "Script copié ✓"; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(setupSql).then(done, () => { ta.hidden = false; ta.value = setupSql; ta.select(); });
      else { ta.hidden = false; ta.value = setupSql; ta.select(); }
    };
    const chk = () => { const k = $("#sK").value.trim(); $("#sUL").hidden = !k || !!refFromKey(k); };
    $("#sK").oninput = chk; chk();
    $("#sAcc").onclick = () => {
      const k = $("#sK").value.trim(), ref = refFromKey(k), u = ref ? "https://" + ref + ".supabase.co" : $("#sU").value.trim().replace(/\/+$/, "");
      if (!/^https:\/\/.+/.test(u) || k.length < 20) { $("#sE").textContent = "Colle d'abord la clé anon de ta base (étape 4)."; return; }
      LS.set("url", u); LS.set("key", k); addBase(u, k); location.reload();
    };
    $("#sGo").onclick = async () => {
      const k = $("#sK").value.trim(), ref = refFromKey(k), code = $("#sC").value.trim().toUpperCase(), b = $("#sGo");
      const u = ref ? "https://" + ref + ".supabase.co" : $("#sU").value.trim().replace(/\/+$/, "");
      if (k.length < 20) { $("#sE").textContent = "Colle la clé anon public (étape 4)."; return; }
      if (!/^https:\/\/.+/.test(u)) { $("#sE").textContent = "Indique aussi l'adresse du projet (https://…supabase.co)."; return; }
      if (code.length < 6) { $("#sE").textContent = "Entre le code d'installation affiché après le script (étape 2)."; return; }
      busy(b, true);
      try {
        const c = window.supabase.createClient(u, k, { auth: { persistSession: true, autoRefreshToken: true } });
        const r = await c.auth.signInAnonymously();
        if (r.error) { busy(b, false); $("#sE").textContent = /anonymous/i.test(r.error.message) ? "Les connexions par code ne sont pas encore autorisées : fais l'étape 3, puis réessaie." : /api key|invalid/i.test(r.error.message) ? "Cette clé n'est pas reconnue : vérifie que c'est bien la clé « anon public »." : netMsg(r.error); return; }
        const j = await c.rpc("rejoindre", { p_code: code });
        if (j.error) { busy(b, false); $("#sE").textContent = /function|rejoindre/i.test(j.error.message) ? "Les tables ne sont pas installées : fais l'étape 2, puis réessaie." : netMsg(j.error); await c.auth.signOut(); return; }
        if (j.data !== "coordo") { busy(b, false); $("#sE").textContent = "Ce code d'installation n'est pas valide. Relance le script pour en obtenir un nouveau."; await c.auth.signOut(); return; }
        if (LOCAL || localStorage.getItem("skb:local:cache")) LS.set("migrate", refOf(u));
        LS.del("local"); LS.set("url", u); LS.set("key", k); addBase(u, k); location.reload();
      } catch (e) { busy(b, false); $("#sE").textContent = netMsg(e); }
    };
  }

  function screenLogin(msg) {
    const pc = LS.get("pendingFor", base) === base ? LS.get("pendingCode", "") : "";
    show(`<div class="card"><h2>Je fais partie de l'équipe</h2><p>Entre le code donné par ton responsable stock, ou scanne son QR code. Ça marche aussi avec un code de responsable stock.</p>
      <input id="tC" class="code" maxlength="10" autocomplete="off" autocapitalize="characters" inputmode="text" value="${esc(pc)}" aria-label="Code d'équipe">
      <div class="err" id="tE">${esc(msg || "")}</div><button class="btn primary big" id="tGo">Rejoindre l'équipe</button></div>
      <button class="alt" id="cShow">J'ai un compte responsable stock avec e-mail</button>
      <div class="card" id="cCard" hidden><h2>Responsable stock avec un compte</h2>
      <label>Adresse e-mail<input id="cM" type="email" autocomplete="username"></label>
      <label>Mot de passe<input id="cP" type="password" autocomplete="current-password"></label>
      <div class="err" id="cE"></div><button class="btn big" id="cGo">Se connecter</button>
      </div>
      <button class="alt" id="cfg">Changer de base de données</button>`);
    $("#tC").onkeydown = e => { if (e.key === "Enter") $("#tGo").click(); };
    $("#cP").onkeydown = e => { if (e.key === "Enter") $("#cGo").click(); };
    $("#cfg").onclick = () => screenSetup();
    $("#tGo").onclick = async () => {
      const code = $("#tC").value.trim().toUpperCase(), b = $("#tGo");
      if (code.length < 4) { $("#tE").textContent = "Entre le code (6 à 10 caractères)."; return; }
      busy(b, true);
      try {
        let { data: s } = await sb.auth.getSession();
        if (!s.session) { const r = await sb.auth.signInAnonymously(); if (r.error) throw r.error; }
        const { data, error } = await sb.rpc("rejoindre", { p_code: code });
        if (error) throw error;
        if (!data) { busy(b, false); $("#tE").textContent = "Code inconnu ou désactivé. Demande un nouveau code au responsable stock."; return; }
        LS.del("pendingCode"); await enter();
      } catch (e) { busy(b, false); $("#tE").textContent = netMsg(e, "La connexion a échoué. Vérifie que les connexions anonymes sont activées dans Supabase."); }
    };
    $("#cGo").onclick = async () => {
      const b = $("#cGo"); busy(b, true);
      const { error } = await sb.auth.signInWithPassword({ email: $("#cM").value.trim(), password: $("#cP").value });
      if (error) { busy(b, false); $("#cE").textContent = /invalid/i.test(error.message) ? "E-mail ou mot de passe incorrect." : netMsg(error); return; }
      await enter(true);
    };
    $("#cShow").onclick = () => { $("#cCard").hidden = false; $("#cShow").hidden = true; $("#cM").focus(); };
  }

  function screenSignup() {
    show(`<div class="card"><h2>Créer le compte responsable stock</h2><p>Le premier compte créé gère le stock. Il sert aussi de compte de secours : garde bien le mot de passe. Les autres responsables stock n'ont pas besoin de compte : tu leur donneras un code.</p>
      <label>Adresse e-mail<input id="nM" type="email" autocomplete="username"></label>
      <label>Mot de passe (8 caractères ou plus)<input id="nP" type="password" autocomplete="new-password"></label>
      <div class="err" id="nE"></div><button class="btn primary big" id="nGo">Créer le compte</button>
      <button class="alt" id="nBack">Retour</button></div>`);
    $("#nBack").onclick = () => screenLogin();
    $("#nGo").onclick = async () => {
      const m = $("#nM").value.trim(), p = $("#nP").value, b = $("#nGo");
      if (!/.+@.+\..+/.test(m) || p.length < 8) { $("#nE").textContent = "Vérifie l'e-mail et choisis un mot de passe d'au moins 8 caractères."; return; }
      busy(b, true);
      const { data, error } = await sb.auth.signUp({ email: m, password: p });
      if (error) { busy(b, false); $("#nE").textContent = netMsg(error); return; }
      if (!data.session) { show(`<div class="card"><h2>Confirme ton adresse</h2><p>Un e-mail de confirmation a été envoyé à ${esc(m)}. Clique sur le lien, puis reviens ici pour te connecter.</p><button class="btn primary big" id="ok">J'ai confirmé</button></div>`); $("#ok").onclick = () => screenLogin(); return; }
      await enter(true);
    };
  }

  function screenCoordoCode() {
    show(`<div class="card"><h2>Code responsable stock</h2><p>Stockaarud est déjà installé pour ce CAARUD. Demande un code de responsable stock (Réglages › Accès et appareils).</p>
      <input id="kC" class="code" maxlength="10" autocomplete="off" autocapitalize="characters" aria-label="Code responsable stock">
      <div class="err" id="kE"></div><button class="btn primary big" id="kGo">Valider</button><button class="alt" id="kOut">Se déconnecter</button></div>`);
    $("#kOut").onclick = () => logout();
    $("#kGo").onclick = async () => {
      const { data, error } = await sb.rpc("rejoindre", { p_code: $("#kC").value.trim().toUpperCase() });
      if (error || data !== "coordo") { $("#kE").textContent = error ? netMsg(error) : "Ce code n'est pas un code de responsable stock valide."; return; }
      await enter();
    };
  }

  function netMsg(e, fallback) {
    const m = (e && (e.message || e.error_description)) || "";
    if (!navigator.onLine || /fetch|network/i.test(m)) return "Pas de connexion internet. Réessaie dès que le réseau revient.";
    return fallback || m || "Une erreur est survenue.";
  }

  /* ---------- Entrée dans l'appli ---------- */
  let resolveReady; const ready = new Promise(r => (resolveReady = r));
  async function enter(fromCoordoLogin) {
    const { data: s } = await sb.auth.getSession();
    if (!s.session) { screenLogin(); return; }
    uid = s.session.user.id;
    const anon = !!s.session.user.is_anonymous;
    let r = null;
    try {
      const { data, error } = await sb.rpc("mon_role"); if (error) throw error; r = data;
      if (!r && !anon) { const p = await sb.rpc("premier_coordo"); if (p.data) r = "coordo"; }
    } catch (e) {
      if (role && BK.get("uid", null) === uid) r = role; // hors ligne : on garde le dernier rôle connu
      else { screenLogin(netMsg(e)); return; }
    }
    if (!r) { if (anon) { await sb.auth.signOut(); screenLogin("Cet appareil n'a plus accès. Demande un nouveau code au responsable stock."); } else screenCoordoCode(); return; }
    role = r; BK.set("role", r); BK.set("uid", uid);
    if (r === "coordo" && LS.get("migrate", "") === base) await migrateLocal();
    if (ov) hide();
    startSync();
    resolveReady(true);
  }
  function forgetLocal(r) {
    lsDrop("skb:" + r + ":"); lsDrop("stk@" + r + ":"); lsDrop("sb-" + r + "-auth-token");
    LS.set("bases", LS.get("bases", []).filter(x => refOf(x.u) !== r));
  }
  function bases() {
    return LS.get("bases", []).map(x => {
      const r = refOf(x.u); let pend = 0;
      try { const q = JSON.parse(localStorage.getItem("stk@" + r + ":queue") || "[]"); pend = Array.isArray(q) ? q.length : 0; } catch (e) {}
      return { ref: r, nom: x.n || "", cur: r === base, pend };
    });
  }
  function switchBase(r) {
    const e = LS.get("bases", []).find(x => refOf(x.u) === r); if (!e || r === base) return;
    LS.set("url", e.u); LS.set("key", e.k); location.reload();
  }
  function addLink(text) {
    let u; try { u = new URL(String(text || "").trim()); } catch (e) { return "Ce n'est pas un lien. Copie le lien d'invitation en entier."; }
    const b = (u.searchParams.get("b") || "").trim(), k = (u.searchParams.get("k") || "").trim(), c = (u.searchParams.get("code") || "").trim().toUpperCase();
    if (!b || !k) return "Ce lien n'est pas un lien d'invitation Stockaarud.";
    const url = /^https:\/\//.test(b) ? b.replace(/\/+$/, "") : "https://" + b.replace(/[^a-z0-9-]/gi, "") + ".supabase.co";
    LS.set("url", url); LS.set("key", k); addBase(url, k); if (c) { LS.set("pendingCode", c); LS.set("pendingFor", refOf(url)); }
    location.reload(); return "";
  }
  function setName(n) {
    n = String(n || "").trim(); const L = LS.get("bases", []), e = L.find(x => refOf(x.u) === base);
    if (e && n && e.n !== n) { e.n = n; LS.set("bases", L); }
  }
  async function migrateLocal() {
    let d = null; try { d = JSON.parse(localStorage.getItem("skb:local:cache") || "null"); } catch (e) {}
    if (!d) { LS.del("migrate"); return; }
    try { const { data: ex } = await sb.from("documents").select("coll,id,data").order("coll").order("id").range(0, 0);
      if (ex && ex.length) { LS.del("migrate"); show(`<div class="card"><h2>Cette base contient déjà des données</h2><p>Ce que tu as saisi sans compte n'a pas été envoyé, pour ne rien écraser. Il reste sur cet appareil : tu peux le retrouver depuis l'écran d'installation, « Reprendre sur cet appareil », et en télécharger une sauvegarde.</p><button class="btn primary big" id="mgK">Compris</button></div>`); await new Promise(res => { $("#mgK").onclick = res; }); return; } } catch (e) {}
    const rows = []; for (const c in d) for (const id in d[c]) rows.push({ coll: c, id, data: d[c][id], updated_at: new Date().toISOString() });
    show(`<div class="card"><h2>Envoi de tes données…</h2><p id="mgP">0 / ${rows.length}</p><p>Garde cette page ouverte.</p></div>`);
    try {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from("documents").upsert(rows.slice(i, i + 200)); if (error) throw error;
        const el = $("#mgP"); if (el) el.textContent = Math.min(rows.length, i + 200) + " / " + rows.length;
      }
      LS.del("migrate"); lsDrop("skb:local:"); lsMove("stk@local:", "stk@" + base + ":");
    } catch (e) {
      show(`<div class="card"><h2>L'envoi n'a pas abouti</h2><p>${esc(netMsg(e))}</p><p>Tes données sont toujours sur cet appareil. Réessaie quand la connexion est bonne.</p><button class="btn primary big" id="mgR">Réessayer</button></div>`);
      await new Promise(res => { $("#mgR").onclick = res; }); return migrateLocal();
    }
  }
  const lsMove = (from, to) => lsKeys(from).forEach(k => { try { if (localStorage.getItem(to + k.slice(from.length)) == null) localStorage.setItem(to + k.slice(from.length), localStorage.getItem(k)); localStorage.removeItem(k); } catch (e) {} });
  async function logout() {
    let pend = 0; try { const q = JSON.parse(localStorage.getItem("stk@" + base + ":queue") || "[]"); pend = Array.isArray(q) ? q.length : 0; } catch (e) {}
    if (pend && !confirm(pend + " saisie" + (pend > 1 ? "s ne sont" : " n'est") + " pas encore envoyée" + (pend > 1 ? "s" : "") + " et " + (pend > 1 ? "seront perdues" : "sera perdue") + ". Se déconnecter quand même ?")) return;
    try { await sb.auth.signOut(); } catch (e) {}
    forgetLocal(base);
    const next = LS.get("bases", [])[0];
    if (next) { LS.set("url", next.u); LS.set("key", next.k); }
    location.reload();
  }

  /* ---------- Base de données (même interface que sur claude.ai) ---------- */
  const store = new Map();
  const cached = BK.get("cache", null);
  if (cached && typeof cached === "object") for (const c in cached) store.set(c, new Map(Object.entries(cached[c])));
  const collL = new Map(), docL = new Map();
  let saveT = 0;
  let cacheWarned = false;
  const tryStore = (k, v) => { try { localStorage.setItem("skb:" + base + ":" + k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const writeCache = () => {
    clearTimeout(saveT); saveT = 0; const o = {}; for (const [c, m] of store) o[c] = Object.fromEntries(m);
    if (tryStore("cache", o)) return;
    if (LOCAL) { if (!cacheWarned) { cacheWarned = true; alert("Il n'y a plus de place sur cet appareil pour enregistrer le stock. Télécharge une sauvegarde maintenant (Réglages), puis passe en ligne : sans cela, les prochaines saisies ne seront pas gardées."); } return; }
    // en ligne, la base garde tout : hors connexion, on se contente des 6 derniers mois et des inventaires
    const lim = Date.now() - 200 * 864e5, mv = {}; for (const [id, d] of store.get("mouvements") || []) if (d && (d.t >= lim || d.type === "inventaire")) mv[id] = d;
    if (!tryStore("cache", { ...o, mouvements: mv })) console.warn("Cache hors ligne impossible à enregistrer");
  };
  // sans compte, ce cache est la seule copie des données : on l'écrit presque tout de suite, et toujours avant de quitter la page
  function saveCache() { clearTimeout(saveT); saveT = setTimeout(writeCache, LOCAL ? 40 : 400); }
  if (LOCAL) { window.addEventListener("pagehide", () => { if (saveT) writeCache(); }); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && saveT) writeCache(); }); }
  const meta = () => ({ fromCache: !synced, hasPendingWrites: false });
  function docSnap(c, id) { const m = store.get(c), d = m && m.get(id); return { id, exists: d !== undefined, data: () => d, metadata: meta() }; }
  function emitColl(c) {
    const ls = collL.get(c); if (!ls || !ls.size) return;
    const m = store.get(c) || new Map();
    const docs = [...m.keys()].sort().map(id => docSnap(c, id));
    const snap = { docs, size: docs.length, empty: !docs.length, metadata: meta(), docChanges: () => [] };
    ls.forEach(cb => { try { cb(snap); } catch (e) { console.error(e); } });
  }
  function emitDoc(c, id) { const ls = docL.get(c + "/" + id); if (ls) ls.forEach(cb => { try { cb(docSnap(c, id)); } catch (e) { console.error(e); } }); }
  function emitAll() { for (const c of collL.keys()) emitColl(c); for (const p of docL.keys()) { const [c, id] = p.split("/"); emitDoc(c, id); } }
  function put(c, id, data) { if (!store.has(c)) store.set(c, new Map()); if (data === undefined) store.get(c).delete(id); else store.get(c).set(id, data); saveCache(); emitColl(c); emitDoc(c, id); }

  function mapErr(error) {
    const m = (error && error.message) || "";
    if (!navigator.onLine || /fetch|network|Failed to fetch|timeout/i.test(m) || error.status === 0) return { code: "unavailable", message: m };
    if (/row-level security|permission|42501/i.test(m + (error.code || ""))) { setTimeout(resync, 50); return { code: "invalid_argument", message: m }; }
    return { code: "unavailable", message: m };
  }
  async function fullSync() {
    const fresh = new Map(); let from = 0; const step = 1000;
    for (;;) {
      const { data, error } = await sb.from("documents").select("coll,id,data").order("coll").order("id").range(from, from + step - 1);
      if (error) throw error;
      for (const r of data) { if (!fresh.has(r.coll)) fresh.set(r.coll, new Map()); fresh.get(r.coll).set(r.id, r.data); }
      if (data.length < step) break; from += step;
    }
    store.clear(); for (const [c, m] of fresh) store.set(c, m);
    synced = true; saveCache(); emitAll();
  }
  let channel = null, syncing = false;
  async function startSync() {
    if (!channel) {
      channel = sb.channel("stockaarud-docs").on("postgres_changes", { event: "*", schema: "public", table: "documents" }, p => {
        if (p.eventType === "DELETE") { const o = p.old || {}; if (o.coll) put(o.coll, o.id, undefined); }
        else { const n = p.new || {}; if (n.coll) put(n.coll, n.id, n.data); }
      }).subscribe(st => { if (st === "SUBSCRIBED") resync(); });
    }
    resync();
  }
  /* L'accès a pu être retiré (ou changé) depuis un autre appareil : on le vérifie avant de recharger les données. */
  async function checkAccess() {
    if (!navigator.onLine || !sb || !role) return true;
    try {
      const { data, error } = await sb.rpc("mon_role"); if (error) return true;
      if (!data) { BK.set("msg", "Cet appareil n'a plus accès. Demande un nouveau code au responsable stock."); BK.del("cache"); await sb.auth.signOut(); return false; }
      if (data !== role) { role = data; BK.set("role", data); location.reload(); return false; }
    } catch (e) {}
    return true;
  }
  async function resync() { if (syncing || !navigator.onLine) return; syncing = true; try { if (await checkAccess()) await fullSync(); } catch (e) { console.warn("Synchronisation impossible", e); } syncing = false; }
  window.addEventListener("online", resync);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resync(); });

  function split(path) { const i = path.indexOf("/"); return [path.slice(0, i), path.slice(i + 1)]; }
  const db = Object.freeze({
    doc(path) {
      const [c, id] = split(path);
      return {
        id, path,
        async get() { return docSnap(c, id); },
        async set(data) {
          const { error } = await sb.from("documents").upsert({ coll: c, id, data, updated_at: new Date().toISOString() });
          if (error) throw mapErr(error); put(c, id, data);
        },
        async update(patch) {
          const { error } = await sb.rpc("doc_fusion", { p_coll: c, p_id: id, p_patch: patch });
          if (error) throw mapErr(error);
          const cur = (store.get(c) || new Map()).get(id); if (cur) put(c, id, { ...cur, ...patch });
        },
        async delete() {
          const had = (store.get(c) || new Map()).has(id);
          const { data, error } = await sb.from("documents").delete().eq("coll", c).eq("id", id).select("id");
          if (error) throw mapErr(error);
          // rien n'a été supprimé alors que le document existe : la base a refusé (saisie d'un collègue)
          if (had && Array.isArray(data) && !data.length && navigator.onLine) throw mapErr({ message: "row-level security", code: "42501" });
          put(c, id, undefined);
        },
        onSnapshot(next) {
          const k = c + "/" + id; if (!docL.has(k)) docL.set(k, new Set()); docL.get(k).add(next);
          setTimeout(() => next(docSnap(c, id)), 0);
          return () => docL.get(k).delete(next);
        }
      };
    },
    collection(c) {
      return {
        path: c,
        doc: id => db.doc(c + "/" + id),
        onSnapshot(next) {
          if (!collL.has(c)) collL.set(c, new Set()); collL.get(c).add(next);
          setTimeout(() => emitColl(c), 0);
          return () => collL.get(c).delete(next);
        }
      };
    }
  });

  const dbLocal = Object.freeze({
    doc(path) {
      const [c, id] = split(path);
      return {
        id, path,
        async get() { return docSnap(c, id); },
        async set(data) { put(c, id, JSON.parse(JSON.stringify(data))); },
        async update(patch) { const cur = (store.get(c) || new Map()).get(id); if (cur) put(c, id, { ...cur, ...JSON.parse(JSON.stringify(patch)) }); },
        async delete() { put(c, id, undefined); },
        onSnapshot(next) { const k = c + "/" + id; if (!docL.has(k)) docL.set(k, new Set()); docL.get(k).add(next); setTimeout(() => next(docSnap(c, id)), 0); return () => docL.get(k).delete(next); }
      };
    },
    collection(c) { return { path: c, doc: id => dbLocal.doc(c + "/" + id), onSnapshot(next) { if (!collL.has(c)) collL.set(c, new Set()); collL.get(c).add(next); setTimeout(() => emitColl(c), 0); return () => collL.get(c).delete(next); } }; }
  });
  const user = Object.freeze({
    isOwner: async () => role === "coordo",
    canEdit: async () => role === "coordo",
    can: async n => (n === "data.write" ? true : null),
    id: async () => uid,
    me: async () => ({ id: uid, name: "", isOwner: role === "coordo", canEdit: role === "coordo" })
  });

  const assets = Object.freeze({
    async upload(blob) {
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + "." + ext;
      const { error } = await sb.storage.from("photos").upload(id, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (error) throw mapErr(error);
      const url = sb.storage.from("photos").getPublicUrl(id).data.publicUrl;
      return { id, url, sizeBytes: blob.size, contentType: blob.type };
    },
    async delete(id) { await sb.storage.from("photos").remove([id]); },
    async list() { const { data } = await sb.storage.from("photos").list(); return { assets: data || [], usage: {} }; }
  });

  const downloads = Object.freeze({
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return { saved: true };
    }
  });

  const caps = { db: LOCAL ? dbLocal : db, user, assets: LOCAL ? null : assets, downloads };
  window.claude = Object.freeze({ use: name => ready.then(() => caps[name] || null) });

  /* ---------- Outils pour l'écran « Accès et appareils » ---------- */
  function inviteLink(code) {
    const m = /^https:\/\/([a-z0-9-]+)\.supabase\.co$/i.exec(sbUrl);
    return location.origin + location.pathname + "?b=" + encodeURIComponent(m ? m[1] : sbUrl) + "&k=" + encodeURIComponent(sbKey) + (code ? "&code=" + encodeURIComponent(code) : "");
  }
  function qrSvg(text) {
    if (typeof qrcode !== "function") return "";
    const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }
  window.SKB = Object.freeze({
    get role() { return role; },
    get url() { return LOCAL ? "cet appareil (sans compte)" : sbUrl; },
    get local() { return LOCAL; },
    goOnline() { screenSetup(); },
    async newCode(r) { if (LOCAL) throw { code: "local", message: "Passe en ligne pour inviter l'équipe." }; const { data, error } = await sb.rpc("creer_code", { p_role: r }); if (error) throw mapErr(error); return data; },
    async disableCodes(r) { const { error } = await sb.rpc("desactiver_codes", { p_role: r }); if (error) throw mapErr(error); },
    async removeTeam() { const { error } = await sb.rpc("retirer_equipe"); if (error) throw mapErr(error); },
    async removeGest() { const { error } = await sb.rpc("retirer_gestion_par_code"); if (error) throw mapErr(error); },
    inviteLink, qrSvg, logout,
    bases, switchBase, addLink, setName,
    forget(r) { if (r === base) logout(); else forgetLocal(r); }
  });

  /* ---------- Démarrage ---------- */
  if (LOCAL) { role = "coordo"; uid = "local"; synced = true; try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {} resolveReady(true); return; }
  if (!sbUrl || !sbKey || !window.supabase) { screenSetup(!window.supabase ? "La bibliothèque Supabase n'a pas pu se charger : vérifie la connexion internet." : ""); return; }
  try { sb = window.supabase.createClient(sbUrl, sbKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }); }
  catch (e) { screenSetup("Adresse ou clé invalide."); return; }
  sb.auth.getSession().then(({ data }) => { if (data.session) enter(); else { const m = BK.get("msg", ""); BK.del("msg"); screenLogin(m); } });
  sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" && role) { BK.del("role"); location.reload(); } });
})();
