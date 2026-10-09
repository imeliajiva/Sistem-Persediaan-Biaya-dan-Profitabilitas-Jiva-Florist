"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const supabase = require("./supabase");

const projectRoot = path.resolve(__dirname, "..");
const nestedFrontendRoot = path.join(projectRoot, "frontend");
const hasNestedFrontend = fs.existsSync(path.join(nestedFrontendRoot, "index.html"));
const root = hasNestedFrontend ? projectRoot : __dirname;
const frontendRoot = hasNestedFrontend ? nestedFrontendRoot : __dirname;
const production = process.env.NODE_ENV === "production";
const authRequired = production;
const sessionCookieName = "jiva_session";
const sessionDurationSeconds = 60 * 60 * 12;
const loginAttempts = new Map();
const host = process.env.HOST || (production ? "0.0.0.0" : "127.0.0.1");
const port = Number(process.env.PORT || 3000);
const authConfig = production ? {
  username: process.env.APP_USERNAME,
  password: process.env.APP_PASSWORD,
  secret: process.env.SESSION_SECRET
} : null;

if (production && (!authConfig.username || !authConfig.password || Buffer.byteLength(authConfig.password) < 12
  || !authConfig.secret || Buffer.byteLength(authConfig.secret) < 32)) {
  throw new Error("Atur APP_USERNAME, APP_PASSWORD (minimal 12 karakter), dan SESSION_SECRET (minimal 32 karakter) pada environment hosting.");
}

const publicFiles = new Set([
  path.join(frontendRoot, "index.html"),
  path.join(frontendRoot, "style.css"),
  path.join(frontendRoot, "script.js")
]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function allowLocalFileOrigin(request, response) {
  if (request.headers.origin === "null") {
    response.setHeader("Access-Control-Allow-Origin", "null");
    response.setHeader("Vary", "Origin");
  }
}

function sessionSignature(payload) {
  return crypto.createHmac("sha256", authConfig.secret).update(payload).digest("base64url");
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? ["", ""] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }).filter(([name]) => name));
}

function isAuthenticated(request) {
  if (!authRequired) return true;
  const token = parseCookies(request.headers.cookie)[sessionCookieName];
  if (!token) return false;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return false;
  const expectedSignature = sessionSignature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.username === authConfig.username
      && Number.isInteger(session.expires)
      && session.expires > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function createSession(username) {
  const payload = Buffer.from(JSON.stringify({
    username,
    expires: Math.floor(Date.now() / 1000) + sessionDurationSeconds
  })).toString("base64url");
  return `${payload}.${sessionSignature(payload)}`;
}

function setSessionCookie(response, token) {
  const secure = production ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${sessionDurationSeconds}`);
}

function clearSessionCookie(response) {
  const secure = production ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`);
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!production) return true;
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const forwardedProtocol = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    return parsed.protocol === "https:" && parsed.host === request.headers.host && forwardedProtocol === "https";
  } catch {
    return false;
  }
}

function allowLoginAttempt(request) {
  const forwardedAddress = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const key = forwardedAddress || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  if (loginAttempts.size > 1000) {
    for (const [address, attempt] of loginAttempts) {
      if (attempt.resetAt <= now) loginAttempts.delete(address);
    }
  }
  const record = loginAttempts.get(key);
  if (!record || record.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (record.count >= 5) return false;
  record.count += 1;
  return true;
}

function verifyCredentials(username, password) {
  const submitted = crypto.createHash("sha256").update(`${username}\0${password}`).digest();
  const expected = crypto.createHash("sha256").update(`${authConfig.username}\0${authConfig.password}`).digest();
  return crypto.timingSafeEqual(submitted, expected);
}

function sendCsv(response, filename, rows) {
  const escapeCell = (value) => {
    let text = String(value ?? "");
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const headings = [
    "Waktu transaksi",
    "Produk",
    "Jumlah",
    "Satuan",
    "Harga per unit (Rp)",
    "Penjualan bersih (Rp)",
    "PPN (%)",
    "PPN (Rp)",
    "HPP FIFO (Rp)",
    "Laba kotor (Rp)",
    "Catatan"
  ];
  const lines = [
    headings,
    ...rows.map((row) => [
      row.occurred_at,
      row.product_name,
      row.quantity,
      row.unit,
      row.unit_price,
      row.subtotal,
      Number(row.vat_rate) * 100,
      row.vat_amount,
      row.cogs,
      row.gross_profit,
      row.description
    ])
  ].map((line) => line.map(escapeCell).join(","));

  response.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(`\uFEFF${lines.join("\r\n")}`);
}

function parseReportDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw Object.assign(new Error(`${label} wajib diisi dengan tanggal yang valid.`), { statusCode: 400 });
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw Object.assign(new Error(`${label} bukan tanggal kalender yang valid.`), { statusCode: 400 });
  }
  return value;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 32768) {
      const error = new Error("Ukuran permintaan melebihi batas 32 KB.");
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    const parsed = JSON.parse(body || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Body harus berupa objek JSON.");
    return parsed;
  } catch (error) {
    if (!error.statusCode) error.statusCode = 400;
    throw error;
  }
}

