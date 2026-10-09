"use strict";

const state = {
  dashboard: null,
  products: [],
  transactions: [],
  editing: null,
  apiBase: location.protocol === "file:" ? null : "",
  settings: { vatEnabled: false, vatRate: 11, incomeTaxEnabled: false, incomeTaxRate: 0.5 }
};
const localApiCandidates = ["http://127.0.0.1:3000", "http://127.0.0.1:3001"];

const flowerStyles = {
  aster: { petals: 13, colors: ["#9a71bf", "#dbc2ef"], center: "#f3cb62", background: ["#f7efff", "#e9d8f8"] },
  sunflower: { petals: 16, colors: ["#f2ad38", "#ffd875"], center: "#71452f", background: ["#fff8df", "#fce5ac"] },
  carnation: { petals: 12, colors: ["#e7799f", "#f7b0c3"], center: "#d65780", background: ["#fff0f5", "#f8d7e2"] },
  foliage: { petals: 8, colors: ["#548660", "#8db47d"], center: "#39704e", background: ["#eaf5e9", "#cee5cf"] },
  hydrangea: { petals: 12, colors: ["#779bdb", "#aebfee"], center: "#f4e8a5", background: ["#eef3ff", "#d9e3fa"] },
  chrysanthemum: { petals: 18, colors: ["#f2d35c", "#fff0a0"], center: "#bc8440", background: ["#fff9e4", "#f8edc2"] },
  lily: { petals: 6, colors: ["#fffafa", "#f4d7e1"], center: "#df809e", background: ["#fff5f7", "#f3dce7"] },
  rose: { petals: 11, colors: ["#d95375", "#f093a7"], center: "#a83d60", background: ["#fff0f3", "#f5d3dc"] },
  peony: { petals: 16, colors: ["#eb8b9f", "#f6bfca"], center: "#e9c15d", background: ["#fff1f4", "#f5dce5"] },
  filler: { petals: 9, colors: ["#fff9fb", "#f2c8dc"], center: "#d7a7c9", background: ["#fff4fa", "#f0deef"] },
  tulip: { petals: 6, colors: ["#ec7393", "#f6a6b5"], center: "#f8d46e", background: ["#fff0f4", "#f7d9e2"] },
  default: { petals: 9, colors: ["#df8bab", "#f1c2d2"], center: "#e8bf68", background: ["#fff3f6", "#f5e1e8"] }
};

const pageNames = {
  profile: "Profil Usaha",
  dashboard: "Ringkasan",
  inventory: "Persediaan",
  transactions: "Transaksi",
  reports: "Profitabilitas"
};

const rupiah = (amount) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
}).format(Number(amount) || 0);

const number = (value) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value) || 0);
const localDate = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const transactionDate = (value) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date(value));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
})[character]);

function showNotice(title, message, kind = "warning") {
  const notice = document.getElementById("app-notice");
  notice.classList.toggle("notice-error", kind === "error");
  notice.classList.toggle("notice-success", kind === "success");
  document.getElementById("notice-title").textContent = title;
  document.getElementById("notice-message").textContent = message;
  notice.hidden = false;
}

async function request(path, options = {}) {
  const response = await fetch(`${state.apiBase || ""}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Permintaan gagal (${response.status}).`);
  }
  return body;
}

