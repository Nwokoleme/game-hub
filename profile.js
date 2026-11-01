// Jolt - FILE 2: For You page, new posts, comments, profile pages.
// Plugs into index.html with ONE line at the bottom:
// <script type="module" src="profile.js?v=1"></script>
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, updateDoc, addDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, increment, deleteField } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const OWNER_EMAIL = "saviatim3@gmail.com";
const $ = id => document.getElementById(id);
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const MUSIC = [["music1.mp3", "Sad Mood"], ["music2.mp3", "Lofi House"], ["music3.mp3", "Coffee Shop Lofi"], ["music4.mp3", "Hype Trap Beat"], ["music5.mp3", "Hip Hop Beat"], ["music6.mp3", "Future Bass"], ["music7.mp3", "Phonk"]];
const CATS = { gaming: "🎮 Gaming", lifestyle: "🌍 Lifestyle", fun: "😂 Fun" };
const COLORS = ["#1d9bf0", "#a855f7", "#ec4899", "#ef4444", "#f59e0b", "#10b981", "#14b8a6", "#111827"];
const REACTS = ["😂", "🔥", "😮", "😢", "👏"];
const svg = d => '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>";
const ICON_HEART = svg('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>');
const ICON_SEND = svg('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>');
const ICON_CMT = svg('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.6-.8L3 21l1.9-5.3A8.4 8.4 0 1 1 21 11.5z"/>');

let me = null, players = [], posts = [], reqs = [], ownerUid = "";
let unsubs = [], feedCat = "all", tm = null, feedN = 10;
let muted = false;
try { muted = localStorage.getItem("jmute") === "1"; } catch (e) {}

// ---------- small helpers ----------
const isOwner = () => !!(me && me.email && me.email.toLowerCase() === OWNER_EMAIL);
const myProf = () => players.find(p => me && p.uid === me.uid);
const myName = () => { const p = myProf(); return p ? p.gameName : (isOwner() ? "Jeffrey Nwokoleme" : "Player"); };
const followingOf = p => (p && p.following) || [];
// ---- privacy: who may see whose posts ----
const friendSet = () => { const s = new Set(); if (!me) return s; reqs.forEach(r => { if (r.status === "accepted") { const o = (r.participants || []).find(u => u !== me.uid); if (o) s.add(o); } }); return s; };
function postsHidden(uid) {
  if (!me || uid === me.uid || uid === ownerUid || isOwner()) return false;
  const p = players.find(x => x.uid === uid);
  return !!(p && p.privPrivate && !friendSet().has(uid));
}
const isOnline = p => !!(p && p.lastSeen && !p.privHideOnline && Date.now() - p.lastSeen < 150000);
const imgsOf = p => (p.imgs && p.imgs.length) ? p.imgs : (p.img && String(p.img).startsWith("data:image/") ? [p.img] : []);
const msOf = p => (p.time && p.time.toMillis) ? p.time.toMillis() : 0;
const timeText = p => { try { return p.time ? p.time.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "just now"; } catch (e) { return ""; } };
const dateTimeText = p => { try { return p.time ? p.time.toDate().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "just now"; } catch (e) { return ""; } };
function schedule() { clearTimeout(tm); tm = setTimeout(renderAll, 120); }
function toast(t) {
  let el = $("jToast");
  if (!el) { el = mk("div"); el.id = "jToast"; document.body.appendChild(el); }
  el.textContent = t; el.classList.add("on");
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 2600);
}
function gradFor(uid) {
  let h = 0; const t = String(uid || "x");
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360;
  return "linear-gradient(135deg,hsl(" + h + ",70%,36%),hsl(" + ((h + 70) % 360) + ",75%,30%) 55%,hsl(" + ((h + 150) % 360) + ",70%,26%))";
}
function avEl(uid, name, big) {
  const a = mk("div", "av" + (big ? " big profAv" : ""), (name || "?").charAt(0).toUpperCase());
  const p = players.find(x => x.uid === uid);
  if (p && p.photo) { a.textContent = ""; a.style.backgroundImage = "url(" + p.photo + ")"; a.style.backgroundSize = "cover"; a.style.backgroundPosition = "center"; }
  if (isOnline(p)) a.appendChild(mk("span", "dot"));
  return a;
}
function nameEl(name, uid) {
  const b = mk("b", "", name || "Player");
  if (uid && uid === ownerUid) b.appendChild(mk("span", "badge", "👑 OWNER"));
  return b;
}
// phone buzz (works when Jolt is closed), same push worker the chat uses
const PUSH_URL = "https://winter-glitter-2dfe.saviatim3.workers.dev";
async function pushTo(uid, body) {
  try {
    const pl = players.find(x => x.uid === uid);
    const toks = (pl && pl.fcmTokens) || [];
    if (!toks.length || !me) return;
    const idt = await me.getIdToken();
    await fetch(PUSH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: idt, tokens: toks, title: "Jolt", body: body, url: "./" }) });
  } catch (e) {}
}
async function notify(to, type, postId, text) {
  try {
    if (!to || !me || to === me.uid) return;
    await addDoc(collection(db, "notifs"), { to: to, from: me.uid, fromName: myName(), type: type, postId: postId || "", text: text || "", time: serverTimestamp(), read: false });
    const who = myName();
    pushTo(to, type === "like" ? "❤️ " + who + " liked your post" : type === "fire" ? "🔥 " + who + " fired up your post" : "💬 " + who + " commented: " + (text || ""));
  } catch (e) {}
}
// shrink a picture so many fit in one post
function shrink(img, maxDim, target) {
  let q = 0.8, md = maxDim, out = "";
  for (let i = 0; i < 8; i++) {
    const s = Math.min(1, md / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, c.width, c.height);
    out = c.toDataURL("image/jpeg", q);
    if (out.length <= target) return out;
    if (q > 0.55) q -= 0.1; else md = Math.round(md * 0.85);
  }
  return out;
}
function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
function readFile(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }

