"use strict";

const { URL, URLSearchParams } = require("node:url");

function getCredentials() {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceRoleKey) {
    throw Object.assign(
      new Error("Supabase belum dikonfigurasi. Atur SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY pada environment server."),
      { statusCode: 503 }
    );
  }
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw Object.assign(new Error("SUPABASE_URL bukan URL yang valid."), { statusCode: 503 });
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw Object.assign(new Error("SUPABASE_URL harus menggunakan HTTPS, kecuali server lokal."), { statusCode: 503 });
  }
  return { baseUrl: parsed.origin, serviceRoleKey };
}

async function supabaseRequest(path, options = {}) {
  const { baseUrl, serviceRoleKey } = getCredentials();
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...options.headers
    },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.text();
  let result;
  try {
    result = body ? JSON.parse(body) : null;
  } catch {
    result = body;
  }
  if (!response.ok) {
    const detail = typeof result === "object" && result !== null
      ? result.message || result.details || result.hint
      : result;
    throw Object.assign(
      new Error(detail || `Supabase mengembalikan HTTP ${response.status}.`),
      { statusCode: response.status < 500 ? 400 : 502 }
    );
  }
  return result;
}

async function rpc(name, args) {
  return supabaseRequest(`rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify(args)
  });
}

async function getProducts() {
  return supabaseRequest("rpc/get_products_inventory", { method: "POST", body: "{}" });
}

async function getDashboard(days) {
  return rpc("get_dashboard_summary", { p_days: days });
}

async function getTransactions(limit) {
  const params = new URLSearchParams({
    select: "id,group_id,product_id,type,description,quantity,unit_price,subtotal,cogs,gross_profit,vat_rate,vat_amount,occurred_at,supplier_invoice_path,supplier_invoice_filename,products(name,unit),inventory_batches(supplier,supplier_id,quantity_remaining,quantity_in,suppliers(name))",
    order: "occurred_at.desc",
    limit: String(limit)
  });
  const transactions = await supabaseRequest(`transactions?${params}`);
  return transactions.map((transaction) => ({
    ...transaction,
    product_name: transaction.products?.name || null,
    unit: transaction.products?.unit || "",
    batch_supplier: transaction.inventory_batches?.[0]?.suppliers?.name || transaction.inventory_batches?.[0]?.supplier || "",
    batch_remaining: transaction.inventory_batches?.[0]?.quantity_remaining ?? null,
    batch_quantity: transaction.inventory_batches?.[0]?.quantity_in ?? null,
    has_supplier_invoice: Boolean(transaction.supplier_invoice_path),
    products: undefined,
    inventory_batches: undefined
  }));
}

async function getPurchaseTransaction(id) {
  const params = new URLSearchParams({
    select: "id,group_id,type,supplier_invoice_path,supplier_invoice_filename",
    id: `eq.${id}`,
    limit: "1"
  });
  const [transaction] = await supabaseRequest(`transactions?${params}`);
  if (!transaction) {
    throw Object.assign(new Error("Transaksi tidak ditemukan."), { statusCode: 404 });
  }
  if (transaction.type !== "purchase") {
    throw Object.assign(new Error("Faktur pemasok hanya dapat ditautkan ke transaksi pembelian."), { statusCode: 400 });
  }
  return transaction;
}

async function saveSupplierInvoice(id, fileName, contentType, file) {
  const transaction = await getPurchaseTransaction(id);
  const extensions = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  const objectPath = `${transaction.group_id}/supplier-invoice.${extensions[contentType]}`;
  const { baseUrl, serviceRoleKey } = getCredentials();
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  const upload = await fetch(`${baseUrl}/storage/v1/object/supplier-invoices/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": contentType,
      "x-upsert": "true"
    },
    body: file,
    signal: AbortSignal.timeout(30000)
  });
  if (!upload.ok) {
    const detail = await upload.text();
    throw Object.assign(new Error(detail || `Supabase Storage mengembalikan HTTP ${upload.status}.`), {
      statusCode: upload.status < 500 ? 400 : 502
    });
  }

  await supabaseRequest(`transactions?group_id=eq.${encodeURIComponent(transaction.group_id)}&type=eq.purchase`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      supplier_invoice_path: objectPath,
      supplier_invoice_filename: fileName
    })
  });
  return { transaction_id: transaction.id, file_name: fileName };
}

async function getSupplierInvoice(id) {
  const transaction = await getPurchaseTransaction(id);
  const groupPrefix = `${transaction.group_id}/supplier-invoice.`;
  const legacyPrefix = `${transaction.id}/supplier-invoice.`;
  const expectedPrefix = transaction.supplier_invoice_path?.startsWith(groupPrefix)
    ? groupPrefix
    : legacyPrefix;
  if (!transaction.supplier_invoice_path?.startsWith(expectedPrefix)) {
    throw Object.assign(new Error("Faktur pemasok belum diunggah untuk transaksi ini."), { statusCode: 404 });
  }
  const extension = transaction.supplier_invoice_path.slice(expectedPrefix.length);
  const contentTypes = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  };
  const contentType = contentTypes[extension];
  if (!contentType) {
    throw Object.assign(new Error("Jenis file faktur tersimpan tidak valid."), { statusCode: 500 });
  }
  const { baseUrl, serviceRoleKey } = getCredentials();
  const encodedPath = transaction.supplier_invoice_path.split("/").map(encodeURIComponent).join("/");
  const fileResponse = await fetch(`${baseUrl}/storage/v1/object/supplier-invoices/${encodedPath}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    },
    signal: AbortSignal.timeout(30000)
  });
  if (!fileResponse.ok) {
    const detail = await fileResponse.text();
    throw Object.assign(new Error(detail || `Faktur tidak dapat diambil (HTTP ${fileResponse.status}).`), {
      statusCode: fileResponse.status === 404 ? 404 : 502
    });
  }
  return {
    contentType,
    fileName: transaction.supplier_invoice_filename || `faktur-pemasok-${transaction.id}.${extension}`,
    file: Buffer.from(await fileResponse.arrayBuffer())
  };
}

async function getSalesReport(from, untilExclusive) {
  const params = new URLSearchParams({
    select: "id,description,quantity,unit_price,subtotal,cogs,gross_profit,vat_rate,vat_amount,occurred_at,products(name,unit)",
    type: "eq.sale",
    and: `(occurred_at.gte.${from},occurred_at.lt.${untilExclusive})`,
    order: "occurred_at.asc,id.asc",
    limit: "1000"
  });

  const result = [];
  const pageSize = 1000;
  const maximumRows = 50000;
  for (let offset = 0; offset <= maximumRows; offset += pageSize) {
    const limit = Math.min(pageSize, maximumRows + 1 - offset);
    const page = await supabaseRequest(`transactions?${params}`, {
      headers: { Range: `${offset}-${offset + limit - 1}`, "Range-Unit": "items" }
    });
    result.push(...page);
    if (result.length > maximumRows) {
      throw Object.assign(new Error("Laporan melebihi batas 50.000 transaksi. Pilih rentang tanggal yang lebih pendek."), { statusCode: 413 });
    }
    if (page.length < limit) break;
  }

  return result.map((transaction) => ({
    ...transaction,
    product_name: transaction.products?.name || "",
    unit: transaction.products?.unit || "",
    products: undefined
  }));
}

module.exports = {
  getProducts,
  getDashboard,
  getTransactions,
  getSalesReport,
  getPurchaseTransaction,
  saveSupplierInvoice,
  getSupplierInvoice,
  rpc
};