async function discoverLocalApi() {
  const errors = [];
  for (const candidate of localApiCandidates) {
    try {
      const response = await fetch(`${candidate}/api/health`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.status === "ok" && body.database === "connected" && body.features?.includes("supplier-invoices")) {
        state.apiBase = candidate;
        return;
      }
      errors.push(`${candidate}: ${body.error || "backend belum diperbarui untuk fitur faktur pemasok"}`);
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }
  throw new Error(`index.html sudah terbuka, tetapi backend Supabase tidak ditemukan. Jalankan backend JIVA FLORIST di port 3000 atau 3001, lalu muat ulang halaman. ${errors.join(" · ")}`);
}

function flowerImage(product) {
  const name = String(product.name || "").toLowerCase();
  const category = String(product.category || "").toLowerCase();
  let type = "default";
  if (/eucaly|daun|foliage/.test(`${category} ${name}`)) type = "foliage";
  else if (/sunflower|matahari/.test(`${category} ${name}`)) type = "sunflower";
  else if (/aster/.test(`${category} ${name}`)) type = "aster";
  else if (/carnation|anyelir/.test(`${category} ${name}`)) type = "carnation";
  else if (/hydrangea/.test(`${category} ${name}`)) type = "hydrangea";
  else if (/krisna|krisan|chrysanthemum/.test(`${category} ${name}`)) type = "chrysanthemum";
  else if (/lily|lili/.test(`${category} ${name}`)) type = "lily";
  else if (/mawar|rose/.test(`${category} ${name}`)) type = "rose";
  else if (/peony|peoni/.test(`${category} ${name}`)) type = "peony";
  else if (/filler|pikok/.test(`${category} ${name}`)) type = "filler";
  else if (/tulip/.test(`${category} ${name}`)) type = "tulip";

  let style = flowerStyles[type];
  if (type === "rose" && /white|putih/.test(name)) {
    style = { ...style, colors: ["#fffdfb", "#f6e6ed"], center: "#e6c46e", background: ["#fffaf8", "#f0e6ea"] };
  } else if (type === "rose" && /pink|soft/.test(name)) {
    style = { ...style, colors: ["#ed8da9", "#ffc0d0"], center: "#e5b75e", background: ["#fff3f6", "#f7dce6"] };
  }
  let blossom;
  if (type === "foliage") {
    blossom = `<path d="M32 55V25M32 41L20 31M32 47L44 35M32 33L40 24" fill="none" stroke="#477657" stroke-width="2.3" stroke-linecap="round"/><g fill="${style.colors[0]}"><ellipse cx="18" cy="28" rx="5" ry="10" transform="rotate(-42 18 28)"/><ellipse cx="45" cy="32" rx="5" ry="10" transform="rotate(42 45 32)"/><ellipse cx="39" cy="21" rx="4.5" ry="9" transform="rotate(38 39 21)"/><ellipse cx="24" cy="38" rx="4.5" ry="9" transform="rotate(-48 24 38)"/><ellipse cx="31" cy="20" rx="4" ry="8"/></g>`;
  } else if (type === "tulip") {
    blossom = `<path d="M32 55V29M32 46C25 39 21 43 19 48C25 49 29 48 32 46Z" fill="#56845c"/><path d="M20 32C18 22 21 15 26 18L32 25L38 18C43 15 46 22 44 32C42 39 37 42 32 42C27 42 22 39 20 32Z" fill="${style.colors[0]}"/><path d="M31 27V40M22 29C23 35 26 38 30 40M42 29C41 35 38 38 34 40" fill="none" stroke="${style.colors[1]}" stroke-width="2" stroke-linecap="round"/>`;
  } else {
    const petals = Array.from({ length: style.petals }, (_, index) => {
      const angle = index * 360 / style.petals;
      const radiusX = type === "lily" ? 5 : type === "sunflower" ? 3.5 : 4.5;
      const radiusY = type === "lily" ? 13 : type === "sunflower" ? 8 : 8.5;
      const centerY = type === "lily" ? 20 : 23;
      return `<ellipse cx="32" cy="${centerY}" rx="${radiusX}" ry="${radiusY}" transform="rotate(${angle} 32 32)" fill="${style.colors[index % style.colors.length]}"/>`;
    }).join("");
    const stem = `<path d="M32 38V57M32 48C26 42 22 44 20 49C25 51 29 50 32 48ZM32 52C38 45 42 47 44 51C40 54 36 54 32 52Z" fill="none" stroke="#56845c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    const centerRadius = type === "sunflower" ? 7 : type === "hydrangea" ? 3 : 4;
    const center = `<circle cx="32" cy="32" r="${centerRadius}" fill="${style.center}"/><circle cx="30.5" cy="30.5" r="1" fill="#fff8df" opacity=".85"/><circle cx="34" cy="33.5" r=".8" fill="#fff8df" opacity=".75"/>`;
    const secondBloom = type === "hydrangea" || type === "filler"
      ? `<g transform="translate(15 17) scale(.38)">${Array.from({ length: 8 }, (_, index) => `<circle cx="32" cy="15" r="8" transform="rotate(${index * 45} 32 32)" fill="${style.colors[(index + 1) % style.colors.length]}"/>`).join("")}<circle cx="32" cy="32" r="5" fill="${style.center}"/></g><g transform="translate(39 19) scale(.31)"><circle cx="32" cy="15" r="8" fill="${style.colors[0]}"/><circle cx="32" cy="32" r="5" fill="${style.center}"/></g>`
      : "";
    blossom = `${stem}${secondBloom}${petals}${center}`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${style.background[0]}"/><stop offset="1" stop-color="${style.background[1]}"/></linearGradient></defs><rect width="64" height="64" rx="13" fill="url(#bg)"/><circle cx="12" cy="13" r="8" fill="#fff" opacity=".22"/><circle cx="53" cy="52" r="12" fill="#fff" opacity=".2"/>${blossom}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function updateMetrics(dashboard) {
  document.getElementById("metric-revenue").textContent = rupiah(dashboard.today.revenue);
  document.getElementById("metric-gross-profit").textContent = rupiah(dashboard.today.gross_profit);
  document.getElementById("metric-net-profit").textContent = rupiah(dashboard.today.gross_profit - dashboard.today.expenses + dashboard.today.adjustments);
  document.getElementById("metric-inventory").textContent = rupiah(dashboard.inventory.value);
  document.getElementById("metric-product-count").textContent = `${dashboard.inventory.product_count} jenis bunga tersedia`;
  document.getElementById("nav-low-stock").textContent = dashboard.inventory.low_stock_count;

  document.getElementById("report-revenue").textContent = rupiah(dashboard.month.revenue);
  document.getElementById("report-cogs").textContent = rupiah(dashboard.month.cogs);
  document.getElementById("report-gross-profit").textContent = rupiah(dashboard.month.gross_profit);
  document.getElementById("report-expenses").textContent = rupiah(dashboard.month.expenses);
  document.getElementById("report-adjustments").textContent = rupiah(dashboard.month.adjustments);
  document.getElementById("report-net-profit").textContent = rupiah(dashboard.month.gross_profit - dashboard.month.expenses + dashboard.month.adjustments);
  document.getElementById("report-vat").textContent = rupiah(dashboard.month.vat);
  const incomeTax = state.settings.incomeTaxEnabled
    ? dashboard.month.revenue * state.settings.incomeTaxRate / 100
    : 0;
  document.getElementById("report-income-tax").textContent = rupiah(incomeTax);
  document.getElementById("tax-report-note").textContent = state.settings.incomeTaxEnabled
    ? `Estimasi sederhana ${number(state.settings.incomeTaxRate)}% dari omzet bulan ini. Ketentuan tarif, batas omzet, masa berlaku fasilitas, dan kelayakan wajib pajak perlu diverifikasi sebelum digunakan.`
    : "Aktifkan estimasi PPh final melalui pengaturan bila usahamu memenuhi syarat. Perhitungan aplikasi adalah alat bantu pencatatan, bukan nasihat atau pelaporan pajak.";

  renderChart(dashboard.chart);
  renderLowStock(dashboard.low_stock);
}

function renderChart(data) {
  const container = document.getElementById("sales-chart");
  if (!data.length) {
    container.innerHTML = '<div class="empty-inline">Belum ada penjualan pada periode ini.</div>';
    return;
  }
  const width = 600;
  const height = 165;
  const left = 39;
  const right = 7;
  const top = 8;
  const bottom = 25;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(1, ...data.map((day) => Math.max(Number(day.revenue), Number(day.gross_profit))));
  const point = (value, index) => ({
    x: left + (data.length === 1 ? plotWidth / 2 : index * plotWidth / (data.length - 1)),
    y: top + plotHeight - Number(value) / max * plotHeight
  });
  const linePath = (key) => data.map((day, index) => {
    const { x, y } = point(day[key], index);
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const revenuePath = linePath("revenue");
  const first = point(data[0].revenue, 0);
  const last = point(data[data.length - 1].revenue, data.length - 1);
  const grid = [0, 1, 2, 3].map((index) => {
    const y = top + index * plotHeight / 3;
    const value = max * (1 - index / 3);
    return `<line class="chart-gridline" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"></line><text class="chart-label" x="0" y="${y + 3}">${compactCurrency(value)}</text>`;
  }).join("");
  const step = Math.max(1, Math.ceil(data.length / 7));
  const labels = data.map((day, index) => index % step === 0 || index === data.length - 1
    ? `<text class="chart-label" text-anchor="middle" x="${point(day.revenue, index).x}" y="${height - 4}">${escapeHtml(day.label)}</text>`
    : "").join("");
  const dots = data.map((day, index) => {
    const { x, y } = point(day.revenue, index);
    return `<circle class="chart-dot" cx="${x}" cy="${y}" r="3"></circle>`;
  }).join("");
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik penjualan dan laba kotor"><defs><linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#e29ab0" stop-opacity=".22"></stop><stop offset="100%" stop-color="#e29ab0" stop-opacity="0"></stop></linearGradient></defs>${grid}<path class="chart-fill" d="${revenuePath} L${last.x},${top + plotHeight} L${first.x},${top + plotHeight} Z"></path><path class="chart-path-revenue" d="${revenuePath}"></path><path class="chart-path-profit" d="${linePath("gross_profit")}"></path>${dots}${labels}</svg>`;
}

function compactCurrency(value) {
  const amount = Number(value) || 0;
  if (amount >= 1000000) return `${number(amount / 1000000)}jt`;
  if (amount >= 1000) return `${number(amount / 1000)}rb`;
  return number(amount);
}

function renderLowStock(products) {
  const list = document.getElementById("low-stock-list");
  if (!products.length) {
    list.innerHTML = '<div class="empty-inline">Stok aman, semua bunga siap dirangkai ✿</div>';
    return;
  }
  list.innerHTML = products.slice(0, 4).map((product) => `
    <div class="stock-row">
      <div class="flower-thumb"><img src="${flowerImage(product)}" alt="" loading="lazy"></div>
      <div class="stock-info"><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.category)}</span></div>
      <div class="stock-amount">${number(product.stock)} ${escapeHtml(product.unit)}<small>ambang ${number(product.reorder_level)}</small></div>
    </div>`).join("");
}

function transactionTitle(transaction) {
  if (transaction.type === "sale") return transaction.description || transaction.product_name || "Penjualan";
  if (transaction.type === "purchase") return transaction.description || `Pembelian ${transaction.product_name || "bunga"}`;
  return transaction.description || "Biaya operasional";
}

function transactionKind(type) {
  return ({ sale: "Penjualan", purchase: "Pembelian", expense: "Biaya", adjustment: "Penyesuaian NRV" })[type] || type;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function printDocument(title, content, printWindow = window.open("", "_blank"), landscape = false) {
  if (!printWindow) {
    showNotice("Jendela cetak diblokir", "Izinkan pop-up untuk situs atau file ini, lalu coba lagi.", "error");
    return false;
  }
  printWindow.onload = () => printWindow.print();
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f7f4f5;color:#30272b;font:14px Arial,sans-serif}.sheet{width:min(900px,calc(100% - 32px));margin:28px auto;padding:40px;background:#fff;box-shadow:0 8px 30px #38212a12}.brand{color:#a65370;font-size:12px;font-weight:700;letter-spacing:2px}.brand-sub{margin-top:5px;color:#88777e;font-size:12px}.heading{display:flex;justify-content:space-between;gap:24px;padding-bottom:22px;border-bottom:2px solid #f0dfe5}.heading h1{margin:15px 0 5px;font-family:Georgia,serif;font-size:28px;font-weight:500}.muted{color:#82747a;font-size:12px;line-height:1.7}.meta{text-align:right;font-size:12px;line-height:1.8}.meta strong{color:#44343b}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}.summary div{padding:13px;border:1px solid #f0e6e9;border-radius:8px;background:#fffafb}.summary span,.summary strong{display:block}.summary span{margin-bottom:7px;color:#8d7b82;font-size:11px}.summary strong{font-size:16px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:11px 9px;border-bottom:1px solid #eee6e9;text-align:left;vertical-align:top}th{background:#fff5f8;color:#805366;font-size:10px;letter-spacing:.6px}td.num,th.num{text-align:right;white-space:nowrap}.total{margin:18px 0 0 auto;width:min(360px,100%);border-top:1px solid #e9dce1}.total div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;color:#72636a;font-size:12px}.total .grand{border-top:1px solid #e9dce1;color:#382a30;font-size:16px;font-weight:700}.note{margin-top:24px;padding-top:13px;border-top:1px solid #eee6e9;color:#8b7c82;font-size:11px;line-height:1.7}.actions{display:flex;justify-content:center;gap:10px;margin:0 auto 20px}.actions button{padding:10px 16px;border:1px solid #e5cbd4;border-radius:7px;background:#fff;color:#974e69;font-weight:700;cursor:pointer}.actions button:first-child{background:#a65370;color:#fff}@media(max-width:600px){.sheet{padding:22px}.heading{flex-direction:column}.meta{text-align:left}.summary{grid-template-columns:1fr}.sheet{margin:12px auto}}@media print{body{background:#fff}.sheet{width:auto;margin:0;padding:0;box-shadow:none}.actions{display:none}thead{display:table-header-group}tr{break-inside:avoid}table{font-size:${landscape ? "8px" : "12px"}}th,td{padding:${landscape ? "6px 4px" : "11px 9px"}}@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:12mm}}
    </style></head><body>${content}</body></html>`);
  printWindow.document.close();
  printWindow.onload = () => printWindow.print();
  return true;
}

