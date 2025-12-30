/* PackPop: coins-only pack opener + collection
   Saves in localStorage. No real money features.
*/

const STORE_KEY = "packpop_save_v1";

const RARITIES = ["Common", "Rare", "Epic", "Legendary"];
const RARITY_RANK = { Common: 1, Rare: 2, Epic: 3, Legendary: 4 };

const DUST_FROM_DUP = { Common: 1, Rare: 5, Epic: 18, Legendary: 60 };
const CRAFT_COST = { Common: 20, Rare: 80, Epic: 240, Legendary: 700 };

const PACKS = {
  common: { cost: 100, pulls: 5, odds: { Common: 0.80, Rare: 0.17, Epic: 0.027, Legendary: 0.003 } },
  rare:   { cost: 250, pulls: 5, odds: { Common: 0.60, Rare: 0.34, Epic: 0.05,  Legendary: 0.01  } },
  epic:   { cost: 500, pulls: 5, odds: { Common: 0.40, Rare: 0.45, Epic: 0.13,  Legendary: 0.02  } },
};

// Simple starter “set”
const CARD_SET = [
  // Common
  { id:"c01", name:"Street Racer", rarity:"Common" },
  { id:"c02", name:"Pit Crew", rarity:"Common" },
  { id:"c03", name:"Fresh Tires", rarity:"Common" },
  { id:"c04", name:"Night Lap", rarity:"Common" },
  { id:"c05", name:"Draft Boost", rarity:"Common" },
  { id:"c06", name:"Corner King", rarity:"Common" },
  { id:"c07", name:"Fuel Saver", rarity:"Common" },
  { id:"c08", name:"Clean Overcut", rarity:"Common" },

  // Rare
  { id:"r01", name:"Turbo Spool", rarity:"Rare" },
  { id:"r02", name:"Late Braker", rarity:"Rare" },
  { id:"r03", name:"Pole Position", rarity:"Rare" },
  { id:"r04", name:"Safety Car", rarity:"Rare" },
  { id:"r05", name:"Perfect Apex", rarity:"Rare" },

  // Epic
  { id:"e01", name:"Rain Master", rarity:"Epic" },
  { id:"e02", name:"Strategy Genius", rarity:"Epic" },
  { id:"e03", name:"Triple Overtake", rarity:"Epic" },

  // Legendary
  { id:"l01", name:"World Champion", rarity:"Legendary" },
  { id:"l02", name:"Unbeatable Lap", rarity:"Legendary" },
];

const byId = Object.fromEntries(CARD_SET.map(c => [c.id, c]));
const byRarity = (rar) => CARD_SET.filter(c => c.rarity === rar);

const ui = {
  coins: document.getElementById("coins"),
  dust: document.getElementById("dust"),
  openingArea: document.getElementById("openingArea"),
  collection: document.getElementById("collection"),
  craftGrid: document.getElementById("craftGrid"),
  toast: document.getElementById("toast"),

  btnDaily: document.getElementById("btnDaily"),
  dailyInfo: document.getElementById("dailyInfo"),
  btnTap: document.getElementById("btnTap"),
  tapCount: document.getElementById("tapCount"),
  packsToday: document.getElementById("packsToday"),

  btnSave: document.getElementById("btnSave"),
  btnReset: document.getElementById("btnReset"),

  filterRarity: document.getElementById("filterRarity"),
  sortBy: document.getElementById("sortBy"),
};

let state = load() ?? freshState();
renderAll();

document.querySelectorAll("button[data-pack]").forEach(btn => {
  btn.addEventListener("click", () => openPack(btn.dataset.pack));
});

ui.btnDaily.addEventListener("click", claimDaily);
ui.btnTap.addEventListener("click", tapQuest);
ui.btnSave.addEventListener("click", () => { save(); toast("Saved."); });
ui.btnReset.addEventListener("click", resetAll);

ui.filterRarity.addEventListener("change", renderCollection);
ui.sortBy.addEventListener("change", renderCollection);

/* ---------- State ---------- */

function freshState(){
  const owned = {};
  CARD_SET.forEach(c => { owned[c.id] = 0; });

  return {
    coins: 600,            // starter coins
    dust: 0,
    owned,
    taps: 0,
    packsOpenedToday: 0,
    daily: { lastClaimDay: null, streak: 0 },
    lastOpenDay: dayKey(new Date()),
  };
}

