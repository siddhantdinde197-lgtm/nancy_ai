const $ = (s) => document.querySelector(s);

const STORE = {
  key: "siddhant_api_key",
  lang: "siddhant_lang",
  auto: "siddhant_auto",
};

const state = {
  status: "idle", // idle | listening | thinking | speaking
  history: [],
  recog: null,
};

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

/* ---------------------------------------------------------- helpers */
function getKey() { return localStorage.getItem(STORE.key) || ""; }
function getLang() { return localStorage.getItem(STORE.lang) || "en-IN"; }
function autoListen() { return localStorage.getItem(STORE.auto) !== "0"; }

function toast(msg, ms = 4000) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

const STATUS_TEXT = {
  idle: "Tap the orb and start talking",
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Speaking. Tap to interrupt",
};

function setStatus(s) {
  state.status = s;
  $("#orb").dataset.state = s;
  $("#status").textContent = STATUS_TEXT[s];
  if (s !== "listening") $("#live").textContent = "";
}

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + (role === "user" ? "user" : "ai");
  div.textContent = text;
  const log = $("#log");
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

/* ---------------------------------------------------------- listening */
function listen() {
  if (!SR) {
    toast("Voice input needs Chrome or Edge. You can still type.");
    return;
  }
  if (!getKey()) {
    openDrawer();
    toast("Add or generate an API key first.");
    return;
  }
  stopSpeaking();

  const r = new SR();
  r.lang = getLang();
  r.interimResults = true;
  r.continuous = false;

  let finalText = "";
  r.onstart = () => setStatus("listening");
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    $("#live").textContent = finalText + interim;
  };
  r.onerror = (e) => {
    if (e.error === "not-allowed") toast("Microphone blocked. Allow mic access in the browser.");
    else if (e.error !== "no-speech" && e.error !== "aborted") toast("Mic error: " + e.error);
  };
  r.onend = () => {
    if (finalText.trim()) send(finalText.trim());
    else if (state.status === "listening") setStatus("idle");
  };

  state.recog = r;
  try { r.start(); } catch (_) { /* already started */ }
}

function stopListening() {
  if (state.recog) { try { state.recog.abort(); } catch (_) {} }
}

/* ---------------------------------------------------------- speaking */
function cleanForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#`>~]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "link")
    .trim();
}

function pickVoice(lang) {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang.startsWith(lang.split("-")[0])) ||
    null
  );
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    setStatus("idle");
    return;
  }
  const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
  u.lang = getLang();
  const v = pickVoice(u.lang);
  if (v) u.voice = v;
  u.rate = 1;
  u.onstart = () => setStatus("speaking");
  u.onend = () => {
    setStatus("idle");
    if (autoListen()) listen();
  };
  u.onerror = () => setStatus("idle");
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

/* ---------------------------------------------------------- chat */
async function send(text) {
  addMsg("user", text);
  state.history.push({ role: "user", content: text });
  setStatus("thinking");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": getKey() },
      body: JSON.stringify({ messages: state.history.slice(-20) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);

    state.history.push({ role: "assistant", content: data.reply });
    addMsg("ai", data.reply);
    speak(data.reply);
  } catch (err) {
    state.history.pop(); // keep user/assistant turns alternating
    setStatus("idle");
    toast(err.message || "Something went wrong.");
  }
}

/* ---------------------------------------------------------- UI wiring */
$("#orb").addEventListener("click", () => {
  if (state.status === "idle") listen();
  else if (state.status === "listening") { stopListening(); setStatus("idle"); }
  else if (state.status === "speaking") { stopSpeaking(); setStatus("idle"); }
});

$("#textForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#textInput").value.trim();
  if (!v) return;
  if (!getKey()) { openDrawer(); toast("Add or generate an API key first."); return; }
  $("#textInput").value = "";
  send(v);
});

function openDrawer() { $("#drawer").hidden = false; }
function closeDrawer() { $("#drawer").hidden = true; }
$("#settingsBtn").addEventListener("click", openDrawer);
$("#closeBtn").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

$("#saveKey").addEventListener("click", () => {
  const k = $("#apiKey").value.trim();
  if (!k) return toast("Paste your API key first.");
  localStorage.setItem(STORE.key, k);
  toast("API key saved.");
  closeDrawer();
});

$("#genKey").addEventListener("click", async () => {
  const pw = $("#adminPw").value;
  if (!pw) return toast("Enter the admin password from backend/.env");
  try {
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Password": pw },
      body: JSON.stringify({ label: $("#keyLabel").value.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);

    $("#newKey").textContent = data.api_key;
    $("#newKeyBox").hidden = false;
    $("#apiKey").value = data.api_key;
    localStorage.setItem(STORE.key, data.api_key);
    toast("New key created and saved in this browser.");
  } catch (err) {
    toast(err.message);
  }
});

$("#lang").addEventListener("change", (e) => localStorage.setItem(STORE.lang, e.target.value));
$("#autoListen").addEventListener("change", (e) =>
  localStorage.setItem(STORE.auto, e.target.checked ? "1" : "0")
);

/* ---------------------------------------------------------- init */
$("#lang").value = getLang();
$("#autoListen").checked = autoListen();
$("#apiKey").value = getKey();
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => {};
if (!SR) toast("Voice input works in Chrome or Edge. Typing works everywhere.", 6000);
setStatus("idle");