function invoiceMarkup(transaction) {
  const invoiceDate = formatDateTime(transaction.occurred_at);
  const invoiceNumber = `JF-J-${transactionDate(transaction.occurred_at).replace(/-/g, "")}-${transaction.id.slice(0, 8).toUpperCase()}`;
  const subtotal = Number(transaction.subtotal) || 0;
  const vat = Number(transaction.vat_amount) || 0;
  const total = subtotal + vat;
  const description = transaction.description && transaction.description !== transaction.product_name
    ? `<p class="muted">Catatan: ${escapeHtml(transaction.description)}</p>`
    : "";
  return `<div class="actions"><button onclick="window.print()">Cetak / Simpan PDF</button><button onclick="window.close()">Tutup</button></div><main class="sheet"><header class="heading"><div><div class="brand">JIVA FLORIST</div><div class="brand-sub">Magelang, Jawa Tengah</div><h1>Bukti Penjualan</h1><div class="muted">Terima kasih telah berbelanja di JIVA FLORIST.</div></div><div class="meta"><strong>No. Bukti</strong><br>${invoiceNumber}<br><strong>Tanggal</strong><br>${escapeHtml(invoiceDate)}</div></header><section class="summary"><div><span>Pelanggan</span><strong>Pelanggan umum</strong></div><div><span>Status pencatatan</span><strong>Tercatat</strong></div><div><span>Nomor transaksi</span><strong>${escapeHtml(transaction.id.slice(0, 8).toUpperCase())}</strong></div></section><div class="table-wrap"><table><thead><tr><th>PRODUK</th><th class="num">JUMLAH</th><th class="num">HARGA / UNIT</th><th class="num">JUMLAH</th></tr></thead><tbody><tr><td>${escapeHtml(transaction.product_name || "Produk bunga")}</td><td class="num">${number(transaction.quantity)} ${escapeHtml(transaction.unit || "")}</td><td class="num">${rupiah(transaction.unit_price)}</td><td class="num">${rupiah(subtotal)}</td></tr></tbody></table></div><div class="total"><div><span>Subtotal</span><strong>${rupiah(subtotal)}</strong></div><div><span>PPN (${number(Number(transaction.vat_rate) * 100)}%)</span><strong>${rupiah(vat)}</strong></div><div class="grand"><span>Total</span><strong>${rupiah(total)}</strong></div></div>${description}<footer class="note">Bukti ini merupakan bukti transaksi penjualan dari sistem pencatatan JIVA FLORIST, bukan faktur pajak. Simpan bukti ini untuk arsip.</footer></main>`;
}

function salesReportMarkup(report) {
  const rows = report.rows || [];
  const totals = rows.reduce((sum, row) => ({
    quantity: sum.quantity + Number(row.quantity || 0),
    subtotal: sum.subtotal + Number(row.subtotal || 0),
    vat: sum.vat + Number(row.vat_amount || 0),
    cogs: sum.cogs + Number(row.cogs || 0),
    profit: sum.profit + Number(row.gross_profit || 0)
  }), { quantity: 0, subtotal: 0, vat: 0, cogs: 0, profit: 0 });
  const details = rows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(formatDateTime(row.occurred_at))}</td><td>${escapeHtml(row.product_name || "—")}</td><td class="num">${number(row.quantity)} ${escapeHtml(row.unit || "")}</td><td class="num">${rupiah(row.unit_price)}</td><td class="num">${rupiah(row.subtotal)}</td><td class="num">${rupiah(row.vat_amount)}</td><td class="num">${rupiah(row.cogs)}</td><td class="num">${rupiah(row.gross_profit)}</td><td>${escapeHtml(row.description || "—")}</td></tr>`).join("");
  const detailRows = details || '<tr><td colspan="10" class="muted">Tidak ada penjualan dalam periode ini.</td></tr>';
  return `<div class="actions"><button onclick="window.print()">Cetak / Simpan PDF</button><button onclick="window.close()">Tutup</button></div><main class="sheet"><header class="heading"><div><div class="brand">${escapeHtml(report.business || "JIVA FLORIST")}</div><div class="brand-sub">${escapeHtml(report.location || "Magelang, Jawa Tengah")}</div><h1>Laporan Penjualan</h1><div class="muted">Ringkasan penjualan dan HPP FIFO pada periode terpilih.</div></div><div class="meta"><strong>Periode</strong><br>${escapeHtml(report.from)} s.d. ${escapeHtml(report.to)}<br><strong>Dicetak</strong><br>${escapeHtml(formatDateTime(new Date().toISOString()))}</div></header><section class="summary"><div><span>Jumlah transaksi</span><strong>${number(rows.length)}</strong></div><div><span>Total kuantitas terjual</span><strong>${number(totals.quantity)}</strong></div><div><span>Penjualan bersih</span><strong>${rupiah(totals.subtotal)}</strong></div><div><span>PPN tercatat</span><strong>${rupiah(totals.vat)}</strong></div><div><span>HPP FIFO</span><strong>${rupiah(totals.cogs)}</strong></div><div><span>Laba kotor</span><strong>${rupiah(totals.profit)}</strong></div></section><div class="table-wrap"><table><thead><tr><th>#</th><th>TANGGAL</th><th>PRODUK</th><th class="num">JUMLAH</th><th class="num">HARGA / UNIT</th><th class="num">PENJUALAN BERSIH</th><th class="num">PPN</th><th class="num">HPP FIFO</th><th class="num">LABA KOTOR</th><th>CATATAN</th></tr></thead><tbody>${detailRows}</tbody><tfoot><tr><th colspan="3">TOTAL</th><th class="num">${number(totals.quantity)}</th><th></th><th class="num">${rupiah(totals.subtotal)}</th><th class="num">${rupiah(totals.vat)}</th><th class="num">${rupiah(totals.cogs)}</th><th class="num">${rupiah(totals.profit)}</th><th></th></tr></tfoot></table></div><footer class="note">Penjualan bersih belum termasuk PPN. Laba kotor = penjualan bersih − HPP FIFO. Dokumen ini adalah laporan operasional dari data aplikasi, bukan laporan pajak atau laporan keuangan formal.</footer></main>`;
}

