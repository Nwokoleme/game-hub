/* Jolt File 1: chat.js
   New chat hub for the Friends tab. Loads after index.html, uses the same Firebase app.
   Features: one chat list (friends + groups), Jux inside chats, blue/red online dots,
   two blue ticks, streaks, requests button, WhatsApp-style groups with name + picture,
   disappearing messages (24h), read receipts switch. */
import { getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function ready() {
  return new Promise(res => {
    const t = setInterval(() => { if (getApps().length) { clearInterval(t); res(); } }, 100);
  });
}

(async function () {
  await ready();
  const app = getApp(), auth = getAuth(app), db = getFirestore(app);
  const $ = id => document.getElementById(id);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  const ONLINE_MS = 150000;
  let me = null, myP = null, players = [], reqs = {}, groups = [];
  let unsubs = [], lastUnsubs = {}, lastMsgs = {};
  let cx = null; // open chat

  // ---------- styles ----------
  const css = document.createElement("style");
  css.textContent = `
#tab-friends>.card{display:none!important}
#quickJux{display:none!important}
#chatHub{padding:4px 0 90px}
.chHead{display:flex;align-items:center;justify-content:space-between;padding:10px 2px}
.chHead h2{margin:0;font-size:24px}
.chBtns{display:flex;gap:8px;padding:0 0 10px}
.chBtns button{flex:1;margin:0;padding:11px 8px;font-size:15px;border-radius:14px;position:relative}
.chBadge{background:#f4212e;color:#fff;border-radius:10px;padding:1px 7px;font-size:12px;margin-left:6px}
.chRow{display:flex;align-items:center;gap:12px;padding:12px 2px;border-bottom:1px solid var(--line);cursor:pointer}
.chRow:active{background:var(--inp)}
.chAv{position:relative;flex:none;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#16a34a,#0f766e);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:21px;background-size:cover;background-position:center}
.chAv.sm{width:34px;height:34px;font-size:14px}
.chAv .st{position:absolute;right:-1px;bottom:-1px;width:14px;height:14px;border-radius:50%;border:2px solid var(--bg)}
.st.on{background:#1d9bf0}.st.off{background:#f4212e}
.chMid{flex:1;min-width:0}
.chMid b{display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chMid span{display:block;color:var(--mut);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.chTime{font-size:12px;color:var(--mut);flex:none}
.chEmpty{text-align:center;color:var(--mut);padding:30px 10px;font-size:14px}
#cx{position:fixed;inset:0;z-index:40;background:var(--bg);display:flex;flex-direction:column;height:100dvh}
#cx.hidden{display:none}
#cx .cxHead{display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 8px;border-bottom:1px solid var(--line)}
#cx .cxHead button{width:40px;height:40px;padding:0;margin:0;border-radius:50%;flex:none;font-size:18px;background:transparent;color:var(--tx);border:none}
#cx .cxT{flex:1;min-width:0}
#cx .cxT b{display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cx .cxT span{font-size:12px;color:var(--mut)}
#cxLog{flex:1;min-height:0;overflow-y:auto;padding:12px 10px;background:var(--wp-bg,var(--chat-bg))}
.cxMsg{display:flex;gap:8px;margin:6px 0;align-items:flex-end}
.cxMsg.mine{justify-content:flex-end}
.cxB{max-width:78%;padding:7px 11px 5px;border-radius:12px 12px 12px 3px;background:var(--in-bg);color:var(--tx);box-shadow:0 1px 1px rgba(0,0,0,.25);font-size:15.5px;line-height:1.35;word-wrap:break-word;overflow-wrap:anywhere;white-space:pre-wrap;-webkit-user-select:text;user-select:text}
.cxMsg.mine .cxB{background:var(--me-bg);color:var(--me-tx);border-radius:12px 12px 3px 12px}
.cxN{font-size:12px;font-weight:700;color:var(--ac);margin-bottom:2px}
.cxM{font-size:10.5px;opacity:.7;text-align:right;margin-top:2px;white-space:nowrap}
.tick{margin-left:4px;font-weight:700}
.tick.blue{color:#1d9bf0;opacity:1}
.cxB audio{display:block;width:200px;max-width:100%;height:36px}
.cxNote{text-align:center;color:var(--mut);font-size:12px;margin:8px 0}
#cx .cxBar{display:flex;gap:8px;align-items:center;padding:8px 10px calc(8px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--bg)}
#cx .cxBar input{flex:1;margin:0;border-radius:22px;padding:11px 16px;min-width:0}
#cx .cxBar button{width:46px;height:46px;padding:0;margin:0;border-radius:50%;font-size:19px;display:flex;align-items:center;justify-content:center;background:var(--btn);color:#fff;border:none}
#chSheet{position:fixed;inset:0;z-index:45;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center}
#chSheet.hidden{display:none}
#chSheet .box{width:100%;max-width:560px;max-height:86vh;overflow-y:auto;background:var(--card);color:var(--tx);border-radius:22px 22px 0 0;padding:16px 16px 26px}
#chSheet h3{margin:0 0 10px;font-size:19px}
#chSheet .opt{display:block;width:100%;text-align:left;margin:6px 0;padding:14px;border-radius:14px;border:none;background:var(--inp);color:var(--tx);font-size:16px}
#chSheet .opt.red{color:#ff6b6b}
#chSheet .rq{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
#chSheet .rq .chMid{flex:1}
#chSheet .rq button{width:auto;margin:0;padding:8px 14px;font-size:14px}
#chSheet label.gp{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--line);font-size:16px}
#chSheet label.gp input{width:22px;height:22px;margin:0;flex:none}
#chSheet .gl{max-height:34vh;overflow-y:auto;margin:8px 0}
`;
  document.head.appendChild(css);

  // ---------- containers ----------
  const hub = mk("div"); hub.id = "chatHub";
  const tabF = $("tab-friends");
  if (!tabF) return;
  tabF.appendChild(hub);

  const cxEl = mk("div", "hidden"); cxEl.id = "cx";
  cxEl.innerHTML = '<div class="cxHead"><button id="cxBack" type="button" aria-label="Back">←</button><div id="cxAv"></div><div class="cxT"><b id="cxTitle"></b><span id="cxSub"></span></div><button id="cxMenu" type="button" aria-label="Options">⋯</button></div>' +
    '<div id="cxLog"></div><div class="cxBar"><input id="cxInput" placeholder="Type a message" maxlength="500" autocomplete="off"><button id="cxSend" type="button" aria-label="Send">➤</button></div>';
  document.body.appendChild(cxEl);
  const sheet = mk("div", "hidden"); sheet.id = "chSheet";
  document.body.appendChild(sheet);
  sheet.addEventListener("click", e => { if (e.target === sheet) closeSheet(); });
  function closeSheet() { sheet.classList.add("hidden"); sheet.innerHTML = ""; }
  function openSheet(title) {
    sheet.innerHTML = "";
    const box = mk("div", "box");
    box.appendChild(mk("h3", "", title));
    sheet.appendChild(box);
    sheet.classList.remove("hidden");
    return box;
  }

  // ---------- helpers ----------
  const isOn = p => !!p && !!p.lastSeen && (Date.now() - p.lastSeen) < ONLINE_MS;
  const pOf = uid => players.find(x => x.uid === uid);
  const nameOf = uid => { const p = pOf(uid); return p ? (p.gameName || "Player") : "Player"; };
  const myName = () => (myP && myP.gameName) || "Player";
  const dmId = other => [other, me.uid].sort().join("_");
  function fillAv(el, p, name) {
    if (p && p.photo) { el.style.backgroundImage = "url(" + p.photo + ")"; el.textContent = ""; }
    else { el.style.backgroundImage = ""; el.textContent = (name || "?").charAt(0).toUpperCase(); }
  }
  function mkAv(p, name, small, dot) {
    const a = mk("div", "chAv" + (small ? " sm" : ""));
    fillAv(a, p, name);
    if (dot) a.appendChild(mk("span", "st " + (isOn(p) ? "on" : "off")));
    return a;
  }
  const msOf = m => (m.time && m.time.seconds) ? m.time.seconds * 1000 : Date.now();
  function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
  function timeLabel(ms) {
    const d = new Date(ms);
    if (dayKey(ms) === dayKey(Date.now())) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  }
  function preview(m) {
    const t = typeof m.text === "string" ? m.text : "";
    let s = t;
    if (t.indexOf("[v]") === 0) s = "🎤 Voice note";
    else if (t.indexOf("[s]") === 0) s = t.slice(3).split("|")[0] || "Sticker";
    return (m.from === me.uid ? "You: " : "") + s;
  }
  function streakOf(msgs, a, b) {
    const days = {};
    msgs.forEach(m => {
      if (!m.time || !m.time.seconds) return;
      const k = dayKey(m.time.seconds * 1000);
      (days[k] = days[k] || new Set()).add(m.from);
    });
    const ok = d => { const s = days[dayKey(d.getTime())]; return !!s && s.has(a) && s.has(b); };
    const t = new Date(); t.setHours(0, 0, 0, 0);
    if (!ok(t)) t.setDate(t.getDate() - 1);
    let n = 0;
    while (ok(t)) { n++; t.setDate(t.getDate() - 1); }
    return n;
  }
  const disKey = id => "jolt_dis_" + id;
  function disOn(id, cdata) {
    if (cdata && typeof cdata.disappear === "boolean") return cdata.disappear;
    try { return localStorage.getItem(disKey(id)) === "1"; } catch (e) { return false; }
  }

  // ---------- chat list ----------
  function friendIds() { return Object.keys(reqs).filter(id => reqs[id].status === "accepted"); }
  function incoming() { return Object.keys(reqs).filter(id => reqs[id].status === "pending" && reqs[id].to === me.uid); }

  function syncLast() {
    const want = {};
    friendIds().forEach(id => { want["dm:" + id] = ["chats", id, "messages"]; });
    groups.forEach(g => { want["gr:" + g.id] = ["groups", g.id, "messages"]; });
    Object.keys(lastUnsubs).forEach(k => { if (!want[k]) { lastUnsubs[k](); delete lastUnsubs[k]; delete lastMsgs[k]; } });
    Object.keys(want).forEach(k => {
      if (lastUnsubs[k]) return;
      const q = query(collection(db, ...want[k]), orderBy("time", "desc"), limit(100));
      lastUnsubs[k] = onSnapshot(q, snap => {
        lastMsgs[k] = snap.docs.map(d => d.data());
        renderHub();
      }, () => {});
    });
  }

  function renderHub() {
    if (!me) return;
    hub.innerHTML = "";
    const head = mk("div", "chHead");
    head.appendChild(mk("h2", "", "💬 Chats"));
    hub.appendChild(head);

    const bar = mk("div", "chBtns");
    const rb = mk("button", "ghost", "📩 Requests");
    rb.type = "button";
    const n = incoming().length;
    if (n) rb.appendChild(mk("span", "chBadge", String(n)));
    rb.onclick = openRequests;
    const gb = mk("button", "green", "➕ New group");
    gb.type = "button";
    gb.onclick = openNewGroup;
    bar.appendChild(rb); bar.appendChild(gb);
    hub.appendChild(bar);

    // Jux row (like Meta AI inside chats)
    const jr = mk("div", "chRow");
    const ja = mk("div", "chAv", "✨");
    jr.appendChild(ja);
    const jm = mk("div", "chMid");
    jm.appendChild(mk("b", "", "Jux AI"));
    jm.appendChild(mk("span", "", "Ask me anything"));
    jr.appendChild(jm);
    jr.onclick = () => { const b = $("quickJux"); if (b) b.click(); };
    hub.appendChild(jr);

    const items = [];
    groups.forEach(g => {
      const arr = lastMsgs["gr:" + g.id] || [];
      const last = arr[0];
      items.push({ kind: "group", g: g, last: last, ms: last ? msOf(last) : ((g.time && g.time.seconds) ? g.time.seconds * 1000 : 0) });
    });
    friendIds().forEach(id => {
      const r = reqs[id];
      const ou = r.participants.find(x => x !== me.uid);
      const arr = lastMsgs["dm:" + id] || [];
      const last = arr[0];
      items.push({ kind: "dm", id: id, ou: ou, last: last, arr: arr, ms: last ? msOf(last) : 0 });
    });
    items.sort((a, b) => b.ms - a.ms);

    if (!items.length) {
      hub.appendChild(mk("div", "chEmpty", "No chats yet. Find people in Search, send a friend request, or tap New group."));
    }
    items.forEach(it => {
      const row = mk("div", "chRow");
      const mid = mk("div", "chMid");
      if (it.kind === "group") {
        row.appendChild(mkAv(null, "👥", false, false));
        row.firstChild.textContent = "👥";
        mid.appendChild(mk("b", "", it.g.name || "Group"));
        let sub = (it.g.members || []).length + " members";
        if (it.last) {
          const who = it.last.from === me.uid ? "You" : nameOf(it.last.from);
          let t = typeof it.last.text === "string" ? it.last.text : "";
          if (t.indexOf("[v]") === 0) t = "🎤 Voice note"; else if (t.indexOf("[s]") === 0) t = t.slice(3).split("|")[0];
          sub = who + ": " + t;
        }
        mid.appendChild(mk("span", "", sub));
        row.appendChild(mid);
        if (it.ms) row.appendChild(mk("div", "chTime", timeLabel(it.ms)));
        row.onclick = () => openChat({ kind: "group", id: it.g.id, title: it.g.name || "Group", g: it.g });
      } else {
        const p = pOf(it.ou);
        row.appendChild(mkAv(p, nameOf(it.ou), false, true));
        const s = it.arr ? streakOf(it.arr, me.uid, it.ou) : 0;
        mid.appendChild(mk("b", "", nameOf(it.ou) + (s >= 2 ? "  🔥" + s : "")));
        mid.appendChild(mk("span", "", it.last ? preview(it.last) : "Say hi 👋"));
        row.appendChild(mid);
        if (it.ms) row.appendChild(mk("div", "chTime", timeLabel(it.ms)));
        row.onclick = () => openChat({ kind: "dm", id: it.id, title: nameOf(it.ou), other: it.ou });
      }
      hub.appendChild(row);
    });
  }

  // ---------- requests ----------
  function openRequests() {
    const box = openSheet("📩 Friend requests");
    const ids = incoming();
    if (!ids.length) box.appendChild(mk("div", "chEmpty", "No new requests."));
    ids.forEach(id => {
      const r = reqs[id];
      const ou = r.participants.find(x => x !== me.uid);
      const p = pOf(ou);
      const row = mk("div", "rq");
      row.appendChild(mkAv(p, nameOf(ou), true, false));
      const mid = mk("div", "chMid");
      mid.appendChild(mk("b", "", nameOf(ou)));
      mid.appendChild(mk("span", "", "wants to be your friend"));
      row.appendChild(mid);
      const ok = mk("button", "green", "Accept"); ok.type = "button";
      ok.onclick = async () => { try { await updateDoc(doc(db, "requests", id), { status: "accepted" }); } catch (e) { alert("Could not accept. Try again."); } closeSheet(); };
      const no = mk("button", "ghost", "✕"); no.type = "button";
      no.onclick = async () => { try { await deleteDoc(doc(db, "requests", id)); } catch (e) {} closeSheet(); };
      row.appendChild(ok); row.appendChild(no);
      box.appendChild(row);
    });
    const c = mk("button", "opt", "Close"); c.type = "button"; c.onclick = closeSheet;
    box.appendChild(c);
  }

  // ---------- new group ----------
  function openNewGroup() {
    if (!myP) { alert("Save your name first (Me tab)."); return; }
    const box = openSheet("👥 New group");
    const nm = document.createElement("input"); nm.placeholder = "Group name"; nm.maxLength = 30;
    const se = document.createElement("input"); se.placeholder = "Search people";
    const gl = mk("div", "gl");
    box.appendChild(nm); box.appendChild(se); box.appendChild(gl);
    function draw() {
      const keep = new Set(Array.from(gl.querySelectorAll("input:checked")).map(i => i.value));
      const term = se.value.trim().toLowerCase();
      gl.innerHTML = "";
      players.filter(p => p.uid !== me.uid && (!term || String(p.gameName || "").toLowerCase().includes(term))).forEach(p => {
        const l = mk("label", "gp");
        const c = document.createElement("input"); c.type = "checkbox"; c.value = p.uid; c.checked = keep.has(p.uid);
        l.appendChild(c); l.appendChild(mk("span", "", p.gameName || "Player"));
        gl.appendChild(l);
      });
      if (!gl.children.length) gl.appendChild(mk("div", "chEmpty", "No people found."));
    }
    se.oninput = draw; draw();
    const go = mk("button", "green", "Create group"); go.type = "button";
    go.onclick = async () => {
      const name = nm.value.trim();
      const picked = Array.from(gl.querySelectorAll("input:checked")).map(i => i.value);
      if (!name) { alert("Type a group name."); return; }
      if (!picked.length) { alert("Choose at least one person."); return; }
      try {
        const members = [me.uid].concat(picked).slice(0, 30);
        const ref = await addDoc(collection(db, "groups"), { name: name, owner: me.uid, members: members, time: serverTimestamp() });
        closeSheet();
        openChat({ kind: "group", id: ref.id, title: name, g: { id: ref.id, name: name, owner: me.uid, members: members } });
      } catch (e) { alert("Could not create the group. Try again."); }
    };
    const ca = mk("button", "ghost", "Cancel"); ca.type = "button"; ca.onclick = closeSheet;
    box.appendChild(go); box.appendChild(ca);
  }

  // ---------- open chat ----------
  function openChat(ctx) {
    closeChat(true);
    cx = { kind: ctx.kind, id: ctx.id, title: ctx.title, other: ctx.other || null, g: ctx.g || null, msgs: [], cdata: {}, unsubs: [], lastMark: 0, first: true };
    const path = ctx.kind === "dm" ? ["chats", ctx.id, "messages"] : ["groups", ctx.id, "messages"];
    $("cxTitle").textContent = ctx.title;
    $("cxAv").innerHTML = "";
    if (ctx.kind === "dm") $("cxAv").appendChild(mkAv(pOf(ctx.other), ctx.title, true, true));
    else { const a = mk("div", "chAv sm", "👥"); $("cxAv").appendChild(a); }
    $("cxLog").innerHTML = "";
    cxEl.classList.remove("hidden");
    const q = query(collection(db, ...path), orderBy("time", "desc"), limit(150));
    cx.unsubs.push(onSnapshot(q, snap => {
      cx.msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
      drawChat();
    }, () => { $("cxLog").innerHTML = ""; $("cxLog").appendChild(mk("div", "cxNote", "Messages could not load.")); }));
    if (ctx.kind === "dm") {
      cx.unsubs.push(onSnapshot(doc(db, "chats", ctx.id), d => { cx.cdata = d.exists() ? d.data() : {}; drawChat(); }, () => {}));
    }
  }
  function closeChat(silent) {
    if (cx) { cx.unsubs.forEach(u => u()); cx = null; }
    cxEl.classList.add("hidden");
    if (!silent) renderHub();
  }
  function markRead() {
    if (!cx || cx.kind !== "dm" || !myP || myP.hideRead || document.hidden) return;
    if (Date.now() - cx.lastMark < 4000) return;
    cx.lastMark = Date.now();
    setDoc(doc(db, "chats", cx.id), { ["read_" + me.uid]: Date.now() }, { merge: true }).catch(() => {});
  }
  function drawChat() {
    if (!cx) return;
    const log = $("cxLog");
    const nearBottom = cx.first || (log.scrollHeight - log.scrollTop - log.clientHeight < 140);
    log.innerHTML = "";
    const dis = cx.kind === "dm" ? disOn(cx.id, cx.cdata) : false;
    const otherRead = cx.kind === "dm" ? (cx.cdata["read_" + cx.other] || 0) : 0;
    const otherP = cx.kind === "dm" ? pOf(cx.other) : null;
    const blueOk = !(myP && myP.hideRead) && !(otherP && otherP.hideRead);

    // subtitle: online state or streak or member count
    if (cx.kind === "dm") {
      const s = streakOf(cx.msgs.slice().reverse(), me.uid, cx.other);
      $("cxSub").textContent = (isOn(otherP) ? "🔵 Online" : "🔴 Offline") + (s >= 2 ? "  ·  🔥 " + s + " day streak" : "") + (dis ? "  ·  ⏱ 24h" : "");
    } else {
      $("cxSub").textContent = ((cx.g && cx.g.members) || []).length + " members";
    }

    let shown = 0, lastDay = "";
    cx.msgs.forEach(m => {
      const ms = msOf(m);
      if (dis && Date.now() - ms > 86400000) return;
      shown++;
      const dk = dayKey(ms);
      if (dk !== lastDay) { lastDay = dk; log.appendChild(mk("div", "cxNote", new Date(ms).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }))); }
      const mine = m.from === me.uid;
      const row = mk("div", "cxMsg" + (mine ? " mine" : ""));
      if (!mine && cx.kind === "group") row.appendChild(mkAv(pOf(m.from), nameOf(m.from) || m.name, true, false));
      const b = mk("div", "cxB");
      if (!mine && cx.kind === "group") b.appendChild(mk("div", "cxN", m.from === "bot" ? "🤖 Assistant" : (nameOf(m.from) !== "Player" ? nameOf(m.from) : (m.name || "Player"))));
      const t = typeof m.text === "string" ? m.text : "";
      if (t.indexOf("[v]") === 0) {
        const au = document.createElement("audio"); au.controls = true; au.preload = "metadata"; au.src = t.slice(3);
        b.appendChild(mk("div", "", "🎤 Voice note")); b.appendChild(au);
      } else if (t.indexOf("[s]") === 0) {
        const parts = t.slice(3).split("|");
        const st = mk("div", "", parts[0]); st.style.fontSize = "46px"; st.style.textAlign = "center";
        b.appendChild(st); if (parts[1]) b.appendChild(mk("div", "cxNote", parts[1]));
      } else b.appendChild(document.createTextNode(t));
      const meta = mk("div", "cxM", new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (mine && cx.kind === "dm") {
        const read = blueOk && m.time && m.time.seconds && ms <= otherRead;
        meta.appendChild(mk("span", "tick" + (read ? " blue" : ""), read ? "✓✓" : "✓"));
      }
      b.appendChild(meta);
      row.appendChild(b);
      log.appendChild(row);
    });
    if (!shown) log.appendChild(mk("div", "cxNote", cx.kind === "dm" ? "No messages yet. Say hi 👋" : "No messages yet. Start the group chat."));
    if (nearBottom) log.scrollTop = log.scrollHeight;
    cx.first = false;
    const lastM = cx.msgs[cx.msgs.length - 1];
    if (lastM && lastM.from !== me.uid) markRead();
  }

  // ---------- phone alerts for new messages (works when Jolt is closed) ----------
  const PUSH_URL = "https://winter-glitter-2dfe.saviatim3.workers.dev";
  async function pushMsg(text) {
    try {
      if (!cx || !me) return;
      const ids = cx.kind === "dm" ? [cx.other] : ((cx.g && cx.g.members) || []).filter(u => u !== me.uid);
      const toks = [];
      ids.forEach(u => { const p = pOf(u); ((p && p.fcmTokens) || []).forEach(t => { if (toks.indexOf(t) < 0) toks.push(t); }); });
      if (!toks.length) return;
      const idt = await auth.currentUser.getIdToken();
      const title = cx.kind === "dm" ? myName() : (cx.title || "Group");
      const body = (cx.kind === "dm" ? "" : myName() + ": ") + text.slice(0, 80);
      await fetch(PUSH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: idt, tokens: toks, title: title, body: "💬 " + body, url: "./" }) });
    } catch (e) {}
  }

  async function sendMsg() {
    const inp = $("cxInput");
    const text = inp.value.trim();
    if (!text || !cx || !me) return;
    inp.value = "";
    const path = cx.kind === "dm" ? ["chats", cx.id, "messages"] : ["groups", cx.id, "messages"];
    try {
      await addDoc(collection(db, ...path), { text: text, time: serverTimestamp(), from: me.uid, name: myName(), owner: false });
      pushMsg(text);
    } catch (e) { inp.value = text; alert("Message not sent. Check your internet and try again."); }
  }
  $("cxSend").onclick = sendMsg;
  $("cxInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); sendMsg(); } });
  $("cxBack").onclick = () => closeChat(false);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && cx && cx.msgs.length) { const l = cx.msgs[cx.msgs.length - 1]; if (l.from !== me.uid) markRead(); } });

  // ---------- chat options ----------
  $("cxMenu").onclick = () => {
    if (!cx) return;
    const box = openSheet(cx.title);
    const hide = !!(myP && myP.hideRead);
    const rr = mk("button", "opt", hide ? "👁 Read receipts: OFF (tap to turn on)" : "👁 Read receipts: ON (tap to turn off)"); rr.type = "button";
    rr.onclick = async () => {
      try { await updateDoc(doc(db, "players", me.uid), { hideRead: !hide }); } catch (e) { alert("Could not change this setting."); }
      closeSheet();
    };
    box.appendChild(rr);
    if (cx.kind === "dm") {
      const on = disOn(cx.id, cx.cdata);
      const d = mk("button", "opt", on ? "⏱ Disappearing messages: ON (tap to turn off)" : "⏱ Disappearing messages: OFF (tap to turn on)"); d.type = "button";
      d.onclick = async () => {
        const id = cx.id;
        try { localStorage.setItem(disKey(id), on ? "0" : "1"); } catch (e) {}
        try { await setDoc(doc(db, "chats", id), { disappear: !on }, { merge: true }); } catch (e) {}
        closeSheet(); drawChat();
      };
      box.appendChild(d);
    } else {
      const g = cx.g;
      const mine = g && g.owner === me.uid;
      const l = mk("button", "opt red", mine ? "🗑 Delete group for everyone" : "🚪 Leave group"); l.type = "button";
      l.onclick = async () => {
        if (!confirm(mine ? "Delete this group for everyone?" : "Leave this group?")) return;
        try {
          if (mine) await deleteDoc(doc(db, "groups", g.id));
          else await updateDoc(doc(db, "groups", g.id), { members: arrayRemove(me.uid) });
          closeSheet(); closeChat(false);
        } catch (e) { alert("Could not do that. Try again."); }
      };
      box.appendChild(l);
    }
    const c = mk("button", "opt", "Close"); c.type = "button"; c.onclick = closeSheet;
    box.appendChild(c);
  };

  // ---------- data ----------
  function stopAll() {
    unsubs.forEach(u => u()); unsubs = [];
    Object.keys(lastUnsubs).forEach(k => lastUnsubs[k]());
    lastUnsubs = {}; lastMsgs = {};
    if (cx) closeChat(true);
    players = []; reqs = {}; groups = []; myP = null; me = null;
    hub.innerHTML = "";
  }
  onAuthStateChanged(auth, user => {
    stopAll();
    if (!user) return;
    me = user;
    unsubs.push(onSnapshot(collection(db, "players"), snap => {
      players = snap.docs.map(d => d.data());
      myP = players.find(p => p.uid === user.uid) || null;
      renderHub();
      if (cx) drawChat();
    }, () => {}));
    unsubs.push(onSnapshot(query(collection(db, "requests"), where("participants", "array-contains", user.uid)), snap => {
      reqs = {};
      snap.forEach(d => { reqs[d.id] = d.data(); });
      syncLast(); renderHub();
    }, () => {}));
    unsubs.push(onSnapshot(query(collection(db, "groups"), where("members", "array-contains", user.uid)), snap => {
      groups = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      syncLast(); renderHub();
    }, () => {}));
    // keep online dots fresh
    unsubs.push((function () { const t = setInterval(() => { renderHub(); if (cx) drawChat(); }, 60000); return () => clearInterval(t); })());
  });
})();
