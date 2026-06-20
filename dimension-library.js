const DB_NAME = "logistics-query-dimension-library";
const DB_VERSION = 1;
const STORE_NAME = "dimension-files";
const SHARED_PACKAGE_NAME = "物流查询维度表共享数据包.json";
const SHARED_MANIFEST_PATH = "data/shared-library.json";

const slots = [
  {
    id: "dim-origin-address",
    name: "发货地址",
    expectedName: "发货地址.xlsx",
    description: "发货地、报价区域、仓库地址、省市区、联系人等发货信息。",
    template: "origin",
    keywords: ["发货地", "报价区域", "发货省", "发货市", "详细地址"]
  },
  {
    id: "dim-product-info",
    name: "商品信息表",
    expectedName: "商品信息表.xlsx",
    description: "商品基础信息维护槽位，包含物料编码、销售系列、型号、商品名称等字段。",
    template: "product",
    keywords: ["物料编码", "销售系列", "型号", "商品名称"]
  },
  {
    id: "dim-product-package",
    name: "商品包装明细",
    expectedName: "商品包装明细.xlsx",
    description: "型号、物料编码、商品名称、包裹 1 到包裹 6 的尺寸、重量和计费重量。",
    template: "package",
    keywords: ["物料编码", "型号", "包裹1重量kg", "包裹1计费重量kg"]
  },
  {
    id: "quote-sf-hebei",
    name: "顺丰-河北报价",
    expectedName: "顺丰-河北报价.xlsx",
    description: "河北发货地使用的顺丰报价表。",
    template: "quote",
    keywords: ["目的省", "目的市", "首重kg", "续重费用", "是否可发"]
  },
  {
    id: "quote-jd-hebei",
    name: "京东-河北报价",
    expectedName: "京东-河北报价.xlsx",
    description: "河北发货地使用的京东报价表。",
    template: "quote",
    keywords: ["目的省", "目的市", "首重kg", "续重费用", "是否可发"]
  },
  {
    id: "quote-sf-ningbo",
    name: "顺丰-宁波报价",
    expectedName: "顺丰-宁波报价.xlsx",
    description: "宁波发货地使用的顺丰报价表。",
    template: "quote",
    keywords: ["目的省", "目的市", "首重kg", "续重费用", "是否可发"]
  },
  {
    id: "quote-jd-ningbo",
    name: "京东-宁波报价",
    expectedName: "京东-宁波报价.xlsx",
    description: "宁波发货地使用的京东报价表。",
    template: "quote",
    keywords: ["目的省", "目的市", "首重kg", "续重费用", "是否可发"]
  },
  {
    id: "quote-zt-hebei",
    name: "中通-河北报价",
    expectedName: "中通-河北报价.xlsx",
    description: "河北发货地使用的中通报价表。",
    template: "quote",
    keywords: ["目的省", "目的市", "首重kg", "续重费用", "是否可发"]
  }
];

const slotIds = new Set(slots.map((slot) => slot.id));
const grid = document.getElementById("libraryGrid");
const applyAllBtn = document.getElementById("applyAllBtn");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const refreshBtn = document.getElementById("refreshBtn");
const downloadSharedBtn = document.getElementById("downloadSharedBtn");
const importSharedBtn = document.getElementById("importSharedBtn");
const importSharedInput = document.getElementById("importSharedInput");
const sharedStatus = document.getElementById("sharedStatus");
const savedBadge = document.getElementById("savedBadge");
const slotLimit = document.getElementById("slotLimit");
const uploadedCount = document.getElementById("uploadedCount");
const appliedCount = document.getElementById("appliedCount");
const latestUpdate = document.getElementById("latestUpdate");

let records = new Map();

init();

async function init() {
  try {
    sharedStatus.textContent = "正在同步共享文件库...";
    await window.LogisticsSharedLibrary?.importSharedLibrary?.();
    records = await loadRecords();
    bindToolbar();
    renderLibrary();
    sharedStatus.textContent = "文件库使用浏览器本地存储；GitHub Pages 默认不提交真实业务 Excel。";
  } catch (error) {
    console.error(error);
    sharedStatus.textContent = "共享文件库同步失败，请直接上传本地文件。";
    toast(error.message || "维度表文件库初始化失败");
  }
}

