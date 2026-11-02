/* Jolt File 1: chat.js (version 2)
   Chat hub for the Friends tab. Loads after index.html, uses the same Firebase app.
   Chats: friends + groups, Jux inside chats, blue/red online dots, two blue ticks, streaks,
   requests, groups with name, disappearing messages (24h), read receipts switch.
   New in v2: emoji, stickers (built-in + your own pictures), photos, voice notes,
   message reactions, copy, delete, share a post to a chat, block and report.
   v2.1: bold text (tap B, or type *text*).
   v3: wallpaper colors + chat color picker, WhatsApp-style voice notes, search bar on For You.
   v3.1: search bar inside Messages (filters chats by name). */
import { getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, getDocs, doc, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp, arrayRemove, arrayUnion, deleteField } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function ready() {
  return new Promise(res => {
    const t = setInterval(() => { if (getApps().length) { clearInterval(t); res(); } }, 100);
  });
}

const EMOJIS = Array.from("😀😃😄😁😆😅😂🤣😊😇🙂😉😍🥰😘😋😎🤩🥳😏😒😞😔😢😭😤😡🤬🤯😱😨😰🥶🥵🤔🤫🤭🙄😴🤮🤧😷🤝👍👎👏🙌🙏💪👊✌️🤞👌🫡👀🧠💀👻🤖👽🔥💥✨⭐🌟💯❤️🧡💛💚💙💜🖤💔🏆🥇🎮🕹️🔫💣🎯🎧🎵🎉🎊🎁🍕🍔🍟🍗🍺🥤⚽🏀🚀💎👑");
const STICKERS = [
  ["🏆", "EZ WIN"], ["🔥", "BOOYAH!"], ["😎", "CLUTCH"], ["💀", "I'M DEAD"],
  ["😂", "NOOB 😂"], ["🤝", "RESPECT"], ["🎯", "HEADSHOT"], ["👑", "KING"],
  ["💪", "LET'S GO"], ["😭", "SO CLOSE"], ["🤣", "LOL"], ["👏", "WELL PLAYED"],
  ["🎮", "GG"], ["🥳", "WE WON"], ["😡", "RAGE"], ["❤️", "LOVE IT"]
];