// ---------- styles ----------
const css = document.createElement("style");
css.textContent = `
.jflash{outline:2px solid #1d9bf0;outline-offset:2px;border-radius:12px}
#jToast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%) translateY(20px);background:#222;color:#fff;padding:10px 16px;border-radius:20px;font-size:14px;opacity:0;pointer-events:none;transition:.25s;z-index:99999;max-width:86%;text-align:center}
#jToast.on{opacity:1;transform:translateX(-50%) translateY(0)}
.jcat{display:flex;gap:8px;overflow-x:auto;padding:4px 0 10px}
.jcat button{width:auto;margin:0;padding:7px 14px;border-radius:18px;background:var(--card);border:1px solid var(--line);color:var(--tx);font-size:14px;white-space:nowrap}
.jcat button.on{background:var(--btn,#15803d);color:#fff;border-color:transparent}
.jcar{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:14px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.jcar::-webkit-scrollbar{display:none}
.jcar img{flex:0 0 100%;width:100%;max-height:560px;object-fit:cover;scroll-snap-align:center;display:block;border:none!important;border-radius:0!important;margin:0!important}
.jdots{display:flex;justify-content:center;gap:5px;padding:6px 0 0}
.jdots i{width:6px;height:6px;border-radius:50%;background:var(--line)}
.jdots i.on{background:var(--ac,#4ade80)}
.jsave,.jvol{position:absolute;top:10px;width:38px!important;height:38px;margin:0!important;padding:0!important;border-radius:50%!important;background:rgba(0,0,0,.55)!important;color:#fff!important;border:none!important;font-size:18px;display:flex;align-items:center;justify-content:center;z-index:3}
.jsave{right:10px}.jvol{left:10px}
.jtime{font-size:11px;color:var(--mut);text-align:center;padding:4px 0;display:none}
.jtime.on{display:block}
.jdate{font-size:12px;color:var(--mut);padding:0 4px 6px}
.jpin{font-size:12px;color:#f4b400;padding:0 4px 4px}
.jsong{font-size:13px;color:var(--mut);padding:6px 4px 0}
.jbox textarea{width:100%;min-height:80px}
.jthumbs{display:flex;gap:8px;overflow-x:auto;padding:8px 0}
.jthumbs div{position:relative;flex:0 0 78px;height:78px}
.jthumbs img{width:78px;height:78px;object-fit:cover;border-radius:10px}
.jthumbs b{position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:#f4212e;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center}
.jcolors{display:flex;gap:10px;padding:8px 0}
.jcolors span{width:30px;height:30px;border-radius:50%;border:3px solid transparent}
.jcolors span.on{border-color:var(--tx)}
.jprev{border-radius:16px;padding:26px 18px;min-height:110px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:19px;text-align:center;white-space:pre-wrap;word-wrap:break-word;margin:6px 0}
.jrow{display:flex;gap:8px;align-items:center;margin:6px 0}
.jrow select{flex:1;margin:0}
.jrow button{width:auto;margin:0}
#jMe .profCover,#jUser .profCover{background-size:cover!important;background-position:center!important}
.jgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
.jt{position:relative;aspect-ratio:3/4;overflow:hidden;border-radius:6px;background:var(--card)}
.jt img{width:100%;height:100%;object-fit:cover;display:block;margin:0!important;border:none!important;border-radius:0!important;max-height:none!important}
.jt.tx{display:flex;align-items:center;justify-content:center;padding:8px;color:#fff;font-weight:700;font-size:13px;text-align:center;word-break:break-word}
.jt i{position:absolute;left:6px;bottom:5px;font-style:normal;font-size:12px;color:#fff;text-shadow:0 1px 4px #000}
.jt em{position:absolute;right:6px;top:5px;font-style:normal;font-size:14px;text-shadow:0 1px 4px #000}
#jcm{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:flex-end}
#jcm.hidden{display:none}
#jcm .jsh{background:var(--bg);width:100%;max-height:82vh;border-radius:20px 20px 0 0;display:flex;flex-direction:column}
#jcm .jhd{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}
#jcm .jhd button{width:auto;margin:0;background:none;border:none;color:var(--tx);font-size:20px}
#jcmList{overflow-y:auto;padding:8px 14px;flex:1;min-height:120px}
.jc{display:flex;gap:10px;padding:8px 0}
.jc.rp{margin-left:42px}
.jc .av{width:34px;height:34px;flex:0 0 34px;font-size:14px}
.jc .jb{flex:1;min-width:0}
.jc .jb p{margin:2px 0;font-size:15px;word-wrap:break-word;white-space:pre-wrap}
.jc .jm{display:flex;gap:14px;font-size:13px;color:var(--mut);align-items:center;flex-wrap:wrap}
.jc .jm span{cursor:pointer}
.jc .jl{display:flex;flex-direction:column;align-items:center;font-size:12px;color:var(--mut);cursor:pointer;min-width:30px}
.jc .jl.on{color:#f4212e}
.jpick{display:flex;gap:10px;padding:4px 0;font-size:22px}
.jrc{font-size:13px;padding:2px 0}
#jcmBar{border-top:1px solid var(--line);padding:8px 12px}
#jcmRep{font-size:13px;color:var(--mut);padding:0 2px 6px}
#jcmBar .jf{display:flex;gap:8px}
#jcmBar input{flex:1;margin:0}
#jcmBar button.send{width:auto;margin:0}
`;
css.textContent += `
html,body,body *:not(input):not(textarea){-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-tap-highlight-color:transparent}
input,textarea,[contenteditable="true"]{-webkit-user-select:text!important;user-select:text!important}
img{-webkit-user-drag:none;-webkit-touch-callout:none}
`;
document.head.appendChild(css);
// no copy / search menu when you press and hold (typing boxes still work)
document.addEventListener("contextmenu", e => { if (!(e.target.closest && e.target.closest("input,textarea"))) e.preventDefault(); });
document.addEventListener("selectstart", e => { if (!(e.target.closest && e.target.closest("input,textarea"))) e.preventDefault(); });

// ---------- music (auto play on a post) ----------
let cur = null; // { id, audio }
let retryId = "";
function stopMusic() { if (cur) { try { cur.audio.pause(); } catch (e) {} cur = null; } syncVol(); }
function syncVol() {
  document.querySelectorAll(".jvol").forEach(b => { b.textContent = muted ? "🔇" : "🔊"; });
}
function startMusic(id, file) {
  if (cur && cur.id === id && !cur.audio.paused) { syncVol(); return; }
  stopMusic();
  const a = new Audio(file); a.loop = true; a.muted = muted;
  cur = { id: id, audio: a };
  a.play().then(() => { retryId = ""; }).catch(() => { retryId = id; });
  syncVol();
}
document.addEventListener("pointerdown", () => {
  if (retryId && cur && cur.id === retryId) { cur.audio.play().then(() => { retryId = ""; }).catch(() => {}); }
}, true);
const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    const el = en.target, id = el.dataset.mid, file = el.dataset.mfile;
    if (en.isIntersecting && en.intersectionRatio >= 0.6) startMusic(id, file);
    else if (cur && cur.id === id && document.body.contains(el)) stopMusic();
  });
}, { threshold: [0, 0.6] });
function toggleMute() {
  muted = !muted;
  try { localStorage.setItem("jmute", muted ? "1" : "0"); } catch (e) {}
  if (cur) cur.audio.muted = muted;
  syncVol();
}
function checkCur() { if (cur && !document.querySelector('[data-mid="' + cur.id + '"]')) stopMusic(); }