function renderTransactions(transactions) {
  const rows = transactions.map((transaction) => {
    const amount = transaction.subtotal + (transaction.vat_amount || 0);
    const symbol = transaction.type === "sale" ? "↗" : transaction.type === "purchase" ? "❀" : transaction.type === "adjustment" ? "◌" : "−";
    const rowClass = transaction.type === "purchase" ? "purchase" : transaction.type === "expense" ? "expense" : "";
    const signedAmount = transaction.type === "adjustment" ? Number(transaction.gross_profit) : amount;
    return `<tr><td><div class="transaction-name"><span class="transaction-mark ${rowClass}">${symbol}</span>${escapeHtml(transactionTitle(transaction))}</div></td><td>${transactionKind(transaction.type)}</td><td>${formatDate(transaction.occurred_at)}</td><td><span class="status-pill">Tercatat</span></td><td class="align-right">${rupiah(signedAmount)}</td></tr>`;
  }).join("");
  document.getElementById("recent-transactions").innerHTML = rows || '<tr><td colspan="5" class="table-empty">Belum ada transaksi. Catat penjualan atau pembelian pertamamu.</td></tr>';

  document.getElementById("transactions-table").innerHTML = transactions.map((transaction) => {
    const amount = transaction.type === "adjustment" ? Number(transaction.gross_profit) : transaction.subtotal + (transaction.vat_amount || 0);
    const invoiceActions = transaction.type === "sale"
      ? `<button class="row-edit-button" type="button" data-invoice-transaction="${transaction.id}" aria-label="Buat bukti penjualan ${escapeHtml(transactionTitle(transaction))}" title="Cetak bukti penjualan">Invoice</button>`
      : transaction.type === "purchase"
        ? `${transaction.has_supplier_invoice ? `<a class="row-edit-button" href="${state.apiBase || ""}/api/transactions/${transaction.id}/supplier-invoice" target="_blank" rel="noopener" aria-label="Lihat faktur pemasok ${escapeHtml(transactionTitle(transaction))}">Lihat faktur</a>` : ""}<button class="row-edit-button" type="button" data-upload-supplier-invoice="${transaction.id}" aria-label="${transaction.has_supplier_invoice ? "Ganti" : "Unggah"} faktur pemasok ${escapeHtml(transactionTitle(transaction))}">${transaction.has_supplier_invoice ? "Ganti faktur" : "Unggah faktur"}</button>`
        : "";
    return `<tr><td>${escapeHtml(transactionTitle(transaction))}</td><td>${transactionKind(transaction.type)}</td><td>${escapeHtml(transaction.product_name || "—")}</td><td>${formatDate(transaction.occurred_at)}</td><td class="align-right">${rupiah(amount)}</td><td><div class="row-actions">${invoiceActions}<button class="row-edit-button" type="button" data-edit-transaction="${transaction.id}" aria-label="Edit ${escapeHtml(transactionTitle(transaction))}" title="Edit transaksi">Edit</button></div></td></tr>`;
  }).join("") || '<tr><td colspan="6" class="table-empty">Belum ada transaksi.</td></tr>';
}

function renderInventory(products) {
  document.getElementById("inventory-table").innerHTML = products.map((product) => {
    const suggested = product.selling_price_override == null
      ? suggestedPrice(product.fifo_unit_cost, product.target_margin)
      : Number(product.selling_price_override);
    const low = Number(product.stock) <= Number(product.reorder_level);
    const priceLabel = product.selling_price_override == null ? "otomatis" : "harga tetap";
    return `<tr><td><div class="transaction-name"><span class="flower-thumb"><img src="${flowerImage(product)}" alt="" loading="lazy"></span>${escapeHtml(product.name)}</div></td><td>${escapeHtml(product.category)}</td><td>${number(product.stock)} ${escapeHtml(product.unit)}</td><td>${rupiah(product.fifo_unit_cost)} / ${escapeHtml(product.unit)}</td><td>${rupiah(suggested)} / ${escapeHtml(product.unit)}<small class="price-mode">${priceLabel}</small></td><td><span class="${low ? "inventory-status-low" : ""}">${low ? "Perlu restok" : "Tersedia"}</span></td><td><button class="row-edit-button" type="button" data-edit-product="${product.id}" aria-label="Edit ${escapeHtml(product.name)}" title="Edit produk">Edit</button></td></tr>`;
  }).join("") || '<tr><td colspan="7" class="table-empty">Belum ada produk. Catat pembelian untuk menambahkan persediaan.</td></tr>';
}

function suggestedPrice(cost, margin) {
  const divisor = 1 - Number(margin || 0.4);
  return divisor > 0 ? Math.ceil((Number(cost || 0) / divisor) / 100) * 100 : 0;
}

async function refreshDashboard() {
  const days = document.getElementById("chart-period").value;
  const dashboard = await request(`/api/dashboard?days=${encodeURIComponent(days)}`);
  state.dashboard = dashboard;
  updateMetrics(dashboard);
}

async function refreshProducts() {
  state.products = await request("/api/products");
  renderInventory(state.products);
  const lowStock = state.products.filter((product) => Number(product.stock) <= Number(product.reorder_level));
  renderLowStock(lowStock);
  document.getElementById("nav-low-stock").textContent = lowStock.length;
}

async function refreshTransactions() {
  state.transactions = await request("/api/transactions?limit=100");
  renderTransactions(state.transactions);
}

async function refreshAll() {
  try {
    await Promise.all([refreshDashboard(), refreshProducts(), refreshTransactions()]);
    document.getElementById("app-notice").hidden = true;
    const connectionLabel = location.protocol === "file:"
      ? `Terhubung ke Supabase (port ${new URL(state.apiBase).port})`
      : "Terhubung ke Supabase";
    document.getElementById("connection-state").textContent = connectionLabel;
    document.getElementById("connection-dot").classList.remove("connection-error");
  } catch (error) {
    document.getElementById("connection-state").textContent = "Basis data belum terhubung";
    document.getElementById("connection-dot").classList.add("connection-error");
    document.getElementById("sales-chart").innerHTML = '<div class="empty-inline">Grafik akan tampil setelah basis data tersambung.</div>';
    document.getElementById("low-stock-list").innerHTML = '<div class="empty-inline">Persediaan belum dapat dimuat.</div>';
    document.getElementById("recent-transactions").innerHTML = '<tr><td colspan="5" class="table-empty">Transaksi belum dapat dimuat.</td></tr>';
    document.getElementById("transactions-table").innerHTML = '<tr><td colspan="6" class="table-empty">Transaksi belum dapat dimuat.</td></tr>';
    document.getElementById("inventory-table").innerHTML = '<tr><td colspan="7" class="table-empty">Persediaan belum dapat dimuat.</td></tr>';
    showNotice("Data belum dapat dimuat", `${error.message} Pastikan Supabase sudah disiapkan dan server dijalankan sesuai README.`, "error");
  }
}

function switchPage(view) {
  const page = pageNames[view] ? view : "profile";
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === page));
  document.getElementById("breadcrumb-current").textContent = pageNames[page];
  document.getElementById("profile-section").hidden = page !== "profile";
  document.querySelector(".page-heading").hidden = page === "profile";
  document.getElementById("page-title").innerHTML = `${page === "dashboard" ? "Ringkasan hari ini" : pageNames[page]}<span>.</span>`;
  document.getElementById("inventory-section").hidden = page !== "inventory";
  document.getElementById("transactions-section").hidden = page !== "transactions";
  document.getElementById("reports-section").hidden = page !== "reports";
  document.querySelector(".metrics-grid").hidden = page !== "dashboard";
  document.querySelector(".overview-grid").hidden = page !== "dashboard";
  document.querySelector(".recent-panel").hidden = page !== "dashboard";
}