async function readBinary(request, maximumBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) {
      throw Object.assign(new Error("Ukuran faktur maksimal 10 MB."), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  if (!size) throw Object.assign(new Error("File faktur kosong."), { statusCode: 400 });
  return Buffer.concat(chunks, size);
}

function validateInvoiceFile(file, contentType) {
  const signatures = {
    "application/pdf": file.subarray(0, 5).toString("ascii") === "%PDF-",
    "image/jpeg": file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff,
    "image/png": file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/webp": file.length >= 12 && file.subarray(0, 4).toString("ascii") === "RIFF" && file.subarray(8, 12).toString("ascii") === "WEBP"
  };
  if (!Object.hasOwn(signatures, contentType)) {
    throw Object.assign(new Error("Format faktur harus PDF, JPG, PNG, atau WEBP."), { statusCode: 415 });
  }
  if (!signatures[contentType]) {
    throw Object.assign(new Error("Isi file tidak sesuai dengan format faktur yang dipilih."), { statusCode: 400 });
  }
}

function sanitizeInvoiceFileName(value, contentType) {
  let fileName;
  try {
    fileName = decodeURIComponent(value || "");
  } catch {
    throw Object.assign(new Error("Nama file faktur tidak valid."), { statusCode: 400 });
  }
  fileName = fileName.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
  if (!fileName) {
    const extension = ({ "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[contentType];
    fileName = `faktur-pemasok.${extension}`;
  }
  return fileName;
}

function requireNumber(value, label, { min = 0, max = 1000000, exclusiveMin = false } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || (exclusiveMin ? numeric <= min : numeric < min) || numeric > max) {
    throw Object.assign(new Error(`${label} harus ${exclusiveMin ? "lebih besar dari" : "minimal"} ${min}${max === 1000000 ? "" : ` dan maksimal ${max}`}.`), { statusCode: 400 });
  }
  return numeric;
}

function requireText(value, label, maxLength = 240) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw Object.assign(new Error(`${label} wajib diisi (maksimal ${maxLength} karakter).`), { statusCode: 400 });
  }
  return value.trim();
}