// ---------- post card ----------
async function react(p, field, on) {
  try {
    await updateDoc(doc(db, "posts", p.id), { [field]: on ? arrayRemove(me.uid) : arrayUnion(me.uid) });
    if (!on) notify(p.uid, field === "likes" ? "like" : "fire", p.id, "");
  } catch (e) { toast("Could not do that."); }
}
async function delPost(p) {
  if (!confirm("Delete this post?")) return;
  try { await deleteDoc(doc(db, "posts", p.id)); } catch (e) { toast("Could not delete."); }
}
async function reportPost(p) {
  const reason = prompt("Why are you reporting this? Write a short reason.");
  if (reason === null) return;
  try {
    await addDoc(collection(db, "reports"), { by: me.uid, byName: myName(), reason: reason.trim().slice(0, 120), time: serverTimestamp(), targetUid: p.uid, targetName: p.name || "Player", postId: p.id, snippet: (p.text || "[photo]").slice(0, 120) });
    alert("Thank you. The Owner will check it.");
  } catch (e) { toast("Could not send report."); }
}
async function togglePin(p) {
  const mp = myProf(); if (!mp) return;
  const list = (mp.pins || []).slice();
  const i = list.indexOf(p.id);
  if (i >= 0) list.splice(i, 1);
  else { if (list.length >= 3) { alert("You can pin 3 posts only. Unpin one first."); return; } list.push(p.id); }
  try { await updateDoc(doc(db, "players", me.uid), { pins: list }); toast(i >= 0 ? "Unpinned" : "Pinned 📌"); } catch (e) { toast("Could not pin."); }
}
function saveImage(src) {
  const a = document.createElement("a");
  a.href = src; a.download = "jolt-" + Date.now() + ".jpg";
  document.body.appendChild(a); a.click(); a.remove();
  toast("Picture saved");
}
function postCard(p, opt) {
  opt = opt || {};
  const mine = p.uid === me.uid;
  const likes = p.likes || [], fires = p.fires || [];
  const l = likes.includes(me.uid), f = fires.includes(me.uid);
  const c = mk("div", "post");
  c.dataset.pid = p.id;
  const mp = myProf();
  const pinned = mp && (mp.pins || []).includes(p.id);

  const head = mk("div", "row link phead");
  head.appendChild(avEl(p.uid, p.name));
  const info = mk("div", "info");
  info.appendChild(nameEl(p.name, p.uid));
  info.appendChild(mk("span", "mut", CATS[p.category] || CATS.gaming));
  head.appendChild(info);
  if (!opt.profile) head.onclick = () => openUser(p.uid);
  const canDel = mine || isOwner(), canRep = !mine;
  const more = mk("button", "dots", "⋯"); more.type = "button";
  const menu = mk("div", "pmenu hidden");
  const addItem = (txt, cls, fn) => { const d = mk("div", cls, txt); d.onclick = e => { e.stopPropagation(); menu.classList.add("hidden"); fn(); }; menu.appendChild(d); };
  if (mine) addItem(pinned ? "📌 Unpin" : "📌 Pin to my page", "", () => togglePin(p));
  if (canRep) addItem("🚩 Report", "", () => reportPost(p));
  if (canDel) addItem("🗑 Delete", "red", () => delPost(p));
  more.onclick = e => { e.stopPropagation(); menu.classList.toggle("hidden"); };
  head.appendChild(more); head.appendChild(menu);
  c.appendChild(head);
  if (opt.profile && pinned) c.appendChild(mk("div", "jpin", "📌 Pinned"));
  if (opt.profile && mine) c.appendChild(mk("div", "jdate", "Posted " + dateTimeText(p)));

  const imgs = imgsOf(p);
  const hasVid = !!(p.video && String(p.video).indexOf("data:video/") === 0);
  const body = mk("div", "pbody");
  body.style.position = "relative";
  let carEl = null;
  if (hasVid) {
    const vw = mk("div", "jvid");
    const v = document.createElement("video");
    v.src = p.video; v.controls = true; v.playsInline = true; v.loop = true; v.preload = "metadata";
    if (p.vthumb) v.poster = p.vthumb;
    v.onplay = () => { document.querySelectorAll(".jvid video").forEach(o => { if (o !== v) o.pause(); }); };
    vw.appendChild(v); body.appendChild(vw);
  } else if (imgs.length) {
    const car = mk("div", "jcar"); carEl = car;
    imgs.forEach(s => { const im = mk("img"); im.src = s; im.draggable = false; im.loading = "lazy"; im.decoding = "async"; car.appendChild(im); });
    body.appendChild(car);
    const sv = mk("button", "jsave", "⬇"); sv.type = "button"; sv.title = "Save picture";
    sv.onclick = e => { e.stopPropagation(); const i = Math.round(car.scrollLeft / Math.max(1, car.clientWidth)); saveImage(imgs[Math.min(i, imgs.length - 1)]); };
    body.appendChild(sv);
  } else if (p.text) {
    body.classList.add("textOnly");
    if (p.bg) body.style.background = p.bg;
    body.appendChild(mk("p", "bigText", p.text));
  }
  const pop = mk("div", "heartPop", "❤️"); body.appendChild(pop);
  const tt = mk("div", "jtime", "🕒 " + timeText(p));
  let lastTap = 0, tapT = null;
  body.addEventListener("pointerup", e => {
    if (e.target.closest && e.target.closest("button")) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      lastTap = 0; clearTimeout(tapT);
      pop.classList.remove("go"); void pop.offsetWidth; pop.classList.add("go");
      if (!l) react(p, "likes", false);
    } else {
      lastTap = now;
      tapT = setTimeout(() => tt.classList.toggle("on"), 300);
    }
  });
  c.appendChild(body);
  if (imgs.length > 1) {
    const dots = mk("div", "jdots");
    imgs.forEach((_, i) => dots.appendChild(mk("i", i === 0 ? "on" : "")));
    carEl.addEventListener("scroll", () => {
      const i = Math.round(carEl.scrollLeft / Math.max(1, carEl.clientWidth));
      [...dots.children].forEach((d, k) => d.classList.toggle("on", k === i));
    });
    c.appendChild(dots);
  }
  c.appendChild(tt);

  const song = p.music && MUSIC.find(m => m[0] === p.music);
  if (song) {
    c.dataset.mid = p.id + (opt.profile ? "-p" : ""); c.dataset.mfile = song[0];
    c.appendChild(mk("div", "jsong", "🎵 " + song[1]));
    const vb = mk("button", "jvol", muted ? "🔇" : "🔊"); vb.type = "button"; vb.title = "Sound on/off";
    vb.onclick = e => { e.stopPropagation(); toggleMute(); };
    body.appendChild(vb);
    io.observe(c);
  }

  const acts = mk("div", "acts");
  const hb = mk("button", "ibtn" + (l ? " liked" : "")); hb.type = "button"; hb.innerHTML = ICON_HEART; hb.onclick = e => { e.stopPropagation(); react(p, "likes", l); };
  const cb = mk("button", "ibtn"); cb.type = "button"; cb.innerHTML = ICON_CMT; cb.onclick = e => { e.stopPropagation(); openComments(p); };
  const fb = mk("button", "ibtn fireBtn" + (f ? " on" : ""), "🔥"); fb.type = "button"; fb.onclick = e => { e.stopPropagation(); react(p, "fires", f); };
  const sb = mk("button", "ibtn"); sb.type = "button"; sb.title = "Send to a friend"; sb.innerHTML = ICON_SEND;
  sb.onclick = e => { e.stopPropagation(); if (window.joltSharePost) window.joltSharePost({ id: p.id, uid: p.uid, name: p.name, text: p.text || (hasVid ? "🎬 Video" : ""), img: imgs[0] || p.vthumb || "" }); else toast("Chat is still loading. Try again in a moment."); };
  acts.appendChild(hb); acts.appendChild(cb); acts.appendChild(fb); acts.appendChild(sb);
  c.appendChild(acts);
  if (likes.length || fires.length) {
    const parts = [];
    if (likes.length) parts.push(likes.length + (likes.length === 1 ? " like" : " likes"));
    if (fires.length) parts.push("🔥 " + fires.length);
    c.appendChild(mk("div", "counts", parts.join("  ·  ")));
  }
  if (p.text && (imgs.length || hasVid)) {
    const cap = mk("div", "caption"); cap.appendChild(mk("b", "", (p.name || "Player") + " ")); cap.appendChild(document.createTextNode(p.text)); c.appendChild(cap);
  }
  const cc = p.commentCount || 0;
  const vc = mk("div", "viewCmts", cc ? "View all " + cc + (cc === 1 ? " comment" : " comments") : "Add a comment...");
  vc.onclick = () => openComments(p);
  c.appendChild(vc);
  return c;
}
document.addEventListener("click", () => document.querySelectorAll(".pmenu").forEach(m => m.classList.add("hidden")));