function field(label, name, type, options = {}) {
  const span = options.full ? " full-width" : "";
  const hint = options.hint ? `<small class="field-hint">${options.hint}</small>` : "";
  const input = options.options
    ? `<select class="select-input" name="${name}" id="${name}" ${options.required ? "required" : ""}>${options.options}</select>`
    : `<input class="text-input" name="${name}" id="${name}" type="${type}" ${options.min != null ? `min="${options.min}"` : ""} ${options.step ? `step="${options.step}"` : ""} ${options.required ? "required" : ""} ${options.disabled ? "disabled" : ""} ${options.value != null ? `value="${escapeHtml(options.value)}"` : ""} ${options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : ""}>`;
  return `<label class="form-field${span}" for="${name}"><span class="field-label">${label}</span>${input}${hint}</label>`;
}

function purchaseItemMarkup(index) {
  const choices = state.products.map((product) =>
    `<option value="${product.id}">${escapeHtml(product.name)} · stok ${number(product.stock)} ${escapeHtml(product.unit)}</option>`
  ).join("");
  const options = `<option value="">Pilih bunga</option>${choices}<option value="__new__">＋ Daftarkan bunga baru</option>`;
  return `<section class="multi-item-row" data-item-row="purchase" data-index="${index}">
    <div class="multi-item-heading"><strong>Bunga ${index + 1}</strong><button class="row-edit-button" type="button" data-remove-item aria-label="Hapus bunga ${index + 1}" ${index === 0 ? "hidden" : ""}>Hapus</button></div>
    ${field("Pilih bunga", `product_${index}`, "select", { required: true, options })}
    ${field("Jumlah dibeli", `quantity_${index}`, "number", { required: true, min: 0.01, step: 0.01, value: 1 })}
    ${field("Biaya per unit (Rp)", `unit_cost_${index}`, "number", { required: true, min: 0.01, step: 1000, placeholder: "Termasuk biaya langsung" })}
    <div class="multi-new-product full-width" hidden>
      ${field("Nama bunga baru", `new_name_${index}`, "text", { required: true, placeholder: "Contoh: Mawar pink" })}
      ${field("Kategori", `new_category_${index}`, "text", { required: true, placeholder: "Mawar, tulip, filler…" })}
      ${field("Satuan", `new_unit_${index}`, "text", { required: true, value: "batang" })}
      ${field("Ambang stok minimum", `new_reorder_${index}`, "number", { min: 0, step: 1, value: 5 })}
      ${field("Margin harga jual (%)", `new_margin_${index}`, "number", { min: 1, max: 89, step: 1, value: 55 })}
    </div>
  </section>`;
}

function saleItemMarkup(index) {
  const choices = state.products.filter((product) => Number(product.stock) > 0).map((product) =>
    `<option value="${product.id}">${escapeHtml(product.name)} · ${number(product.stock)} ${escapeHtml(product.unit)} tersisa</option>`
  ).join("");
  return `<section class="multi-item-row" data-item-row="sale" data-index="${index}">
    <div class="multi-item-heading"><strong>Bunga ${index + 1}</strong><button class="row-edit-button" type="button" data-remove-item aria-label="Hapus bunga ${index + 1}" ${index === 0 ? "hidden" : ""}>Hapus</button></div>
    ${field("Pilih bunga", `product_${index}`, "select", { required: true, options: `<option value="">Pilih bunga</option>${choices}` })}
    ${field("Jumlah", `quantity_${index}`, "number", { required: true, min: 0.01, step: 0.01, value: 1 })}
    ${field("Margin target (%)", `margin_${index}`, "number", { required: true, min: 1, max: 89, step: 1, value: 55 })}
    <div class="multi-price-preview field-hint full-width" data-price-preview>Harga saran: pilih bunga.</div>
  </section>`;
}

function renumberItemRows(container) {
  container.querySelectorAll("[data-item-row]").forEach((row, index) => {
    row.dataset.index = String(index);
    row.querySelector(".multi-item-heading strong").textContent = `Bunga ${index + 1}`;
    const remove = row.querySelector("[data-remove-item]");
    remove.hidden = index === 0;
    remove.setAttribute("aria-label", `Hapus bunga ${index + 1}`);
    row.querySelectorAll("input, select").forEach((input) => {
      const name = input.name.replace(/_\d+$/, `_${index}`);
      const id = input.id.replace(/_\d+$/, `_${index}`);
      input.name = name;
      input.id = id;
      input.closest(".form-field")?.setAttribute("for", id);
    });
  });
}

function updateMultiSalePreview(row) {
  const fields = row.closest("#transaction-fields");
  const product = state.products.find((item) => item.id === row.querySelector("select")?.value);
  const preview = row.querySelector("[data-price-preview]");
  if (!product || !preview) {
    preview.textContent = "Harga saran: pilih bunga.";
    return;
  }
  const unitPrice = product.selling_price_override == null
    ? suggestedPrice(product.fifo_unit_cost, Number(row.querySelector('input[name^="margin_"]').value) / 100)
    : Number(product.selling_price_override);
  preview.textContent = `${product.selling_price_override == null ? "Harga saran otomatis" : "Harga jual tetap"}: ${rupiah(unitPrice)} / ${product.unit}`;
  const count = fields.querySelectorAll('[data-item-row="sale"]').length;
  const add = fields.querySelector('[data-add-item="sale"]');
  if (add) add.disabled = count >= 30;
}