function bindToolbar() {
  applyAllBtn?.addEventListener("click", applyAllSlots);
  refreshBtn?.addEventListener("click", applyAllSlots);
  clearCacheBtn?.addEventListener("click", clearAllLibraryCache);
  downloadSharedBtn?.addEventListener("click", exportSharedPackage);
  importSharedBtn?.addEventListener("click", () => importSharedInput?.click());
  importSharedInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await importSharedPackage(file);
    event.target.value = "";
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "slotId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const activeRecords = request.result
        .filter((record) => slotIds.has(record.slotId || record.id))
        .filter((record) => !record.deletedAt);
      resolve(new Map(activeRecords.map((record) => [record.slotId || record.id, normalizeRecord(record)])));
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveRecord(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(normalizeRecord(record));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteRecord(slotId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(slotId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function normalizeRecord(record) {
  const slotId = record.slotId || record.id;
  return {
    ...record,
    slotId,
    id: slotId,
    libraryType: "dimension"
  };
}

function renderLibrary() {
  const uploaded = slots.filter((slot) => hasFile(records.get(slot.id))).length;
  const applied = slots.filter((slot) => records.get(slot.id)?.applied && hasFile(records.get(slot.id))).length;
  const latest = latestRecordDate();

  slotLimit.textContent = String(slots.length);
  uploadedCount.textContent = String(uploaded);
  appliedCount.textContent = String(applied);
  latestUpdate.textContent = latest ? formatDate(latest) : "-";
  savedBadge.textContent = uploaded ? "维度文件已保存" : "等待上传维度文件";
  savedBadge.classList.toggle("pending", uploaded > applied);

  grid.innerHTML = slots.map((slot) => renderCard(slot, records.get(slot.id))).join("");
  bindCardEvents();
}

function renderCard(slot, record) {
  const status = getStatus(record);
  const fileName = record?.pendingName || record?.fileName || slot.expectedName;
  const fileKind = record
    ? `${getFileKind(record)} · ${formatFileSize(record.fileSize || record.size || 0)}`
    : "支持 Excel / CSV，拖拽到此槽位上传";
  const refreshMonth = record?.refreshMonth || deriveRefreshMonth(record?.fileName || record?.pendingName, record?.savedAt);
  const updateDate = record ? formatDate(record.appliedAt || record.savedAt) : "-";
  const sheets = record?.sheetNames?.length ? record.sheetNames.join("、") : "等待解析";
  const templateButton = slot.template
    ? `<button type="button" data-template="${slot.template}">下载模板</button>`
    : "";

  return `
    <article class="library-card file-slot" data-drop="${slot.id}" data-slot-id="${slot.id}">
      <div class="slot-head">
        <span class="slot-kicker">DIMENSION SLOT</span>
        <span class="slot-state ${status.className}">${status.label}</span>
      </div>
      <h2>${escapeHtml(slot.name)}</h2>
      <p class="slot-description">${escapeHtml(slot.description)}</p>
      <div class="drop-zone" data-choose="${slot.id}">
        <strong>${escapeHtml(fileName)}</strong>
        <span>${escapeHtml(fileKind)}</span>
      </div>
      <div class="slot-info">
        <span>刷新月份</span>
        <strong>${escapeHtml(refreshMonth || "-")}</strong>
      </div>
      <div class="slot-info">
        <span>更新日期</span>
        <strong>${escapeHtml(updateDate)}</strong>
      </div>
      <div class="slot-info">
        <span>工作表</span>
        <strong>${escapeHtml(sheets)}</strong>
      </div>
      ${renderReferencePath(slot, record)}
      ${renderParseDiagnostics(record)}
      <input class="slot-file-input" type="file" accept=".xlsx,.xlsm,.xls,.csv" data-file="${slot.id}">
      <div class="card-actions">
        <button type="button" data-choose="${slot.id}">${record ? "替换文件" : "上传文件"}</button>
        <button type="button" data-apply="${slot.id}" ${hasFile(record) ? "" : "disabled"}>应用刷新</button>
        <button type="button" data-delete="${slot.id}" ${record ? "" : "disabled"}>删除</button>
        ${templateButton}
      </div>
    </article>
  `;
}

function bindCardEvents() {
  grid.querySelectorAll("[data-file]").forEach((input) => {
    input.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (file) await saveSlotFile(input.dataset.file, file);
      event.target.value = "";
    });
  });
  grid.querySelectorAll("[data-choose]").forEach((button) => {
    button.addEventListener("click", () => {
      grid.querySelector(`[data-file="${button.dataset.choose}"]`)?.click();
    });
  });
  grid.querySelectorAll("[data-apply]").forEach((button) => {
    button.addEventListener("click", () => applySlot(button.dataset.apply));
  });
  grid.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => clearSlot(button.dataset.delete));
  });
  grid.querySelectorAll("[data-template]").forEach((button) => {
    button.addEventListener("click", () => downloadSlotTemplate(button.dataset.template));
  });
  grid.querySelectorAll("[data-drop]").forEach((card) => bindDropUpload(card, card.dataset.drop));
}