// ---------- "New posts" button: new posts wait while you scroll, tap to see them ----------
let knownIds = new Set(), heldIds = new Set(), firstPosts = true;
function feedOk(p) { return p.uid !== me.uid && !postsHidden(p.uid) && (circle().has(p.uid) || p.uid === ownerUid); }
function updateNewBtn() {
  const b = $("jNew"); if (!b || !me) return;
  const ok = circle();
  const n = posts.filter(p => heldIds.has(p.id) && p.uid !== me.uid && !postsHidden(p.uid) && (ok.has(p.uid) || p.uid === ownerUid)).length;
  b.classList.toggle("on", n > 0);
  b.textContent = "⬆ " + n + (n === 1 ? " new post" : " new posts");
}
function releaseNew() {
  if (!heldIds.size) return;
  heldIds.clear(); renderFYP(); updateNewBtn();
}
function trackNew() {
  if (!me) return;
  const home = $("tab-home") && !$("tab-home").classList.contains("hidden");
  const scrolled = (window.scrollY || 0) > 300;
  posts.forEach(p => {
    if (knownIds.has(p.id)) return;
    knownIds.add(p.id);
    if (!firstPosts && home && scrolled && p.uid !== me.uid) heldIds.add(p.id);
  });
  firstPosts = false;
  updateNewBtn();
}
function buildNewBtn() {
  const st = document.createElement("style");
  st.textContent = "#jNew{position:fixed;top:76px;left:50%;transform:translateX(-50%);z-index:40;display:none;width:auto;margin:0;padding:9px 18px;border-radius:22px;border:none;background:#00ba7c;color:#fff;font-weight:700;font-size:14px;box-shadow:0 6px 20px rgba(0,0,0,.45)}#jNew.on{display:block}";
  document.head.appendChild(st);
  const b = mk("button", "", ""); b.id = "jNew"; b.type = "button";
  b.onclick = () => { heldIds.clear(); renderFYP(); updateNewBtn(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  ($("tab-home") || document.body).appendChild(b);
  window.addEventListener("scroll", () => { if ((window.scrollY || 0) < 80) releaseNew(); }, { passive: true });
}

// ---------- For You (friends and friends of friends, no date, no own posts) ----------
function circle() {
  const out = new Set();
  if (!me) return out;
  const fol = {};
  players.forEach(x => followingOf(x).forEach(v => { (fol[v] = fol[v] || []).push(x.uid); }));
  const l1 = new Set(followingOf(myProf()));
  (fol[me.uid] || []).forEach(u => l1.add(u));
  reqs.forEach(r => { if (r.status === "accepted") { const o = (r.participants || []).find(u => u !== me.uid); if (o) l1.add(o); } });
  l1.delete(me.uid);
  l1.forEach(u => out.add(u));
  l1.forEach(u => {
    if (u === ownerUid) return; // everyone follows the owner, so do not grow the circle through him
    const p = players.find(x => x.uid === u);
    followingOf(p).forEach(v => out.add(v));
    (fol[u] || []).forEach(v => out.add(v));
  });
  out.delete(me.uid);
  return out;
}
function renderFYP() {
  const box = $("jfyp"); if (!box || !me) return;
  box.innerHTML = "";
  const bar = mk("div", "jcat");
  [["all", "🌐 All"], ["gaming", CATS.gaming], ["lifestyle", CATS.lifestyle], ["fun", CATS.fun]].forEach(o => {
    const b = mk("button", feedCat === o[0] ? "on" : "", o[1]); b.type = "button";
    b.onclick = () => { feedCat = o[0]; renderFYP(); };
    bar.appendChild(b);
  });
  box.appendChild(bar);
  const ok = circle();
  const list = posts.filter(p => p.uid !== me.uid && !heldIds.has(p.id) && !postsHidden(p.uid) && (ok.has(p.uid) || p.uid === ownerUid) && (feedCat === "all" || (p.category || "gaming") === feedCat));
  if (!list.length) { box.appendChild(mk("div", "card mut", "Nothing here yet. Follow people, or search a name and add friends, to fill your For You page.")); checkCur(); return; }
  const shownList = list.slice(0, feedN);
  shownList.forEach(p => box.appendChild(postCard(p)));
  if (list.length > shownList.length) { const mb = mk("button", "ghost", "Show more posts"); mb.type = "button"; mb.onclick = () => { feedN += 10; renderFYP(); }; box.appendChild(mb); }
  checkCur();
}

// ---------- comments (like, react, reply) ----------
let cmUnsub = null, cmPost = null, cmReply = null;
function buildCommentSheet() {
  const s = mk("div", "hidden"); s.id = "jcm";
  s.innerHTML = '<div class="jsh"><div class="jhd"><b>💬 Comments</b><button type="button" id="jcmX">✕</button></div><div id="jcmList"></div><div id="jcmBar"><div id="jcmRep" class="hidden"></div><div class="jf"><input id="jcmInp" maxlength="300" placeholder="Write a comment"><button class="send green" type="button" id="jcmSend">Send</button></div></div></div>';
  document.body.appendChild(s);
  s.onclick = e => { if (e.target === s) closeComments(); };
  $("jcmX").onclick = closeComments;
  $("jcmSend").onclick = sendComment;
  $("jcmInp").addEventListener("keydown", e => { if (e.key === "Enter") sendComment(); });
}
function closeComments() { if (cmUnsub) { cmUnsub(); cmUnsub = null; } cmPost = null; cmReply = null; $("jcm").classList.add("hidden"); }
function openComments(p) {
  closeComments();
  cmPost = p; cmReply = null;
  $("jcm").classList.remove("hidden");
  $("jcmRep").classList.add("hidden");
  const list = $("jcmList"); list.innerHTML = ""; list.appendChild(mk("div", "mut", "Loading..."));
  cmUnsub = onSnapshot(query(collection(db, "posts", p.id, "comments"), orderBy("time"), limit(200)), snap => {
    renderComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, () => { list.innerHTML = ""; list.appendChild(mk("div", "mut", "Comments could not load.")); });
}
function setReply(c) {
  cmReply = c ? { id: c.replyTo || c.id, name: c.name || "Player" } : null;
  const r = $("jcmRep");
  if (cmReply) { r.textContent = "↩ Replying to " + cmReply.name + "  (tap to cancel)"; r.classList.remove("hidden"); r.onclick = () => setReply(null); $("jcmInp").focus(); }
  else r.classList.add("hidden");
}
function commentRow(c, isReply) {
  const row = mk("div", "jc" + (isReply ? " rp" : ""));
  row.appendChild(avEl(c.uid, c.name));
  const b = mk("div", "jb");
  const n = mk("b", "", c.name || "Player"); if (c.uid === ownerUid) n.appendChild(mk("span", "badge", "👑"));
  b.appendChild(n);
  const t = mk("p"); if (isReply && c.replyName) t.appendChild(mk("span", "mut", "@" + c.replyName + " ")); t.appendChild(document.createTextNode(c.text || "")); b.appendChild(t);
  const rc = {}; Object.values(c.reacts || {}).forEach(e => { rc[e] = (rc[e] || 0) + 1; });
  const rs = Object.keys(rc).map(e => e + rc[e]).join("  ");
  if (rs) b.appendChild(mk("div", "jrc", rs));
  const m = mk("div", "jm");
  const rep = mk("span", "", "Reply"); rep.onclick = () => setReply(c); m.appendChild(rep);
  const rb = mk("span", "", "😊 React");
  rb.onclick = () => {
    const old = b.querySelector(".jpick"); if (old) { old.remove(); return; }
    const pk = mk("div", "jpick");
    REACTS.forEach(e => { const s = mk("span", "", e); s.onclick = () => reactComment(c, e); pk.appendChild(s); });
    b.appendChild(pk);
  };
  m.appendChild(rb);
  if (c.uid === me.uid || isOwner()) { const d = mk("span", "", "🗑"); d.onclick = () => delComment(c); m.appendChild(d); }
  b.appendChild(m);
  row.appendChild(b);
  const lk = (c.likes || []).includes(me.uid);
  const l = mk("div", "jl" + (lk ? " on" : "")); l.appendChild(mk("span", "", lk ? "❤️" : "🤍")); l.appendChild(mk("span", "", String((c.likes || []).length || "")));
  l.onclick = () => likeComment(c, lk);
  row.appendChild(l);
  return row;
}
function renderComments(arr) {
  const list = $("jcmList"); list.innerHTML = "";
  if (!arr.length) { list.appendChild(mk("div", "mut", "No comments yet. Say something!")); return; }
  const tops = arr.filter(c => !c.replyTo);
  tops.forEach(c => {
    list.appendChild(commentRow(c, false));
    arr.filter(r => r.replyTo === c.id).forEach(r => list.appendChild(commentRow(r, true)));
  });
  arr.filter(r => r.replyTo && !tops.find(t => t.id === r.replyTo)).forEach(r => list.appendChild(commentRow(r, true)));
}
async function sendComment() {
  const inp = $("jcmInp"), text = inp.value.trim();
  if (!text || !cmPost) return;
  if (!myProf() && !isOwner()) { toast("Save your profile first."); return; }
  const p = cmPost, rep = cmReply;
  inp.value = ""; setReply(null);
  try {
    const data = { uid: me.uid, name: myName(), text: text, time: serverTimestamp(), likes: [] };
    if (rep) { data.replyTo = rep.id; data.replyName = rep.name; }
    await addDoc(collection(db, "posts", p.id, "comments"), data);
    try { await updateDoc(doc(db, "posts", p.id), { commentCount: increment(1) }); } catch (e) {}
    notify(p.uid, "comment", p.id, text.slice(0, 60));
  } catch (e) { toast("Could not send comment."); }
}
async function likeComment(c, on) {
  try {
    await updateDoc(doc(db, "posts", cmPost.id, "comments", c.id), { likes: on ? arrayRemove(me.uid) : arrayUnion(me.uid) });
  } catch (e) { toast("Could not like. Ask Claude for the comments rule."); }
}
async function reactComment(c, emoji) {
  try {
    const same = c.reacts && c.reacts[me.uid] === emoji;
    await updateDoc(doc(db, "posts", cmPost.id, "comments", c.id), { ["reacts." + me.uid]: same ? deleteField() : emoji });
  } catch (e) { toast("Could not react. Ask Claude for the comments rule."); }
}
async function delComment(c) {
  if (!confirm("Delete this comment?")) return;
  try {
    await deleteDoc(doc(db, "posts", cmPost.id, "comments", c.id));
    try { await updateDoc(doc(db, "posts", cmPost.id), { commentCount: increment(-1) }); } catch (e) {}
  } catch (e) { toast("Could not delete."); }
}

// ---------- new post box (lives on your own page) ----------
let cImgs = [], cBg = COLORS[0], pvAudio = null, cVideo = null, vidBusy = false;
function stopPreview() { if (pvAudio) { pvAudio.pause(); pvAudio = null; } const b = $("jListen"); if (b) b.textContent = "▶ Listen"; }
function buildComposer() {
  const card = mk("div", "card jbox"); card.id = "jComposer";
  card.innerHTML = '<h2>✍️ New post</h2><textarea id="jText" maxlength="300" placeholder="What is on your mind? 🔥"></textarea>'
    + '<div id="jColors" class="jcolors"></div><div id="jPrev" class="jprev"></div><div id="jThumbs" class="jthumbs"></div>'
    + '<input id="jFiles" type="file" accept="image/*" multiple class="hidden">'
    + '<div class="jrow"><button id="jAdd" class="ghost" type="button">📷 Add pictures</button><button id="jCam" class="ghost" type="button">🤳 Take photo</button></div>'
    + '<div class="jrow"><button id="jVid" class="ghost" type="button">🎬 Add video (12s)</button><button id="jRec" class="ghost" type="button">🎥 Record video</button></div>'
    + '<input id="jVidFile" type="file" accept="video/*" class="hidden"><input id="jRecFile" type="file" accept="video/*" capture="environment" class="hidden"><div id="jVidPrev"></div>'
    + '<div class="jrow"><select id="jMusic"></select><button id="jListen" class="ghost" type="button">▶ Listen</button></div>'
    + '<div class="jrow"><select id="jCat"><option value="gaming">🎮 Gaming</option><option value="lifestyle">🌍 Lifestyle</option><option value="fun">😂 Fun</option></select></div>'
    + '<button id="jPost" class="green" type="button">Post</button><div id="jMsg" class="mut"></div>';
  const meProfile = $("meProfile");
  meProfile.parentNode.insertBefore(card, meProfile.nextSibling);
  const sel = $("jMusic");
  sel.appendChild(new Option("🎵 No music", ""));
  MUSIC.forEach(m => sel.appendChild(new Option("🎵 " + m[1], m[0])));
  sel.onchange = stopPreview;
  $("jListen").onclick = () => {
    if (pvAudio) { stopPreview(); return; }
    if (!sel.value) { $("jMsg").textContent = "Pick a song first."; return; }
    stopMusic();
    pvAudio = new Audio(sel.value); pvAudio.loop = true;
    pvAudio.play().catch(() => { $("jMsg").textContent = "Music not available yet."; stopPreview(); });
    $("jListen").textContent = "⏸ Stop";
  };
  $("jText").oninput = drawComposer;
  $("jAdd").onclick = () => $("jFiles").click();
  $("jCam").onclick = () => { const cb = $("camBtn"); if (cb) cb.click(); };
  $("jFiles").onchange = async e => {
    const files = [...e.target.files]; e.target.value = "";
    if (files.length) cVideo = null;
    for (const f of files) {
      if (cImgs.length >= 6) { $("jMsg").textContent = "6 pictures is the most."; break; }
      try { const im = await loadImg(await readFile(f)); cImgs.push(shrink(im, 1080, 140000)); } catch (err) {}
    }
    drawComposer();
  };
  const vst = document.createElement("style");
  vst.textContent = ".jvid video{width:calc(100% + 24px);max-width:none;margin:0 -12px;display:block;max-height:560px;background:#000}#jVidPrev video{width:100%;max-height:260px;border-radius:14px;background:#000;margin-top:8px}#jVidPrev .jvx{width:auto;margin:6px 0 0;padding:7px 14px;font-size:13px}";
  document.head.appendChild(vst);
  $("jVid").onclick = () => $("jVidFile").click();
  $("jRec").onclick = () => $("jRecFile").click();
  $("jVidFile").onchange = e => pickVideo(e);
  $("jRecFile").onchange = e => pickVideo(e);
  $("jPost").onclick = doPost;
  drawComposer();
}

// ---------- 12-second videos: shrink the clip on the phone so it fits in the database ----------
async function pickVideo(e) {
  const f = e.target.files[0]; e.target.value = "";
  if (!f || vidBusy) return;
  const msg = $("jMsg");
  vidBusy = true; $("jPost").disabled = true;
  try {
    cVideo = null; cImgs = [];
    msg.textContent = "Preparing video...";
    cVideo = await makeVideo(f, t => { msg.textContent = "Preparing video... " + t; });
    msg.textContent = "Video ready ✅";
  } catch (err) {
    cVideo = null;
    msg.textContent = (err && err.message && err.message.indexOf("Video") === 0) ? err.message : "Could not prepare this video. Try a shorter clip.";
  }
  vidBusy = false; $("jPost").disabled = false;
  drawComposer();
}
function makeVideo(file, progress) {
  return new Promise(async (resolve, reject) => {
    const url = URL.createObjectURL(file);
    let ac = null, done = false, rec = null;
    const clean = () => { try { URL.revokeObjectURL(url); } catch (x) {} try { if (ac) ac.close(); } catch (x) {} };
    const fail = m => { if (done) return; done = true; clean(); try { if (rec && rec.state !== "inactive") rec.stop(); } catch (x) {} reject(new Error(m)); };
    try {
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return fail("Video: this phone browser cannot prepare videos.");
      const v = document.createElement("video");
      v.src = url; v.playsInline = true; v.preload = "auto";
      await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error("open")); });
      const dur = Math.min(isFinite(v.duration) && v.duration > 0 ? v.duration : 12, 12);
      const sc = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
      const w = Math.max(2, Math.round(v.videoWidth * sc / 2) * 2), h = Math.max(2, Math.round(v.videoHeight * sc / 2) * 2);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const g = cv.getContext("2d");
      // small picture for the grid and chat card
      v.currentTime = Math.min(0.4, dur / 3);
      await new Promise(ok => { v.onseeked = ok; });
      g.drawImage(v, 0, 0, w, h);
      const tc = document.createElement("canvas"); const ts = Math.min(1, 240 / Math.max(w, h));
      tc.width = Math.round(w * ts); tc.height = Math.round(h * ts);
      tc.getContext("2d").drawImage(cv, 0, 0, tc.width, tc.height);
      const thumb = tc.toDataURL("image/jpeg", 0.6);
      v.currentTime = 0;
      await new Promise(ok => { v.onseeked = ok; });
      const stream = cv.captureStream(24);
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const srcN = ac.createMediaElementSource(v), dst = ac.createMediaStreamDestination();
        srcN.connect(dst);
        dst.stream.getAudioTracks().forEach(t => stream.addTrack(t));
        if (ac.state === "suspended") await ac.resume();
      } catch (x) { ac = null; }
      const types = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"];
      const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || "";
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 240000, audioBitsPerSecond: 32000 } : { videoBitsPerSecond: 240000 });
      const chunks = [];
      rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = () => {
        if (done) return; done = true; clean();
        const blob = new Blob(chunks, { type: (rec.mimeType || mime || "video/webm").split(";")[0] });
        if (!blob.size) return reject(new Error("Video: nothing was recorded. Try again."));
        if (blob.size > 600000) return reject(new Error("Video: this clip is too big. Try a simpler or shorter clip."));
        const fr = new FileReader();
        fr.onload = () => resolve({ data: fr.result, thumb: thumb });
        fr.onerror = () => reject(new Error("read"));
        fr.readAsDataURL(blob);
      };
      let stopped = false;
      const stopNow = () => { if (!stopped) { stopped = true; try { rec.stop(); } catch (x) {} try { v.pause(); } catch (x) {} } };
      const loop = () => {
        if (done || stopped) return;
        g.drawImage(v, 0, 0, w, h);
        progress(Math.floor(v.currentTime) + "/" + Math.round(dur) + "s");
        if (v.currentTime >= dur - 0.05 || v.ended) { stopNow(); return; }
        requestAnimationFrame(loop);
      };
      rec.start(300);
      try { await v.play(); } catch (x) { return fail("Video: tap the video button again to allow playing."); }
      requestAnimationFrame(loop);
      setTimeout(stopNow, (dur + 3) * 1000);
    } catch (err) { fail("Could not prepare this video."); }
  });
}
function drawComposer() {
  const txt = $("jText").value;
  const cols = $("jColors"), prev = $("jPrev"), th = $("jThumbs");
  cols.innerHTML = "";
  const textOnly = cImgs.length === 0 && !cVideo;
  cols.style.display = textOnly ? "flex" : "none";
  prev.style.display = textOnly && txt.trim() ? "flex" : "none";
  prev.style.background = cBg; prev.textContent = txt;
  COLORS.forEach(c => { const s = mk("span", c === cBg ? "on" : ""); s.style.background = c; s.onclick = () => { cBg = c; drawComposer(); }; cols.appendChild(s); });
  const vp = $("jVidPrev");
  if (vp) {
    vp.innerHTML = "";
    if (cVideo) {
      const pv = document.createElement("video"); pv.src = cVideo.data; pv.controls = true; pv.playsInline = true; pv.muted = true;
      vp.appendChild(pv);
      const x = mk("button", "ghost jvx", "✕ Remove video"); x.type = "button"; x.onclick = () => { cVideo = null; drawComposer(); };
      vp.appendChild(x);
    }
  }
  th.innerHTML = "";
  cImgs.forEach((src, i) => {
    const d = mk("div"); const im = mk("img"); im.src = src; d.appendChild(im);
    const x = mk("b", "", "✕"); x.onclick = () => { cImgs.splice(i, 1); drawComposer(); }; d.appendChild(x);
    th.appendChild(d);
  });
}
async function doPost() {
  const text = $("jText").value.trim();
  const msg = $("jMsg");
  if (!text && !cImgs.length && !cVideo) { msg.textContent = "Write something, or add a picture or video."; return; }
  if (vidBusy) { msg.textContent = "Wait, the video is still getting ready."; return; }
  if (!myProf()) { msg.textContent = "Save your profile first (tap Edit profile)."; return; }
  const total = cImgs.reduce((n, s) => n + s.length, 0);
  if (cVideo && cVideo.data.length + cVideo.thumb.length > 900000) { msg.textContent = "This video is too big. Try a shorter clip."; return; }
  if (total > 950000) { msg.textContent = "Pictures are too big together. Remove one."; return; }
  const btn = $("jPost"); btn.disabled = true; msg.textContent = "Posting...";
  stopPreview();
  try {
    await addDoc(collection(db, "posts"), {
      uid: me.uid, name: myProf().gameName, text: text, img: cImgs[0] || "", imgs: cImgs.slice(),
      bg: (cImgs.length || cVideo) ? "" : cBg, video: cVideo ? cVideo.data : "", vthumb: cVideo ? cVideo.thumb : "", category: $("jCat").value, music: $("jMusic").value,
      time: serverTimestamp(), likes: [], fires: [], commentCount: 0
    });
    $("jText").value = ""; cImgs = []; cVideo = null; $("jMusic").value = "";
    drawComposer(); msg.textContent = ""; toast("Posted ✅");
  } catch (e) { msg.textContent = "Could not post. Try fewer pictures."; }
  btn.disabled = false;
}
// camera button on the old page: take the finished photo into the new post box
function hookCamera() {
  const pv = $("preview"); if (!pv) return;
  let busy = false;
  new MutationObserver(async () => {
    const s = pv.getAttribute("src") || "";
    if (busy || !s.startsWith("data:image/") || pv.classList.contains("hidden")) return;
    busy = true;
    try {
      const im = await loadImg(s);
      if (cImgs.length < 6) cImgs.push(shrink(im, 1080, 140000));
      pv.classList.add("hidden"); pv.removeAttribute("src");
      drawComposer();
      const mb = document.querySelector('nav button[data-tab="me"]'); if (mb) mb.click();
      setTimeout(() => { const c = $("jComposer"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); }, 150);
      toast("Photo added to your new post");
    } catch (e) {}
    busy = false;
  }).observe(pv, { attributes: true, attributeFilter: ["src", "class"] });
}