function openTransactionDialog(type, editing = null) {
  const dialog = document.getElementById("transaction-dialog");
  const fields = document.getElementById("transaction-fields");
  const error = document.getElementById("form-error");
  state.editing = editing ? { ...editing, editType: type } : null;
  error.hidden = true;
  document.getElementById("transaction-type").value = type;
  const config = {
    sale: {
      eyebrow: editing ? "EDIT PENJUALAN" : "PENJUALAN BARU",
      title: editing ? "Ubah data penjualan" : "Rangkai transaksi",
      button: editing ? "Simpan perubahan" : "Simpan penjualan",
      html: () => {
        if (editing) return `<p class="field-hint full-width">${escapeHtml(editing.product_name || "Penjualan")} · jumlah dan HPP FIFO tetap agar alokasi persediaan historis tidak berubah.</p>
          ${field("Keterangan", "description", "text", { required: true, value: editing.description })}
          ${field("Tanggal", "occurred_at", "date", { full: true, value: transactionDate(editing.occurred_at) })}
          ${field("Harga jual per unit (Rp)", "unit_price", "number", { required: true, min: 0.01, step: 100, value: editing.unit_price })}
          ${field("PPN (%)", "vat_rate", "number", { min: 0, step: 0.01, value: Number(editing.vat_rate) * 100 })}`;
        if (!state.products.some((product) => Number(product.stock) > 0)) return '<p class="field-hint full-width">Belum ada bunga yang tersedia untuk dijual. Catat pembelian terlebih dahulu.</p>';
        return `<div class="multi-items full-width" data-items-container="sale">${saleItemMarkup(0)}</div>
          <button class="button button-quiet full-width" type="button" data-add-item="sale">＋ Tambah jenis bunga</button>
          ${field("PPN (%)", "vat_rate", "number", { min: 0, step: 0.01, value: state.settings.vatEnabled ? state.settings.vatRate : 0, hint: state.settings.vatEnabled ? "Tarif PPN berlaku untuk semua item dalam transaksi ini." : "PPN nonaktif. Atur di pengaturan bila tokomu PKP." })}
          ${field("Catatan transaksi (opsional)", "description", "text", { full: true, placeholder: "Contoh: Pesanan buket ulang tahun" })}
          <p class="field-hint full-width">Semua item disimpan sebagai satu transaksi. Stok setiap jenis bunga divalidasi dan dikurangi memakai FIFO.</p>`;
      }
    },
    purchase: {
      eyebrow: editing ? "EDIT PEMBELIAN" : "RESTOK PERSEDIAAN",
      title: editing ? "Ubah data pembelian" : "Catat pembelian",
      button: editing ? "Simpan perubahan" : "Simpan pembelian",
      html: () => {
        if (editing) {
          const canEditBatch = editing.batch_quantity != null && Number(editing.batch_quantity) === Number(editing.batch_remaining);
          const hasSales = state.transactions.some((transaction) => transaction.product_id === editing.product_id && transaction.type === "sale");
          return `<p class="field-hint full-width">${escapeHtml(editing.product_name || "Pembelian")} · ${canEditBatch ? "batch belum terpakai, sehingga jumlah dan biaya dapat diubah dengan aman." : "batch sudah terpakai atau merupakan data lama; jumlah, biaya, pemasok, dan tanggal dikunci agar stok FIFO tetap konsisten."}${hasSales ? " Tanggal pembelian dikunci karena produk ini sudah memiliki penjualan." : ""}</p>
            ${field("Keterangan", "description", "text", { required: true, value: editing.description })}
            ${field("Jumlah dibeli", "quantity", "number", { required: true, min: 0.01, step: 0.01, value: editing.quantity, disabled: !canEditBatch })}
            ${field("Biaya per unit (Rp)", "unit_cost", "number", { required: true, min: 0.01, step: 1000, value: editing.unit_price, disabled: !canEditBatch })}
            ${field("Pemasok", "supplier", "text", { full: true, value: editing.batch_supplier || "", disabled: !canEditBatch })}
            ${field("Tanggal", "occurred_at", "date", { full: true, value: transactionDate(editing.occurred_at), disabled: !canEditBatch || hasSales })}`;
        }
        return `<div class="multi-items full-width" data-items-container="purchase">${purchaseItemMarkup(0)}</div>
          <button class="button button-quiet full-width" type="button" data-add-item="purchase">＋ Tambah jenis bunga</button>
          ${field("Pemasok (opsional)", "supplier", "text", { full: true, placeholder: "Nama pemasok bunga" })}
          <p class="field-hint full-width">Semua item disimpan bersama. Jika satu baris gagal, seluruh pembelian batal tersimpan.</p>`;
      }
    },
    expense: {
      eyebrow: editing ? "EDIT BIAYA" : "BIAYA OPERASIONAL",
      title: editing ? "Ubah data biaya" : "Catat biaya usaha",
      button: editing ? "Simpan perubahan" : "Simpan biaya",
      html: () => `${field("Kategori biaya", "description", "text", { required: true, value: editing?.description, placeholder: "Contoh: Sewa toko, kemasan, listrik" })}
        ${field("Nominal (Rp)", "amount", "number", { required: true, min: 1, step: 1000, value: editing?.subtotal, placeholder: "0" })}
        ${field("Tanggal", "occurred_at", "date", { full: true, value: editing ? transactionDate(editing.occurred_at) : localDate() })}`
    },
    adjustment: {
      eyebrow: "EDIT PENYESUAIAN",
      title: "Ubah keterangan penilaian",
      button: "Simpan perubahan",
      html: () => `<p class="field-hint full-width">Nilai penyesuaian NRV tidak dapat diubah langsung karena terkait nilai buku stok. Untuk memperbaruinya, lakukan penilaian NRV baru.</p>
        ${field("Keterangan", "description", "text", { required: true, value: editing.description })}
        ${field("Tanggal", "occurred_at", "date", { full: true, value: transactionDate(editing.occurred_at) })}`
    },
    product: {
      eyebrow: "EDIT PRODUK",
      title: "Ubah data bunga",
      button: "Simpan perubahan",
      html: () => `${field("Nama bunga", "name", "text", { required: true, value: editing.name })}
        ${field("Kategori", "category", "text", { required: true, value: editing.category })}
        ${field("Satuan", "unit", "text", { required: true, value: editing.unit, hint: "Satuan tidak dapat diubah jika produk sudah memiliki transaksi." })}
        ${field("Ambang stok minimum", "reorder_level", "number", { min: 0, step: 1, value: editing.reorder_level })}
        ${field("Margin harga jual (%)", "target_margin", "number", { required: true, min: 1, max: 89, step: 1, value: Math.round(Number(editing.target_margin) * 100) })}
        ${field("Harga jual per unit (Rp)", "selling_price_override", "number", { min: 0.01, step: 100, value: editing.selling_price_override ?? "", hint: "Isi harga jual tetap. Kosongkan untuk kembali memakai saran otomatis dari HPP dan margin." })}`
    },
    nrv: {
      eyebrow: "PENGUKURAN PERSEDIAAN",
      title: "Uji nilai realisasi neto",
      button: "Simpan penilaian",
      html: () => {
        const choices = state.products.filter((product) => Number(product.stock) > 0).map((product) =>
          `<option value="${product.id}">${escapeHtml(product.name)} · nilai buku ${rupiah(product.fifo_unit_cost)} / ${escapeHtml(product.unit)}</option>`
        ).join("");
        return `${field("Pilih bunga", "product_id", "select", { required: true, options: choices || '<option value="">Tidak ada stok tersedia</option>' })}
          ${field("Estimasi NRV neto per unit (Rp)", "nrv_unit", "number", { required: true, min: 0, step: 100, placeholder: "Terisi otomatis dari harga jual normal", hint: "Pilih bunga untuk mengisi estimasi otomatis. Koreksi bila ada biaya penyelesaian atau penjualan per unit." })}
          <p class="field-hint full-width">NRV adalah estimasi harga jual normal dikurangi biaya penyelesaian dan penjualan. Stok diukur pada nilai terendah antara biaya perolehan dan NRV; pemulihan dibatasi sebesar biaya awal.</p>`;
      }
    }
  }[type];
  document.getElementById("dialog-eyebrow").textContent = config.eyebrow;
  document.getElementById("dialog-title").textContent = config.title;
  document.getElementById("submit-transaction").textContent = config.button;
  fields.innerHTML = config.html();
  if (type === "sale" && editing) {
    fields.querySelector("#product_id")?.addEventListener("change", () => {
      const selectedProduct = state.products.find((product) => product.id === fields.querySelector("#product_id").value);
      if (selectedProduct) {
        fields.querySelector("#target_margin").value = Math.round(Number(selectedProduct.target_margin) * 100);
      }
      updateSalePreview();
    });
    fields.querySelector("#quantity")?.addEventListener("input", updateSalePreview);
    fields.querySelector("#target_margin")?.addEventListener("input", updateSalePreview);
    fields.querySelector("#vat_rate")?.addEventListener("input", updateSalePreview);
    fields.querySelector("#product_id")?.dispatchEvent(new Event("change"));
  }
  if (type === "nrv") {
    const productSelect = fields.querySelector("#product_id");
    productSelect?.addEventListener("change", updateNrvEstimate);
    productSelect?.dispatchEvent(new Event("change"));
  }
  if ((type === "purchase" || type === "sale") && !editing) {
    const container = fields.querySelector("[data-items-container]");
    const addItem = fields.querySelector("[data-add-item]");
    addItem.addEventListener("click", () => {
      const index = container.querySelectorAll("[data-item-row]").length;
      if (index >= 30) return;
      container.insertAdjacentHTML("beforeend", type === "sale" ? saleItemMarkup(index) : purchaseItemMarkup(index));
      if (type === "sale") updateMultiSalePreview(container.lastElementChild);
    });
    container.addEventListener("click", (event) => {
      if (!event.target.closest("[data-remove-item]")) return;
      event.target.closest("[data-item-row]").remove();
      renumberItemRows(container);
      if (type === "sale") container.querySelectorAll("[data-item-row]").forEach(updateMultiSalePreview);
      addItem.disabled = container.querySelectorAll("[data-item-row]").length >= 30;
    });
    if (type === "purchase") {
      container.addEventListener("change", (event) => {
        if (!event.target.matches("select")) return;
        const row = event.target.closest("[data-item-row]");
        const isNew = event.target.value === "__new__";
        const newProductFields = row.querySelector(".multi-new-product");
        newProductFields.hidden = !isNew;
        newProductFields.querySelectorAll("input").forEach((input) => {
          input.required = isNew && !input.name.startsWith("new_reorder_") && !input.name.startsWith("new_margin_");
        });
      });
      container.querySelector("select").dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      container.addEventListener("input", (event) => {
        if (event.target.matches("select, input")) updateMultiSalePreview(event.target.closest("[data-item-row]"));
      });
      container.addEventListener("change", (event) => {
        if (event.target.matches("select")) {
          const row = event.target.closest("[data-item-row]");
          const product = state.products.find((item) => item.id === event.target.value);
          if (product) row.querySelector('input[name^="margin_"]').value = Math.round(Number(product.target_margin) * 100);
          updateMultiSalePreview(row);
        }
      });
      container.querySelectorAll("[data-item-row]").forEach(updateMultiSalePreview);
    }
  }
  dialog.showModal();
}