function bindDropUpload(card, slotId) {
  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    card.classList.add("is-drag-over");
  });
  card.addEventListener("dragleave", () => card.classList.remove("is-drag-over"));
  card.addEventListener("drop", async (event) => {
    event.preventDefault();
    card.classList.remove("is-drag-over");
    const file = event.dataTransfer.files?.[0];
    if (file) await saveSlotFile(slotId, file);
  });
}

async function saveSlotFile(slotId, file) {
  try {
    if (!isAcceptedFile(file)) {
      toast("请上传 .xlsx、.xlsm、.xls 或 .csv 文件。");
      return;
    }
    const slot = slots.find((item) => item.id === slotId);
    const buffer = await file.arrayBuffer();
    const parseResult = parseUploadedWorkbook(file.name, buffer, slot);
    const previous = records.get(slotId) || {};
    const now = new Date().toISOString();
    const record = normalizeRecord({
      ...previous,
      slotId,
      title: slot.name,
      expectedName: slot.expectedName,
      fileName: previous.applied ? previous.fileName : file.name,
      pendingName: file.name,
      fileSize: file.size,
      size: file.size,
      fileType: file.type || inferFileType(file.name),
      fileTypeLabel: getFileKind({ fileName: file.name, fileType: file.type }),
      fileData: arrayBufferToBase64(buffer),
      sheetNames: parseResult.sheetNames,
      sheetName: parseResult.sheetName,
      parseDiagnostics: parseResult.diagnostics,
      rowCount: parseResult.rows.length,
      headers: parseResult.headers,
      sampleRows: parseResult.rows.slice(0, 3).map((row) => ({
        rowNumber: row.__rowNumber,
        cells: (row.__cells || []).slice(0, 12)
      })),
      refreshMonth: deriveRefreshMonth(file.name, now),
      pendingFile: true,
      applied: false,
      savedAt: now,
      sharedSavedAt: ""
    });
    delete record.fileBuffer;
    delete record.deletedAt;
    records.set(slotId, record);
    await saveRecord(record);
    renderLibrary();
    toast(`已上传 ${file.name}，点击应用刷新后查询页生效。`);
  } catch (error) {
    console.error(error);
    toast(formatUploadError(error));
  }
}

async function applySlot(slotId) {
  const record = records.get(slotId);
  if (!hasFile(record)) return;
  const applied = normalizeRecord({
    ...record,
    fileName: record.pendingName || record.fileName,
    pendingFile: false,
    applied: true,
    appliedAt: new Date().toISOString()
  });
  delete applied.pendingName;
  records.set(slotId, applied);
  await saveRecord(applied);
  renderLibrary();
  toast("应用刷新完成。");
}

async function applyAllSlots() {
  const targets = slots
    .map((slot) => records.get(slot.id))
    .filter((record) => hasFile(record));
  for (const record of targets) {
    const applied = normalizeRecord({
      ...record,
      fileName: record.pendingName || record.fileName,
      pendingFile: false,
      applied: true,
      appliedAt: new Date().toISOString()
    });
    delete applied.pendingName;
    records.set(record.slotId, applied);
    await saveRecord(applied);
  }
  renderLibrary();
  toast(`已应用 ${targets.length} 个槽位。`);
}

async function clearSlot(slotId) {
  const slot = slots.find((item) => item.id === slotId);
  const ok = window.confirm(`确认删除「${slot?.name || slotId}」的本地文件？`);
  if (!ok) return;
  await deleteRecord(slotId);
  records.delete(slotId);
  renderLibrary();
  toast("已删除本地槽位文件。");
}

