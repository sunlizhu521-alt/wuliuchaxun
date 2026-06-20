const DB_NAME = "logistics-query-dimension-library";
const DB_VERSION = 1;
const STORE_NAME = "dimension-files";

const slotIds = {
  origin: "dim-origin-address",
  productInfo: "dim-product-info",
  productPackage: "dim-product-package"
};

const quoteSlots = [
  { id: "quote-sf-hebei", carrier: "顺丰", zone: "河北" },
  { id: "quote-jd-hebei", carrier: "京东", zone: "河北" },
  { id: "quote-sf-ningbo", carrier: "顺丰", zone: "宁波" },
  { id: "quote-jd-ningbo", carrier: "京东", zone: "宁波" },
  { id: "quote-zt-hebei", carrier: "中通", zone: "河北" }
];

const state = {
  products: [],
  quotes: [],
  origins: [],
  results: []
};

const els = {
  originSelect: document.getElementById("originSelect"),
  addressInput: document.getElementById("addressInput"),
  modelInput: document.getElementById("modelInput"),
  materialCodeInput: document.getElementById("materialCodeInput"),
  salesSeriesInput: document.getElementById("salesSeriesInput"),
  quantityInput: document.getElementById("quantityInput"),
  modelList: document.getElementById("modelList"),
  materialCodeList: document.getElementById("materialCodeList"),
  salesSeriesList: document.getElementById("salesSeriesList"),
  runQuery: document.getElementById("runQuery"),
  reloadLibrary: document.getElementById("reloadLibrary"),
  resultBody: document.getElementById("resultBody"),
  resultHint: document.getElementById("resultHint"),
  exportResults: document.getElementById("exportResults"),
  downloadTemplate: document.getElementById("downloadTemplate"),
  dropZone: document.getElementById("dropZone"),
  batchFile: document.getElementById("batchFile"),
  libraryStatus: document.getElementById("libraryStatus"),
  productCount: document.getElementById("productCount"),
  quoteCount: document.getElementById("quoteCount"),
  originCount: document.getElementById("originCount")
};

init();

async function init() {
  bindEvents();
  await loadLibrary();
}

function bindEvents() {
  els.reloadLibrary.addEventListener("click", loadLibrary);
  els.runQuery.addEventListener("click", runSingleQuery);
  els.exportResults.addEventListener("click", exportResults);
  els.downloadTemplate.addEventListener("click", downloadBatchTemplate);
  els.dropZone.addEventListener("click", () => els.batchFile.click());
  els.batchFile.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importBatchFile(file);
    event.target.value = "";
  });
  els.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });
  els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragging"));
  els.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
    const file = event.dataTransfer.files?.[0];
    if (file) importBatchFile(file);
  });
}

async function loadLibrary() {
  try {
    await window.LogisticsSharedLibrary?.importSharedLibrary?.();
    const records = await loadAppliedRecords();
    state.origins = normalizeOrigins(await rowsFromRecord(records.get(slotIds.origin)));
    state.products = normalizeProducts(
      await rowsFromRecord(records.get(slotIds.productPackage)),
      await rowsFromRecord(records.get(slotIds.productInfo))
    );
    state.quotes = [];

    for (const quoteSlot of quoteSlots) {
      const rows = await rowsFromRecord(records.get(quoteSlot.id));
      state.quotes.push(...normalizeQuotes(rows, quoteSlot));
    }

    renderSourceState(records);
    renderOriginOptions();
    renderProductOptions();
    toast("维度表已刷新。");
  } catch (error) {
    console.error(error);
    els.libraryStatus.textContent = "加载失败";
    toast(error.message || "维度表加载失败");
  }
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

async function loadAppliedRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const applied = request.result.filter((record) => record.applied && (record.fileData || record.fileBuffer));
      resolve(new Map(applied.map((record) => [record.slotId, record])));
    };
    request.onerror = () => reject(request.error);
  });
}

async function rowsFromRecord(record) {
  const buffer = getRecordBuffer(record);
  if (!buffer) return [];
  const workbook = readWorkbook(record.fileName, buffer);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
}