function normalizeNewProduct(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("Data produk baru harus berupa objek."), { statusCode: 400 });
  }
  const margin = requireNumber(value.target_margin ?? 0.55, "Margin target", { min: 0, max: 0.9, exclusiveMin: true });
  if (margin >= 0.9) throw Object.assign(new Error("Margin target harus kurang dari 90%."), { statusCode: 400 });
  return {
    name: requireText(value.name, "Nama produk", 120),
    category: requireText(value.category, "Kategori produk", 80),
    unit: requireText(value.unit || "batang", "Satuan produk", 30),
    reorder_level: requireNumber(value.reorder_level ?? 0, "Ambang stok", { max: 1000000 }),
    target_margin: margin
  };
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/auth/session") {
    return sendJson(response, 200, { authenticated: isAuthenticated(request), required: authRequired });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    if (!authRequired) return sendJson(response, 200, { authenticated: true });
    if (!allowLoginAttempt(request)) {
      return sendJson(response, 429, { error: "Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit." });
    }
    const body = await readJson(request);
    if (typeof body.username !== "string" || typeof body.password !== "string"
      || !verifyCredentials(body.username, body.password)) {
      return sendJson(response, 401, { error: "Nama pengguna atau kata sandi tidak sesuai." });
    }
    const key = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim() || request.socket.remoteAddress || "unknown";
    loginAttempts.delete(key);
    setSessionCookie(response, createSession(body.username));
    return sendJson(response, 200, { authenticated: true });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    clearSessionCookie(response);
    return sendJson(response, 200, { authenticated: false });
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    try {
      await supabase.getDashboard(1);
      return sendJson(response, 200, { status: "ok", database: "connected", features: ["supplier-invoices"] });
    } catch (error) {
      if (production) {
        console.error(`[health] ${error.message}`);
        return sendJson(response, 503, { status: "error", database: "unavailable" });
      }
      return sendJson(response, 503, { error: error.message });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/products") {
    return sendJson(response, 200, await supabase.getProducts());
  }
  if (request.method === "GET" && url.pathname === "/api/dashboard") {
    const days = requireNumber(url.searchParams.get("days") || 7, "Periode grafik", { min: 1, max: 90 });
    return sendJson(response, 200, await supabase.getDashboard(Math.floor(days)));
  }
  if (request.method === "GET" && url.pathname === "/api/transactions") {
    const limit = requireNumber(url.searchParams.get("limit") || 100, "Jumlah transaksi", { min: 1, max: 100 });
    return sendJson(response, 200, await supabase.getTransactions(Math.floor(limit)));
  }
  const invoiceFile = url.pathname.match(/^\/api\/transactions\/([0-9a-f-]+)\/supplier-invoice$/i);
  if (invoiceFile) {
    const id = invoiceFile[1];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw Object.assign(new Error("ID transaksi tidak valid."), { statusCode: 400 });
    }
    if (request.method === "POST") {
      const contentType = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
      if (!allowedTypes.has(contentType)) {
        throw Object.assign(new Error("Pilih faktur berformat PDF, JPG, PNG, atau WEBP."), { statusCode: 415 });
      }
      const file = await readBinary(request, 10 * 1024 * 1024);
      validateInvoiceFile(file, contentType);
      const fileName = sanitizeInvoiceFileName(request.headers["x-file-name"], contentType);
      return sendJson(response, 200, await supabase.saveSupplierInvoice(id, fileName, contentType, file));
    }
    if (request.method === "GET") {
      const invoice = await supabase.getSupplierInvoice(id);
      const safeFallback = `faktur-pemasok-${id.slice(0, 8)}`;
      response.writeHead(200, {
        "Content-Type": invoice.contentType,
        "Content-Disposition": `inline; filename="${safeFallback}"; filename*=UTF-8''${encodeURIComponent(invoice.fileName)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(invoice.file);
      return;
    }
    throw Object.assign(new Error("Metode permintaan tidak didukung."), { statusCode: 405 });
  }
  const productEdit = url.pathname.match(/^\/api\/products\/([0-9a-f-]+)$/i);
  const transactionEdit = url.pathname.match(/^\/api\/transactions\/([0-9a-f-]+)$/i);
  if (request.method === "PUT" && (productEdit || transactionEdit)) {
    const id = (productEdit || transactionEdit)[1];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw Object.assign(new Error("ID data tidak valid."), { statusCode: 400 });
    }
    const body = await readJson(request);
    if (productEdit) {
      const allowed = ["name", "category", "unit", "reorder_level", "target_margin", "selling_price_override"];
      const changes = {};
      for (const key of allowed) {
        if (!(key in body)) continue;
        if (key === "reorder_level") changes[key] = requireNumber(body[key], "Ambang stok", { max: 1000000 });
        else if (key === "target_margin") {
          const margin = requireNumber(body[key], "Margin target", { min: 0, max: 0.9, exclusiveMin: true });
          if (margin >= 0.9) throw Object.assign(new Error("Margin target harus kurang dari 90%."), { statusCode: 400 });
          changes[key] = margin;
        } else if (key === "selling_price_override") {
          changes[key] = body[key] === null || body[key] === ""
            ? null
            : requireNumber(body[key], "Harga jual tetap", { min: 0, exclusiveMin: true, max: 1000000000000 });
        } else changes[key] = requireText(body[key], key === "name" ? "Nama produk" : key === "category" ? "Kategori produk" : "Satuan produk", key === "name" ? 120 : key === "category" ? 80 : 30);
      }
      if (!Object.keys(changes).length) throw Object.assign(new Error("Tidak ada perubahan produk yang dikirim."), { statusCode: 400 });
      return sendJson(response, 200, await supabase.rpc("edit_product", {
        p_product_id: id,
        p_changes: changes
      }));
    }

    const changes = {};
    if (body.description !== undefined) changes.description = requireText(body.description, "Keterangan transaksi");
    if (body.occurred_at !== undefined) {
      if (typeof body.occurred_at !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.occurred_at) || Number.isNaN(Date.parse(`${body.occurred_at}T12:00:00+07:00`))) {
        throw Object.assign(new Error("Tanggal transaksi tidak valid."), { statusCode: 400 });
      }
      changes.occurred_at = new Date(`${body.occurred_at}T12:00:00+07:00`).toISOString();
    }
    if (body.quantity !== undefined) changes.quantity = requireNumber(body.quantity, "Jumlah pembelian", { min: 0, exclusiveMin: true });
    if (body.unit_cost !== undefined) changes.unit_cost = requireNumber(body.unit_cost, "Biaya per unit", { min: 0, exclusiveMin: true, max: 1000000000000 });
    if (body.supplier !== undefined) changes.supplier = body.supplier === "" ? "" : requireText(body.supplier, "Nama pemasok", 120);
    if (body.unit_price !== undefined) changes.unit_price = requireNumber(body.unit_price, "Harga jual per unit", { min: 0, exclusiveMin: true, max: 1000000000000 });
    if (body.vat_rate !== undefined) changes.vat_rate = requireNumber(body.vat_rate, "Tarif PPN", { min: 0, max: 1 });
    if (body.amount !== undefined) changes.amount = requireNumber(body.amount, "Nominal biaya", { min: 0, exclusiveMin: true, max: 1000000000000 });
    if (!Object.keys(changes).length) throw Object.assign(new Error("Tidak ada perubahan transaksi yang dikirim."), { statusCode: 400 });
    return sendJson(response, 200, await supabase.rpc("edit_transaction", {
      p_transaction_id: id,
      p_changes: changes
    }));
  }
  if (request.method === "GET" && url.pathname === "/api/reports/sales.csv") {
    const from = parseReportDate(url.searchParams.get("from"), "Tanggal mulai");
    const to = parseReportDate(url.searchParams.get("to"), "Tanggal akhir");
    if (from > to) {
      throw Object.assign(new Error("Tanggal mulai harus sama dengan atau sebelum tanggal akhir."), { statusCode: 400 });
    }
    const nextDay = new Date(`${to}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const fromTimestamp = new Date(`${from}T00:00:00+07:00`).toISOString();
    const untilTimestamp = new Date(`${nextDay.toISOString().slice(0, 10)}T00:00:00+07:00`).toISOString();
    const rows = await supabase.getSalesReport(fromTimestamp, untilTimestamp);
    return sendCsv(response, `jiva-laporan-penjualan-${from}-${to}.csv`, rows);
  }
  if (request.method === "GET" && url.pathname === "/api/reports/sales.json") {
    const from = parseReportDate(url.searchParams.get("from"), "Tanggal mulai");
    const to = parseReportDate(url.searchParams.get("to"), "Tanggal akhir");
    if (from > to) {
      throw Object.assign(new Error("Tanggal mulai harus sama dengan atau sebelum tanggal akhir."), { statusCode: 400 });
    }
    const nextDay = new Date(`${to}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const fromTimestamp = new Date(`${from}T00:00:00+07:00`).toISOString();
    const untilTimestamp = new Date(`${nextDay.toISOString().slice(0, 10)}T00:00:00+07:00`).toISOString();
    return sendJson(response, 200, {
      business: "JIVA FLORIST",
      location: "Magelang, Jawa Tengah",
      from,
      to,
      rows: await supabase.getSalesReport(fromTimestamp, untilTimestamp)
    });
  }
  if (request.method !== "POST") {
    return sendJson(response, 405, { error: "Metode permintaan tidak didukung." });
  }

  const body = await readJson(request);
  if (url.pathname === "/api/purchases/batch") {
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
      throw Object.assign(new Error("Tambahkan antara 1 sampai 30 jenis bunga."), { statusCode: 400 });
    }
    const items = body.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw Object.assign(new Error("Data setiap bunga harus berupa objek."), { statusCode: 400 });
      }
      const productId = item.product_id == null || item.product_id === "" ? null : String(item.product_id);
      if (productId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) {
        throw Object.assign(new Error("Pilih bunga yang valid pada setiap baris."), { statusCode: 400 });
      }
      return {
        product_id: productId,
        new_product: item.new_product ? normalizeNewProduct(item.new_product) : null,
        quantity: requireNumber(item.quantity, "Jumlah pembelian", { min: 0, exclusiveMin: true }),
        unit_cost: requireNumber(item.unit_cost, "Biaya per unit", { min: 0, exclusiveMin: true, max: 1000000000000 })
      };
    });
    return sendJson(response, 201, await supabase.rpc("register_purchase_batch", {
      p_items: items,
      p_supplier: body.supplier == null || body.supplier === "" ? null : requireText(body.supplier, "Nama pemasok", 120)
    }));
  }
  if (url.pathname === "/api/purchases") {
    const productId = body.product_id == null || body.product_id === "" ? null : String(body.product_id);
    if (productId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) {
      throw Object.assign(new Error("ID produk tidak valid."), { statusCode: 400 });
    }
    return sendJson(response, 201, await supabase.rpc("register_purchase", {
      p_product_id: productId,
      p_new_product: body.new_product ? normalizeNewProduct(body.new_product) : null,
      p_quantity: requireNumber(body.quantity, "Jumlah pembelian", { min: 0, exclusiveMin: true }),
      p_unit_cost: requireNumber(body.unit_cost, "Biaya per unit", { min: 0, exclusiveMin: true, max: 1000000000000 }),
      p_supplier: body.supplier == null || body.supplier === "" ? null : requireText(body.supplier, "Nama pemasok", 120)
    }));
  }
  if (url.pathname === "/api/sales/batch") {
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
      throw Object.assign(new Error("Tambahkan antara 1 sampai 30 jenis bunga."), { statusCode: 400 });
    }
    const items = body.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw Object.assign(new Error("Data setiap bunga harus berupa objek."), { statusCode: 400 });
      }
      const productId = String(item.product_id || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) {
        throw Object.assign(new Error("Pilih bunga yang valid pada setiap baris."), { statusCode: 400 });
      }
      const margin = requireNumber(item.target_margin, "Margin target", { min: 0, max: 0.9, exclusiveMin: true });
      if (margin >= 0.9) throw Object.assign(new Error("Margin target harus kurang dari 90%."), { statusCode: 400 });
      return {
        product_id: productId,
        quantity: requireNumber(item.quantity, "Jumlah penjualan", { min: 0, exclusiveMin: true }),
        target_margin: margin
      };
    });
    return sendJson(response, 201, await supabase.rpc("register_sale_batch", {
      p_items: items,
      p_vat_rate: requireNumber(body.vat_rate ?? 0, "Tarif PPN", { min: 0, max: 1 }),
      p_description: body.description == null || body.description === "" ? null : requireText(body.description, "Catatan transaksi")
    }));
  }
  if (url.pathname === "/api/sales") {
    const productId = String(body.product_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) {
      throw Object.assign(new Error("Pilih produk yang valid."), { statusCode: 400 });
    }
    const margin = requireNumber(body.target_margin, "Margin target", { min: 0, max: 0.9, exclusiveMin: true });
    if (margin >= 0.9) throw Object.assign(new Error("Margin target harus kurang dari 90%."), { statusCode: 400 });
    return sendJson(response, 201, await supabase.rpc("register_sale", {
      p_product_id: productId,
      p_quantity: requireNumber(body.quantity, "Jumlah penjualan", { min: 0, exclusiveMin: true }),
      p_target_margin: margin,
      p_vat_rate: requireNumber(body.vat_rate ?? 0, "Tarif PPN", { min: 0, max: 1 }),
      p_description: body.description == null || body.description === "" ? null : requireText(body.description, "Catatan transaksi")
    }));
  }
  if (url.pathname === "/api/expenses") {
    let occurredAt = null;
    if (body.occurred_at) {
      if (typeof body.occurred_at !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.occurred_at) || Number.isNaN(Date.parse(`${body.occurred_at}T12:00:00+07:00`))) {
        throw Object.assign(new Error("Tanggal biaya tidak valid."), { statusCode: 400 });
      }
      occurredAt = new Date(`${body.occurred_at}T12:00:00+07:00`).toISOString();
    }
    return sendJson(response, 201, await supabase.rpc("register_expense", {
      p_description: requireText(body.description, "Deskripsi biaya"),
      p_amount: requireNumber(body.amount, "Nominal biaya", { min: 0, exclusiveMin: true, max: 1000000000000 }),
      p_occurred_at: occurredAt
    }));
  }
  if (url.pathname === "/api/nrv") {
    const productId = String(body.product_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) {
      throw Object.assign(new Error("Pilih produk yang valid."), { statusCode: 400 });
    }
    return sendJson(response, 201, await supabase.rpc("assess_inventory_nrv", {
      p_product_id: productId,
      p_nrv_unit: requireNumber(body.nrv_unit, "Nilai realisasi neto per unit", { max: 1000000000000 })
    }));
  }
  return sendJson(response, 404, { error: "Endpoint API tidak ditemukan." });
}

async function serve(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    allowLocalFileOrigin(request, response);
    const isLoginRequest = request.method === "POST" && url.pathname === "/api/auth/login";
    if (production && (request.headers.origin
      ? !isSameOrigin(request)
      : request.method !== "GET" && request.method !== "HEAD")) {
      return sendJson(response, 403, { error: "Permintaan harus berasal dari situs JIVA FLORIST yang sama." });
    }
    if (request.method === "OPTIONS") {
      if (request.headers.origin !== "null") {
        return sendJson(response, 403, { error: "Permintaan lintas origin tidak diizinkan." });
      }
      response.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-File-Name",
        "Access-Control-Max-Age": "600",
        "X-Content-Type-Options": "nosniff"
      });
      response.end();
      return;
    }
    const publicRoute = request.method === "GET" && url.pathname === "/api/auth/session"
      || request.method === "POST" && (url.pathname === "/api/auth/login" || url.pathname === "/api/auth/logout")
      || request.method === "GET" && url.pathname === "/api/health";
    if (!publicRoute && !isAuthenticated(request)) {
      return sendJson(response, 401, { error: "Sesi masuk berakhir. Silakan masuk kembali." });
    }
    if (isLoginRequest && !isSameOrigin(request)) {
      return sendJson(response, 403, { error: "Permintaan masuk harus berasal dari situs JIVA FLORIST." });
    }
    try {
      await handleApi(request, response, url);
    } catch (error) {
      const status = error.statusCode || (error.name === "TimeoutError" ? 504 : 502);
      console.error(`[api ${request.method} ${url.pathname}] ${error.message}`);
      sendJson(response, status, { error: error.message });
    }
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Metode permintaan tidak didukung." });
    return;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  } catch {
    sendJson(response, 400, { error: "Alamat berkas tidak valid." });
    return;
  }
  const filePath = path.resolve(frontendRoot, `.${relativePath}`);
  if (!filePath.startsWith(`${frontendRoot}${path.sep}`) && filePath !== path.join(frontendRoot, "index.html")) {
    sendJson(response, 403, { error: "Akses berkas ditolak." });
    return;
  }
  if (!publicFiles.has(filePath)) {
    sendJson(response, 404, { error: "Berkas tidak ditemukan." });
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      const status = error.code === "ENOENT" ? 404 : 500;
      sendJson(response, status, { error: status === 404 ? "Berkas tidak ditemukan." : "Berkas tidak dapat dibaca." });
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  });
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT harus berupa bilangan bulat antara 1 dan 65535.");
}
const server = http.createServer(serve);
server.listen(port, host, () => {
  console.log(`JIVA FLORIST tersedia di http://${host}:${port}`);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("Atur SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY sebelum menggunakan data aplikasi.");
  }
});

server.on("error", (error) => {
  console.error(`Server gagal dijalankan: ${error.message}`);
  process.exitCode = 1;
});