function dayKey(d){
  // local day key like 2025-12-30
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    // basic validation
    if(typeof parsed?.coins !== "number" || typeof parsed?.dust !== "number") return null;
    if(!parsed.owned) return null;
    // ensure new cards get added if set expands
    CARD_SET.forEach(c => { if(parsed.owned[c.id] == null) parsed.owned[c.id] = 0; });
    return parsed;
  }catch{
    return null;
  }
}

function save(){
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function resetAll(){
  if(!confirm("Reset all progress?")) return;
  state = freshState();
  save();
  renderAll();
  toast("Reset complete.");
}

/* ---------- RNG ---------- */

function rand01(){
  // crypto-strong random 0..1
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / 4294967296;
}

function pickRarity(odds){
  const r = rand01();
  let cum = 0;
  for(const rar of RARITIES){
    cum += odds[rar] ?? 0;
    if(r <= cum) return rar;
  }
  // fallback
  return "Common";
}

function pickCard(rarity){
  const pool = byRarity(rarity);
  const i = Math.floor(rand01() * pool.length);
  return pool[Math.min(i, pool.length - 1)];
}

/* ---------- Economy / Quests ---------- */

function rollDay(){
  const today = dayKey(new Date());

  // reset "today" counters if new day
  if(state.lastOpenDay !== today){
    state.lastOpenDay = today;
    state.packsOpenedToday = 0;
    state.taps = 0;
  }
}

function claimDaily(){
  rollDay();
  const today = dayKey(new Date());

  if(state.daily.lastClaimDay === today){
    toast("Daily already claimed.");
    return;
  }

  // streak logic: if last claim was yesterday, streak +1 else reset to 1
  const last = state.daily.lastClaimDay;
  const yesterday = dayKey(new Date(Date.now() - 86400000));

  if(last === yesterday) state.daily.streak = Math.min(state.daily.streak + 1, 30);
  else state.daily.streak = 1;

  state.daily.lastClaimDay = today;

  const base = 250;
  const bonus = Math.floor(state.daily.streak * 8);
  const reward = base + bonus;

  state.coins += reward;
  save();
  renderAll();
  toast(`Daily claimed: +${reward} coins (streak ${state.daily.streak})`);
}

function tapQuest(){
  rollDay();
  state.taps += 1;
  if(state.taps >= 25){
    state.taps = 0;
    state.coins += 120;
    toast("Quest complete: +120 coins");
  }
  save();
  renderAll();
}

/* ---------- Packs ---------- */

function openPack(packKey){
  rollDay();

  const pack = PACKS[packKey];
  if(!pack){
    toast("Unknown pack.");
    return;
  }
  if(state.coins < pack.cost){
    toast("Not enough coins.");
    return;
  }

  state.coins -= pack.cost;

  const pulls = [];
  for(let i=0;i<pack.pulls;i++){
    const rar = pickRarity(pack.odds);
    const card = pickCard(rar);
    pulls.push(card);

    const had = state.owned[card.id] ?? 0;
    if(had >= 1){
      // duplicate => dust
      const dustGain = DUST_FROM_DUP[card.rarity] ?? 1;
      state.dust += dustGain;
    }
    state.owned[card.id] = had + 1;
  }

  state.packsOpenedToday += 1;

  // quest reward for opening 3 packs today (only once per day)
  if(state.packsOpenedToday === 3){
    state.coins += 150;
    toast("Quest complete: Open 3 packs today (+150 coins)");
  }

  save();
  renderAll();
  renderOpening(pulls, packKey);
}

/* ---------- Crafting ---------- */

function craft(cardId){
  rollDay();
  const card = byId[cardId];
  if(!card) return;

  const cost = CRAFT_COST[card.rarity] ?? 9999;
  if(state.dust < cost){
    toast("Not enough dust.");
    return;
  }

  state.dust -= cost;
  state.owned[card.id] = (state.owned[card.id] ?? 0) + 1;

  save();
  renderAll();
  toast(`Crafted: ${card.name}`);
}

/* ---------- Rendering ---------- */

function renderAll(){
  rollDay();
  ui.coins.textContent = Math.floor(state.coins);
  ui.dust.textContent = Math.floor(state.dust);

  ui.tapCount.textContent = state.taps;
  ui.packsToday.textContent = state.packsOpenedToday;

  renderDailyInfo();
  renderCollection();
  renderCrafting();
}

function renderDailyInfo(){
  const today = dayKey(new Date());
  const claimed = state.daily.lastClaimDay === today;
  ui.dailyInfo.textContent = claimed
    ? `Claimed • streak ${state.daily.streak}`
    : `Ready • streak ${state.daily.streak || 0}`;
}

function raritySort(a,b){
  return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || a.name.localeCompare(b.name);
}

function renderCollection(){
  const filter = ui.filterRarity.value;
  const sortBy = ui.sortBy.value;

  let items = CARD_SET.map(c => ({
    ...c,
    count: state.owned[c.id] ?? 0
  }));

  if(filter !== "all"){
    items = items.filter(x => x.rarity === filter);
  }

  if(sortBy === "name"){
    items.sort((a,b) => a.name.localeCompare(b.name));
  }else if(sortBy === "owned"){
    items.sort((a,b) => (b.count - a.count) || raritySort(a,b));
  }else{
    items.sort(raritySort);
  }

  ui.collection.innerHTML = "";
  for(const c of items){
    const tile = document.createElement("div");
    tile.className = "cardTile";
    tile.innerHTML = `
      <div class="glow"></div>
      <div class="name">${escapeHtml(c.name)}</div>
      <div class="meta">
        <span class="badge ${c.rarity}">${c.rarity}</span>
      </div>
      <div class="cOwned">
        <div class="count">Owned: ${c.count}</div>
        <div class="dustVal">Dup → +${DUST_FROM_DUP[c.rarity]} dust</div>
      </div>
    `;
    ui.collection.appendChild(tile);
  }
}

function renderCrafting(){
  // show top 6 craftable targets (prioritize not-owned + higher rarity)
  let items = CARD_SET.map(c => ({
    ...c,
    count: state.owned[c.id] ?? 0,
    cost: CRAFT_COST[c.rarity] ?? 9999
  }));

  items.sort((a,b) => {
    const aNeed = a.count === 0 ? 1 : 0;
    const bNeed = b.count === 0 ? 1 : 0;
    return (bNeed - aNeed) || (RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]) || a.name.localeCompare(b.name);
  });

  items = items.slice(0, 6);

  ui.craftGrid.innerHTML = "";
  for(const c of items){
    const can = state.dust >= c.cost;
    const el = document.createElement("div");
    el.className = "cardTile";
    el.innerHTML = `
      <div class="glow"></div>
      <div class="name">${escapeHtml(c.name)}</div>
      <div class="meta">
        <span class="badge ${c.rarity}">${c.rarity}</span>
        <span class="muted small" style="margin-left:8px;">Cost: <b>${c.cost}</b> dust</span>
      </div>
      <div class="cOwned">
        <div class="muted small">Owned: <b>${c.count}</b></div>
        <button class="btn ${can ? "" : "ghost"}" ${can ? "" : "disabled"} data-craft="${c.id}">
          Craft
        </button>
      </div>
    `;
    ui.craftGrid.appendChild(el);
  }

  ui.craftGrid.querySelectorAll("button[data-craft]").forEach(btn => {
    btn.addEventListener("click", () => craft(btn.dataset.craft));
  });
}