function getRecordBuffer(record) {
  if (!record) return null;
  if (record.fileData) return base64ToArrayBuffer(record.fileData);
  return record.fileBuffer || null;
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function readWorkbook(fileName, buffer) {
  if (!window.XLSX) throw new Error("XLSX 解析库未加载");
  if (/\.csv$/i.test(fileName)) {
    const text = new TextDecoder("utf-8").decode(buffer);
    return XLSX.read(text, { type: "string" });
  }
  return XLSX.read(buffer, { type: "array", cellDates: true });
}

function normalizeOrigins(rows) {
  return rows.map((row) => {
    const name = pick(row, ["发货地", "发货仓", "仓库", "地址名称", "名称"]);
    if (!name) return null;
    const origin = {
      name: clean(name),
      quoteZone: clean(pick(row, ["报价区域", "报价地区", "区域"])),
      province: clean(pick(row, ["发货省", "省", "省份"])),
      city: clean(pick(row, ["发货市", "市", "城市"])),
      district: clean(pick(row, ["发货区", "区", "区县"])),
      address: clean(pick(row, ["详细地址", "发货地址", "地址"])),
      contact: clean(pick(row, ["联系人"])),
      phone: clean(pick(row, ["联系电话", "电话", "手机号"])),
      raw: row
    };
    origin.quoteZone = normalizeQuoteZone(origin.quoteZone || origin.name || origin.address || origin.city);
    return origin;
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function normalizeProducts(packageRows, infoRows = []) {
  const infoItems = infoRows
    .map((row) => normalizeProductIdentity(row))
    .filter((item) => item.model || item.materialCode || item.salesSeries);

  return packageRows.map((row) => {
    const packageIdentity = normalizeProductIdentity(row);
    const info = findProductInfo(packageIdentity, infoItems);
    const model = packageIdentity.model || info?.model || "";
    const materialCode = packageIdentity.materialCode || info?.materialCode || "";
    const salesSeries = packageIdentity.salesSeries || info?.salesSeries || "";
    if (!model && !materialCode && !salesSeries) return null;
    const packages = parsePackages(row);
    const singleChargeWeight = roundWeight(packages.reduce((sum, item) => sum + item.chargeWeight, 0));
    return {
      model,
      materialCode,
      salesSeries,
      name: packageIdentity.name || info?.name || "",
      packages,
      packageCount: packages.length,
      singleChargeWeight,
      raw: row
    };
  }).filter(Boolean);
}

function normalizeProductIdentity(row) {
  return {
    model: clean(pick(row, ["型号", "商品型号", "产品型号", "SKU", "sku", "model"])),
    materialCode: clean(pick(row, ["物料编码", "物料代码", "商品编码", "产品编码", "存货编码"])),
    salesSeries: clean(pick(row, ["销售系列", "系列", "产品系列", "商品系列"])),
    name: clean(pick(row, ["商品名称", "品名", "产品名称", "物料名称"]))
  };
}

function findProductInfo(packageIdentity, infoItems) {
  if (!infoItems.length) return null;
  return infoItems.find((item) => (
    (packageIdentity.materialCode && sameText(item.materialCode, packageIdentity.materialCode))
    || (packageIdentity.model && sameText(item.model, packageIdentity.model))
  )) || null;
}

function parsePackages(row) {
  const packages = [];
  for (let index = 1; index <= 20; index += 1) {
    const length = parseNumber(pick(row, [`包裹${index}长cm`, `包裹${index}长度cm`, `包裹${index}长`]));
    const width = parseNumber(pick(row, [`包裹${index}宽cm`, `包裹${index}宽度cm`, `包裹${index}宽`]));
    const height = parseNumber(pick(row, [`包裹${index}高cm`, `包裹${index}高度cm`, `包裹${index}高`]));
    const weight = parseNumber(pick(row, [`包裹${index}重量kg`, `包裹${index}实际重量kg`, `包裹${index}毛重kg`, `包裹${index}重量`]));
    const explicitChargeWeight = parseNumber(pick(row, [`包裹${index}计费重量kg`, `包裹${index}计费重量`, `包裹${index}抛重kg`]));
    const volumeWeight = calcVolumeWeight(length, width, height);
    const chargeWeight = explicitChargeWeight || Math.max(weight, volumeWeight);
    if (!length && !width && !height && !weight && !explicitChargeWeight) continue;
    packages.push({
      index,
      length,
      width,
      height,
      weight,
      volumeWeight: roundWeight(volumeWeight),
      chargeWeight: roundWeight(chargeWeight || 0)
    });
  }

  if (!packages.length) {
    const weight = parseNumber(pick(row, ["计费重量kg", "计费重量", "重量kg", "重量", "实际重量kg"]));
    if (weight) {
      packages.push({ index: 1, length: 0, width: 0, height: 0, weight, volumeWeight: 0, chargeWeight: weight });
    }
  }
  return packages;
}

function normalizeQuotes(rows, slot) {
  return rows.map((row) => {
    const canShipText = clean(pick(row, ["是否可发", "可发", "是否可送", "是否配送"]));
    const firstFee = parseNumber(pick(row, ["首重费用", "首重价格", "首重费", "首费"]));
    const stepFee = parseNumber(pick(row, ["续重费用", "续重价格", "续重费"]));
    const unitPrice = parseNumber(pick(row, ["单价", "每公斤", "元/kg", "公斤单价", "每kg费用"]));
    if (!firstFee && !stepFee && !unitPrice) return null;
    return {
      slotId: slot.id,
      carrier: slot.carrier,
      quoteZone: slot.zone,
      province: clean(pick(row, ["目的省", "省", "省份", "收货省"])),
      city: clean(pick(row, ["目的市", "市", "城市", "收货市"])),
      district: clean(pick(row, ["目的区", "区", "区县", "目的区县", "收货区县"])),
      firstWeight: parseNumber(pick(row, ["首重kg", "首重", "首重重量"])) || 1,
      firstFee,
      stepWeight: parseNumber(pick(row, ["续重kg", "续重", "续重单位", "计费单位"])) || 1,
      stepFee,
      unitPrice,
      minFee: parseNumber(pick(row, ["最低收费", "最低费用", "起步价", "保底费用"])),
      canShip: !["否", "不可发", "不可送", "停发", "禁发", "no", "false"].includes(normalizeText(canShipText)),
      limit: clean(pick(row, ["限制说明", "限制", "不可发原因"])),
      remark: clean(pick(row, ["备注", "说明"])),
      raw: row
    };
  }).filter(Boolean);
}

function renderSourceState(records) {
  const coreIds = [slotIds.origin, slotIds.productPackage];
  const quoteIds = quoteSlots.map((item) => item.id);
  const coreReady = coreIds.filter((id) => records.has(id)).length;
  const quoteReady = quoteIds.filter((id) => records.has(id)).length;
  els.libraryStatus.textContent = `${coreReady}/2 + ${quoteReady}/5`;
  els.productCount.textContent = state.products.length;
  els.quoteCount.textContent = state.quotes.length;
  els.originCount.textContent = state.origins.length;
}

function renderOriginOptions() {
  if (!state.origins.length) {
    els.originSelect.innerHTML = `<option value="">请先维护发货地址</option>`;
    return;
  }
  els.originSelect.innerHTML = state.origins
    .map((origin) => `<option value="${escapeHtml(origin.name)}">${escapeHtml(origin.name)}</option>`)
    .join("");
}

function renderProductOptions() {
  fillDatalist(els.modelList, state.products.map((item) => item.model).filter(Boolean));
  fillDatalist(els.materialCodeList, state.products.map((item) => item.materialCode).filter(Boolean));
  fillDatalist(els.salesSeriesList, state.products.map((item) => item.salesSeries).filter(Boolean));
}

function fillDatalist(node, values) {
  const unique = [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-CN"));
  node.innerHTML = unique.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function runSingleQuery() {
  const result = calculateBestOption({
    origin: els.originSelect.value,
    address: els.addressInput.value.trim(),
    model: els.modelInput.value.trim(),
    materialCode: els.materialCodeInput.value.trim(),
    salesSeries: els.salesSeriesInput.value.trim(),
    purchaseQty: parsePurchaseQty(els.quantityInput.value)
  });
  state.results = [result];
  renderResults();
}

async function importBatchFile(file) {
  try {
    const workbook = readWorkbook(file.name, await file.arrayBuffer());
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
    state.results = rows.map((row) => calculateBestOption({
      origin: pick(row, ["发货地", "发货仓", "仓库"]) || els.originSelect.value,
      address: pick(row, ["顾客地址", "客户地址", "收货地址", "地址"]) || "",
      model: pick(row, ["型号", "商品型号", "SKU", "sku"]) || "",
      materialCode: pick(row, ["物料编码", "物料代码", "商品编码", "产品编码", "存货编码"]) || "",
      salesSeries: pick(row, ["销售系列", "系列", "产品系列", "商品系列"]) || "",
      purchaseQty: parsePurchaseQty(pick(row, ["购买件数", "商品购买件数", "件数", "数量"]))
    }));
    renderResults();
    toast(`已导入 ${state.results.length} 条地址查询。`);
  } catch (error) {
    console.error(error);
    toast(error.message || "导入失败");
  }
}

function calculateBestOption(input) {
  const originName = clean(input.origin);
  const address = clean(input.address);
  const model = clean(input.model);
  const materialCode = clean(input.materialCode);
  const salesSeries = clean(input.salesSeries);
  const purchaseQty = parsePurchaseQty(input.purchaseQty);
  const origin = findOrigin(originName);
  const match = findProductMatch({ model, materialCode, salesSeries });
  const product = match.product;
  const quoteZone = origin?.quoteZone || normalizeQuoteZone(originName);

  if (!originName || !address) {
    return buildResult(input, origin, product, null, [], "缺少发货地或顾客地址。");
  }
  if (!materialCode) {
    return buildResult(input, origin, product, null, [], "物料编码为必填项。");
  }
  if (!origin) {
    return buildResult(input, origin, product, null, [], "发货地址表中未找到该发货地。");
  }
  if (match.error) {
    return buildResult(input, origin, product, null, [], match.error);
  }
  if (!product.packageCount || !product.singleChargeWeight) {
    return buildResult(input, origin, product, null, [], "该物料缺少有效包裹重量或计费重量。");
  }
  if (!quoteZone) {
    return buildResult(input, origin, product, null, [], "发货地址缺少报价区域，且无法从发货地识别河北/宁波。");
  }

  const totalChargeWeight = roundWeight(product.singleChargeWeight * purchaseQty);
  const candidates = state.quotes
    .filter((quote) => sameText(quote.quoteZone, quoteZone))
    .filter((quote) => quote.canShip)
    .map((quote) => {
      const addressMatch = matchAddress(quote, address);
      if (!addressMatch.matched) return null;
      return {
        quote,
        match: addressMatch,
        cost: calculateCost(quote, totalChargeWeight)
      };
    })
    .filter(Boolean)
    .filter((item) => Number.isFinite(item.cost))
    .sort((a, b) => a.cost - b.cost || b.match.score - a.match.score || a.quote.carrier.localeCompare(b.quote.carrier, "zh-CN"));

  if (!candidates.length) {
    return buildResult(input, origin, product, null, [], "没有匹配到可用物流报价。");
  }

  return buildResult(input, origin, product, candidates[0], candidates, "");
}

function findOrigin(originName) {
  return state.origins.find((item) => sameText(item.name, originName)) || null;
}

function findProductMatch({ model, materialCode, salesSeries }) {
  let matches = state.products;
  if (model) matches = matches.filter((item) => sameText(item.model, model));
  if (materialCode) matches = matches.filter((item) => sameText(item.materialCode, materialCode));
  if (salesSeries) matches = matches.filter((item) => sameText(item.salesSeries, salesSeries));
  if (!matches.length) return { product: null, error: "商品包装明细中未找到匹配的物料。" };
  if (matches.length > 1) return { product: null, error: "匹配到多个物料，请补充型号或物料编码。" };
  return { product: matches[0], error: "" };
}

function matchAddress(quote, address) {
  const normalized = normalizeText(address);
  const district = normalizeText(quote.district);
  const city = normalizeText(quote.city);
  const province = normalizeText(quote.province);
  let score = 0;
  const labels = [];

  if (district) {
    if (!normalized.includes(district)) return { matched: false, score: 0, label: "" };
    score += 3;
    labels.push(quote.district);
  }
  if (city) {
    if (!normalized.includes(city)) return { matched: false, score: 0, label: "" };
    score += 2;
    labels.push(quote.city);
  }
  if (province) {
    if (!normalized.includes(province)) return { matched: false, score: 0, label: "" };
    score += 1;
    labels.push(quote.province);
  }
  if (!province && !city && !district) {
    score = 0.5;
    labels.push("全国/未限定区域");
  }
  return { matched: true, score, label: labels.join(" / ") };
}

function calculateCost(quote, weight) {
  const firstWeight = quote.firstWeight || 1;
  const stepWeight = quote.stepWeight || 1;
  let cost = 0;
  if (quote.firstFee || quote.stepFee) {
    const extraWeight = Math.max(0, weight - firstWeight);
    cost = (quote.firstFee || 0) + Math.ceil(extraWeight / stepWeight) * (quote.stepFee || 0);
  } else if (quote.unitPrice) {
    cost = weight * quote.unitPrice;
  } else {
    return Number.NaN;
  }
  if (quote.minFee) cost = Math.max(cost, quote.minFee);
  return roundMoney(cost);
}

function buildResult(input, origin, product, best, candidates, message) {
  const purchaseQty = parsePurchaseQty(input.purchaseQty);
  const singleChargeWeight = product?.singleChargeWeight || 0;
  const totalChargeWeight = product ? roundWeight(singleChargeWeight * purchaseQty) : 0;
  const quote = best?.quote || {};
  return {
    origin: clean(input.origin),
    quoteZone: origin?.quoteZone || normalizeQuoteZone(input.origin) || "",
    address: clean(input.address),
    model: product?.model || clean(input.model),
    materialCode: product?.materialCode || clean(input.materialCode),
    salesSeries: product?.salesSeries || clean(input.salesSeries),
    purchaseQty,
    packageCount: product?.packageCount || 0,
    singleChargeWeight,
    totalChargeWeight,
    carrier: quote.carrier || "",
    cost: best ? best.cost : "",
    region: best?.match?.label || "",
    candidateCount: candidates.length,
    message: message || quote.remark || quote.limit || "费用最低"
  };
}

function renderResults() {
  if (!state.results.length) {
    els.resultBody.innerHTML = `<tr><td colspan="15" class="empty">暂无查询结果</td></tr>`;
    els.exportResults.disabled = true;
    return;
  }
  els.resultBody.innerHTML = state.results.map((row) => `
    <tr>
      <td>${escapeHtml(row.origin)}</td>
      <td>${escapeHtml(row.quoteZone)}</td>
      <td>${escapeHtml(row.address)}</td>
      <td>${escapeHtml(row.model)}</td>
      <td>${escapeHtml(row.materialCode)}</td>
      <td>${escapeHtml(row.salesSeries)}</td>
      <td>${escapeHtml(row.purchaseQty)}</td>
      <td>${escapeHtml(row.packageCount)}</td>
      <td>${escapeHtml(row.singleChargeWeight)}</td>
      <td>${escapeHtml(row.totalChargeWeight)}</td>
      <td>${escapeHtml(row.carrier || "未匹配")}</td>
      <td>${row.cost === "" ? "未匹配" : escapeHtml(row.cost)}</td>
      <td>${escapeHtml(row.region)}</td>
      <td>${escapeHtml(row.candidateCount)}</td>
      <td>${escapeHtml(row.message)}</td>
    </tr>
  `).join("");
  const matched = state.results.filter((row) => row.carrier).length;
  els.resultHint.textContent = `共 ${state.results.length} 条，已匹配 ${matched} 条。`;
  els.exportResults.disabled = false;
}

function downloadBatchTemplate() {
  const rows = [
    { 发货地: "河北仓", 顾客地址: "浙江省杭州市余杭区示例路1号", 物料编码: "MAT-A100", 销售系列: "示例系列", 型号: "A100", 购买件数: 1 },
    { 发货地: "宁波仓", 顾客地址: "江苏省南京市建邺区示例路2号", 物料编码: "MAT-B200", 销售系列: "示例系列", 型号: "B200", 购买件数: 2 }
  ];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: ["发货地", "顾客地址", "物料编码", "销售系列", "型号", "购买件数"] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "地址查询导入模板");
  XLSX.writeFile(workbook, "物流地址查询导入模板.xlsx");
}

function exportResults() {
  const rows = state.results.map((row) => ({
    发货地: row.origin,
    报价区域: row.quoteZone,
    顾客地址: row.address,
    型号: row.model,
    物料编码: row.materialCode,
    销售系列: row.salesSeries,
    购买件数: row.purchaseQty,
    包裹数: row.packageCount,
    单件计费重量: row.singleChargeWeight,
    总计费重量: row.totalChargeWeight,
    推荐物流: row.carrier,
    预估费用: row.cost,
    匹配区域: row.region,
    备选数量: row.candidateCount,
    失败原因或说明: row.message
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "物流查询结果");
  XLSX.writeFile(workbook, `物流查询结果_${formatDateForFileName(new Date())}.xlsx`);
}

function pick(row, names) {
  const entries = Object.entries(row || {});
  for (const name of names) {
    const exact = entries.find(([key]) => normalizeHeader(key) === normalizeHeader(name));
    if (exact && clean(exact[1]) !== "") return exact[1];
  }
  for (const name of names) {
    const fuzzy = entries.find(([key]) => normalizeHeader(key).includes(normalizeHeader(name)));
    if (fuzzy && clean(fuzzy[1]) !== "") return fuzzy[1];
  }
  return "";
}

function normalizeHeader(value) {
  return String(value || "").replace(/\s+/g, "").replace(/[()（）]/g, "").toLowerCase();
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function normalizeQuoteZone(value) {
  const text = normalizeText(value);
  if (text.includes("河北")) return "河北";
  if (text.includes("宁波")) return "宁波";
  return clean(value);
}

function sameText(a, b) {
  return normalizeText(a) === normalizeText(b);
}

function clean(value) {
  return String(value ?? "").trim();
}

function parsePurchaseQty(value) {
  return Math.max(1, Math.floor(parseNumber(value) || 1));
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return text ? Number(text[0]) : 0;
}

function calcVolumeWeight(length, width, height) {
  if (!length || !width || !height) return 0;
  return length * width * height / 6000;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundWeight(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatDateForFileName(date) {
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
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
  setTimeout(() => node.remove(), 2200);
}