// ---------- profile pages ----------
const modes = {};
let focusId = "";
function stat(n, label) { const d = mk("div"); d.appendChild(mk("b", "", String(n))); d.appendChild(mk("span", "", label)); return d; }
function tile(x) {
  const imgs = imgsOf(x);
  const t = mk("div", "jt");
  if (x.video && !imgs.length) {
    if (x.vthumb) { const im = mk("img"); im.src = x.vthumb; im.draggable = false; t.appendChild(im); }
    else { t.classList.add("tx"); t.style.background = "#111"; }
    t.appendChild(mk("em", "", "🎬"));
  }
  else if (imgs.length) { const im = mk("img"); im.src = imgs[0]; im.draggable = false; t.appendChild(im); }
  else { t.classList.add("tx"); t.style.background = x.bg || COLORS[1]; t.appendChild(mk("span", "", (x.text || "").slice(0, 60))); }
  const n = (x.likes || []).length + (x.fires || []).length;
  if (n) t.appendChild(mk("i", "", "❤ " + n));
  if (imgs.length > 1) t.appendChild(mk("em", "", "▣"));
  return t;
}
function buildProfile(box, p, isMe, actsNode) {
  box.innerHTML = "";
  const fol = players.filter(x => followingOf(x).includes(p.uid)).length;
  const likesN = posts.filter(x => x.uid === p.uid).reduce((n, x) => n + (x.likes || []).length + (x.fires || []).length, 0);
  const wrap = mk("div", "prof");
  const cover = mk("div", "profCover");
  cover.style.background = p.cover ? "url(" + p.cover + ") center/cover" : gradFor(p.uid);
  if (isMe) {
    const mb = mk("button", "menuBtn", "☰"); mb.type = "button";
    mb.onclick = () => {
      const m = $("menuModal"); if (!m) return;
      const mi = $("mInstall"), mo = $("mOwner");
      if (mi && $("installBtn")) mi.classList.toggle("hidden", $("installBtn").classList.contains("hidden"));
      if (mo && $("ownerInboxBtn")) mo.classList.toggle("hidden", $("ownerInboxBtn").classList.contains("hidden"));
      if ($("mHelpBox")) $("mHelpBox").classList.add("hidden");
      m.classList.remove("hidden");
    };
    cover.appendChild(mb);
  }
  wrap.appendChild(cover);
  const body = mk("div", "profBody");
  body.appendChild(avEl(p.uid, p.gameName, true));
  const nm = mk("div", "profName"); nm.appendChild(nameEl(p.gameName, p.uid)); body.appendChild(nm);
  body.appendChild(mk("div", "profSub", (isOnline(p) ? "🟢 Online now" : "⚫ Offline") + "  ·  " + (p.game || "Member")));
  if (p.uid === ownerUid) body.appendChild(mk("div", "profFounder", "👑 Founder of Jolt"));
  const st = mk("div", "profStats");
  st.appendChild(stat(followingOf(p).length, "Following")); st.appendChild(stat(fol, "Followers")); st.appendChild(stat(likesN, "Likes"));
  body.appendChild(st);
  const acts = mk("div", "profActs");
  if (isMe) {
    const eb = mk("button", "sm green", "✏️ Edit profile"); eb.onclick = () => { const s = $("mSettings"); if (s) s.click(); };
    const cb = mk("button", "sm ghost", "🖼 Cover photo"); cb.onclick = () => $("jCoverFile").click();
    acts.appendChild(eb); acts.appendChild(cb);
    const cf = mk("input"); cf.type = "file"; cf.accept = "image/*"; cf.className = "hidden"; cf.id = "jCoverFile";
    cf.onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const im = await loadImg(await readFile(f));
        const c = document.createElement("canvas"); c.width = 900; c.height = 360;
        const g = c.getContext("2d");
        const s = Math.max(900 / im.naturalWidth, 360 / im.naturalHeight);
        const w = im.naturalWidth * s, h = im.naturalHeight * s;
        g.drawImage(im, (900 - w) / 2, (360 - h) / 2, w, h);
        let q = 0.75, out = c.toDataURL("image/jpeg", q);
        while (out.length > 90000 && q > 0.35) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
        await updateDoc(doc(db, "players", me.uid), { cover: out });
        toast("Cover photo saved");
      } catch (err) { toast("Could not save cover photo."); }
    };
    acts.appendChild(cf);
  } else if (actsNode) { acts.appendChild(actsNode); }
  body.appendChild(acts);
  if (p.gameUid) body.appendChild(mk("div", "profId", "🎮 ID: " + p.gameUid));
  wrap.appendChild(body);

  const key = isMe ? "me" : "user";
  const mode = modes[key] || "grid";
  const tabs = mk("div", "profTabs");
  [["grid", "▦ Grid"], ["list", "☰ Posts"]].forEach(o => {
    const b = mk("button", "ptab" + (mode === o[0] ? " on" : ""), o[1]); b.type = "button";
    b.onclick = () => { modes[key] = o[0]; buildProfile(box, p, isMe, actsNode); };
    tabs.appendChild(b);
  });
  wrap.appendChild(tabs);
  box.appendChild(wrap);

  if (!isMe && !isOwner() && p.uid !== ownerUid && (postsHidden(p.uid) || p.privHidePosts)) { box.appendChild(mk("div", "profEmpty", "🔒 This person's posts are private.")); return; }
  const pins = p.pins || [];
  const mineAll = posts.filter(x => x.uid === p.uid);
  const pinned = pins.map(id => mineAll.find(x => x.id === id)).filter(Boolean);
  const rest = mineAll.filter(x => !pins.includes(x.id));
  const mine = pinned.concat(rest);
  if (!mine.length) { box.appendChild(mk("div", "profEmpty", isMe ? "You have not posted yet. Use the New post box below." : "No posts yet.")); return; }
  if (mode === "grid") {
    const g = mk("div", "jgrid");
    mine.forEach(x => {
      const t = tile(x);
      if (pins.includes(x.id)) t.appendChild(mk("em", "", "📌"));
      t.onclick = () => { modes[key] = "list"; focusId = x.id; buildProfile(box, p, isMe, actsNode); };
      g.appendChild(t);
    });
    box.appendChild(g);
  } else {
    mine.forEach(x => { const c = postCard(x, { profile: true }); c.dataset.pid = x.id; box.appendChild(c); });
    if (focusId) { const el = box.querySelector('[data-pid="' + focusId + '"]'); focusId = ""; if (el) setTimeout(() => el.scrollIntoView({ block: "start" }), 30); }
  }
}
function renderMe() {
  const box = $("jMe"); if (!box || !me) return;
  const p = myProf() || { uid: me.uid, gameName: myName(), game: isOwner() ? "Founder" : "Member" };
  buildProfile(box, p, true, null);
}
// other people's pages: take over the old page but keep its buttons (follow, friend, chat)
let userUid = "", userActs = null;
function adoptUser() {
  const ub = $("userBox"), ju = $("jUser"); if (!ub || !ju) return;
  const nmEl = ub.querySelector(".profName b");
  if (!nmEl) { ub.style.display = ""; ju.innerHTML = ""; return; }
  const name = nmEl.firstChild ? nmEl.firstChild.textContent : "";
  const p = players.find(x => x.gameName === name);
  if (!p) { ub.style.display = ""; ju.innerHTML = ""; return; }
  userUid = p.uid;
  const acts = ub.querySelector(".profActs");
  if (acts) userActs = acts;
  renderUserView();
}
function renderUserView() {
  const ub = $("userBox"), ju = $("jUser"); if (!ub || !ju || !userUid) return;
  const p = players.find(x => x.uid === userUid); if (!p) return;
  try {
    buildProfile(ju, p, me && p.uid === me.uid, userActs && userActs.querySelector ? userActs.querySelector(".profActs") || userActs : null);
    ub.style.display = "none";
  } catch (e) { ub.style.display = ""; ju.innerHTML = ""; }
}
// open someone's page by using the old Search list
function openUser(uid) {
  const p = players.find(x => x.uid === uid); if (!p) return;
  const inp = $("playerSearch"); if (!inp) return;
  inp.value = p.gameName; inp.dispatchEvent(new Event("input", { bubbles: true }));
  setTimeout(() => {
    const rows = [...document.querySelectorAll("#players > .row")];
    const hit = rows.find(r => { const b = r.querySelector(".info b"); return b && b.firstChild && b.firstChild.textContent === p.gameName; });
    if (hit) { const lk = hit.querySelector(".row.link"); if (lk) lk.click(); }
    inp.value = ""; inp.dispatchEvent(new Event("input", { bubbles: true }));
  }, 60);
}