function renderOpening(pulls, packKey){
  const best = pulls.reduce((m,c)=> RARITY_RANK[c.rarity] > RARITY_RANK[m.rarity] ? c : m, pulls[0]);
  const header = document.createElement("div");
  header.className = "muted small";
  header.textContent = `Opened ${packKey.toUpperCase()} pack • Best pull: ${best.rarity} (${best.name})`;

  const row = document.createElement("div");
  row.className = "revealRow";

  for(const c of pulls){
    const tile = document.createElement("div");
    tile.className = "cardTile";
    tile.innerHTML = `
      <div class="glow"></div>
      <div class="name">${escapeHtml(c.name)}</div>
      <div class="meta">
        <span class="badge ${c.rarity}">${c.rarity}</span>
      </div>
      <div class="muted small" style="margin-top:10px">
        ${state.owned[c.id] > 1 ? `Duplicate → +${DUST_FROM_DUP[c.rarity]} dust` : `New card!`}
      </div>
    `;
    row.appendChild(tile);
  }

  ui.openingArea.innerHTML = "";
  ui.openingArea.appendChild(header);
  ui.openingArea.appendChild(row);
}

/* ---------- Helpers ---------- */

let toastTimer = null;
function toast(msg){
  ui.toast.textContent = msg;
  ui.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> ui.toast.classList.remove("show"), 1600);
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