async function clearAllLibraryCache() {
  const ok = window.confirm("确认清除当前浏览器中物流查询系统的 8 个维度槽位缓存？");
  if (!ok) return;
  for (const slot of slots) {
    await deleteRecord(slot.id);
  }
  records.clear();
  renderLibrary();
  toast("已清除本地维度表缓存。");
}

function exportSharedPackage() {
  const exported = {};
  for (const slot of slots) {
    const record = records.get(slot.id);
    if (record?.applied && hasFile(record)) {
      exported[slot.id] = normalizeRecord({
        ...record,
        title: slot.name,
        expectedName: slot.expectedName,
        exportedAt: new Date().toISOString()
      });
    }
  }
  const payload = {
    project: "wuliuchaxun",
    libraryType: "dimension",
    updatedAt: new Date().toISOString(),
    dbName: DB_NAME,
    storeName: STORE_NAME,
    records: exported
  };
  downloadJsonFile(SHARED_PACKAGE_NAME, payload);
  toast(`已导出 ${Object.keys(exported).length} 个已应用槽位。`);
}

async function importSharedPackage(file) {
  try {
    const payload = JSON.parse(await file.text());
    const entries = normalizeSharedEntries(payload.records);
    let count = 0;
    for (const [slotId, record] of entries) {
      if (!slotIds.has(slotId) || !hasFile(record)) continue;
      const saved = normalizeRecord({
        ...record,
        slotId,
        id: slotId,
        pendingFile: false,
        applied: true,
        importedAt: new Date().toISOString(),
        sharedSavedAt: record.sharedSavedAt || payload.updatedAt || new Date().toISOString()
      });
      records.set(slotId, saved);
      await saveRecord(saved);
      count += 1;
    }
    renderLibrary();
    toast(`已导入 ${count} 个共享槽位。`);
  } catch (error) {
    console.error(error);
    toast("共享数据包导入失败，请确认 JSON 文件格式。");
  }
}

function normalizeSharedEntries(recordsPayload) {
  if (Array.isArray(recordsPayload)) {
    return recordsPayload
      .map((record) => [record.slotId || record.id, record])
      .filter(([slotId]) => Boolean(slotId));
  }
  return Object.entries(recordsPayload || {}).map(([key, record]) => [record.slotId || record.id || key, record]);
}

function parseUploadedWorkbook(fileName, buffer, slot) {
  if (!window.XLSX) throw new Error("XLSX 解析库未加载");
  const workbook = readWorkbook(fileName, buffer);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("文件中没有可读取的工作表");
  const worksheet = workbook.Sheets[sheetName];
  const parse = parseWorkbookRows(worksheet, slot);
  return {
    sheetNames: workbook.SheetNames,
    sheetName,
    rows: parse.rows,
    headers: parse.headers,
    diagnostics: buildParseDiagnostics(workbook, sheetName, parse)
  };
}

function readWorkbook(fileName, buffer) {
  if (/\.csv$/i.test(fileName)) {
    const text = decodeCsvBuffer(buffer);
    return XLSX.read(text, { type: "string", blankrows: true, raw: false });
  }
  return XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    dense: false,
    raw: false
  });
}

function parseWorkbookRows(worksheet, slot) {
  const matrix = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: true,
    range: 0
  });
  const attemptedHeaderRows = headerRowCandidates(matrix.length);
  const scored = attemptedHeaderRows.map((rowIndex) => {
    const headers = normalizeHeaders(matrix[rowIndex] || []);
    return {
      rowIndex,
      headers,
      score: scoreHeaderRow(headers, slot)
    };
  });
  const best = scored.sort((a, b) => b.score - a.score || a.rowIndex - b.rowIndex)[0] || {
    rowIndex: 0,
    headers: [],
    score: 0
  };
  const headers = best.headers.length ? best.headers : normalizeHeaders(matrix[0] || []);
  const rows = matrix.slice(best.rowIndex + 1).map((rowValues, rowOffset) => {
    const row = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = rowValues[index] ?? "";
    });
    row.__rowNumber = best.rowIndex + rowOffset + 2;
    row.__cells = rowValues;
    return row;
  }).filter((row) => Object.entries(row)
    .some(([key, value]) => !key.startsWith("__") && String(value ?? "").trim() !== ""));

  return {
    rows,
    headers,
    headerRowIndex: best.rowIndex,
    attemptedHeaderRows,
    headerScore: best.score,
    matrix
  };
}