function updateSalePreview() {
  const form = document.getElementById("transaction-fields");
  const product = state.products.find((item) => item.id === form.querySelector("#product_id")?.value);
  const priceBox = form.querySelector("#price-preview");
  if (!product || !priceBox) return;
  const margin = Number(form.querySelector("#target_margin").value) / 100;
  const vatRate = Number(form.querySelector("#vat_rate").value) / 100;
  const unitPrice = product.selling_price_override == null
    ? suggestedPrice(product.fifo_unit_cost, margin)
    : Number(product.selling_price_override);
  const priceMode = product.selling_price_override == null ? "saran otomatis" : "harga jual tetap dari pengaturan produk";
  priceBox.querySelector("strong").textContent = `${rupiah(unitPrice)} / ${product.unit}${vatRate ? ` · ${rupiah(unitPrice * (1 + vatRate))} termasuk PPN` : ""}`;
  priceBox.querySelector(".field-hint").textContent = `${priceMode}. Harga final yang disimpan mengikuti alokasi HPP FIFO.`;
}

function updateNrvEstimate() {
  const form = document.getElementById("transaction-fields");
  const product = state.products.find((item) => item.id === form.querySelector("#product_id")?.value);
  const estimate = form.querySelector("#nrv_unit");
  const hint = estimate?.closest(".form-field")?.querySelector(".field-hint");
  if (!product || !estimate || !hint) return;
  const sellingPrice = product.selling_price_override == null
    ? suggestedPrice(product.fifo_unit_cost, product.target_margin)
    : Number(product.selling_price_override);
  estimate.value = String(sellingPrice);
  hint.textContent = `Estimasi otomatis: harga jual normal ${rupiah(sellingPrice)} − biaya penyelesaian/penjualan Rp0 (belum dicatat per unit). Koreksi nilai bila ada biaya terkait.`;
}