// open a shared post from a chat
window.joltOpenPost = function (id) {
  const el = document.querySelector('[data-pid="' + id + '"]');
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("jflash"); setTimeout(() => el.classList.remove("jflash"), 2200); return; }
  const p = posts.find(x => x.id === id);
  if (p) openComments(p); else toast("This post is no longer available.");
};

// ---------- privacy settings (opens from the menu) ----------
const PRIV = [
  ["privPrivate", "🔒 Private account", "Only your friends can see your posts. Other people will not see them on For You or on your page."],
  ["privHidePosts", "🙈 Hide posts on my page", "Nobody can see the posts on your profile page."],
  ["privHideOnline", "🕶 Hide online dot", "Other people see you as offline, even when you are using Jolt."],
  ["privFriendsOnly", "💬 Friends-only messages", "Only your friends can add you to a group."]
];
function drawPrivacy() {
  const box = $("pvList"); if (!box) return;
  box.innerHTML = "";
  const mp = myProf() || {};
  PRIV.forEach(o => {
    const on = !!mp[o[0]];
    const row = mk("div", "pvRow");
    const t = mk("div", "pvT"); t.appendChild(mk("b", "", o[1])); t.appendChild(mk("span", "", o[2]));
    const b = mk("button", "pvBtn" + (on ? " on" : ""), on ? "On" : "Off"); b.type = "button";
    b.onclick = async () => {
      if (!myProf()) { toast("Save your name first."); return; }
      b.disabled = true;
      try {
        const data = { [o[0]]: !on };
        if (o[0] === "privHideOnline" && !on) data.lastSeen = 0;
        await updateDoc(doc(db, "players", me.uid), data);
      } catch (e) { toast("Could not change this. Try again."); }
      b.disabled = false;
    };
    row.appendChild(t); row.appendChild(b);
    box.appendChild(row);
  });
}
function buildPrivacy() {
  const st = document.createElement("style");
  st.textContent = "#pvModal{position:fixed;inset:0;z-index:75;background:rgba(0,0,0,.7);display:flex;align-items:flex-end;justify-content:center}#pvModal.hidden{display:none}#pvModal .sheet{width:100%;max-width:520px;max-height:88vh;overflow-y:auto;background:var(--card,#141414);color:var(--tx,#fff);border-radius:22px 22px 0 0;padding:16px 16px 26px}#pvModal .pvHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}#pvModal .pvHead b{font-size:18px}#pvModal .pvX{width:38px;height:38px;border-radius:50%;border:0;background:var(--inp,#2a2a2a);color:var(--tx,#fff);font-size:18px;padding:0;margin:0}.pvRow{display:flex;align-items:center;gap:12px;padding:14px 0;border-top:1px solid var(--line,#2a2a2a)}.pvT{flex:1;min-width:0}.pvT b{display:block;font-size:16px}.pvT span{display:block;font-size:13px;opacity:.7;margin-top:3px;line-height:1.35}.pvBtn{width:64px;margin:0;padding:9px 0;border-radius:20px;border:1px solid var(--line,#444);background:var(--inp,#222);color:var(--tx,#fff);font-weight:700;font-size:14px}.pvBtn.on{background:#00ba7c;border-color:#00ba7c;color:#fff}";
  document.head.appendChild(st);
  const m = mk("div", "hidden"); m.id = "pvModal";
  m.innerHTML = '<div class="sheet"><div class="pvHead"><b>🔒 Privacy</b><button class="pvX" id="pvClose" type="button">✕</button></div><div id="pvList"></div></div>';
  document.body.appendChild(m);
  m.onclick = e => { if (e.target === m) m.classList.add("hidden"); };
  $("pvClose").onclick = () => m.classList.add("hidden");
  const sheet = document.querySelector("#menuModal .sheet");
  const out = $("mLogout");
  if (sheet && out) {
    const bt = mk("button", "mItem", "🔒 Privacy"); bt.type = "button"; bt.id = "mPrivacy";
    bt.onclick = () => { const mm = $("menuModal"); if (mm) mm.classList.add("hidden"); drawPrivacy(); m.classList.remove("hidden"); };
    sheet.insertBefore(bt, out);
  }
}