function normalizeHeaders(values) {
  const seen = new Map();
  return values.map((value, index) => {
    let header = normalizeHeaderName(value);
    if (!header) header = `空列${index + 1}`;
    const count = seen.get(header) || 0;
    seen.set(header, count + 1);
    return count ? `${header}_${count + 1}` : header;
  });
}

function normalizeHeaderName(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function headerRowCandidates(rowCount) {
  const base = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  return [...new Set(base.filter((rowIndex) => rowIndex >= 0 && rowIndex < rowCount))];
}

function scoreHeaderRow(headers, slot) {
  const joined = headers.join("|");
  const nonEmpty = headers.filter((header) => header && !/^空列\d+$/.test(header)).length;
  const keywordScore = (slot?.keywords || []).reduce((score, keyword) => (
    joined.includes(keyword) ? score + 3 : score
  ), 0);
  const genericScore = ["物料编码", "型号", "商品名称", "目的省", "目的市", "首重", "续重", "是否可发", "报价区域", "发货地"]
    .reduce((score, keyword) => (joined.includes(keyword) ? score + 1 : score), 0);
  return nonEmpty + keywordScore + genericScore;
}

function buildParseDiagnostics(workbook, sheetName, parse) {
  const headerValues = parse.matrix[parse.headerRowIndex] || [];
  const sampleRows = parse.rows.slice(0, 3).map((row) => row.__rowNumber);
  return {
    sheetName,
    sheetCount: workbook.SheetNames.length,
    headerRowNumber: parse.headerRowIndex + 1,
    attemptedHeaderRows: parse.attemptedHeaderRows.map((rowIndex) => rowIndex + 1),
    headerScore: parse.headerScore,
    rowCount: parse.rows.length,
    headerFirst12: headerValues.slice(0, 12).map((value) => String(value ?? "")),
    sampleRowNumbers: sampleRows,
    gHeader: headerValues[6] || "",
    hHeader: headerValues[7] || "",
    adHeader: headerValues[29] || "",
    sheets: workbook.SheetNames
  };
}

function renderParseDiagnostics(record) {
  const diagnostics = record?.parseDiagnostics;
  if (!diagnostics) return "";
  const firstHeaders = (diagnostics.headerFirst12 || []).filter(Boolean).join("、") || "-";
  const attempted = (diagnostics.attemptedHeaderRows || []).join("、") || "-";
  return `
    <div class="parse-info">
      <span>解析诊断</span>
      <strong>${escapeHtml(diagnostics.sheetName || record.sheetName || "-")} / 表头第 ${escapeHtml(diagnostics.headerRowNumber || "-")} 行 / ${escapeHtml(diagnostics.rowCount || 0)} 行</strong>
      <small>尝试表头行：${escapeHtml(attempted)}</small>
      <small>前 12 列：${escapeHtml(firstHeaders)}</small>
      <small>G/H/AD：${escapeHtml(diagnostics.gHeader || "-")} / ${escapeHtml(diagnostics.hHeader || "-")} / ${escapeHtml(diagnostics.adHeader || "-")}</small>
    </div>
  `;
}

function renderReferencePath(slot, record) {
  if (!record) {
    return `
      <div class="path-info">
        <span>引用路径</span>
        <strong>浏览器本地库 / ${escapeHtml(slot.id)}</strong>
      </div>
    `;
  }
  return `
    <div class="path-info">
      <span>引用路径</span>
      <strong>IndexedDB: ${escapeHtml(DB_NAME)}/${escapeHtml(STORE_NAME)}/${escapeHtml(slot.id)}</strong>
      <small>共享包：${escapeHtml(SHARED_MANIFEST_PATH)}</small>
    </div>
  `;
}

function getStatus(record) {
  if (!record || !hasFile(record)) return { label: "缺失", className: "empty" };
  if (record.pendingFile || !record.applied) return { label: "待应用", className: "pending" };
  return { label: "已应用", className: "applied" };
}

function hasFile(record) {
  return Boolean(record?.fileData || record?.fileBuffer);
}

function latestRecordDate() {
  const values = [...records.values()]
    .map((record) => record.appliedAt || record.savedAt || record.importedAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return new Date(Math.max(...values)).toISOString();
}

function getFileKind(record) {
  const name = record.fileName || record.pendingName || "";
  if (/\.csv$/i.test(name) || /csv/i.test(record.fileType || "")) return "CSV 表格";
  if (/\.xlsm$/i.test(name)) return "Excel 宏工作簿";
  if (/\.xls$/i.test(name)) return "Excel 97-2003";
  return "Excel 工作簿";
}

function decodeCsvBuffer(buffer) {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  const invalidCount = (utf8.match(/\uFFFD/g) || []).length;
  if (invalidCount < 3) return utf8;
  try {
    return new TextDecoder("gb18030").decode(buffer);
  } catch {
    return utf8;
  }
}

function isAcceptedFile(file) {
  return /\.(xlsx|xlsm|xls|csv)$/i.test(file?.name || "");
}

function inferFileType(name) {
  if (/\.csv$/i.test(name)) return "text/csv";
  if (/\.xlsx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (/\.xlsm$/i.test(name)) return "application/vnd.ms-excel.sheet.macroEnabled.12";
  return "application/vnd.ms-excel";
}

function deriveRefreshMonth(fileName, fallbackDate) {
  const text = String(fileName || "");
  const match = text.match(/(20\d{2})[-_.年]?\s*(0?[1-9]|1[0-2])\s*月?/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}`;
  const fallback = fallbackDate ? new Date(fallbackDate) : new Date();
  if (!Number.isNaN(fallback.getTime())) {
    return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}`;
  }
  return "";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadSlotTemplate(type) {
  const templates = {
    origin: {
      fileName: "发货地址模板.xlsx",
      sheetName: "发货地址",
      rows: [
        {
          发货地: "河北仓",
          报价区域: "河北",
          发货省: "河北省",
          发货市: "示例市",
          发货区: "示例区",
          详细地址: "河北省示例市示例区示例路1号",
          联系人: "张三",
          联系电话: "13800000000",
          备注: ""
        },
        {
          发货地: "宁波仓",
          报价区域: "宁波",
          发货省: "浙江省",
          发货市: "宁波市",
          发货区: "示例区",
          详细地址: "浙江省宁波市示例区示例路2号",
          联系人: "李四",
          联系电话: "13900000000",
          备注: ""
        }
      ]
    },
    product: {
      fileName: "商品信息表模板.xlsx",
      sheetName: "商品信息表",
      rows: [
        {
          物料编码: "MAT-A100",
          销售系列: "示例系列",
          型号: "A100",
          商品名称: "示例商品",
          商品分类: "示例分类",
          品牌: "",
          单位: "件",
          备注: ""
        }
      ]
    },
    package: {
      fileName: "商品包装明细模板.xlsx",
      sheetName: "商品包装明细",
      rows: [buildPackageTemplateRow()]
    },
    quote: {
      fileName: "物流报价模板.xlsx",
      sheetName: "物流报价",
      rows: [
        {
          目的省: "浙江省",
          目的市: "杭州市",
          目的区: "",
          首重kg: 1,
          首重费用: 8,
          续重kg: 1,
          续重费用: 2,
          最低收费: 8,
          是否可发: "是",
          限制说明: "",
          备注: ""
        }
      ]
    }
  };
  const template = templates[type];
  if (!template) return;
  const worksheet = XLSX.utils.json_to_sheet(template.rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  XLSX.writeFile(workbook, template.fileName);
}

function buildPackageTemplateRow() {
  const row = {
    物料编码: "MAT-A100",
    物料编码2: "",
    物料编码3: "",
    销售系列: "示例系列",
    型号: "A100",
    商品名称: "示例商品",
    备注: ""
  };
  for (let index = 1; index <= 6; index += 1) {
    row[`包裹${index}长cm`] = index === 1 ? 60 : "";
    row[`包裹${index}宽cm`] = index === 1 ? 40 : "";
    row[`包裹${index}高cm`] = index === 1 ? 30 : "";
    row[`包裹${index}重量kg`] = index === 1 ? 12 : "";
    row[`包裹${index}计费重量kg`] = index === 1 ? 12 : "";
  }
  return row;
}

function formatUploadError(error) {
  const message = error?.message || "";
  if (message.includes("Unsupported") || message.includes("zip")) {
    return "文件解析失败，请确认文件未损坏且格式为 Excel 或 CSV。";
  }
  return message || "上传失败";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}
