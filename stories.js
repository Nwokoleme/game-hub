// Jolt - FILE 3: Stories (picture stories that last 24 hours).
// Seen by the people who follow you and your friends.
// Plugs into index.html with ONE line at the bottom:
// <script type="module" src="stories.js?v=1"></script>
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, addDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const DAY = 24 * 60 * 60 * 1000;
const SHOW_MS = 6000;
const MAX_LIVE = 10;
const $ = id => document.getElementById(id);
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

let me = null, players = [], reqs = [], stories = [];
let unsubs = [], tm = null, pending = "";
let seen = {};
try { seen = JSON.parse(localStorage.getItem("jstoryseen") || "{}"); } catch (e) { seen = {}; }
const saveSeen = () => { try { localStorage.setItem("jstoryseen", JSON.stringify(seen)); } catch (e) {} };
const cleaned = new Set();

// ---------- styles ----------
const css = document.createElement("style");
css.textContent = `
#jStories{display:flex;gap:12px;overflow-x:auto;padding:10px 4px 12px;scrollbar-width:none}
#jStories::-webkit-scrollbar{display:none}
#jStories.hidden{display:none}
.jsIt{flex:none;width:68px;text-align:center;cursor:pointer;color:var(--tx)}
.jsRing{width:64px;height:64px;border-radius:50%;padding:3px;margin:0 auto;background:linear-gradient(135deg,#1d9bf0,#a855f7,#ec4899);position:relative;box-sizing:border-box}
.jsRing.seen{background:var(--line)}
.jsRing.none{background:transparent;border:2px dashed var(--line)}
.jsAv{width:100%;height:100%;border-radius:50%;border:3px solid var(--bg);background:var(--inp) center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:20px;color:var(--tx);box-sizing:border-box;overflow:hidden}
.jsRing.none .jsAv{border:none}
.jsPlus{position:absolute;right:-3px;bottom:-3px;width:22px;height:22px;border-radius:50%;background:var(--ac);color:#fff;font-size:16px;line-height:19px;font-weight:bold;border:2px solid var(--bg);text-align:center;box-sizing:border-box}
.jsNm{font-size:12px;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

#jsv{position:fixed;inset:0;z-index:10000;background:#000;display:flex;flex-direction:column;color:#fff}
#jsv.hidden,#jsc.hidden{display:none}
#jsBars{display:flex;gap:4px;padding:10px 10px 6px}
#jsBars i{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.3);overflow:hidden;position:relative}
#jsBars i b{position:absolute;inset:0;background:#fff;transform:scaleX(0);transform-origin:left}
#jsBars i.done b{transform:scaleX(1)}
#jsBars i.cur b{animation:jsFill ${SHOW_MS}ms linear forwards}
#jsv.paused #jsBars i.cur b{animation-play-state:paused}
@keyframes jsFill{to{transform:scaleX(1)}}
#jsHd{display:flex;align-items:center;gap:10px;padding:4px 12px 8px}
#jsHd .jsAv{width:38px;height:38px;flex:none;border:none;font-size:16px;background-color:#222;color:#fff}
#jsHd .nm{flex:1;min-width:0}
#jsHd .nm b{display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#jsHd .nm span{font-size:12px;opacity:.7}
#jsv button.jsBtn{width:auto;display:block;margin:0;padding:8px 12px;font-size:20px;background:none;color:#fff;border:none;border-radius:20px}
#jsStage{flex:1;position:relative;display:flex;align-items:center;justify-content:center;min-height:0;user-select:none;-webkit-user-select:none}
#jsImg{max-width:100%;max-height:100%;object-fit:contain;pointer-events:none}
.jsTap{position:absolute;top:0;bottom:0}
#jsPrev{left:0;width:33%}
#jsNext{right:0;width:67%}
#jsCap{padding:12px 18px 6px;text-align:center;font-size:17px;line-height:1.35;min-height:20px;word-break:break-word}
#jsFoot{padding:4px 18px 22px;text-align:center;font-size:13px;opacity:.75;min-height:18px}

#jsc{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.65);display:flex;align-items:flex-end}
.jscBox{width:100%;max-width:560px;margin:0 auto;background:var(--card);color:var(--tx);border-radius:20px 20px 0 0;padding:16px}
.jscBox h3{margin:0 0 10px;font-size:18px}
#jscImg{width:100%;max-height:46vh;object-fit:contain;border-radius:12px;background:#000;display:block}
.jscBox input{margin:10px 0 4px}
`;
document.head.appendChild(css);

