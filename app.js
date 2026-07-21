/* =========================================================
   Trade Journal — Portfolio P&L Analytics & Trade Journal
   - เก็บข้อมูลใน localStorage (cache บนอุปกรณ์)
   - ดึงราคา BTC/Gold อัตโนมัติ + FX (USD/THB) พร้อม timeout & fallback
   - คำนวณ P&L แบบ FIFO แยก Realized / Unrealized (จัดการกรณีขายเกินคงเหลือ)
   - ตรวจสอบข้อมูลนำเข้า (non-negative), Safe DOM binding, robust rounding
   - Export / Import JSON + CSV
   ========================================================= */
(() => {
  "use strict";

  const LS_KEY = "tradeJournal.v1";
  const LS_PREF = "tradeJournal.pref";
  const LS_MKT = "tradeJournal.market";
  let store = null; // storage layer (localforage/IndexedDB หรือ fallback localStorage)

  // ---------- State ----------
  let state = { txs: [] };
  let pref = { displayCcy: "THB", side: "buy", filter: "all", autoRefresh: false, theme: "dark",
    includeExitFee: false, exitFeePct: 0.25, equityRange: "ALL" };
  let market = {
    btc: { usd: null, thb: null },
    gold: { usd: null, thb: null }, // ต่อ 1 troy ounce
    fx: null,                       // THB ต่อ 1 USD
    ts: null
  };
  let pnlChart = null, allocChart = null, autoTimer = null;

  // ---------- DOM helpers ----------
  const $ = (s) => document.querySelector(s);
  const el = {};
  const fmt = (n, ccy) => {
    if (n == null || isNaN(n)) return "—";
    const sym = ccy === "USD" ? "$" : "฿";
    return sym + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const fmtQty = (n) => n == null || isNaN(n) ? "—" :
    Number(n).toLocaleString("en-US", { maximumFractionDigits: 8 });
  // ป้ายแกนแบบตัวเลขย่อล้วน (ไม่มีสัญลักษณ์เงิน -> แคบ ไม่มีทางถูกตัด) เช่น 6.3K, 1.2M, -500
  // หน่วยเงินไปแสดงที่ "ชื่อแกน" แทน เพื่อให้เห็นหน่วยชัดโดยไม่เบียดตัวเลข
  const fmtAxisNum = (n) => {
    if (n == null || isNaN(n)) return "";
    return Number(n).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
  };
  const ccySym = (ccy) => (ccy === "USD" ? "$" : "฿");
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Storage layer (IndexedDB ผ่าน localforage + fallback localStorage) ----------
  // ยกเลิกเพดาน ~5MB ของ localStorage — IndexedDB รองรับข้อมูลปริมาณมาก
  async function initStorage() {
    try {
      if (typeof localforage === "undefined") throw new Error("ไม่พบไลบรารี localforage");
      localforage.config({
        name: "TradeJournal",
        storeName: "trade_journal",
        description: "Trade Journal — trades, preferences, market cache"
      });
      // ลำดับความสำคัญ driver: IndexedDB -> WebSQL -> localStorage
      await localforage.setDriver([localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE]);
      await localforage.ready();
      store = {
        get: (k) => localforage.getItem(k),                 // คืน object ตรง ๆ (ไม่ต้อง JSON.parse)
        set: (k, v) => localforage.setItem(k, v),
        remove: (k) => localforage.removeItem(k),
        driver: () => localforage.driver()
      };
      console.info("[TradeJournal] storage driver:", localforage.driver());
    } catch (e) {
      // Fallback: ถ้า IndexedDB เริ่มต้นไม่สำเร็จ -> ใช้ localStorage แบบ sync ห่อด้วย Promise
      console.warn("[TradeJournal] IndexedDB ใช้งานไม่ได้ สลับไปใช้ localStorage แทน:", e);
      store = {
        get: async (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
        set: async (k, v) => { localStorage.setItem(k, JSON.stringify(v)); },
        remove: async (k) => { localStorage.removeItem(k); },
        driver: () => "localStorageFallback"
      };
    }
  }

  // ---------- Persistence (async) ----------
  async function load() {
    if (!store) await initStorage();
    try { const d = await store.get(LS_KEY); if (d && Array.isArray(d.txs)) state = d; } catch (e) { console.warn("[TradeJournal] โหลดรายการเทรดไม่สำเร็จ:", e); }
    try { const p = await store.get(LS_PREF); if (p) pref = { ...pref, ...p }; } catch (e) { console.warn("[TradeJournal] โหลดการตั้งค่าไม่สำเร็จ:", e); }
    // migration ครั้งเดียว: อัปเดต default ค่าธรรมเนียมปิดเป็น 0.25%
    if (!pref.feeDefaultV2) { pref.exitFeePct = 0.25; pref.feeDefaultV2 = true; await savePref(); }
    try { const m = await store.get(LS_MKT); if (m && m.fx) market = { ...market, ...m }; } catch (e) { console.warn("[TradeJournal] โหลดราคาที่ cache ไว้ไม่สำเร็จ:", e); }
  }

  async function save() {
    try {
      await store.set(LS_KEY, state);
    } catch (e) {
      // QuotaExceededError หรือ storage error อื่น ๆ
      console.warn("[TradeJournal] บันทึกข้อมูลไม่สำเร็จ:", e);
      alert("พื้นที่จัดเก็บข้อมูลในเบราว์เซอร์เต็มแล้ว กรุณา Export ข้อมูลเก็บไว้และเคลียร์รายการเก่าออกบางส่วน");
    }
  }

  async function savePref() {
    try { await store.set(LS_PREF, pref); }
    catch (e) { console.warn("[TradeJournal] บันทึกการตั้งค่าไม่สำเร็จ:", e); }
  }

  // ---------- FX conversion ----------
  // แปลงจำนวนเงินจากสกุลของไม้ -> สกุลที่แสดงผล โดยใช้ FX ปัจจุบัน
  function convert(amount, fromCcy, toCcy) {
    if (amount == null || isNaN(amount)) return amount;
    if (fromCcy === toCcy) return amount;
    const fx = market.fx; // THB per USD
    if (!fx) return amount; // ยังไม่มีราคา -> ไม่แปลง (จะอัปเดตเมื่อได้ราคา)
    if (fromCcy === "USD" && toCcy === "THB") return amount * fx;
    if (fromCcy === "THB" && toCcy === "USD") return amount / fx;
    return amount;
  }

  // ราคาตลาดปัจจุบันของสินทรัพย์ ในสกุลที่ต้องการ
  function marketPrice(asset, ccy) {
    if (asset === "BTC") return market.btc[ccy.toLowerCase()];
    if (asset === "GOLD") return market.gold[ccy.toLowerCase()];
    return null; // OTHER ไม่มีฟีดราคา
  }

  // ---------- Price fetching ----------
  // หลักการ: THB = USD × FX จริงเสมอ (ไม่ใช้ค่า 36 ตายตัว) เพื่อให้ราคานิ่ง ไม่เด้งไปมา
  // ดึง JSON แบบมี timeout 5,000ms (AbortController) กันสถานะ pending ค้างถาวร
  async function tryJson(url, timeoutMs = 5000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (r.ok) return await r.json();
    } catch (e) {
      // timeout (AbortError) หรือ network error -> คืน null เพื่อไป fallback
      console.warn("[TradeJournal] ดึงข้อมูลไม่สำเร็จ:", url, "-", e && e.name === "AbortError" ? "หมดเวลา (timeout)" : (e && e.message));
    } finally {
      clearTimeout(timer);
    }
    return null;
  }

  // อัตราแลกเปลี่ยน USD->THB จากแหล่งที่เชื่อถือได้ (มีหลาย fallback)
  async function fetchFx() {
    let j = await tryJson("https://api.frankfurter.app/latest?from=USD&to=THB");
    if (j && j.rates && j.rates.THB) return j.rates.THB;
    j = await tryJson("https://open.er-api.com/v6/latest/USD");
    if (j && j.rates && j.rates.THB) return j.rates.THB;
    return null;
  }

  // ราคา BTC / Gold เป็น USD (CoinGecko หลัก, Coinbase สำรองเฉพาะ BTC)
  async function fetchUsdPrices() {
    let btcUsd = null, goldUsd = null;
    const j = await tryJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,pax-gold&vs_currencies=usd");
    if (j) {
      if (j.bitcoin && j.bitcoin.usd) btcUsd = j.bitcoin.usd;
      if (j["pax-gold"] && j["pax-gold"].usd) goldUsd = j["pax-gold"].usd;
    }
    if (btcUsd == null) {
      const c = await tryJson("https://api.coinbase.com/v2/prices/BTC-USD/spot");
      const p = parseFloat(c?.data?.amount);
      if (p) btcUsd = p;
    }
    return { btcUsd, goldUsd };
  }

  async function fetchPrices() {
    el.refreshBtn.textContent = "⟳ ...";
    const [fx, usd] = await Promise.all([fetchFx(), fetchUsdPrices()]);

    if (fx) market.fx = fx;                      // อัปเดต FX ถ้าได้ (ไม่งั้นคงค่าเดิมที่ cache ไว้)
    if (usd.btcUsd != null) market.btc.usd = usd.btcUsd;
    if (usd.goldUsd != null) market.gold.usd = usd.goldUsd;

    // แปลง THB จาก USD × FX เดียวกันทุกครั้ง -> ราคานิ่ง ไม่เด้ง
    if (market.fx) {
      if (market.btc.usd != null) market.btc.thb = market.btc.usd * market.fx;
      if (market.gold.usd != null) market.gold.thb = market.gold.usd * market.fx;
    }

    const gotSomething = fx || usd.btcUsd != null || usd.goldUsd != null;
    if (gotSomething) {
      market.ts = Date.now();
      market.stale = false;
      // cache ค่าล่าสุด (fire-and-forget)
      if (store) store.set(LS_MKT, market).catch(e => console.warn("[TradeJournal] cache ราคาไม่สำเร็จ:", e));
    } else {
      market.stale = true; // ใช้ค่าที่ cache ไว้ต่อไป ไม่รีเซ็ต
    }

    el.refreshBtn.textContent = "⟳ ราคา";
    renderTicker();
    render();
    return gotSomething;
  }

  function renderTicker() {
    const c = pref.displayCcy;
    el.tickBTC.textContent = market.btc[c.toLowerCase()] ? fmt(market.btc[c.toLowerCase()], c) : "—";
    el.tickGOLD.textContent = market.gold[c.toLowerCase()] ? fmt(market.gold[c.toLowerCase()], c) : "—";
    el.tickFX.textContent = market.fx ? market.fx.toFixed(3) : "—";
    el.tickTime.textContent = market.ts
      ? new Date(market.ts).toLocaleTimeString("th-TH") + (market.stale ? " (ค้าง)" : "")
      : (market.stale ? "ดึงราคาไม่สำเร็จ" : "—");
  }

  // ---------- FIFO P&L engine ----------
  // คืน { positions: {assetKey:{qty,cost,asset,ccy}}, realized (in displayCcy), realizedSeries:[{t,cum}] }
  function computePnl() {
    const dc = pref.displayCcy;
    const sorted = [...state.txs].sort((a, b) => new Date(a.date) - new Date(b.date));
    const lots = {};      // assetKey -> [{qty, unitCostDisp}]
    const positions = {}; // assetKey -> {qty, cost}
    let realizedTotal = 0;
    const series = [];

    for (const t of sorted) {
      const key = t.asset === "OTHER" ? "OTHER:" + (t.other || "?") : t.asset;
      const priceDisp = convert(t.price, t.ccy, dc);
      const feeDisp = convert(t.fee || 0, t.ccy, dc);
      lots[key] = lots[key] || [];
      if (t.side === "buy") {
        // รวมค่าธรรมเนียมเข้าในต้นทุนต่อหน่วย
        const unit = t.qty ? (priceDisp + feeDisp / t.qty) : priceDisp;
        lots[key].push({ qty: t.qty, unit });
      } else {
        // ขาย -> จับคู่ต้นทุนแบบ FIFO ตามจำนวนคงเหลือจริงในพอร์ต
        let remaining = t.qty;
        let costOut = 0;
        while (remaining > 1e-12 && lots[key].length) {
          const lot = lots[key][0];
          const take = Math.min(remaining, lot.qty);
          costOut += take * lot.unit;
          lot.qty -= take;
          remaining -= take;
          if (lot.qty <= 1e-12) lots[key].shift();
        }
        const matchedQty = t.qty - remaining; // จำนวนที่จับคู่ inventory ได้จริง
        if (remaining > 1e-8) {
          // ขายเกินจำนวนคงเหลือ: คิดต้นทุนเฉพาะส่วนที่มีจริง + แจ้งเตือน โดยไม่ทำให้ผลรวมเพี้ยน
          console.warn(
            "[TradeJournal] พบรายการขายเกินจำนวนคงเหลือของ " + key +
            " (วันที่ " + t.date + "): สั่งขาย " + t.qty +
            " แต่มีคงเหลือเพียง " + matchedQty.toFixed(8) +
            " — ระบบคำนวณกำไร/ต้นทุนเฉพาะส่วนที่มีจริง และละเว้นส่วนเกิน " + remaining.toFixed(8)
          );
        }
        // คิด proceeds/ค่าธรรมเนียมตามสัดส่วนที่จับคู่ได้จริง เพื่อไม่ให้ Realized P&L บิดเบือน
        const feePortion = t.qty > 0 ? feeDisp * (matchedQty / t.qty) : feeDisp;
        const proceeds = matchedQty * priceDisp - feePortion;
        realizedTotal += proceeds - costOut;
        series.push({ t: t.date, cum: realizedTotal });
      }
    }

    // สรุป positions ที่เหลือ
    for (const key in lots) {
      let qty = 0, cost = 0;
      for (const lot of lots[key]) { qty += lot.qty; cost += lot.qty * lot.unit; }
      if (qty > 1e-10) {
        const asset = key.startsWith("OTHER:") ? "OTHER" : key;
        positions[key] = { qty, cost, asset, label: key.startsWith("OTHER:") ? key.slice(6) : key };
      }
    }
    return { positions, realizedTotal, series };
  }

  // ---------- Render summary + stats ----------
  function render() {
    const dc = pref.displayCcy;
    const { positions, realizedTotal, series } = computePnl();

    let mv = 0, costBasis = 0, unreal = 0, haveMarket = true;
    const alloc = [];
    for (const key in positions) {
      const p = positions[key];
      costBasis += p.cost;
      const mp = marketPrice(p.asset, dc);
      if (mp != null) {
        const val = p.qty * mp;
        mv += val;
        unreal += val - p.cost;
        alloc.push({ label: p.label, val });
      } else {
        // ไม่มีราคาตลาด (OTHER) -> ใช้ต้นทุนเป็น MV
        mv += p.cost;
        alloc.push({ label: p.label, val: p.cost });
        haveMarket = false;
      }
    }
    // ประเมินค่าธรรมเนียมตอนปิด position (% ของมูลค่าตลาด) แล้วหักออกจาก Unrealized
    const feePct = pref.includeExitFee ? (parseFloat(pref.exitFeePct) || 0) : 0;
    const exitFee = feePct > 0 ? mv * (feePct / 100) : 0;
    const unrealNet = unreal - exitFee;

    const totalPnl = realizedTotal + unrealNet;
    const roi = costBasis > 0 ? (totalPnl / costBasis) * 100 : null;

    el.kpiMV.textContent = fmt(mv, dc);
    el.kpiCost.textContent = fmt(costBasis, dc);
    setPnl(el.kpiUnreal, unrealNet, dc);
    setPnl(el.kpiReal, realizedTotal, dc);
    setPnl(el.kpiTotal, totalPnl, dc);
    el.feeNote.textContent = exitFee > 0
      ? "ประมาณการค่าธรรมเนียมปิดสถานะ ~" + fmt(exitFee, dc) + " (" + feePct + "%)"
      : "";
    el.kpiRoi.textContent = roi == null ? "" : (roi >= 0 ? "+" : "") + roi.toFixed(2) + "% ROI";
    el.kpiRoi.className = "kpi-sub " + (roi >= 0 ? "pos" : "neg");

    renderStats(positions, series, dc);
    renderCharts(series, alloc, dc);
    renderTable();
  }

  function setPnl(node, v, ccy) {
    node.textContent = (v > 0 ? "+" : "") + fmt(v, ccy);
    node.className = "kpi-val " + (v > 0 ? "pos" : v < 0 ? "neg" : "");
  }

  function renderStats(positions, series, dc) {
    const buys = state.txs.filter(t => t.side === "buy").length;
    const sells = state.txs.filter(t => t.side === "sell").length;
    // นับ win/loss จาก realized series (การขายแต่ละครั้ง)
    let wins = 0, losses = 0, prev = 0;
    for (const s of series) { const step = s.cum - prev; if (step > 0) wins++; else if (step < 0) losses++; prev = s.cum; }
    const winRate = (wins + losses) ? (wins / (wins + losses) * 100).toFixed(0) + "%" : "—";
    const btcPos = positions["BTC"];
    const stats = [
      ["จำนวนรายการเทรดทั้งหมด", state.txs.length],
      ["ซื้อ / ขาย", buys + " / " + sells],
      ["Win rate", winRate],
      ["BTC ที่ถือ", btcPos ? fmtQty(btcPos.qty) : "0"],
      ["ต้นทุนเฉลี่ย BTC", btcPos ? fmt(btcPos.cost / btcPos.qty, dc) : "—"],
      ["สินทรัพย์", Object.keys(positions).length],
    ];
    el.stats.innerHTML = stats.map(([l, v]) =>
      `<div class="stat"><div class="s-label">${l}</div><div class="s-val">${v}</div></div>`).join("");
  }

  // อ่านสีจากตัวแปร CSS (ให้กราฟเปลี่ยนตามธีม)
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  // ---------- Charts ----------
  function renderCharts(series, alloc, dc) {
    const green = cssVar("--green", "#26d17c"), red = cssVar("--red", "#ff5c6c");
    const gridC = cssVar("--line", "#1b2536"), tickC = cssVar("--muted", "#8b98a9");
    const cardC = cssVar("--card", "#151d2b");
    // Equity curve — กรองตามช่วงเวลาที่เลือก (ค่าสะสมยังเป็นยอดจริงต่อเนื่อง ไม่รีเซ็ต)
    const rangeDays = { "7D": 7, "30D": 30, "90D": 90, "ALL": null };
    const days = rangeDays[pref.equityRange] ?? null;
    let shown = series;
    if (days) {
      const cutoff = Date.now() - days * 86400000;
      shown = series.filter(s => new Date(s.t).getTime() >= cutoff);
      // ไม่มีการขายในช่วงนี้ แต่มีประวัติก่อนหน้า -> โชว์ระดับสะสมล่าสุดเป็นจุดเดียว (เส้นราบ)
      if (shown.length === 0 && series.length) {
        shown = [{ t: new Date().toISOString(), cum: series[series.length - 1].cum }];
      }
    }
    const labels = shown.map(s => new Date(s.t).toLocaleDateString("th-TH", { day: "2-digit", month: "short" }));
    const fullLabels = shown.map(s => new Date(s.t).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }));
    const data = shown.map(s => s.cum);
    const last = data.length ? data[data.length - 1] : 0;
    const lineColor = last >= 0 ? green : red;
    // เมื่อรายการเยอะ (DCA หลายร้อยไม้) ซ่อนจุดเพื่อไม่ให้กราฟรก แต่ยังโชว์จุดตอน hover
    const manyPoints = data.length > 50;
    if (pnlChart) pnlChart.destroy();
    pnlChart = new Chart(el.pnlChart, {
      type: "line",
      data: {
        labels: labels.length ? labels : [""],
        datasets: [{
          data: data.length ? data : [0],
          borderColor: lineColor, backgroundColor: lineColor + "22",
          fill: true, tension: .25, borderWidth: 2,
          pointRadius: manyPoints ? 0 : 2,
          pointHoverRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { left: 4, right: 10, top: 6, bottom: 2 } },
        // แตะที่ไหนก็ได้ในกราฟ -> tooltip ของจุดที่ใกล้ที่สุดโผล่ (มือถือแตะง่ายขึ้นมาก)
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true, displayColors: false,
            padding: 10, titleFont: { size: 12 }, bodyFont: { size: 13, weight: "600" },
            callbacks: {
              title: (items) => items.length ? fullLabels[items[0].dataIndex] : "",
              label: (c) => "Realized P&L สะสม: " + fmt(c.parsed.y, dc)
            }
          }
        },
        scales: {
          x: { ticks: { color: tickC, maxTicksLimit: 6, font: { size: 10 } }, grid: { color: gridC } },
          y: {
            title: { display: true, text: "Realized P&L (" + ccySym(dc) + ")", color: tickC, font: { size: 10, weight: "600" } },
            ticks: { color: tickC, maxTicksLimit: 6, font: { size: 10 }, padding: 6, callback: v => fmtAxisNum(v) },
            grid: { color: gridC },
            // จองความกว้างแกน Y ขั้นต่ำ กันป้ายตัวเลขถูกตัดบนบางเครื่อง
            afterFit: (scale) => { scale.width = Math.max(scale.width, 52); }
          }
        }
      }
    });
    // Allocation doughnut
    const hasAlloc = alloc.length > 0;
    const allocTotal = alloc.reduce((s, a) => s + (a.val || 0), 0);
    const palette = ["#f7931a", "#e8c766", "#3ba3ff", "#26d17c", "#b57cff", "#ff5c6c", "#8b98a9"];
    if (allocChart) allocChart.destroy();
    el.allocEmpty.style.display = hasAlloc ? "none" : "flex";

    // ปลั๊กอินวาด % บนแต่ละชิ้นของวงแหวน (inline ไม่ต้องพึ่ง CDN — คง offline ได้)
    const pctLabels = {
      id: "pctLabels",
      afterDatasetsDraw(chart) {
        if (!hasAlloc || allocTotal <= 0) return;
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        const data = chart.data.datasets[0].data;
        ctx.save();
        ctx.font = "700 13px Inter, 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        meta.data.forEach((arc, i) => {
          const val = +data[i] || 0;
          const pct = (val / allocTotal) * 100;
          if (pct < 5) return; // ชิ้นเล็กเกินไป ข้าม กันตัวเลขซ้อน
          const pos = arc.tooltipPosition ? arc.tooltipPosition() : arc.getCenterPoint();
          const label = (pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)) + "%";
          ctx.fillStyle = "rgba(0,0,0,.38)"; // เงาให้อ่านง่ายทุกสีพื้น
          ctx.fillText(label, pos.x + 0.7, pos.y + 0.7);
          ctx.fillStyle = "#fff";
          ctx.fillText(label, pos.x, pos.y);
        });
        ctx.restore();
      }
    };

    allocChart = new Chart(el.allocChart, {
      type: "doughnut",
      data: {
        labels: hasAlloc ? alloc.map(a => a.label) : ["ว่าง"],
        datasets: [{ data: hasAlloc ? alloc.map(a => a.val) : [1],
          backgroundColor: hasAlloc ? palette : [gridC], borderColor: cardC, borderWidth: 2 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "58%",
        layout: { padding: 6 },
        plugins: {
          legend: { display: hasAlloc, position: "bottom",
            labels: { color: tickC, boxWidth: 12, padding: 12, font: { size: 11 } } },
          tooltip: { enabled: hasAlloc, callbacks: {
            label: c => {
              const pct = allocTotal > 0 ? (c.parsed / allocTotal * 100).toFixed(1) : "0";
              return c.label + ": " + fmt(c.parsed, dc) + " (" + pct + "%)";
            }
          } }
        }
      },
      plugins: [pctLabels]
    });
  }

  // ---------- History table ----------
  function renderTable() {
    const q = (el.searchBox.value || "").toLowerCase();
    const rows = [...state.txs]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .filter(t => pref.filter === "all" || t.side === pref.filter)
      .filter(t => !q || [t.asset, t.other, t.note].filter(Boolean).join(" ").toLowerCase().includes(q));

    el.emptyState.style.display = rows.length ? "none" : "block";
    el.txBody.innerHTML = rows.map(t => {
      const name = t.asset === "OTHER" ? (t.other || "อื่น ๆ") : t.asset;
      const d = new Date(t.date);
      const dstr = d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" }) +
        " " + d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
      return `<tr>
        <td>${dstr}</td>
        <td><span class="tag ${t.side}">${t.side === "buy" ? "ซื้อ" : "ขาย"}</span></td>
        <td>${name} <span class="asset-badge">${t.ccy}</span></td>
        <td class="num">${fmt(t.price, t.ccy)}</td>
        <td class="num">${fmtQty(t.qty)}</td>
        <td class="num">${fmt(t.cost, t.ccy)}</td>
        <td class="num"><div class="rowbtns">
          <button class="iconbtn" data-edit="${t.id}" title="แก้ไข">✎</button>
          <button class="iconbtn" data-del="${t.id}" title="ลบ">🗑</button>
        </div></td>
      </tr>`;
    }).join("");

    el.txBody.querySelectorAll("[data-edit]").forEach(b =>
      b.onclick = () => startEdit(b.dataset.edit));
    el.txBody.querySelectorAll("[data-del]").forEach(b =>
      b.onclick = () => { if (confirm("ยืนยันการลบรายการเทรดนี้ออกจากบันทึกใช่หรือไม่?")) { state.txs = state.txs.filter(x => x.id !== b.dataset.del); save(); render(); } });
  }

  // ---------- Form logic ----------
  function currentAssetForForm() { return el.fAsset.value; }

  // ต้นทุน (cost) = ตัวยึดคงที่ | ราคา ↔ จำนวน ผูกกันโดยคงต้นทุนไว้เสมอ
  function autoCalc(changed) {
    const price = parseFloat(el.fPrice.value);
    const cost = parseFloat(el.fCost.value);
    const qty = parseFloat(el.fQty.value);
    const has = (x) => !isNaN(x) && x !== 0;

    if (changed === "price") {
      // ปรับราคา -> จำนวนเปลี่ยน (คงต้นทุน)
      if (has(cost) && has(price)) el.fQty.value = round(cost / price, 8);
      else if (has(price) && has(qty)) el.fCost.value = round(price * qty); // ยังไม่มีต้นทุน -> เติมต้นทุนให้
    } else if (changed === "qty") {
      // ปรับจำนวน -> ราคาเปลี่ยน (คงต้นทุน)
      if (has(cost) && has(qty)) el.fPrice.value = round(cost / qty);
      else if (has(price) && has(qty)) el.fCost.value = round(price * qty);
    } else if (changed === "cost") {
      // ปรับต้นทุน -> คงราคาไว้ แล้วปรับจำนวน (ถ้ายังไม่มีราคา ใช้จำนวนคำนวณราคาแทน)
      if (has(cost) && has(price)) el.fQty.value = round(cost / price, 8);
      else if (has(cost) && has(qty)) el.fPrice.value = round(cost / qty);
    }
  }
  // ปัดทศนิยมแบบจัดการ floating-point ให้สะอาด (เลี่ยงปัญหา เช่น 1.005 -> 1.00)
  // ใช้เทคนิค exponential string ป้องกัน error จากเลขฐานสองของ IEEE-754
  function round(n, d = 2) {
    const num = Number(n);
    if (!isFinite(num)) return 0;
    const shifted = Number(num + "e" + d);
    if (!isFinite(shifted)) return num; // เลขใหญ่มาก -> คืนค่าเดิม กัน NaN
    return Number(Math.round(shifted) + "e-" + d);
  }

  // ปุ่ม "ใช้ราคาตลาด" ใช้ได้เฉพาะสินทรัพย์ที่มีฟีดราคา (BTC / GOLD) — ซ่อน/ปิดเมื่อเลือก OTHER
  function updateUsePriceBtn() {
    if (!el.usePriceBtn) return;
    const isOther = el.fAsset && el.fAsset.value === "OTHER";
    el.usePriceBtn.disabled = isOther;
    el.usePriceBtn.classList.toggle("hidden-btn", isOther);
  }

  function fillMarketPrice() {
    const a = currentAssetForForm();
    const ccy = el.fCcy.value;
    const mp = marketPrice(a, ccy);
    if (mp != null) { el.fPrice.value = round(mp); autoCalc("price"); }
    else alert("ไม่พบราคาตลาดสำหรับสินทรัพย์นี้ (ระบบดึงราคาอัตโนมัติเฉพาะ BTC และ Gold เท่านั้น)");
  }

  function resetForm() {
    el.tradeForm.reset();
    el.editId.value = "";
    el.fAsset.value = "BTC";
    el.fCcy.value = pref.displayCcy;
    el.otherNameRow.style.display = "none";
    updateUsePriceBtn();
    setSide("buy");
    setLocalNow();
    el.formTitle.textContent = "บันทึกรายการเทรดใหม่";
    el.submitBtn.textContent = "บันทึกรายการเทรด";
    el.cancelEdit.style.display = "none";
    // เติมราคาตลาดของ BTC ให้อัตโนมัติ
    const mp = marketPrice("BTC", el.fCcy.value);
    if (mp) el.fPrice.value = round(mp);
  }

  function setLocalNow() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    el.fDate.value = d.toISOString().slice(0, 16);
  }

  function setSide(s) {
    pref.side = s; savePref();
    el.sideSeg.querySelectorAll("button").forEach(b =>
      b.classList.toggle("active", b.dataset.side === s));
  }

  function startEdit(id) {
    const t = state.txs.find(x => x.id === id);
    if (!t) return;
    el.editId.value = t.id;
    setSide(t.side);
    el.fAsset.value = t.asset;
    el.otherNameRow.style.display = t.asset === "OTHER" ? "block" : "none";
    updateUsePriceBtn();
    el.fOther.value = t.other || "";
    el.fCcy.value = t.ccy;
    el.fPrice.value = t.price;
    el.fCost.value = t.cost;
    el.fQty.value = t.qty;
    el.fFee.value = t.fee || "";
    el.fNote.value = t.note || "";
    const d = new Date(t.date); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    el.fDate.value = d.toISOString().slice(0, 16);
    el.formTitle.textContent = "แก้ไขรายการเทรด";
    el.submitBtn.textContent = "บันทึกการแก้ไข";
    el.cancelEdit.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ตรวจว่าเป็นตัวเลขที่ถูกต้องและไม่ติดลบ (อนุญาตค่าว่างได้เมื่อ allowEmpty = true)
  function validNonNeg(raw, allowEmpty) {
    if (raw === "" || raw == null) return allowEmpty ? { ok: true, val: NaN } : { ok: false };
    const v = Number(raw);
    if (!isFinite(v) || v < 0) return { ok: false };
    return { ok: true, val: v };
  }

  function submitForm(e) {
    e.preventDefault();

    // ---------- Input Validation: ราคา / จำนวน / ต้นทุน ต้องเป็นตัวเลขไม่ติดลบ ----------
    const pRes = validNonNeg(el.fPrice.value, true);
    const cRes = validNonNeg(el.fCost.value, true);
    const qRes = validNonNeg(el.fQty.value, true);
    const feeRes = validNonNeg(el.fFee.value, true);

    if (!pRes.ok || !cRes.ok || !qRes.ok || !feeRes.ok) {
      alert("กรุณากรอกราคา จำนวน ต้นทุน และค่าธรรมเนียมเป็นตัวเลขที่ไม่ติดลบเท่านั้น");
      return;
    }

    const price = pRes.val;
    const cost = cRes.val;
    let qty = qRes.val;
    if (isNaN(qty) && !isNaN(cost) && !isNaN(price) && price > 0) qty = cost / price;

    if (isNaN(price) || isNaN(qty)) {
      alert("ข้อมูลไม่ครบถ้วน: กรุณาระบุราคาต่อหน่วย ร่วมกับต้นทุนหรือจำนวนสินทรัพย์อย่างน้อยหนึ่งค่า");
      return;
    }
    if (price <= 0 || qty <= 0) {
      alert("ราคาต่อหน่วยและจำนวนสินทรัพย์ต้องมากกว่าศูนย์");
      return;
    }
    if (!el.fDate.value) {
      alert("กรุณาระบุวันที่และเวลาของรายการเทรด");
      return;
    }

    const tx = {
      id: el.editId.value || uid(),
      date: new Date(el.fDate.value).toISOString(),
      side: pref.side,
      asset: el.fAsset.value,
      other: el.fAsset.value === "OTHER" ? (el.fOther.value.trim() || "อื่น ๆ") : "",
      ccy: el.fCcy.value,
      price, qty,
      cost: isNaN(cost) ? round(price * qty) : cost,
      fee: isNaN(feeRes.val) ? 0 : feeRes.val,
      note: el.fNote.value.trim()
    };
    if (el.editId.value) {
      const i = state.txs.findIndex(x => x.id === el.editId.value);
      if (i >= 0) state.txs[i] = tx;
    } else state.txs.push(tx);
    save();
    resetForm();
    render();
  }

  // ---------- Export / Import ----------
  // ป้ายเวลาสำหรับชื่อไฟล์ (เวลาท้องถิ่น) รูปแบบ YYYY-MM-DD_HH-MM-SS — ใช้ขีดแทน ':' กันปัญหาชื่อไฟล์บน Windows
  function fileStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  }
  function exportJSON() {
    const blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), txs: state.txs }, null, 2)],
      { type: "application/json" });
    downloadBlob(blob, "trade-journal-" + fileStamp() + ".json");
  }
  function exportCSV() {
    const head = ["date", "side", "asset", "other", "ccy", "price", "qty", "cost", "fee", "note"];
    const lines = [head.join(",")].concat(state.txs.map(t =>
      head.map(k => JSON.stringify(t[k] ?? "")).join(",")));
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv" }),
      "trade-journal-" + fileStamp() + ".csv");
  }
  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  // ลายนิ้วมือเนื้อไม้ — ใช้ตรวจซ้ำแบบไม่พึ่ง id (กันไม้เดียวกันที่กรอกคนละเครื่อง)
  function fingerprint(t) {
    const r = (n) => Math.round((+n || 0) * 1e8) / 1e8; // ปัดกันคลาดเศษ float
    return [
      new Date(t.date).toISOString(), t.side,
      t.asset, t.other || "", t.ccy,
      r(t.price), r(t.qty), r(t.cost), r(t.fee)
    ].join("|");
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = JSON.parse(reader.result);
        const incoming = Array.isArray(j) ? j : j.txs;
        if (!Array.isArray(incoming)) throw new Error("โครงสร้างไฟล์ไม่ถูกต้อง");
        const mode = confirm("เลือกรูปแบบการนำเข้าข้อมูล:\n\nกด “ตกลง” = รวมกับข้อมูลเดิม (ข้ามรายการที่ซ้ำโดยอัตโนมัติ)\nกด “ยกเลิก” = แทนที่ข้อมูลเดิมทั้งหมดด้วยไฟล์นี้");
        const clean = incoming.map(t => ({
          id: t.id || uid(), date: t.date, side: t.side === "sell" ? "sell" : "buy",
          asset: t.asset || "BTC", other: t.other || "", ccy: t.ccy || "THB",
          price: +t.price || 0, qty: +t.qty || 0, cost: +t.cost || 0, fee: +t.fee || 0, note: t.note || ""
        }));

        if (mode) {
          // dedup 2 ชั้น: (1) id ตรงกัน (2) เนื้อไม้เหมือนกัน (fingerprint)
          const ids = new Set(state.txs.map(x => x.id));
          const prints = new Set(state.txs.map(fingerprint));
          let added = 0, skipped = 0;
          for (const x of clean) {
            const fp = fingerprint(x);
            if (ids.has(x.id) || prints.has(fp)) { skipped++; continue; }
            state.txs.push(x);
            ids.add(x.id); prints.add(fp);
            added++;
          }
          save(); render();
          alert(`นำเข้าข้อมูลสำเร็จ (โหมดรวมข้อมูล)\nเพิ่มรายการใหม่: ${added} รายการ\nข้ามรายการที่ซ้ำ: ${skipped} รายการ`);
        } else {
          // แทนที่ทั้งหมด แต่ยัง dedup ภายในไฟล์ที่นำเข้าเองด้วย
          const seen = new Set();
          state.txs = clean.filter(x => {
            const fp = fingerprint(x);
            if (seen.has(fp)) return false;
            seen.add(fp); return true;
          });
          save(); render();
          alert("แทนที่ข้อมูลเรียบร้อยแล้ว: รวมทั้งสิ้น " + state.txs.length + " รายการ");
        }
      } catch (err) { alert("นำเข้าข้อมูลไม่สำเร็จ: " + err.message); }
    };
    reader.readAsText(file);
  }

  // ---------- Wire up ----------
  function bind() {
    [
      "refreshBtn", "ccyToggle", "ticker", "tickBTC", "tickGOLD", "tickFX", "tickTime",
      "kpiMV", "kpiCost", "kpiUnreal", "kpiReal", "kpiTotal", "kpiRoi", "stats",
      "feeToggle", "feePct", "feeNote",
      "pnlChart", "allocChart", "allocEmpty", "rangeSeg", "tradeForm", "editId", "sideSeg", "fDate", "fAsset",
      "otherNameRow", "fOther", "fCcy", "fPrice", "fCost", "fQty", "fFee", "fNote",
      "usePriceBtn", "submitBtn", "cancelEdit", "formTitle", "filterSeg", "searchBox",
      "txBody", "emptyState", "exportBtn", "importFile", "csvBtn", "autoRefresh", "clearBtn",
      "themeBtn"
    ].forEach(id => el[id] = document.getElementById(id));

    // ตัวช่วยผูก event แบบปลอดภัย: ทำงานเฉพาะเมื่อ element มีอยู่จริงใน DOM
    const on = (node, ev, fn) => { if (node) node.addEventListener(ev, fn); };
    const eachBtn = (node, cb) => { if (node) node.querySelectorAll("button").forEach(cb); };

    on(el.themeBtn, "click", toggleTheme);

    // ตัวเลือกประมาณการค่าธรรมเนียมปิดสถานะ
    if (el.feeToggle) el.feeToggle.checked = pref.includeExitFee;
    if (el.feePct) el.feePct.value = pref.exitFeePct;
    on(el.feeToggle, "change", () => { pref.includeExitFee = el.feeToggle.checked; savePref(); render(); });
    on(el.feePct, "input", () => { pref.exitFeePct = el.feePct.value; savePref(); if (pref.includeExitFee) render(); });

    // สลับสกุลเงินแสดงผล
    eachBtn(el.ccyToggle, b => on(b, "click", () => {
      pref.displayCcy = b.dataset.ccy; savePref();
      eachBtn(el.ccyToggle, x => x.classList.toggle("active", x === b));
      renderTicker(); render();
    }));
    eachBtn(el.ccyToggle, b => b.classList.toggle("active", b.dataset.ccy === pref.displayCcy));

    on(el.refreshBtn, "click", fetchPrices);
    eachBtn(el.sideSeg, b => on(b, "click", () => setSide(b.dataset.side)));

    on(el.fAsset, "change", () => {
      if (el.otherNameRow) el.otherNameRow.style.display = el.fAsset.value === "OTHER" ? "block" : "none";
      updateUsePriceBtn();
      const mp = marketPrice(el.fAsset.value, el.fCcy.value);
      if (mp) { el.fPrice.value = round(mp); autoCalc("price"); }
    });
    on(el.fCcy, "change", () => {
      const mp = marketPrice(el.fAsset.value, el.fCcy.value);
      if (mp) { el.fPrice.value = round(mp); autoCalc("price"); }
    });
    on(el.fPrice, "input", () => autoCalc("price"));
    on(el.fCost, "input", () => autoCalc("cost"));
    on(el.fQty, "input", () => autoCalc("qty"));
    on(el.usePriceBtn, "click", fillMarketPrice);
    on(el.tradeForm, "submit", submitForm);
    on(el.cancelEdit, "click", resetForm);

    eachBtn(el.filterSeg, b => on(b, "click", () => {
      pref.filter = b.dataset.filter; savePref();
      eachBtn(el.filterSeg, x => x.classList.toggle("active", x === b));
      renderTable();
    }));
    eachBtn(el.filterSeg, b => b.classList.toggle("active", b.dataset.filter === pref.filter));
    on(el.searchBox, "input", renderTable);

    // ปุ่มเลือกช่วงเวลา Equity Curve
    eachBtn(el.rangeSeg, b => on(b, "click", () => {
      pref.equityRange = b.dataset.range; savePref();
      eachBtn(el.rangeSeg, x => x.classList.toggle("active", x === b));
      render();
    }));
    eachBtn(el.rangeSeg, b => b.classList.toggle("active", b.dataset.range === pref.equityRange));

    on(el.exportBtn, "click", exportJSON);
    on(el.csvBtn, "click", exportCSV);
    on(el.importFile, "change", (e) => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; });
    on(el.clearBtn, "click", () => {
      if (confirm("ยืนยันการลบข้อมูลรายการเทรดทั้งหมดอย่างถาวร?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้ — แนะนำให้ Export ข้อมูลสำรองไว้ก่อน")) {
        state.txs = []; save(); render();
      }
    });

    if (el.autoRefresh) el.autoRefresh.checked = pref.autoRefresh;
    on(el.autoRefresh, "change", () => { pref.autoRefresh = el.autoRefresh.checked; savePref(); setupAuto(); });
  }

  function setupAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (pref.autoRefresh) autoTimer = setInterval(fetchPrices, 60000);
  }

  // ---------- Theme ----------
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", pref.theme);
    if (el.themeBtn) el.themeBtn.textContent = pref.theme === "dark" ? "🌙" : "☀️";
  }
  function toggleTheme() {
    pref.theme = pref.theme === "dark" ? "light" : "dark";
    savePref(); applyTheme();
    render(); // วาดกราฟใหม่ด้วยสีของธีม
  }

  // ---------- Init ----------
  async function init() {
    await initStorage();     // เริ่มต้น IndexedDB (มี fallback)
    await load();            // รอโหลดข้อมูลให้เสร็จก่อน render
    bind();
    applyTheme();
    resetForm();
    render();                // วาด UI + กราฟ หลังข้อมูลพร้อม
    fetchPrices();
    setupAuto();
  }
  document.addEventListener("DOMContentLoaded", () => {
    init().catch(e => {
      console.error("[TradeJournal] เริ่มต้นแอปไม่สำเร็จ:", e);
      alert("เกิดข้อผิดพลาดในการเริ่มต้นระบบจัดเก็บข้อมูล กรุณารีเฟรชหน้าอีกครั้ง");
    });
  });
})();