// ---------- start ----------
function ownerOnlyStrip() {
  const st = $("strip"); const card = st && st.closest(".card");
  if (!card) return;
  const anyOn = players.some(p => me && p.uid !== me.uid && isOnline(p));
  card.style.display = (isOwner() && anyOn) ? "" : "none";
}
function renderAll() {
  if (!me) return;
  try { const pm = $("pvModal"); if (pm && !pm.classList.contains("hidden")) drawPrivacy(); } catch (e) {}
  try { ownerOnlyStrip(); } catch (e) {}
  try { renderFYP(); } catch (e) { console.error(e); }
  try { renderMe(); } catch (e) { console.error(e); }
  try { renderUserView(); } catch (e) { console.error(e); }
}
let ready = false;
function prepare() {
  if (ready) return; ready = true;
  // For You: hide the old post box and old feed
  const pb = $("postBtn"); if (pb && pb.closest(".card")) pb.closest(".card").style.display = "none";
  if ($("feed")) $("feed").style.display = "none";
  if ($("catBar")) $("catBar").style.display = "none";
  const fyp = mk("div"); fyp.id = "jfyp";
  $("feed").parentNode.insertBefore(fyp, $("feed"));
  // my page
  const jme = mk("div"); jme.id = "jMe";
  $("meProfile").parentNode.insertBefore(jme, $("meProfile"));
  $("meProfile").style.display = "none";
  buildComposer();
  // other pages
  const ju = mk("div"); ju.id = "jUser";
  $("userBox").parentNode.insertBefore(ju, $("userBox").nextSibling);
  new MutationObserver(adoptUser).observe($("userBox"), { childList: true });
  buildCommentSheet();
  buildPrivacy();
  buildNewBtn();
  hookCamera();
  // stop music when leaving For You is handled by the observer (hidden = not visible)
}
onAuthStateChanged(auth, user => {
  unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = [];
  stopMusic(); me = user || null; knownIds = new Set(); heldIds = new Set(); firstPosts = true;
  if (!me) return;
  prepare();
  unsubs.push(onSnapshot(collection(db, "players"), snap => { players = snap.docs.map(d => ({ uid: d.id, ...d.data() })); schedule(); }, () => {}));
  unsubs.push(onSnapshot(query(collection(db, "posts"), orderBy("time", "desc"), limit(60)), snap => { posts = snap.docs.map(d => ({ id: d.id, ...d.data() })); trackNew(); schedule(); }, () => {}));
  unsubs.push(onSnapshot(query(collection(db, "requests"), where("participants", "array-contains", me.uid)), snap => { reqs = snap.docs.map(d => ({ id: d.id, ...d.data() })); schedule(); }, () => {}));
  unsubs.push(onSnapshot(doc(db, "config", "owner"), d => { const v = d.data(); ownerUid = (v && v.uid) || ""; schedule(); }, () => {}));
});