// ---------- helpers ----------
const nameOf = uid => { const p = players.find(x => x.uid === uid); return p && p.gameName ? p.gameName : "Player"; };
const live = () => stories.filter(s => s.expires > Date.now()).sort((a, b) => a.at - b.at);
const allSeen = list => list.every(s => seen[s.id]);
function toast(t) {
  let el = $("jToast");
  if (!el) { el = mk("div"); el.id = "jToast"; document.body.appendChild(el); }
  el.textContent = t; el.classList.add("on");
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 2600);
}
function setAv(el, uid) {
  const p = players.find(x => x.uid === uid);
  if (p && p.photo) { el.textContent = ""; el.style.backgroundImage = "url(" + p.photo + ")"; }
  else { el.style.backgroundImage = ""; el.textContent = (nameOf(uid) || "?").charAt(0).toUpperCase(); }
}
function ago(ms) {
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  return Math.floor(m / 60) + " h ago";
}
// shrink a picture so it fits in one story document
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
// people who may see my story: my followers, my friends, and me
function audienceNow() {
  const set = new Set([me.uid]);
  players.forEach(p => { if ((p.following || []).includes(me.uid)) set.add(p.uid); });
  reqs.forEach(r => { if (r.status === "accepted") (r.participants || []).forEach(u => set.add(u)); });
  return [...set];
}

// ---------- the row on the home page ----------
function mount() {
  if ($("jStories")) return;
  const tab = $("tab-home"); if (!tab) return;
  const d = mk("div"); d.id = "jStories";
  tab.insertBefore(d, tab.firstChild);
}
function item(uid, label, list, isMe) {
  const it = mk("div", "jsIt");
  const ring = mk("div", "jsRing" + (!list.length ? " none" : allSeen(list) ? " seen" : ""));
  const av = mk("div", "jsAv"); setAv(av, uid); ring.appendChild(av);
  if (isMe) {
    const pl = mk("div", "jsPlus", "+");
    pl.onclick = e => { e.stopPropagation(); pickFile(); };
    ring.appendChild(pl);
  }
  it.appendChild(ring); it.appendChild(mk("div", "jsNm", label));
  it.onclick = () => { if (list.length) openViewer(list); else if (isMe) pickFile(); };
  return it;
}
function render() {
  const box = $("jStories"); if (!box) return;
  if (!me) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden"); box.innerHTML = "";
  const groups = {};
  live().forEach(s => { (groups[s.uid] = groups[s.uid] || []).push(s); });
  box.appendChild(item(me.uid, "Your story", groups[me.uid] || [], true));
  Object.keys(groups).filter(u => u !== me.uid).sort((a, b) => {
    const ua = allSeen(groups[a]) ? 1 : 0, ub = allSeen(groups[b]) ? 1 : 0;
    if (ua !== ub) return ua - ub;
    return groups[b][groups[b].length - 1].at - groups[a][groups[a].length - 1].at;
  }).forEach(u => box.appendChild(item(u, nameOf(u), groups[u], false)));
}
function schedule() { clearTimeout(tm); tm = setTimeout(render, 120); }

// ---------- viewer ----------
let V = null, vt = null, vStart = 0, vLeft = SHOW_MS, held = false, holdT = null;
function buildViewer() {
  const v = mk("div"); v.id = "jsv"; v.className = "hidden";
  v.innerHTML = '<div id="jsBars"></div><div id="jsHd"><div class="jsAv" id="jsAv"></div><div class="nm"><b id="jsNm"></b><span id="jsTm"></span></div><button type="button" class="jsBtn" id="jsDel" title="Delete">🗑</button><button type="button" class="jsBtn" id="jsX" title="Close">✕</button></div><div id="jsStage"><img id="jsImg" alt=""><div class="jsTap" id="jsPrev"></div><div class="jsTap" id="jsNext"></div></div><div id="jsCap"></div><div id="jsFoot"></div>';
  document.body.appendChild(v);
  $("jsX").onclick = closeViewer;
  $("jsDel").onclick = delCurrent;
  const st = $("jsStage");
  st.addEventListener("pointerdown", () => { held = false; clearTimeout(holdT); holdT = setTimeout(() => { held = true; pause(); }, 250); });
  const up = () => { clearTimeout(holdT); if (held) resume(); };
  st.addEventListener("pointerup", up); st.addEventListener("pointerleave", up); st.addEventListener("pointercancel", up);
  $("jsNext").onclick = () => { if (held) { held = false; return; } next(); };
  $("jsPrev").onclick = () => { if (held) { held = false; return; } prev(); };
  document.addEventListener("keydown", e => { if (V && e.key === "Escape") closeViewer(); });
}
function pause() { if (!V) return; vLeft -= Date.now() - vStart; clearTimeout(vt); $("jsv").classList.add("paused"); }
function resume() { if (!V) return; $("jsv").classList.remove("paused"); vStart = Date.now(); clearTimeout(vt); vt = setTimeout(next, Math.max(300, vLeft)); }
function next() { if (!V) return; V.i++; showStory(); }
function prev() { if (!V) return; V.i = Math.max(0, V.i - 1); showStory(); }
function openViewer(list) {
  const first = list.findIndex(s => !seen[s.id]);
  V = { list: list.slice(), i: first < 0 ? 0 : first };
  $("jsv").classList.remove("hidden");
  showStory();
}
function closeViewer() {
  clearTimeout(vt); V = null;
  $("jsv").classList.add("hidden"); $("jsv").classList.remove("paused");
  $("jsImg").removeAttribute("src");
  render();
}
function showStory() {
  clearTimeout(vt);
  if (!V) return;
  if (V.i >= V.list.length) { closeViewer(); return; }
  const s = V.list[V.i];
  const bars = $("jsBars"); bars.innerHTML = "";
  V.list.forEach((_, k) => { const i = mk("i", k < V.i ? "done" : k === V.i ? "cur" : ""); i.appendChild(mk("b")); bars.appendChild(i); });
  setAv($("jsAv"), s.uid);
  $("jsNm").textContent = s.uid === me.uid ? "Your story" : nameOf(s.uid);
  $("jsTm").textContent = ago(s.at);
  $("jsImg").src = s.img;
  $("jsCap").textContent = s.caption || "";
  const mine = s.uid === me.uid;
  $("jsDel").style.display = mine ? "" : "none";
  $("jsFoot").textContent = mine ? "👁 " + ((s.views || []).filter(u => u !== me.uid).length) + " seen" : "";
  $("jsv").classList.remove("paused");
  seen[s.id] = 1; saveSeen();
  if (!mine && !(s.views || []).includes(me.uid)) {
    updateDoc(doc(db, "stories", s.id), { views: arrayUnion(me.uid) }).catch(() => {});
  }
  vLeft = SHOW_MS; vStart = Date.now(); vt = setTimeout(next, SHOW_MS);
}
async function delCurrent() {
  if (!V) return;
  const s = V.list[V.i]; if (!s || s.uid !== me.uid) return;
  pause();
  if (!confirm("Delete this story?")) { resume(); return; }
  try {
    await deleteDoc(doc(db, "stories", s.id));
    V.list.splice(V.i, 1);
    if (!V.list.length) closeViewer(); else showStory();
  } catch (e) { toast("Could not delete the story."); resume(); }
}