async function submitTransaction(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const type = document.getElementById("transaction-type").value;
  const data = Object.fromEntries(new FormData(form).entries());
  const message = document.getElementById("form-error");
  message.hidden = true;
  const submit = document.getElementById("submit-transaction");
  submit.disabled = true;
  submit.textContent = "Menyimpan...";
  try {
    if (state.editing?.editType === "product") {
      const payload = {
        name: data.name,
        category: data.category,
        unit: data.unit,
        reorder_level: Number(data.reorder_level || 0),
        target_margin: Number(data.target_margin) / 100,
        selling_price_override: data.selling_price_override === "" ? null : Number(data.selling_price_override)
      };
      await request(`/api/products/${state.editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
      showNotice("Produk diperbarui", `${data.name} berhasil diperbarui.`, "success");
    } else if (state.editing) {
      let payload;
      if (type === "purchase") {
        payload = {
          description: data.description,
          ...(data.quantity !== undefined ? { quantity: Number(data.quantity) } : {}),
          ...(data.unit_cost !== undefined ? { unit_cost: Number(data.unit_cost) } : {}),
          ...(data.supplier !== undefined ? { supplier: data.supplier } : {}),
          ...(data.occurred_at !== undefined ? { occurred_at: data.occurred_at } : {})
        };
      } else if (type === "sale") {
        payload = {
          description: data.description,
          occurred_at: data.occurred_at,
          unit_price: Number(data.unit_price),
          vat_rate: Number(data.vat_rate || 0) / 100
        };
      } else if (type === "expense") {
        payload = { description: data.description, amount: Number(data.amount), occurred_at: data.occurred_at };
      } else {
        payload = { description: data.description, occurred_at: data.occurred_at };
      }
      await request(`/api/transactions/${state.editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
      showNotice("Transaksi diperbarui", "Perubahan sudah disimpan dan ringkasan laporan diperbarui.", "success");
    } else if (type === "sale") {
      const payload = {
        items: [...document.querySelectorAll('#transaction-fields [data-item-row="sale"]')].map((row) => ({
          product_id: row.querySelector("select").value,
          quantity: Number(row.querySelector('input[name^="quantity_"]').value),
          target_margin: Number(row.querySelector('input[name^="margin_"]').value) / 100
        })),
        vat_rate: Number(data.vat_rate) / 100,
        description: data.description || undefined
      };
      const result = await request("/api/sales/batch", { method: "POST", body: JSON.stringify(payload) });
      showNotice("Penjualan tercatat", `${result.transaction_count} jenis bunga · total ${rupiah(result.total)} termasuk PPN · HPP FIFO ${rupiah(result.cogs)}.`, "success");
    } else if (type === "purchase") {
      const payload = {
        supplier: data.supplier || undefined,
        items: [...document.querySelectorAll('#transaction-fields [data-item-row="purchase"]')].map((row) => {
          const index = row.dataset.index;
          const item = {
            quantity: Number(row.querySelector(`[name="quantity_${index}"]`).value),
            unit_cost: Number(row.querySelector(`[name="unit_cost_${index}"]`).value)
          };
          const productId = row.querySelector("select").value;
          if (productId === "__new__") {
            item.new_product = {
              name: row.querySelector(`[name="new_name_${index}"]`).value,
              category: row.querySelector(`[name="new_category_${index}"]`).value,
              unit: row.querySelector(`[name="new_unit_${index}"]`).value,
              reorder_level: Number(row.querySelector(`[name="new_reorder_${index}"]`).value || 0),
              target_margin: Number(row.querySelector(`[name="new_margin_${index}"]`).value || 55) / 100
            };
          } else {
            item.product_id = productId;
          }
          return item;
        })
      };
      const result = await request("/api/purchases/batch", { method: "POST", body: JSON.stringify(payload) });
      showNotice("Pembelian tercatat", `${result.transaction_count} jenis bunga masuk ke persediaan.`, "success");
    } else if (type === "expense") {
      await request("/api/expenses", {
        method: "POST",
        body: JSON.stringify({ description: data.description, amount: Number(data.amount), occurred_at: data.occurred_at })
      });
      showNotice("Biaya tercatat", `${data.description}: ${rupiah(data.amount)}.`, "success");
    } else {
      const result = await request("/api/nrv", {
        method: "POST",
        body: JSON.stringify({ product_id: data.product_id, nrv_unit: Number(data.nrv_unit) })
      });
      showNotice("Penilaian persediaan selesai", result.adjustment === 0
        ? `${result.product_name}: tidak diperlukan penyesuaian.`
        : `${result.product_name}: penyesuaian bersih ${rupiah(result.adjustment)}.`, "success");
    }
    state.editing = null;
    document.getElementById("transaction-dialog").close();
    await refreshAll();
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = state.editing ? "Simpan perubahan" : ({ sale: "Simpan penjualan", purchase: "Simpan pembelian", expense: "Simpan biaya", nrv: "Simpan penilaian", product: "Simpan perubahan" })[type];
  }
}

function loadSettings() {
  try {
    const saved = localStorage.getItem("petal-ledger-settings");
    if (saved) state.settings = { ...state.settings, ...JSON.parse(saved) };
  } catch (error) {
    showNotice("Pengaturan belum terbaca", `Pengaturan pajak lokal tidak dapat dibaca: ${error.message}`, "error");
  }
  document.getElementById("vat-enabled").checked = state.settings.vatEnabled;
  document.getElementById("vat-rate").value = state.settings.vatRate;
  document.getElementById("income-tax-enabled").checked = state.settings.incomeTaxEnabled;
  document.getElementById("income-tax-rate").value = state.settings.incomeTaxRate;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("today-label").textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
  }).format(new Date());
  document.querySelector(".page-heading .eyebrow").textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(new Date()).toUpperCase();
  loadSettings();
  (async () => {
    try {
      if (location.protocol === "file:") await discoverLocalApi();
      await refreshAll();
    } catch (error) {
      document.getElementById("connection-state").textContent = "Backend belum terhubung";
      document.getElementById("connection-dot").classList.add("connection-error");
      showNotice("Data belum dapat dimuat", error.message, "error");
    }
  })();
  switchPage(location.hash.slice(1) || "profile");

  window.addEventListener("hashchange", () => switchPage(location.hash.slice(1)));
  document.getElementById("enter-dashboard").addEventListener("click", () => { location.hash = "dashboard"; });
  document.getElementById("chart-period").addEventListener("change", refreshDashboard);
  document.getElementById("new-sale-button").addEventListener("click", () => openTransactionDialog("sale"));
  document.getElementById("transactions-sale-button").addEventListener("click", () => openTransactionDialog("sale"));
  document.getElementById("record-expense-button").addEventListener("click", () => openTransactionDialog("expense"));
  document.getElementById("transactions-expense-button").addEventListener("click", () => openTransactionDialog("expense"));
  document.getElementById("download-sales-report").addEventListener("click", downloadSalesReport);
  document.getElementById("print-sales-report").addEventListener("click", printSalesReport);
  const today = localDate();
  document.getElementById("sales-report-from").value = `${today.slice(0, 8)}01`;
  document.getElementById("sales-report-to").value = today;
  document.getElementById("new-purchase-button").addEventListener("click", () => openTransactionDialog("purchase"));
  document.getElementById("assess-nrv-button").addEventListener("click", () => openTransactionDialog("nrv"));
  document.getElementById("settings-button").addEventListener("click", () => document.getElementById("settings-dialog").showModal());
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.getElementById("transaction-form").addEventListener("submit", submitTransaction);
  document.getElementById("inventory-table").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-product]");
    if (!button) return;
    const product = state.products.find((item) => item.id === button.dataset.editProduct);
    if (product) openTransactionDialog("product", product);
  });
  document.getElementById("transactions-table").addEventListener("click", (event) => {
    const uploadButton = event.target.closest("[data-upload-supplier-invoice]");
    if (uploadButton) {
      const transaction = state.transactions.find((item) => item.id === uploadButton.dataset.uploadSupplierInvoice);
      if (!transaction) return;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        const typeByExtension = {
          pdf: "application/pdf",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp"
        };
        const extension = file.name.split(".").pop().toLowerCase();
        const contentType = typeByExtension[extension];
        if (!contentType || (file.type && file.type !== contentType)) {
          showNotice("Format file tidak didukung", "Pilih file faktur PDF, JPG, PNG, atau WEBP.", "error");
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          showNotice("File terlalu besar", "Ukuran faktur maksimal 10 MB.", "error");
          return;
        }
        uploadButton.disabled = true;
        uploadButton.textContent = "Mengunggah...";
        let invoiceSaved = false;
        try {
          const response = await fetch(`${state.apiBase || ""}/api/transactions/${transaction.id}/supplier-invoice`, {
            method: "POST",
            headers: {
              "Content-Type": contentType,
              "X-File-Name": encodeURIComponent(file.name)
            },
            body: file
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || `Unggah gagal (${response.status}).`);
          invoiceSaved = true;
          try {
            await refreshTransactions();
            showNotice("Faktur pemasok tersimpan", `File ${file.name} sudah ditautkan ke transaksi pembelian.`, "success");
          } catch (error) {
            showNotice("Faktur tersimpan, daftar belum diperbarui", `File sudah tersimpan. Muat ulang transaksi untuk melihatnya. ${error.message}`, "error");
          }
        } catch (error) {
          uploadButton.disabled = false;
          uploadButton.textContent = transaction.has_supplier_invoice ? "Ganti faktur" : "Unggah faktur";
          showNotice(invoiceSaved ? "Faktur tersimpan, daftar belum diperbarui" : "Faktur belum tersimpan", error.message, "error");
        }
      });
      input.click();
      return;
    }
    const invoiceButton = event.target.closest("[data-invoice-transaction]");
    if (invoiceButton) {
      const transaction = state.transactions.find((item) => item.id === invoiceButton.dataset.invoiceTransaction);
      if (transaction) printDocument(`Bukti penjualan ${transaction.id}`, invoiceMarkup(transaction));
      return;
    }
    const button = event.target.closest("[data-edit-transaction]");
    if (!button) return;
    const transaction = state.transactions.find((item) => item.id === button.dataset.editTransaction);
    if (transaction) openTransactionDialog(transaction.type, transaction);
  });
  document.getElementById("dismiss-notice").addEventListener("click", () => { document.getElementById("app-notice").hidden = true; });
  document.getElementById("settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const vatRate = Number(document.getElementById("vat-rate").value);
    const incomeTaxRate = Number(document.getElementById("income-tax-rate").value);
    if (vatRate < 0 || vatRate > 100 || incomeTaxRate < 0 || incomeTaxRate > 100) {
      showNotice("Tarif tidak valid", "Masukkan tarif pajak antara 0% hingga 100%.");
      return;
    }
    state.settings = {
      vatEnabled: document.getElementById("vat-enabled").checked,
      vatRate,
      incomeTaxEnabled: document.getElementById("income-tax-enabled").checked,
      incomeTaxRate
    };
    try {
      localStorage.setItem("petal-ledger-settings", JSON.stringify(state.settings));
      if (state.dashboard) updateMetrics(state.dashboard);
      document.getElementById("settings-dialog").close();
      showNotice("Pengaturan disimpan", "Pengaturan pajak tersimpan pada browser ini dan akan diterapkan ke transaksi penjualan baru.", "success");
    } catch (error) {
      showNotice("Pengaturan gagal disimpan", `Peramban tidak dapat menyimpan pengaturan: ${error.message}`, "error");
    }
  });

  async function downloadSalesReport() {
    const from = document.getElementById("sales-report-from").value;
    const to = document.getElementById("sales-report-to").value;
    const button = document.getElementById("download-sales-report");
    if (!from || !to || from > to) {
      showNotice("Rentang tanggal belum benar", "Pilih tanggal mulai dan tanggal akhir yang valid. Tanggal mulai tidak boleh setelah tanggal akhir.");
      return;
    }

    button.disabled = true;
    button.textContent = "Menyiapkan...";
    try {
      const response = await fetch(`${state.apiBase || ""}/api/reports/sales.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Unduhan gagal (${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `jiva-laporan-penjualan-${from}-${to}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showNotice("Laporan berhasil diunduh", `CSV penjualan JIVA FLORIST untuk ${from} sampai ${to} berhasil dibuat.`, "success");
    } catch (error) {
      showNotice("Laporan belum dapat diunduh", error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = "<span>↓</span> Unduh CSV";
    }
  }

  async function printSalesReport() {
    const from = document.getElementById("sales-report-from").value;
    const to = document.getElementById("sales-report-to").value;
    const button = document.getElementById("print-sales-report");
    if (!from || !to || from > to) {
      showNotice("Rentang tanggal belum benar", "Pilih tanggal mulai dan tanggal akhir yang valid. Tanggal mulai tidak boleh setelah tanggal akhir.");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showNotice("Jendela laporan diblokir", "Izinkan pop-up untuk situs atau file ini, lalu coba lagi.", "error");
      return;
    }
    button.disabled = true;
    button.textContent = "Menyiapkan...";
    try {
      const response = await fetch(`${state.apiBase || ""}/api/reports/sales.json?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const report = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(report.error || `Laporan gagal dimuat (${response.status}).`);
      printDocument(`Laporan penjualan JIVA FLORIST ${from} - ${to}`, salesReportMarkup(report), printWindow, true);
    } catch (error) {
      printWindow.close();
      showNotice("Laporan belum dapat dicetak", error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = "<span>▣</span> Cetak / PDF";
    }
  }
});