(async function () {
  await ready();
  const app = getApp(), auth = getAuth(app), db = getFirestore(app);
  const $ = id => document.getElementById(id);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  const ONLINE_MS = 150000;
  const REACT_SET = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
  const REPORT_WHY = ["Spam", "Bullying or abuse", "Nudity or sexual content", "Scam or fraud", "Something else"];
  let me = null, myP = null, players = [], reqs = {}, groups = [];
  let unsubs = [], lastUnsubs = {}, lastMsgs = {};
  let cx = null; // open chat
  let panelMode = "";

  // ---------- styles ----------
  const css = document.createElement("style");
  css.textContent = `
#tab-friends>.card{display:none!important}
#quickJux{display:none!important}
#chatHub{padding:4px 0 90px}
#hubQ{display:block;width:100%;box-sizing:border-box;margin:2px 0 8px;border-radius:24px;padding:11px 18px}
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
.cxB{max-width:78%;padding:7px 11px 5px;border-radius:12px 12px 12px 3px;background:var(--in-bg);color:var(--tx);box-shadow:0 1px 1px rgba(0,0,0,.25);font-size:15.5px;line-height:1.35;word-wrap:break-word;overflow-wrap:anywhere;white-space:pre-wrap;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.cxMsg.mine .cxB{background:var(--me-bg);color:var(--me-tx);border-radius:12px 12px 3px 12px}
.cxB.bare{background:none!important;box-shadow:none;padding:2px}
.cxN{font-size:12px;font-weight:700;color:var(--ac);margin-bottom:2px}
.cxM{font-size:10.5px;opacity:.7;text-align:right;margin-top:2px;white-space:nowrap}
.cxB.bare .cxM{color:var(--tx)}
.tick{margin-left:4px;font-weight:700}
.tick.blue{color:#1d9bf0;opacity:1}
.cxB audio{display:block;width:200px;max-width:100%;height:36px}
.cxNote{text-align:center;color:var(--mut);font-size:12px;margin:8px 0}
.cxNote.day{display:table;margin:10px auto;background:rgba(0,0,0,.35);color:#fff;padding:3px 11px;border-radius:10px}
.cxImg{display:block;max-width:240px;width:100%;border-radius:8px;cursor:pointer}
.cxStk{display:block;width:130px;height:130px;object-fit:contain}
.cxPost{border-left:3px solid var(--ac);padding-left:8px;cursor:pointer;min-width:150px;max-width:230px;white-space:normal}
.cxPost img{display:block;width:100%;border-radius:8px;margin:4px 0}
.cxPost small{display:block;opacity:.75;margin-top:3px}
.cxR{display:inline-block;margin-top:3px;padding:1px 8px;border-radius:12px;background:rgba(0,0,0,.28);font-size:13px}
#cx .cxBar{display:flex;gap:6px;align-items:center;padding:8px 8px calc(8px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--bg)}
#cx .cxBar input{flex:1;margin:0;border-radius:22px;padding:11px 16px;min-width:0}
#cx .cxBar button{width:44px;height:44px;padding:0;margin:0;border-radius:50%;font-size:19px;display:flex;align-items:center;justify-content:center;background:var(--btn);color:#fff;border:none;flex:none}
#cx .cxBar #cxEmo,#cx .cxBar #cxAtt{background:transparent;color:var(--tx);font-size:22px;width:38px}
#cx .cxBar #cxBold{background:transparent;color:var(--tx);font-size:20px;font-weight:900;width:34px;font-family:Georgia,serif}
#cx .cxBar #cxRecX{background:#f4212e}
.cxB b.bd{font-weight:800}
#cx .cxBar #cxMic.recOn{width:auto;padding:0 14px;border-radius:22px;background:#f4212e;font-size:15px}
#cx .hidden{display:none!important}
#cxPanel{max-height:250px;overflow-y:auto;border-top:1px solid var(--line);background:var(--bg);padding:6px}
#cxPanel .pnTabs{display:flex;gap:6px;margin-bottom:6px;position:sticky;top:-6px;background:var(--bg);padding:4px 0}
#cxPanel .pnTabs button{width:auto;margin:0;padding:6px 12px;font-size:14px;background:var(--inp);color:var(--tx);border:none;border-radius:16px}
#cxPanel .pnTabs button.on{background:var(--ac);color:#fff}
.pnGrid{display:flex;flex-wrap:wrap}
.pnEm{width:12.5%;text-align:center;font-size:26px;padding:6px 0;cursor:pointer}
.pnStk{width:25%;text-align:center;padding:6px 2px;cursor:pointer}
.pnStk .a{font-size:38px}.pnStk .b{font-size:10px;color:var(--mut)}
.pnMy{width:25%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:30px;color:var(--mut)}
.pnMy img{max-width:92%;max-height:92%}
#cxLock{padding:14px;text-align:center;color:var(--mut);border-top:1px solid var(--line);font-size:14px}
#cxLock button{width:auto;display:inline-block;margin:8px 0 0;padding:9px 18px;font-size:14px}
#cxImgV{position:fixed;inset:0;z-index:60;background:#000;display:flex;align-items:center;justify-content:center}
#cxImgV img{max-width:100%;max-height:100%}
#cxImgV.hidden{display:none}
#chSheet{position:fixed;inset:0;z-index:45;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center}
#chSheet.hidden{display:none}
#chSheet .box{width:100%;max-width:560px;max-height:86vh;overflow-y:auto;background:var(--card);color:var(--tx);border-radius:22px 22px 0 0;padding:16px 16px 26px}
#chSheet h3{margin:0 0 10px;font-size:19px}
#chSheet .opt{display:block;width:100%;text-align:left;margin:6px 0;padding:14px;border-radius:14px;border:none;background:var(--inp);color:var(--tx);font-size:16px}
#chSheet .opt.red{color:#ff6b6b}
#chSheet .rxRow{display:flex;justify-content:space-around;margin:4px 0 10px}
#chSheet .rxE{font-size:30px;padding:6px 8px;border-radius:50%;cursor:pointer}
#chSheet .rxE.on{background:var(--inp)}
#chSheet .rq{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
#chSheet .rq .chMid{flex:1}
#chSheet .rq button{width:auto;margin:0;padding:8px 14px;font-size:14px}
#chSheet label.gp{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--line);font-size:16px}
#chSheet label.gp input{width:22px;height:22px;margin:0;flex:none}
#chSheet .gl{max-height:34vh;overflow-y:auto;margin:8px 0}

#cx.hasWp .cxNote.day{background:rgba(0,0,0,.45);color:#fff}
#cx .cxMsg.mine .cxB{background:var(--cx-me-bg,var(--me-bg));color:var(--cx-me-tx,#fff)}
#cx .cxMsg:not(.mine) .cxB{background:var(--cx-th-bg,var(--in-bg));color:var(--cx-th-tx,var(--tx))}
#cx .cxB.bare{background:none!important;box-shadow:none}
#cx .cxMsg:not(.mine) .cxB.bare{color:var(--tx)}
#cx .cxBar #cxMic{width:46px;height:46px;background:#25d366;color:#fff;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;transition:transform .12s}
#cx .cxBar #cxMic.recOn{width:46px;padding:0;border-radius:50%;background:#f4212e;font-size:19px;transform:scale(1.08)}
#cx .cxBar #cxMic.recOn.hold{transform:scale(1.4)}
#cxRecBar{flex:1;display:flex;align-items:center;gap:10px;padding:0 8px;color:var(--tx);min-width:0}
#cxRecBar .rdot{width:11px;height:11px;border-radius:50%;background:#f4212e;animation:rdp 1s infinite;flex:none}
@keyframes rdp{50%{opacity:.2}}
#cxRecT{font-weight:800;font-size:17px}
#cxRecH{color:var(--mut);font-size:14px;margin-left:auto;white-space:nowrap}
#cx .vn{display:flex;align-items:center;gap:10px;min-width:215px}
#cx .vnP{flex:none;width:42px;height:42px;border-radius:50%;padding:0;margin:0;border:none;display:flex;align-items:center;justify-content:center;background:#25d366;color:#fff}
#cx .cxMsg.mine .vnP{background:#fff;color:#128c4a}
#cx .vnM{flex:1;min-width:0}
#cx .vnW{display:flex;align-items:center;gap:2px;height:30px;cursor:pointer}
#cx .vnW i{display:block;width:3px;border-radius:2px;background:currentColor;opacity:.35;flex:none}
#cx .vnW i.on{opacity:1}
#cx .vnT{font-size:11px;opacity:.75;margin-top:1px}
#chSheet .clr{display:flex;align-items:center;justify-content:space-between;padding:10px 4px;border-bottom:1px solid var(--line);font-size:16px}
#chSheet .clr input{width:60px!important;height:38px;padding:0!important;margin:0!important;border:none;background:none}
#jSrch{padding:8px 14px 4px;background:var(--bg)}
#jSrch .jsIn{display:flex;align-items:center;gap:10px;background:var(--inp);color:var(--mut);border-radius:24px;padding:11px 16px;font-size:15px;cursor:text}
#jSrchP{position:fixed;inset:0;z-index:48;background:var(--bg);color:var(--tx);display:flex;flex-direction:column;height:100dvh}
#jSrchP.hidden{display:none}
#jSrchP .jsHead{display:flex;gap:8px;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 8px;border-bottom:1px solid var(--line)}
#jSrchP .jsHead button{width:40px;height:40px;padding:0;margin:0;border-radius:50%;background:transparent;color:var(--tx);border:none;font-size:20px;flex:none}
#jSrchP .jsHead input{flex:1;margin:0;border-radius:24px;padding:11px 16px;min-width:0}
#jsRes{flex:1;overflow-y:auto;padding:4px 12px 30px}
#jsRes .jsH{font-size:17px;font-weight:800;padding:14px 2px 6px}
#jsRes .jsRow{display:flex;align-items:center;gap:12px;padding:10px 2px;border-bottom:1px solid var(--line);cursor:pointer}
#jsRes .jsRow img{width:54px;height:54px;object-fit:cover;border-radius:10px;flex:none}
#jsRes .jsMid{flex:1;min-width:0}
#jsRes .jsMid b{display:block;font-size:15px}
#jsRes .jsMid span{display:block;color:var(--mut);font-size:14px;max-height:2.7em;overflow:hidden}
#jsRes .jsTags{display:flex;flex-wrap:wrap;gap:8px;padding:6px 0}
#jsRes .jsTags button{width:auto;margin:0;padding:8px 14px;border-radius:20px;background:var(--inp);color:var(--tx);border:none;font-size:14px}
`;
  document.head.appendChild(css);

  // ---------- containers ----------
  const hub = mk("div"); hub.id = "chatHub";
  const tabF = $("tab-friends");
  if (!tabF) return;
  tabF.appendChild(hub);
  const hubTop = mk("div"), hubSrch = mk("div"), hubList = mk("div");
  hub.appendChild(hubTop); hub.appendChild(hubSrch); hub.appendChild(hubList);
  const hubQ = document.createElement("input");
  hubQ.id = "hubQ"; hubQ.type = "search"; hubQ.placeholder = "Search"; hubQ.maxLength = 40; hubQ.autocomplete = "off";
  hubSrch.appendChild(hubQ);
  hubQ.addEventListener("input", () => renderHub());

  const cxEl = mk("div", "hidden"); cxEl.id = "cx";
  cxEl.innerHTML = '<div class="cxHead"><button id="cxBack" type="button" aria-label="Back">←</button><div id="cxAv"></div><div class="cxT"><b id="cxTitle"></b><span id="cxSub"></span></div><button id="cxMenu" type="button" aria-label="Options">⋯</button></div>' +
    '<div id="cxLog"></div><div id="cxLock" class="hidden"></div><div id="cxPanel" class="hidden"></div>' +
    '<div class="cxBar"><button id="cxEmo" type="button" aria-label="Emoji and stickers">😊</button><button id="cxBold" type="button" aria-label="Bold text">B</button><input id="cxInput" placeholder="Type a message" maxlength="500" autocomplete="off"><button id="cxAtt" type="button" aria-label="Send a photo">📎</button><div id="cxRecBar" class="hidden"><i class="rdot"></i><span id="cxRecT">0:00</span><span id="cxRecH">‹ Slide to cancel</span></div><button id="cxRecX" class="hidden" type="button" aria-label="Cancel voice note">🗑</button><button id="cxMic" type="button" aria-label="Voice note">🎤</button><button id="cxSend" class="hidden" type="button" aria-label="Send">➤</button></div>';
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
  const photoFile = mk("input"); photoFile.type = "file"; photoFile.accept = "image/*"; photoFile.style.display = "none"; document.body.appendChild(photoFile);
  const stkFile = mk("input"); stkFile.type = "file"; stkFile.accept = "image/*"; stkFile.style.display = "none"; document.body.appendChild(stkFile);
  const imgV = mk("div", "hidden"); imgV.id = "cxImgV"; imgV.appendChild(mk("img")); document.body.appendChild(imgV);
  imgV.onclick = () => { imgV.classList.add("hidden"); imgV.firstChild.removeAttribute("src"); };

  // ---------- helpers ----------
  function toast(t) {
    let el = $("jToast");
    if (!el) { el = mk("div"); el.id = "jToast"; document.body.appendChild(el); }
    el.textContent = t; el.classList.add("on");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 2600);
  }
  const isOn = p => !!p && !!p.lastSeen && !p.privHideOnline && (Date.now() - p.lastSeen) < ONLINE_MS;
  const pOf = uid => players.find(x => x.uid === uid);
  const nameOf = uid => { const p = pOf(uid); return p ? (p.gameName || "Player") : "Player"; };
  const myName = () => (myP && myP.gameName) || "Player";
  const blockedSet = () => new Set((myP && myP.blocked) || []);
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
  // short text for lists and phone alerts
  function labelOf(t) {
    t = typeof t === "string" ? t : "";
    if (t.indexOf("[v]") === 0) return "🎤 Voice note";
    if (t.indexOf("[s]") === 0) return (t.slice(3).split("|")[0] || "") + " Sticker";
    if (t.indexOf("[k]") === 0) return "Sticker";
    if (t.indexOf("[i]") === 0) return "📷 Photo";
    if (t.indexOf("[p]") === 0) return "📌 Shared a post";
    return t.replace(/\*([^*\n]+)\*/g, "$1");
  }
  const isPlain = t => !/^\[[vskip]\]/.test(t);
  function preview(m) { return (m.from === me.uid ? "You: " : "") + labelOf(m.text); }
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
  // shrink a picture so it fits inside one message
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
  function readImage(file, maxDim, target, cb) {
    if (!file || !/^image\//.test(file.type)) { toast("Please choose a picture."); return; }
    const rd = new FileReader();
    rd.onload = () => {
      const im = new Image();
      im.onload = () => cb(shrink(im, maxDim, target));
      im.onerror = () => toast("That picture could not be opened.");
      im.src = rd.result;
    };
    rd.readAsDataURL(file);
  }
  // long press (also right-click)
  function onLong(el, fn, ms) {
    ms = ms || 480;
    let t = null, fired = false, x0 = 0, y0 = 0;
    const clear = () => { clearTimeout(t); t = null; };
    el.addEventListener("pointerdown", e => { fired = false; clear(); x0 = e.clientX; y0 = e.clientY; t = setTimeout(() => { fired = true; fn(e); }, ms); });
    el.addEventListener("pointermove", e => { if (t && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 12) clear(); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => el.addEventListener(ev, clear));
    el.addEventListener("click", e => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
    el.addEventListener("contextmenu", e => { e.preventDefault(); if (!fired) { clear(); fired = true; fn(e); } });
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      ta.remove();
    }
    toast("Copied");
  }
  const pathOf = t => t.kind === "dm" ? ["chats", t.id, "messages"] : ["groups", t.id, "messages"];
  const myStickers = () => { try { const a = JSON.parse(localStorage.getItem("jolt_stk") || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const saveStickers = a => { try { localStorage.setItem("jolt_stk", JSON.stringify(a.slice(0, 30))); } catch (e) { toast("Not enough space to save this sticker."); } };

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
    hubTop.innerHTML = ""; hubList.innerHTML = "";
    const head = mk("div", "chHead");
    head.appendChild(mk("h2", "", "Messages"));
    hubTop.appendChild(head);

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
    hubTop.appendChild(bar);

    // Jux row (like Meta AI inside chats)
    const jr = mk("div", "chRow");
    const ja = mk("div", "chAv", "✨");
    jr.appendChild(ja);
    const jm = mk("div", "chMid");
    jm.appendChild(mk("b", "", "Jux AI"));
    jm.appendChild(mk("span", "", "Ask me anything"));
    jr.appendChild(jm);
    jr.onclick = () => { const b = $("quickJux"); if (b) b.click(); };
    const term = hubQ.value.trim().toLowerCase();
    if (!term || "jux ai".includes(term)) hubList.appendChild(jr);

    const blocked = blockedSet();
    const items = [];
    groups.forEach(g => {
      const arr = lastMsgs["gr:" + g.id] || [];
      const last = arr.find(m => !blocked.has(m.from));
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
    const shown = term ? items.filter(it => String(it.kind === "group" ? (it.g.name || "Group") : nameOf(it.ou)).toLowerCase().includes(term)) : items;

    if (!items.length) {
      hubList.appendChild(mk("div", "chEmpty", "No chats yet. Find people in Search, send a friend request, or tap New group."));
    } else if (term && !shown.length && !"jux ai".includes(term)) {
      hubList.appendChild(mk("div", "chEmpty", "No chats found for that name."));
    }
    shown.forEach(it => {
      const row = mk("div", "chRow");
      const mid = mk("div", "chMid");
      if (it.kind === "group") {
        row.appendChild(mkAv(null, "👥", false, false));
        row.firstChild.textContent = "👥";
        mid.appendChild(mk("b", "", it.g.name || "Group"));
        let sub = (it.g.members || []).length + " members";
        if (it.last) {
          const who = it.last.from === me.uid ? "You" : nameOf(it.last.from);
          sub = who + ": " + labelOf(it.last.text);
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
        mid.appendChild(mk("span", "", blocked.has(it.ou) ? "🚫 Blocked" : (it.last ? preview(it.last) : "Say hi 👋")));
        row.appendChild(mid);
        if (it.ms) row.appendChild(mk("div", "chTime", timeLabel(it.ms)));
        row.onclick = () => openChat({ kind: "dm", id: it.id, title: nameOf(it.ou), other: it.ou });
      }
      hubList.appendChild(row);
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

  // privacy: people with "friends-only messages" can only be added to groups by their friends
  const isFriendUid = uid => Object.keys(reqs).some(id => reqs[id].status === "accepted" && (reqs[id].participants || []).includes(uid));

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
      players.filter(p => p.uid !== me.uid && !(p.privFriendsOnly && !isFriendUid(p.uid)) && (!term || String(p.gameName || "").toLowerCase().includes(term))).forEach(p => {
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
    $("cxTitle").textContent = ctx.title;
    $("cxAv").innerHTML = "";
    if (ctx.kind === "dm") $("cxAv").appendChild(mkAv(pOf(ctx.other), ctx.title, true, true));
    else { const a = mk("div", "chAv sm", "👥"); $("cxAv").appendChild(a); }
    $("cxLog").innerHTML = "";
    $("cxInput").value = "";
    $("cxPanel").classList.add("hidden"); panelMode = "";
    syncBtn();
    cxEl.classList.remove("hidden");
    applyTheme();
    const q = query(collection(db, ...pathOf(ctx)), orderBy("time", "desc"), limit(150));
    cx.unsubs.push(onSnapshot(q, snap => {
      cx.msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
      drawChat();
    }, () => { $("cxLog").innerHTML = ""; $("cxLog").appendChild(mk("div", "cxNote", "Messages could not load.")); }));
    if (ctx.kind === "dm") {
      cx.unsubs.push(onSnapshot(doc(db, "chats", ctx.id), d => { cx.cdata = d.exists() ? d.data() : {}; drawChat(); }, () => {}));
    }
  }
  function closeChat(silent) {
    if (rec && rec.state === "recording") { sendIt = false; try { rec.stop(); } catch (e) {} } else recReset();
    if (cx) { cx.unsubs.forEach(u => u()); cx = null; }
    try { Object.keys(voiceCache).forEach(k => { voiceCache[k].au.pause(); delete voiceCache[k]; }); } catch (e) {}
    cxEl.classList.add("hidden");
    $("cxPanel").classList.add("hidden"); panelMode = "";
    if (!silent) renderHub();
  }
  function markRead() {
    if (!cx || cx.kind !== "dm" || !myP || myP.hideRead || document.hidden) return;
    if (Date.now() - cx.lastMark < 4000) return;
    cx.lastMark = Date.now();
    setDoc(doc(db, "chats", cx.id), { ["read_" + me.uid]: Date.now() }, { merge: true }).catch(() => {});
  }
  function setLock(kind) {
    const lock = $("cxLock"), bar = cxEl.querySelector(".cxBar");
    lock.innerHTML = "";
    if (!kind) { lock.classList.add("hidden"); bar.classList.remove("hidden"); return; }
    lock.classList.remove("hidden"); bar.classList.add("hidden"); $("cxPanel").classList.add("hidden");
    if (kind === "me") {
      lock.appendChild(mk("div", "", "🚫 You blocked " + cx.title + ". They cannot message you."));
      const b = mk("button", "ghost", "Unblock"); b.type = "button"; const o = cx.other; b.onclick = () => setBlock(o, false);
      lock.appendChild(b);
    } else lock.appendChild(mk("div", "", "You cannot send messages to this person."));
  }
  // ---------- show a message ----------
  function openImg(src) { imgV.firstChild.src = src; imgV.classList.remove("hidden"); }
  function openPostFromChat(id) {
    closeChat(false);
    const nav = document.querySelector('nav button[data-tab="home"]');
    if (nav) nav.click();
    setTimeout(() => { if (window.joltOpenPost) window.joltOpenPost(id); }, 400);
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
    const blocked = blockedSet();

    if (cx.kind === "dm") {
      const byMe = blocked.has(cx.other);
      const byThem = !!(otherP && (otherP.blocked || []).includes(me.uid));
      setLock(byMe ? "me" : byThem ? "them" : "");
      const s = streakOf(cx.msgs.slice().reverse(), me.uid, cx.other);
      $("cxSub").textContent = (isOn(otherP) ? "🔵 Online" : "🔴 Offline") + (s >= 2 ? "  ·  🔥 " + s + " day streak" : "") + (dis ? "  ·  ⏱ 24h" : "");
    } else {
      setLock("");
      $("cxSub").textContent = ((cx.g && cx.g.members) || []).length + " members";
    }

    let shown = 0, lastDay = "";
    cx.msgs.forEach(m => {
      const ms = msOf(m);
      if (dis && Date.now() - ms > 86400000) return;
      if (cx.kind === "group" && blocked.has(m.from)) return;
      shown++;
      const dk = dayKey(ms);
      if (dk !== lastDay) { lastDay = dk; log.appendChild(mk("div", "cxNote day", new Date(ms).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }))); }
      const mine = m.from === me.uid;
      const t = typeof m.text === "string" ? m.text : "";
      const bare = t.indexOf("[k]") === 0 || t.indexOf("[s]") === 0;
      const row = mk("div", "cxMsg" + (mine ? " mine" : ""));
      if (!mine && cx.kind === "group") row.appendChild(mkAv(pOf(m.from), nameOf(m.from) || m.name, true, false));
      const b = mk("div", "cxB" + (bare ? " bare" : ""));
      if (!mine && cx.kind === "group") b.appendChild(mk("div", "cxN", m.from === "bot" ? "🤖 Assistant" : (nameOf(m.from) !== "Player" ? nameOf(m.from) : (m.name || "Player"))));
      if (t.indexOf("[v]") === 0) {
        b.appendChild(buildVoice(m.id || String(ms), t.slice(3)));
      } else if (t.indexOf("[s]") === 0) {
        const parts = t.slice(3).split("|");
        const st = mk("div", "", parts[0]); st.style.fontSize = "52px"; st.style.textAlign = "center";
        b.appendChild(st); if (parts[1]) b.appendChild(mk("div", "cxNote", parts[1]));
      } else if (t.indexOf("[k]") === 0) {
        const im = mk("img", "cxStk"); im.src = t.slice(3); b.appendChild(im);
      } else if (t.indexOf("[i]") === 0) {
        const im = mk("img", "cxImg"); im.src = t.slice(3); im.onclick = () => openImg(im.src); b.appendChild(im);
      } else if (t.indexOf("[p]") === 0) {
        let d = null; try { d = JSON.parse(t.slice(3)); } catch (e) {}
        if (d) {
          const card = mk("div", "cxPost");
          card.appendChild(mk("b", "", "📌 " + (d.name || "Player") + "'s post"));
          if (d.thumb) { const im = mk("img"); im.src = d.thumb; card.appendChild(im); }
          if (d.text) card.appendChild(mk("div", "", d.text));
          card.appendChild(mk("small", "", "Tap to open"));
          card.onclick = () => openPostFromChat(d.id);
          b.appendChild(card);
        } else b.appendChild(document.createTextNode("📌 Shared a post"));
      } else richText(b, t);
      // reactions
      const rc = {}; Object.values(m.reacts || {}).forEach(e => { rc[e] = (rc[e] || 0) + 1; });
      const rs = Object.keys(rc).map(e => e + (rc[e] > 1 ? " " + rc[e] : "")).join("  ");
      if (rs) b.appendChild(mk("div", "cxR", rs));
      const meta = mk("div", "cxM", new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (mine && cx.kind === "dm") {
        const read = blueOk && m.time && m.time.seconds && ms <= otherRead;
        meta.appendChild(mk("span", "tick" + (read ? " blue" : ""), read ? "✓✓" : "✓"));
      }
      b.appendChild(meta);
      onLong(b, () => openMsgMenu(m));
      row.appendChild(b);
      log.appendChild(row);
    });
    if (!shown) log.appendChild(mk("div", "cxNote", cx.kind === "dm" ? "No messages yet. Say hi 👋" : "No messages yet. Start the group chat."));
    if (nearBottom) log.scrollTop = log.scrollHeight;
    cx.first = false;
    const lastM = cx.msgs[cx.msgs.length - 1];
    if (lastM && lastM.from !== me.uid) markRead();
  }

  // ---------- message menu: react, copy, delete, report ----------
  function openMsgMenu(m) {
    if (!cx) return;
    const box = openSheet("Message");
    const rr = mk("div", "rxRow");
    REACT_SET.forEach(e => {
      const s = mk("span", "rxE" + (m.reacts && m.reacts[me.uid] === e ? " on" : ""), e);
      s.onclick = () => { closeSheet(); reactMsg(m, e); };
      rr.appendChild(s);
    });
    box.appendChild(rr);
    const t = typeof m.text === "string" ? m.text : "";
    if (isPlain(t)) {
      const c = mk("button", "opt", "📋 Copy"); c.type = "button";
      c.onclick = () => { closeSheet(); copyText(t); };
      box.appendChild(c);
    }
    if (m.from === me.uid) {
      const d = mk("button", "opt red", "🗑 Delete for everyone"); d.type = "button";
      d.onclick = async () => {
        if (!confirm("Delete this message for everyone?")) return;
        closeSheet();
        try { await deleteDoc(doc(db, ...pathOf(cx), m.id)); } catch (e) { toast("Could not delete the message."); }
      };
      box.appendChild(d);
    } else if (m.from !== "bot") {
      const r = mk("button", "opt red", "🚩 Report"); r.type = "button";
      r.onclick = () => openReport(m.from, nameOf(m.from) !== "Player" ? nameOf(m.from) : (m.name || "Player"), isPlain(t) ? t : labelOf(t));
      box.appendChild(r);
    }
    const x = mk("button", "opt", "Close"); x.type = "button"; x.onclick = closeSheet;
    box.appendChild(x);
  }
  async function reactMsg(m, e) {
    if (!cx) return;
    const same = m.reacts && m.reacts[me.uid] === e;
    try { await updateDoc(doc(db, ...pathOf(cx), m.id), { ["reacts." + me.uid]: same ? deleteField() : e }); }
    catch (err) { toast("Could not react. Try again."); }
  }
  function openReport(uid, name, snippet) {
    const box = openSheet("🚩 Report " + name);
    REPORT_WHY.forEach(r => {
      const b = mk("button", "opt", r); b.type = "button";
      b.onclick = async () => {
        try {
          await addDoc(collection(db, "reports"), { by: me.uid, byName: myName(), reason: r, time: serverTimestamp(), targetUid: uid, targetName: name, postId: "", snippet: String(snippet || "").slice(0, 120) });
          closeSheet(); toast("Thank you. The Owner will check it.");
        } catch (e) { toast("Could not send the report. Try again."); }
      };
      box.appendChild(b);
    });
    const x = mk("button", "opt", "Cancel"); x.type = "button"; x.onclick = closeSheet;
    box.appendChild(x);
  }
  async function setBlock(uid, on) {
    try {
      await updateDoc(doc(db, "players", me.uid), { blocked: on ? arrayUnion(uid) : arrayRemove(uid) });
      closeSheet(); toast(on ? "Blocked. They cannot message you." : "Unblocked.");
    } catch (e) { toast("Could not do that. Try again."); }
  }

  // ---------- phone alerts for new messages (works when Jolt is closed) ----------
  const PUSH_URL = "https://winter-glitter-2dfe.saviatim3.workers.dev";
  async function pushMsg(t, text) {
    try {
      if (!t || !me) return;
      const ids = t.kind === "dm" ? [t.other] : ((t.g && t.g.members) || []).filter(u => u !== me.uid);
      const toks = [];
      ids.forEach(u => { const p = pOf(u); ((p && p.fcmTokens) || []).forEach(k => { if (toks.indexOf(k) < 0) toks.push(k); }); });
      if (!toks.length) return;
      const idt = await auth.currentUser.getIdToken();
      const title = t.kind === "dm" ? myName() : (t.title || "Group");
      const body = (t.kind === "dm" ? "" : myName() + ": ") + labelOf(text).slice(0, 80);
      await fetch(PUSH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: idt, tokens: toks, title: title, body: "💬 " + body, url: "./" }) });
    } catch (e) {}
  }
  async function sendTo(t, text) {
    await addDoc(collection(db, ...pathOf(t)), { text: text, time: serverTimestamp(), from: me.uid, name: myName(), owner: false });
    pushMsg(t, text);
  }
  function sendError(e) {
    const gone = cx && cx.kind === "dm" && (((pOf(cx.other) || {}).blocked) || []).includes(me.uid);
    if (gone || (e && e.code === "permission-denied")) toast("You cannot send messages to this person.");
    else toast("Message not sent. Check your internet and try again.");
  }
  async function sendSpecial(text) {
    if (!cx || !me) return;
    try { await sendTo(cx, text); } catch (e) { sendError(e); }
  }
  async function sendMsg() {
    const inp = $("cxInput");
    const text = inp.value.trim();
    if (!text || !cx || !me) return;
    inp.value = ""; syncBtn();
    try { await sendTo(cx, text); }
    catch (e) { inp.value = text; syncBtn(); sendError(e); }
  }
  function syncBtn() {
    const has = $("cxInput").value.trim().length > 0;
    const recording = !!(rec && rec.state === "recording");
    $("cxSend").classList.toggle("hidden", !has || recording);
    $("cxMic").classList.toggle("hidden", has && !recording);
    $("cxAtt").classList.toggle("hidden", recording);
    $("cxEmo").classList.toggle("hidden", recording);
    $("cxBold").classList.toggle("hidden", recording);
    $("cxInput").classList.toggle("hidden", recording);
    $("cxRecBar").classList.toggle("hidden", !recording);
  }
  $("cxSend").onclick = sendMsg;
  $("cxInput").addEventListener("input", syncBtn);
  $("cxInput").addEventListener("focus", () => { $("cxPanel").classList.add("hidden"); panelMode = ""; });
  $("cxInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); sendMsg(); } });
  $("cxBack").onclick = () => closeChat(false);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && cx && cx.msgs.length) { const l = cx.msgs[cx.msgs.length - 1]; if (l.from !== me.uid) markRead(); } });

  // ---------- bold text: *like this* shows bold ----------
  function richText(box, t) {
    const re = /\*([^*\n]+)\*/g;
    let last = 0, m;
    while ((m = re.exec(t))) {
      if (m.index > last) box.appendChild(document.createTextNode(t.slice(last, m.index)));
      box.appendChild(mk("b", "bd", m[1]));
      last = m.index + m[0].length;
    }
    if (last < t.length) box.appendChild(document.createTextNode(t.slice(last)));
  }
  (function () {
    const bb = $("cxBold"), inp = $("cxInput");
    bb.addEventListener("pointerdown", e => e.preventDefault());
    bb.onclick = () => {
      const v = inp.value;
      let s = inp.selectionStart == null ? v.length : inp.selectionStart;
      let e = inp.selectionEnd == null ? s : inp.selectionEnd;
      if (e > s) {
        const sel = v.slice(s, e);
        if (sel.length > 2 && sel[0] === "*" && sel[sel.length - 1] === "*") {
          inp.value = v.slice(0, s) + sel.slice(1, -1) + v.slice(e);
          inp.setSelectionRange(s, e - 2);
        } else {
          inp.value = v.slice(0, s) + "*" + sel + "*" + v.slice(e);
          inp.setSelectionRange(s, e + 2);
        }
      } else {
        inp.value = v.slice(0, s) + "**" + v.slice(s);
        inp.setSelectionRange(s + 1, s + 1);
      }
      inp.focus(); syncBtn();
    };
  })();

  // ---------- emoji and stickers panel ----------
  function insertAtCursor(t) {
    const i = $("cxInput");
    const s = i.selectionStart == null ? i.value.length : i.selectionStart;
    const e = i.selectionEnd == null ? s : i.selectionEnd;
    i.value = i.value.slice(0, s) + t + i.value.slice(e);
    const pos = s + t.length;
    try { i.setSelectionRange(pos, pos); } catch (_) {}
    syncBtn();
  }
  function hidePanel() { $("cxPanel").classList.add("hidden"); panelMode = ""; }
  function drawPanel() {
    const p = $("cxPanel"); p.innerHTML = "";
    const tabs = mk("div", "pnTabs");
    [["emoji", "😊 Emoji"], ["stk", "🎭 Stickers"], ["my", "🖼 My stickers"]].forEach(o => {
      const b = mk("button", panelMode === o[0] ? "on" : "", o[1]); b.type = "button";
      b.onclick = () => { panelMode = o[0]; drawPanel(); };
      tabs.appendChild(b);
    });
    p.appendChild(tabs);
    const g = mk("div", "pnGrid"); p.appendChild(g);
    if (panelMode === "emoji") {
      EMOJIS.forEach(e => { const s = mk("span", "pnEm", e); s.onclick = () => insertAtCursor(e); g.appendChild(s); });
    } else if (panelMode === "stk") {
      STICKERS.forEach(st => {
        const d = mk("div", "pnStk");
        d.appendChild(mk("div", "a", st[0])); d.appendChild(mk("div", "b", st[1]));
        d.onclick = () => { hidePanel(); sendSpecial("[s]" + st[0] + "|" + st[1]); };
        g.appendChild(d);
      });
    } else {
      const add = mk("div", "pnMy", "➕"); add.onclick = () => stkFile.click(); g.appendChild(add);
      myStickers().forEach((src, i) => {
        const d = mk("div", "pnMy"); const im = mk("img"); im.src = src; d.appendChild(im);
        d.onclick = () => { hidePanel(); sendSpecial("[k]" + src); };
        onLong(d, () => { if (confirm("Remove this sticker?")) { const a = myStickers(); a.splice(i, 1); saveStickers(a); drawPanel(); } });
        g.appendChild(d);
      });
      if (!myStickers().length) g.appendChild(mk("div", "cxNote", "Tap ➕ to make a sticker from a picture on your phone. Press and hold a sticker to remove it."));
    }
  }
  $("cxEmo").onclick = () => {
    const p = $("cxPanel");
    if (!p.classList.contains("hidden")) { hidePanel(); return; }
    panelMode = panelMode || "emoji"; drawPanel(); p.classList.remove("hidden");
    $("cxInput").blur();
  };
  stkFile.onchange = () => {
    const f = stkFile.files && stkFile.files[0]; stkFile.value = "";
    readImage(f, 240, 45000, data => { const a = myStickers(); a.unshift(data); saveStickers(a); if (panelMode === "my") drawPanel(); toast("Sticker saved."); });
  };
  $("cxAtt").onclick = () => { photoFile.value = ""; photoFile.click(); };
  photoFile.onchange = () => {
    const f = photoFile.files && photoFile.files[0]; photoFile.value = "";
    readImage(f, 900, 170000, data => sendSpecial("[i]" + data));
  };

  // ---------- voice notes (WhatsApp style) ----------
  const MIC = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12h-2z"/></svg>';
  const SENDI = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>';
  const PLAYI = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSEI = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  const mmss = n => Math.floor(n / 60) + ":" + String(Math.floor(n % 60)).padStart(2, "0");
  const voiceCache = {};
  function seedOf(str) { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h) + 1; }
  function buildVoice(id, src) {
    const w = mk("div", "vn");
    const pb = mk("button", "vnP"); pb.type = "button"; pb.innerHTML = PLAYI;
    const mid = mk("div", "vnM"), wave = mk("div", "vnW"), tm = mk("div", "vnT", "0:00");
    const bars = [];
    let seed = seedOf(String(id));
    for (let k = 0; k < 28; k++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const i = mk("i"); i.style.height = (6 + (seed % 1000) / 1000 * 20) + "px";
      bars.push(i); wave.appendChild(i);
    }
    mid.appendChild(wave); mid.appendChild(tm); w.appendChild(pb); w.appendChild(mid);
    let c = voiceCache[id];
    if (!c) { const a = new Audio(); a.preload = "metadata"; a.src = src; c = voiceCache[id] = { au: a, dur: 0, fix: false }; }
    const au = c.au;
    const total = () => (isFinite(au.duration) && au.duration > 0) ? au.duration : c.dur;
    function paint() {
      const d = total();
      const p = d ? Math.min(1, au.currentTime / d) : 0;
      bars.forEach((b, i) => b.classList.toggle("on", p > 0 && (i + 1) / bars.length <= p + 0.02));
      tm.textContent = mmss(au.currentTime > 0 && !au.ended ? au.currentTime : d);
      pb.innerHTML = au.paused ? PLAYI : PAUSEI;
    }
    function getDur() {
      if (isFinite(au.duration) && au.duration > 0) { c.dur = au.duration; paint(); return; }
      if (c.fix) return;
      c.fix = true; au.currentTime = 1e101;
      const f = () => { au.removeEventListener("timeupdate", f); au.currentTime = 0; c.fix = false; if (isFinite(au.duration)) c.dur = au.duration; paint(); };
      au.addEventListener("timeupdate", f);
    }
    au.onloadedmetadata = getDur; au.ondurationchange = paint;
    au.onplay = paint; au.onpause = paint; au.ontimeupdate = paint;
    au.onended = () => { au.currentTime = 0; paint(); };
    if (au.readyState >= 1) getDur(); else paint();
    pb.onclick = () => {
      if (au.paused) {
        Object.keys(voiceCache).forEach(k => { if (voiceCache[k].au !== au) voiceCache[k].au.pause(); });
        au.play().catch(() => toast("Could not play this voice note."));
      } else au.pause();
    };
    wave.onclick = e => { const r = wave.getBoundingClientRect(), d = total(); if (d && r.width) { au.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d; paint(); } };
    return w;
  }

  let rec = null, chunks = [], stream = null, rtimer = null, secs = 0, sendIt = true, recTarget = null;
  let locked = false, holding = false, downAt = 0, x0 = 0, starting = false, pendingUp = false, tapSend = false, recAt = 0;
  const mic = $("cxMic"); mic.innerHTML = MIC;
  mic.addEventListener("contextmenu", e => e.preventDefault());
  function recReset() {
    clearInterval(rtimer); rtimer = null; secs = 0;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    mic.innerHTML = MIC; mic.classList.remove("recOn", "hold");
    $("cxRecX").classList.add("hidden"); $("cxRecBar").classList.add("hidden"); $("cxRecH").style.opacity = "1";
    rec = null; chunks = []; locked = false; holding = false; starting = false; pendingUp = false; tapSend = false;
    syncBtn();
  }
  async function recStart() {
    if (!cx) return false;
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast("Voice notes do not work in this browser."); return false; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { toast("Microphone is blocked. Allow the microphone for Jolt in your phone settings."); return false; }
    let type = "";
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].some(t => { if (MediaRecorder.isTypeSupported(t)) { type = t; return true; } return false; });
    try { rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 }); }
    catch (e) { rec = new MediaRecorder(stream); }
    recTarget = { kind: cx.kind, id: cx.id, other: cx.other, g: cx.g, title: cx.title };
    chunks = []; sendIt = true;
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const keep = sendIt, parts = chunks, mime = rec && rec.mimeType ? rec.mimeType : "audio/webm", target = recTarget, tooShort = (Date.now() - recAt) < 700;
      recReset();
      if (!keep || !parts.length || !target) return;
      if (tooShort) { toast("Too short. Hold the button and speak, or tap once and speak."); return; }
      const blob = new Blob(parts, { type: mime });
      if (blob.size > 600000) { toast("That voice note is too long. Keep it under 1 minute."); return; }
      const fr = new FileReader();
      fr.onload = async () => { try { await sendTo(target, "[v]" + fr.result); } catch (e) { sendError(e); } };
      fr.readAsDataURL(blob);
    };
    rec.start();
    secs = 0; recAt = Date.now();
    mic.classList.add("recOn"); if (holding) mic.classList.add("hold");
    $("cxRecT").textContent = "0:00"; $("cxRecH").textContent = "‹ Slide to cancel"; $("cxRecH").style.opacity = "1";
    hidePanel(); syncBtn();
    try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) {}
    rtimer = setInterval(() => {
      secs++;
      $("cxRecT").textContent = mmss(secs);
      if (secs >= 60 && rec && rec.state === "recording") { sendIt = true; rec.stop(); }
    }, 1000);
    return true;
  }
  function handleUp(d) {
    if (!rec || rec.state !== "recording") return;
    if (d >= 500) { sendIt = true; rec.stop(); }
    else { locked = true; mic.classList.remove("hold"); mic.innerHTML = SENDI; $("cxRecX").classList.remove("hidden"); $("cxRecH").textContent = "Recording... tap the arrow to send"; $("cxRecH").style.opacity = "1"; }
  }
  mic.addEventListener("pointerdown", async e => {
    e.preventDefault();
    if (rec && rec.state === "recording") { tapSend = true; return; }
    if (starting) return;
    holding = true; downAt = Date.now(); x0 = e.clientX; pendingUp = false; starting = true;
    try { mic.setPointerCapture(e.pointerId); } catch (_) {}
    const ok = await recStart();
    starting = false;
    if (!ok) { holding = false; return; }
    if (pendingUp) { pendingUp = false; holding = false; handleUp(0); }
  });
  mic.addEventListener("pointermove", e => {
    if (!holding || locked || !rec || rec.state !== "recording") return;
    const dx = x0 - e.clientX;
    $("cxRecH").style.opacity = String(Math.max(0.25, 1 - dx / 120));
    if (dx > 110) { holding = false; sendIt = false; rec.stop(); toast("Voice note canceled"); }
  });
  function micUp() {
    if (tapSend) { tapSend = false; if (rec && rec.state === "recording") { sendIt = true; rec.stop(); } return; }
    if (!holding) return;
    const d = Date.now() - downAt;
    if (starting) { pendingUp = true; return; }
    holding = false; mic.classList.remove("hold");
    handleUp(d);
  }
  mic.addEventListener("pointerup", micUp);
  mic.addEventListener("pointercancel", micUp);
  $("cxRecX").onclick = () => { sendIt = false; if (rec && rec.state === "recording") rec.stop(); else recReset(); };

  // ---------- share a post to a chat (used by the For You page) ----------
  function thumbOf(src) {
    return new Promise(res => {
      if (!src || String(src).indexOf("data:image/") !== 0) return res("");
      const im = new Image();
      im.onload = () => res(shrink(im, 200, 16000));
      im.onerror = () => res("");
      im.src = src;
    });
  }
  function openShareSheet(post) {
    const box = openSheet("📤 Send to a friend");
    const targets = [];
    friendIds().forEach(id => { const ou = reqs[id].participants.find(x => x !== me.uid); targets.push({ kind: "dm", id: id, other: ou, title: nameOf(ou) }); });
    groups.forEach(g => targets.push({ kind: "group", id: g.id, title: g.name || "Group", g: g }));
    if (!targets.length) box.appendChild(mk("div", "chEmpty", "No friends or groups yet. Send a friend request first."));
    const payload = thumbOf(post.img).then(th => "[p]" + JSON.stringify({ id: post.id, uid: post.uid, name: post.name || "Player", text: String(post.text || "").slice(0, 90), thumb: th }));
    targets.forEach(t => {
      const row = mk("div", "rq");
      if (t.kind === "dm") row.appendChild(mkAv(pOf(t.other), t.title, true, false)); else row.appendChild(mk("div", "chAv sm", "👥"));
      const mid = mk("div", "chMid"); mid.appendChild(mk("b", "", t.title)); row.appendChild(mid);
      const b = mk("button", "green", "Send"); b.type = "button";
      b.onclick = async () => {
        b.disabled = true; b.textContent = "...";
        try { await sendTo(t, await payload); b.textContent = "Sent ✓"; }
        catch (e) { b.disabled = false; b.textContent = "Send"; toast("Could not send. Try again."); }
      };
      row.appendChild(b);
      box.appendChild(row);
    });
    const x = mk("button", "opt", "Close"); x.type = "button"; x.onclick = closeSheet;
    box.appendChild(x);
  }
  window.joltSharePost = post => { if (!me) return; openShareSheet(post); };

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
    const wpo = mk("button", "opt", "🎨 Wallpaper"); wpo.type = "button";
    wpo.onclick = () => { closeSheet(); const wb = $("wpBtnChat"); if (wb) wb.click(); else toast("Wallpaper is not ready. Close and open Jolt again."); };
    const cco = mk("button", "opt", "🖍 Chat colors"); cco.type = "button";
    cco.onclick = openColors;
    box.appendChild(wpo); box.appendChild(cco);
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
      const other = cx.other, oname = cx.title;
      const isB = blockedSet().has(other);
      const bl = mk("button", "opt red", isB ? "✅ Unblock " + oname : "🚫 Block " + oname); bl.type = "button";
      bl.onclick = () => {
        if (isB) { setBlock(other, false); return; }
        if (confirm("Block " + oname + "? They will not be able to message you.")) setBlock(other, true);
      };
      box.appendChild(bl);
      const rp = mk("button", "opt red", "🚩 Report " + oname); rp.type = "button";
      rp.onclick = () => openReport(other, oname, "");
      box.appendChild(rp);
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

  // ---------- wallpaper colors + color picker ----------
  // [my bubble, my text, their bubble, their text] for each wallpaper (like Messenger)
  const WPT = {
    web: ["#e62429", "#ffffff", "#14245e", "#ffffff"],
    ninja: ["#ff7a1a", "#ffffff", "#2a1440", "#ffffff"],
    fire: ["#ff4d00", "#ffffff", "#3a0f08", "#ffe9d6"],
    ops: ["#16a34a", "#ffffff", "#0e3320", "#c8ffe0"],
    neon: ["#ff2d95", "#ffffff", "#2b0a45", "#ffe6f5"],
    galaxy: ["#7c3aed", "#ffffff", "#1e1b4b", "#e9e5ff"],
    naija: ["#008751", "#ffffff", "#f1f5f1", "#0b2a1a"]
  };
  const colKey = "jolt_cx_cols";
  function colorPrefs() { try { return JSON.parse(localStorage.getItem(colKey) || "{}") || {}; } catch (e) { return {}; } }
  function applyTheme() {
    let id = "none"; try { id = localStorage.getItem("wp") || "none"; } catch (e) {}
    const base = WPT[id] || (id === "none" ? null : ["", "#ffffff", "rgba(0,0,0,.6)", "#ffffff"]);
    const c = colorPrefs();
    const set = (k, v) => { if (v) cxEl.style.setProperty(k, v); else cxEl.style.removeProperty(k); };
    set("--cx-me-bg", c.meBg || (base && base[0]) || "");
    set("--cx-me-tx", c.meTx || (base && base[1]) || "");
    set("--cx-th-bg", c.thBg || (base && base[2]) || "");
    set("--cx-th-tx", c.thTx || (base && base[3]) || "");
    cxEl.classList.toggle("hasWp", id !== "none");
  }
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  applyTheme();
  function openColors() {
    const box = openSheet("🖍 Chat colors");
    box.appendChild(mk("div", "chEmpty", "These colors show on your phone only."));
    const rows = [["meBg", "My bubble", "#1d9bf0"], ["meTx", "My text", "#ffffff"], ["thBg", "Their bubble", "#2f3336"], ["thTx", "Their text", "#ffffff"]];
    rows.forEach(r => {
      const row = mk("div", "clr"); row.appendChild(mk("span", "", r[1]));
      const inp = document.createElement("input"); inp.type = "color";
      const cur = colorPrefs()[r[0]];
      inp.value = /^#[0-9a-f]{6}$/i.test(cur || "") ? cur : r[2];
      inp.oninput = () => { const p = colorPrefs(); p[r[0]] = inp.value; try { localStorage.setItem(colKey, JSON.stringify(p)); } catch (e) {} applyTheme(); };
      row.appendChild(inp); box.appendChild(row);
    });
    const wb = mk("button", "opt", "🎨 Change wallpaper"); wb.type = "button";
    wb.onclick = () => { closeSheet(); const b = $("wpBtnChat"); if (b) b.click(); };
    const rs = mk("button", "opt", "↺ Match the wallpaper (reset my colors)"); rs.type = "button";
    rs.onclick = () => { try { localStorage.removeItem(colKey); } catch (e) {} applyTheme(); closeSheet(); toast("Colors reset."); };
    const x = mk("button", "opt", "Done"); x.type = "button"; x.onclick = closeSheet;
    box.appendChild(wb); box.appendChild(rs); box.appendChild(x);
  }

  // ---------- search bar on the For You page ----------
  (function () {
    const home = $("tab-home"); if (!home || $("jSrch")) return;
    const bar = mk("div"); bar.id = "jSrch";
    bar.innerHTML = '<div class="jsIn"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/></svg><span>Search people, posts, #tags</span></div>';
    home.insertBefore(bar, home.firstChild);
    const pan = mk("div", "hidden"); pan.id = "jSrchP";
    pan.innerHTML = '<div class="jsHead"><button id="jsBack" type="button" aria-label="Back">←</button><input id="jsInp" type="search" placeholder="Search people, posts, #tags" maxlength="40" autocomplete="off"></div><div id="jsRes"></div>';
    document.body.appendChild(pan);
    let cache = [], cacheAt = 0, loading = null, timer = null;
    function loadPosts() {
      if (cache.length && Date.now() - cacheAt < 90000) return Promise.resolve(cache);
      if (loading) return loading;
      loading = getDocs(query(collection(db, "posts"), orderBy("time", "desc"), limit(80)))
        .then(sn => { cache = sn.docs.map(d => ({ id: d.id, ...d.data() })); cacheAt = Date.now(); loading = null; return cache; })
        .catch(() => { loading = null; return cache; });
      return loading;
    }
    function closeS() { pan.classList.add("hidden"); $("jsInp").blur(); }
    function openS() { pan.classList.remove("hidden"); render(""); loadPosts().then(() => { if (!$("jsInp").value.trim()) render(""); }); setTimeout(() => $("jsInp").focus(), 60); }
    bar.onclick = openS;
    $("jsBack").onclick = closeS;
    function goPerson(p) {
      closeS();
      const nav = document.querySelector('nav button[data-tab="players"]'); if (nav) nav.click();
      const si = $("playerSearch"); if (si) { si.value = p.gameName || ""; si.dispatchEvent(new Event("input")); }
    }
    function goPost(p) {
      closeS();
      if (window.joltOpenPost) setTimeout(() => window.joltOpenPost(p.id), 150); else toast("Open this post from the feed.");
    }
    function render(term) {
      const res = $("jsRes"); res.innerHTML = "";
      if (!term) {
        res.appendChild(mk("div", "chEmpty", "Search a name, a word in a post, or a #hashtag."));
        const counts = {};
        cache.forEach(p => { (String(p.text || "").match(/#[\w]+/g) || []).forEach(h => { const k = h.toLowerCase(); counts[k] = (counts[k] || 0) + 1; }); });
        const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 10);
        if (top.length) {
          res.appendChild(mk("div", "jsH", "Trending hashtags"));
          const wrap = mk("div", "jsTags");
          top.forEach(h => { const b = mk("button", "", h); b.type = "button"; b.onclick = () => { $("jsInp").value = h; run(); }; wrap.appendChild(b); });
          res.appendChild(wrap);
        }
        return;
      }
      const t = term.toLowerCase().replace(/^@/, "");
      const isTag = t.charAt(0) === "#";
      const blocked = blockedSet();
      if (!isTag) {
        const ppl = players.filter(p => me && p.uid !== me.uid && (String(p.gameName || "").toLowerCase().includes(t) || String(p.gameUid || "").toLowerCase().includes(t))).slice(0, 6);
        if (ppl.length) {
          res.appendChild(mk("div", "jsH", "People"));
          ppl.forEach(p => {
            const row = mk("div", "jsRow"); row.appendChild(mkAv(p, p.gameName || "Player", true, true));
            const mid = mk("div", "jsMid"); mid.appendChild(mk("b", "", p.gameName || "Player")); mid.appendChild(mk("span", "", isOn(p) ? "Online" : "Offline"));
            row.appendChild(mid); row.onclick = () => goPerson(p); res.appendChild(row);
          });
        }
      }
      const found = cache.filter(p => !p.bot && !blocked.has(p.uid) && (String(p.text || "").toLowerCase().includes(t) || (!isTag && String(p.name || "").toLowerCase().includes(t)))).slice(0, 20);
      res.appendChild(mk("div", "jsH", "Posts"));
      if (!cache.length && loading) res.appendChild(mk("div", "chEmpty", "Searching posts..."));
      else if (!found.length) res.appendChild(mk("div", "chEmpty", "No posts found for that."));
      found.forEach(p => {
        const row = mk("div", "jsRow");
        if (p.img && String(p.img).indexOf("data:image/") === 0) { const im = mk("img"); im.loading = "lazy"; im.src = p.img; row.appendChild(im); }
        const mid = mk("div", "jsMid"); mid.appendChild(mk("b", "", p.name || "Player")); mid.appendChild(mk("span", "", String(p.text || "").slice(0, 120) || "📷 Photo"));
        row.appendChild(mid); row.onclick = () => goPost(p); res.appendChild(row);
      });
    }
    function run() {
      const v = $("jsInp").value.trim();
      render(v);
      if (v) loadPosts().then(() => { if ($("jsInp").value.trim() === v) render(v); });
    }
    $("jsInp").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  })();

  // ---------- data ----------
  function stopAll() {
    unsubs.forEach(u => u()); unsubs = [];
    Object.keys(lastUnsubs).forEach(k => lastUnsubs[k]());
    lastUnsubs = {}; lastMsgs = {};
    if (cx) closeChat(true);
    players = []; reqs = {}; groups = []; myP = null; me = null;
    hubTop.innerHTML = ""; hubList.innerHTML = ""; hubQ.value = "";
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
    unsubs.push((function () { const t = setInterval(() => { renderHub(); if (cx && !(rec && rec.state === "recording")) drawChat(); }, 60000); return () => clearInterval(t); })());
  });
})();