// ---------- add a story ----------
function buildSheet() {
  const f = mk("input"); f.type = "file"; f.accept = "image/*"; f.id = "jsFile"; f.style.display = "none";
  document.body.appendChild(f);
  f.onchange = () => {
    const file = f.files && f.files[0]; if (!file) return;
    if (!/^image\//.test(file.type)) { toast("Please choose a picture."); return; }
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => { pending = shrink(img, 900, 230000); openSheet(); };
      img.onerror = () => toast("That picture could not be opened.");
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  };
  const s = mk("div"); s.id = "jsc"; s.className = "hidden";
  s.innerHTML = '<div class="jscBox"><h3>New story</h3><img id="jscImg" alt=""><input id="jscCap" maxlength="120" placeholder="Write something (optional)"><button type="button" class="green" id="jscGo">Share story</button><button type="button" class="ghost" id="jscNo">Cancel</button><div class="mut" style="text-align:center">Your followers and friends can see it for 24 hours.</div></div>';
  document.body.appendChild(s);
  s.onclick = e => { if (e.target === s) closeSheet(); };
  $("jscNo").onclick = closeSheet;
  $("jscGo").onclick = share;
}
function pickFile() {
  if (!me) return;
  if (live().filter(s => s.uid === me.uid).length >= MAX_LIVE) { toast("You can have " + MAX_LIVE + " stories at a time."); return; }
  const f = $("jsFile"); f.value = ""; f.click();
}
function openSheet() { $("jscImg").src = pending; $("jscCap").value = ""; $("jsc").classList.remove("hidden"); }
function closeSheet() { pending = ""; $("jsc").classList.add("hidden"); $("jscImg").removeAttribute("src"); }
async function share() {
  if (!pending || !me) return;
  const b = $("jscGo"); b.disabled = true; b.textContent = "Sharing...";
  const at = Date.now();
  try {
    await addDoc(collection(db, "stories"), {
      uid: me.uid, name: nameOf(me.uid), img: pending, caption: $("jscCap").value.trim().slice(0, 120),
      at: at, expires: at + DAY, time: serverTimestamp(), audience: audienceNow(), views: []
    });
    closeSheet(); toast("Story shared. It stays for 24 hours.");
  } catch (e) { toast("Could not share the story. Check your internet and try again."); }
  b.disabled = false; b.textContent = "Share story";
}

// ---------- start ----------
let ready = false;
function prepare() {
  if (ready) return; ready = true;
  buildViewer(); buildSheet();
  setInterval(render, 60000);
}
onAuthStateChanged(auth, user => {
  unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = [];
  me = user || null; stories = [];
  prepare(); mount();
  if (!me) { render(); return; }
  unsubs.push(onSnapshot(collection(db, "players"), snap => { players = snap.docs.map(d => ({ uid: d.id, ...d.data() })); schedule(); }, () => {}));
  unsubs.push(onSnapshot(query(collection(db, "requests"), where("participants", "array-contains", me.uid)), snap => { reqs = snap.docs.map(d => ({ id: d.id, ...d.data() })); }, () => {}));
  unsubs.push(onSnapshot(query(collection(db, "stories"), where("audience", "array-contains", me.uid)), snap => {
    stories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // remove my own stories that are older than 24 hours
    stories.forEach(s => {
      if (s.uid === me.uid && s.expires <= Date.now() && !cleaned.has(s.id)) {
        cleaned.add(s.id); deleteDoc(doc(db, "stories", s.id)).catch(() => {});
      }
    });
    schedule();
  }, () => {}));
});
