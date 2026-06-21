const DB_NAME = "logistics-query-dimension-library";
const DB_VERSION = 1;
const STORE_NAME = "dimension-files";

const slotIds = {
  origin: "dim-origin-address",
  productInfo: "dim-product-info",
  productPackage: "dim-product-package",
  logisticsQuote: "quote-sf-hebei"
};

const state = {
  products: [],
  productInfo: [],
  quotes: [],
  floorFees: [],
  origins: [],
  results: [],
  batchImportHeaders: [],
  libraryLoading: false,
  libraryReady: false
};

const PRODUCT_SUGGESTION_LIMIT = 12;
const pinyinCollator = new Intl.Collator("zh-Hans-CN", { sensitivity: "base" });
const pinyinInitialBoundaries = [
  ["A", "阿"], ["B", "芭"], ["C", "擦"], ["D", "搭"], ["E", "蛾"], ["F", "发"],
  ["G", "噶"], ["H", "哈"], ["J", "击"], ["K", "喀"], ["L", "垃"], ["M", "妈"],
  ["N", "拿"], ["O", "哦"], ["P", "啪"], ["Q", "期"], ["R", "然"], ["S", "撒"],
  ["T", "塌"], ["W", "挖"], ["X", "昔"], ["Y", "压"], ["Z", "匝"]
];

const els = {
  originSelect: document.getElementById("originSelect"),
  elevatorSelect: document.getElementById("elevatorSelect"),
  floorTypeSelect: document.getElementById("floorTypeSelect"),
  pastedAddressInput: document.getElementById("pastedAddressInput"),
  recognizeAddressBtn: document.getElementById("recognizeAddressBtn"),
  provinceSelect: document.getElementById("provinceSelect"),
  citySelect: document.getElementById("citySelect"),
  districtSelect: document.getElementById("districtSelect"),
  addressInput: document.getElementById("addressInput"),
  modelInput: document.getElementById("modelInput"),
  productShortNameInput: document.getElementById("productShortNameInput"),
  productSuggestions: document.getElementById("productSuggestions"),
  materialCodeInput: document.getElementById("materialCodeInput"),
  salesProductLineInput: document.getElementById("salesProductLineInput"),
  salesSeriesInput: document.getElementById("salesSeriesInput"),
  quantityInput: document.getElementById("quantityInput"),
  runQuery: document.getElementById("runQuery"),
  libraryProgress: document.getElementById("libraryProgress"),
  libraryProgressText: document.getElementById("libraryProgressText"),
  libraryProgressBar: document.getElementById("libraryProgressBar"),
  queryProgress: document.getElementById("queryProgress"),
  queryProgressText: document.getElementById("queryProgressText"),
  queryProgressBar: document.getElementById("queryProgressBar"),
  clearQueryInfo: document.getElementById("clearQueryInfo"),
  reloadLibrary: document.getElementById("reloadLibrary"),
  resultBody: document.getElementById("resultBody"),
  resultHint: document.getElementById("resultHint"),
  calculationSelect: document.getElementById("calculationSelect"),
  calculationHint: document.getElementById("calculationHint"),
  calculationDetailBody: document.getElementById("calculationDetailBody"),
  exportResults: document.getElementById("exportResults"),
  downloadTemplate: document.getElementById("downloadTemplate"),
  dropZone: document.getElementById("dropZone"),
  batchFile: document.getElementById("batchFile")
};

init();

async function init() {
  bindEvents();
  renderProvinceOptions();
  updateFloorTypeState();
  setLibraryProgress("正在准备加载维度库...", 5, "loading");
  await loadLibrary();
}

function bindEvents() {
  els.clearQueryInfo.addEventListener("click", clearQueryInfo);
  els.reloadLibrary.addEventListener("click", loadLibrary);
  els.runQuery.addEventListener("click", runSingleQuery);
  els.elevatorSelect.addEventListener("change", updateFloorTypeState);
  els.recognizeAddressBtn.addEventListener("click", recognizePastedAddress);
  els.pastedAddressInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") recognizePastedAddress();
  });
  els.provinceSelect.addEventListener("change", () => {
    renderCityOptions();
    renderDistrictOptions();
  });
  els.citySelect.addEventListener("change", renderDistrictOptions);
  els.productShortNameInput.addEventListener("input", () => {
    delete els.productShortNameInput.dataset.productIndex;
    updateProductInfoFields();
    renderProductSuggestions();
  });
  els.productShortNameInput.addEventListener("focus", renderProductSuggestions);
  els.productShortNameInput.addEventListener("keydown", handleProductSuggestionKeys);
  els.productShortNameInput.addEventListener("change", updateProductInfoFields);
  document.addEventListener("mousedown", (event) => {
    if (!event.target.closest(".product-search-field")) hideProductSuggestions();
  });
  els.calculationSelect.addEventListener("change", () => renderSelectedCalculationDetail());
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
  if (state.libraryLoading) return;
  state.libraryLoading = true;
  state.libraryReady = false;
  els.runQuery.disabled = true;
  els.reloadLibrary.disabled = true;
  setLibraryProgress("正在连接维度库...", 10, "loading");
  try {
    await nextFrame();
    await window.LogisticsSharedLibrary?.importSharedLibrary?.();
    setLibraryProgress("正在读取已应用的维度文件...", 28, "loading");
    await nextFrame();
    const records = await loadAppliedRecords();
    setLibraryProgress("正在解析商品信息表...", 45, "loading");
    await nextFrame();
    const productInfoRows = await rowsFromRecord(records.get(slotIds.productInfo));
    state.productInfo = normalizeProductInfo(productInfoRows);
    setLibraryProgress("正在解析发货地址表...", 58, "loading");
    await nextFrame();
    state.origins = normalizeOrigins(await rowsFromRecord(records.get(slotIds.origin)));
    setLibraryProgress("正在解析商品包装明细...", 72, "loading");
    await nextFrame();
    state.products = normalizeProducts(
      await rowsFromRecord(records.get(slotIds.productPackage)),
      state.productInfo
    );
    setLibraryProgress("正在解析物流公司报价...", 88, "loading");
    await nextFrame();
    const quoteSheets = await sheetsFromRecord(records.get(slotIds.logisticsQuote));
    state.quotes = normalizeLogisticsQuoteSheets(quoteSheets);
    state.floorFees = normalizeFloorFeeSheets(quoteSheets);

    renderOriginOptions();
    updateProductInfoFields();
    const missing = getMissingLibraryParts();
    state.libraryReady = !missing.length;
    if (state.libraryReady) {
      setLibraryProgress(
        `维度库加载完成：发货地 ${state.origins.length} 个，商品 ${state.products.length} 条，报价 ${state.quotes.length} 条，上楼规则 ${state.floorFees.length} 条。`,
        100,
        "done"
      );
      els.runQuery.disabled = false;
    } else {
      setLibraryProgress(`维度库加载完成，但缺少：${missing.join("、")}。请先维护维度表库。`, 100, "warning");
      els.runQuery.disabled = true;
    }
    toast(state.libraryReady ? "维度表已刷新。" : `维度表缺少：${missing.join("、")}`);
  } catch (error) {
    console.error(error);
    setLibraryProgress(error.message || "维度库加载失败，请刷新维度或维护维度表库。", 100, "error");
    els.runQuery.disabled = true;
    toast(error.message || "维度表加载失败");
  } finally {
    state.libraryLoading = false;
    els.reloadLibrary.disabled = false;
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
  const workbook = workbookFromRecord(record);
  if (!workbook) return [];
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
}

async function sheetsFromRecord(record) {
  const workbook = workbookFromRecord(record);
  if (!workbook) return [];
  return workbook.SheetNames.map((sheetName) => ({
    sheetName,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false })
  }));
}

function workbookFromRecord(record) {
  const buffer = getRecordBuffer(record);
  if (!buffer) return null;
  return readWorkbook(record.fileName, buffer);
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
    const name = pick(row, ["供应商简称"]);
    if (!name) return null;
    const origin = {
      name: clean(name),
      supplierShortName: clean(name),
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
  }).filter(Boolean)
    .filter((origin, index, list) => list.findIndex((item) => sameText(item.name, origin.name)) === index)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function normalizeProductInfo(infoRows = []) {
  return infoRows
    .map((row) => normalizeProductIdentity(row))
    .filter((item) => item.materialCode)
    .filter((item, index, list) => list.findIndex((entry) => sameText(entry.materialCode, item.materialCode)) === index);
}

function normalizeProducts(packageRows, infoItems = []) {
  return packageRows.map((row) => {
    const packageIdentity = normalizeProductIdentity(row);
    const info = findProductInfo(packageIdentity, infoItems);
    const model = info?.model || packageIdentity.model || "";
    const materialCodes = packageIdentity.materialCodes;
    const materialCode = materialCodes[0] || packageIdentity.materialCode || "";
    const shortName = packageIdentity.shortName || "";
    const salesProductLine = info?.salesProductLine || packageIdentity.salesProductLine || "";
    const salesSeries = info?.salesSeries || packageIdentity.salesSeries || "";
    if (!model && !materialCode && !shortName && !salesProductLine && !salesSeries) return null;
    const packages = parsePackages(row);
    const singleWeight = roundWeight(packages.reduce((sum, item) => sum + (item.weight || item.chargeWeight || 0), 0));
    const singleChargeWeight = roundWeight(packages.reduce((sum, item) => sum + item.chargeWeight, 0));
    const packageCountFromRow = parseNumber(pick(row, ["件数", "包裹件数", "包裹数量", "单件包裹数", "包装件数"]));
    const totalActualWeightFromRow = parseNumber(pick(row, ["总实际重量", "总实际重量kg", "实际总重量", "实际总重量kg", "总重量", "总重量kg"]));
    const totalVolume = parseNumber(pick(row, ["总体积", "总体积cm3", "总体积cm³", "总体积立方厘米", "总立方厘米", "总方量", "体积"]));
    return {
      model,
      materialCode,
      shortName,
      salesProductLine,
      salesSeries,
      name: info?.name || packageIdentity.name || "",
      packages,
      materialCodes,
      packageCount: packageCountFromRow || materialCodes.length || packages.length,
      singleWeight,
      singleChargeWeight,
      totalActualWeight: totalActualWeightFromRow,
      totalVolume,
      raw: row
    };
  }).filter(Boolean);
}

function normalizeProductIdentity(row) {
  const materialCodes = collectMaterialCodes(row);
  return {
    model: clean(pick(row, ["销售型号", "型号", "商品型号", "产品型号", "SKU", "sku", "model"])),
    materialCode: materialCodes[0] || clean(pick(row, ["物料编码", "物料代码", "商品编码", "产品编码", "存货编码"])),
    materialCodes,
    shortName: clean(pick(row, ["货品简称", "货品名称简称", "货品简名", "货品名称", "货品", "商品简称", "产品简称", "简称"])),
    salesProductLine: clean(pick(row, ["销售产品线", "产品线", "一级产品线", "销售线"])),
    salesSeries: clean(pick(row, ["销售系列", "系列", "产品系列", "商品系列"])),
    name: clean(pick(row, ["商品名称", "品名", "产品名称", "物料名称"]))
  };
}

function collectMaterialCodes(row) {
  const values = [];
  for (const [key, value] of Object.entries(row || {})) {
    if (!isMaterialCodeHeader(key)) continue;
    for (const code of splitMaterialCodes(value)) {
      if (!values.some((item) => sameText(item, code))) values.push(code);
    }
  }
  return values;
}

function isMaterialCodeHeader(key) {
  const header = normalizeHeader(key);
  return ["物料编码", "物料代码", "商品编码", "产品编码", "存货编码"].some((name) => header.includes(normalizeHeader(name)));
}

function splitMaterialCodes(value) {
  return clean(value)
    .split(/[、,，;；\/|｜\s]+/)
    .map((item) => clean(item))
    .filter(Boolean);
}

function findProductInfo(packageIdentity, infoItems) {
  if (!infoItems.length) return null;
  return infoItems.find((item) => (
    (packageIdentity.materialCodes || [packageIdentity.materialCode])
      .filter(Boolean)
      .some((code) => sameText(item.materialCode, code))
    || (packageIdentity.model && sameText(item.model, packageIdentity.model))
  )) || null;
}

function findProductInfoByMaterialCode(materialCode) {
  const code = clean(materialCode);
  if (!code) return null;
  return state.productInfo.find((item) => sameText(item.materialCode, code)) || null;
}

function parsePackages(row) {
  const packages = [];
  for (let index = 1; index <= 20; index += 1) {
    const explicitVolume = parseNumber(pick(row, [`体积${index}`, `子包裹体积${index}`, `包裹${index}体积`, `包裹${index}体积cm3`, `包裹${index}体积cm³`]));
    const length = parseNumber(pick(row, [`包裹${index}长cm`, `包裹${index}长度cm`, `包裹${index}长`]));
    const width = parseNumber(pick(row, [`包裹${index}宽cm`, `包裹${index}宽度cm`, `包裹${index}宽`]));
    const height = parseNumber(pick(row, [`包裹${index}高cm`, `包裹${index}高度cm`, `包裹${index}高`]));
    const weight = parseNumber(pick(row, [`包裹${index}重量kg`, `包裹${index}实际重量kg`, `包裹${index}毛重kg`, `包裹${index}重量`]));
    const explicitChargeWeight = parseNumber(pick(row, [`包裹${index}计费重量kg`, `包裹${index}计费重量`, `包裹${index}抛重kg`]));
    const volumeWeight = calcVolumeWeight(length, width, height);
    const chargeWeight = explicitChargeWeight || Math.max(weight, volumeWeight);
    const volume = explicitVolume || (length && width && height ? length * width * height : 0);
    if (!explicitVolume && !length && !width && !height && !weight && !explicitChargeWeight) continue;
    packages.push({
      index,
      volume,
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
      packages.push({ index: 1, volume: 0, length: 0, width: 0, height: 0, weight, volumeWeight: 0, chargeWeight: weight });
    }
  }
  return packages;
}

function normalizeLogisticsQuoteSheets(sheets) {
  return sheets.flatMap((sheet) => {
    if (isFloorFeeSheet(sheet.sheetName)) return [];
    const sheetMeta = parseQuoteSheetName(sheet.sheetName);
    if (!sheetMeta) return [];
    return sheet.rows.map((row) => normalizeLogisticsQuoteRow(row, sheetMeta, sheet.sheetName)).filter(Boolean);
  });
}

function normalizeFloorFeeSheets(sheets) {
  const floorSheet = sheets.find((sheet) => isFloorFeeSheet(sheet.sheetName));
  if (!floorSheet) return [];
  return floorSheet.rows.map(normalizeFloorFeeRow).filter(Boolean);
}

function isFloorFeeSheet(sheetName) {
  const text = normalizeText(sheetName);
  return text.includes("上楼收费") || text.includes("上楼费用");
}

function normalizeFloorFeeRow(row) {
  const carrier = clean(pick(row, ["快递公司", "物流公司", "承运商"]));
  const floorType = clean(pick(row, ["楼梯类型", "上楼类型", "楼梯", "类型"]));
  const ruleText = clean(pick(row, ["费用", "收费", "收费规则", "上楼费用"]));
  if (!carrier || !floorType || !ruleText) return null;
  return {
    carrier,
    floorType,
    ruleText,
    discount: parseDiscount(pick(row, ["折扣", "上楼折扣"])),
    rules: parseFloorFeeRules(ruleText),
    raw: row
  };
}

function parseFloorFeeRules(ruleText) {
  return clean(ruleText)
    .split(/\r?\n|；|;/)
    .map((line) => parseFloorFeeRuleLine(line))
    .filter(Boolean);
}

function parseFloorFeeRuleLine(line) {
  const text = normalizeFloorRuleText(line);
  if (!text) return null;
  const anyGte = numberFromMatch(text.match(/任意件[≥>=](\d+(?:\.\d+)?)kg/));
  const allLt = numberFromMatch(text.match(/(?:所有件|任意件)[＜<](\d+(?:\.\d+)?)kg/));
  const totalGte = numberFromMatch(text.match(/总计费重量[≥>=](\d+(?:\.\d+)?)kg/));
  const totalLt = numberFromMatch(text.match(/总计费重量[＜<](\d+(?:\.\d+)?)kg/));
  const rate = numberFromMatch(text.match(/总计费重量[*×xX](\d+(?:\.\d+)?)/));
  const unavailable = text.includes("不可上楼");
  if (!unavailable && rate === null) return null;
  return {
    anyGte,
    allLt,
    totalGte,
    totalLt,
    rate: rate || 0,
    unavailable,
    description: clean(line)
  };
}

function normalizeFloorRuleText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/公斤/g, "kg")
    .replace(/ＫＧ/gi, "kg")
    .replace(/KG/g, "kg")
    .replace(/≤/g, "<=")
    .replace(/＞/g, ">")
    .replace(/＜/g, "<")
    .trim();
}

function numberFromMatch(match) {
  return match ? Number(match[1]) : null;
}

function parseDiscount(value) {
  if (value === null || value === undefined || value === "") return 1;
  const raw = clean(value);
  const match = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return 1;
  const num = Number(match[0]);
  if (raw.includes("%") || num > 1) return num / 100;
  return num;
}

function parseQuoteSheetName(sheetName) {
  const text = clean(sheetName);
  const match = text.match(/^(.+?)[-－—](.+)$/);
  if (!match) return null;
  return {
    originName: clean(match[1]),
    carrier: clean(match[2])
  };
}

function normalizeLogisticsQuoteRow(row, sheetMeta, sheetName) {
    const canShipText = clean(pick(row, ["是否可发", "可发", "是否可送", "是否配送"]));
    const priceRule = parseWeightPriceRule(row);
    if (!priceRule) return null;
    return {
      slotId: slotIds.logisticsQuote,
      sheetName,
      originName: sheetMeta.originName,
      carrier: sheetMeta.carrier,
      quoteZone: sheetMeta.originName,
      province: clean(pick(row, ["目的省", "省", "省份", "收货省"])),
      city: clean(pick(row, ["目的市", "市", "城市", "收货市"])),
      district: clean(pick(row, ["目的区", "区", "区县", "目的区县", "收货区县"])),
      bubbleRatio: parseNumber(pick(row, ["泡比", "抛比", "体积泡比", "材积系数"])),
      firstWeight: priceRule.firstWeight,
      firstFee: priceRule.firstFee,
      steps: priceRule.steps,
      minFee: parseNumber(pick(row, ["最低收费", "最低费用", "起步价", "保底费用"])),
      canShip: !["否", "不可发", "不可送", "停发", "禁发", "no", "false"].includes(normalizeText(canShipText)),
      limit: clean(pick(row, ["限制说明", "限制", "不可发原因"])),
      remark: clean(pick(row, ["备注", "说明"])),
      raw: row
    };
}

function parseWeightPriceRule(row) {
  const rule = {
    firstWeight: 0,
    firstFee: 0,
    steps: []
  };
  for (const [header, value] of Object.entries(row || {})) {
    const fee = parseNumber(value);
    if (!fee) continue;
    const text = normalizeHeaderText(header);
    const firstMatch = text.match(/^首重(?:[（(])?\s*(\d+(?:\.\d+)?)\s*kg?\s*(?:[）)])?$/i);
    if (firstMatch) {
      rule.firstWeight = Number(firstMatch[1]);
      rule.firstFee = fee;
      continue;
    }
    const rangeMatch = text.match(/^续重[（(]\s*(\d+(?:\.\d+)?)\s*[-~至]\s*(\d+(?:\.\d+)?)\s*kg\s*[）)]$/i);
    if (rangeMatch) {
      rule.steps.push({
        from: Number(rangeMatch[1]),
        to: Number(rangeMatch[2]),
        fee
      });
      continue;
    }
    const aboveMatch = text.match(/^续重[（(]\s*(\d+(?:\.\d+)?)\s*(?:kg)?\s*以上\s*[）)]$/i);
    if (aboveMatch) {
      rule.steps.push({
        from: Number(aboveMatch[1]),
        to: Number.POSITIVE_INFINITY,
        fee
      });
    }
  }
  rule.steps.sort((a, b) => a.from - b.from);
  if (!rule.firstWeight || !rule.firstFee) return null;
  return rule;
}

function normalizeHeaderText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/ＫＧ/gi, "kg")
    .replace(/公斤/g, "kg")
    .trim();
}

function renderOriginOptions() {
  if (!state.origins.length) {
    els.originSelect.innerHTML = `<option value="">请先维护发货地址</option>`;
    return;
  }
  els.originSelect.innerHTML = `<option value="">请选择发货地</option>` + state.origins
    .map((origin) => `<option value="${escapeHtml(origin.name)}">${escapeHtml(origin.name)}</option>`)
    .join("");
}

function getChinaRegions() {
  return Array.isArray(window.CHINA_REGIONS) ? window.CHINA_REGIONS : [];
}

function getRegionAliases(region) {
  const name = clean(region?.name);
  if (!name) return [];
  const shortName = name
    .replace(/特别行政区$/, "")
    .replace(/维吾尔自治区$/, "")
    .replace(/壮族自治区$/, "")
    .replace(/回族自治区$/, "")
    .replace(/自治区$/, "")
    .replace(/自治州$/, "")
    .replace(/地区$/, "")
    .replace(/省$/, "")
    .replace(/市$/, "")
    .replace(/盟$/, "")
    .replace(/区$/, "")
    .replace(/县$/, "");
  return [...new Set([name, shortName].filter((item) => item.length >= 2))];
}

function findRegionMatch(text, regions) {
  const compact = clean(text).replace(/\s+/g, "");
  const matches = [];
  for (const region of regions || []) {
    for (const alias of getRegionAliases(region)) {
      const index = compact.indexOf(alias);
      if (index >= 0) matches.push({ region, alias, index });
    }
  }
  return matches.sort((a, b) => a.index - b.index || b.alias.length - a.alias.length)[0] || null;
}

function isDirectProvince(province) {
  return ["北京市", "天津市", "上海市", "重庆市", "香港特别行政区", "澳门特别行政区"].includes(province?.name);
}

function inferProvinceByCity(text) {
  const matches = [];
  for (const province of getChinaRegions()) {
    const match = findRegionMatch(text, getCityOptions(province));
    if (match) matches.push({ province, cityMatch: match });
  }
  return matches.sort((a, b) => a.cityMatch.index - b.cityMatch.index || b.cityMatch.alias.length - a.cityMatch.alias.length)[0] || null;
}

function renderProvinceOptions() {
  const regions = getChinaRegions();
  els.provinceSelect.innerHTML = `<option value="">请选择省</option>` + regions
    .map((province) => `<option value="${escapeHtml(province.code)}">${escapeHtml(province.name)}</option>`)
    .join("");
  renderCityOptions();
  renderDistrictOptions();
}

function getSelectedProvince() {
  return getChinaRegions().find((province) => province.code === els.provinceSelect.value) || null;
}

function getCityOptions(province) {
  if (!province) return [];
  const cities = province.children || [];
  if (["北京市", "天津市", "上海市", "重庆市"].includes(province.name) && cities.length === 1) {
    return [{
      code: cities[0].code,
      name: province.name,
      children: cities[0].children || []
    }];
  }
  return cities;
}

function getSelectedCity() {
  const province = getSelectedProvince();
  return getCityOptions(province).find((city) => city.code === els.citySelect.value) || null;
}

function renderCityOptions() {
  const cities = getCityOptions(getSelectedProvince());
  els.citySelect.innerHTML = `<option value="">请选择市</option>` + cities
    .map((city) => `<option value="${escapeHtml(city.code)}">${escapeHtml(city.name)}</option>`)
    .join("");
}

function renderDistrictOptions() {
  const city = getSelectedCity();
  const districts = city?.children || [];
  els.districtSelect.innerHTML = `<option value="">县/区域可不选</option>` + districts
    .map((district) => `<option value="${escapeHtml(district.code)}">${escapeHtml(district.name)}</option>`)
    .join("");
}

function getSelectedDistrict() {
  const city = getSelectedCity();
  return (city?.children || []).find((district) => district.code === els.districtSelect.value) || null;
}

function updateFloorTypeState() {
  const needsElevator = clean(els.elevatorSelect.value) === "需上楼";
  els.floorTypeSelect.disabled = !needsElevator;
  els.floorTypeSelect.required = needsElevator;
  if (!needsElevator) els.floorTypeSelect.value = "";
  if (needsElevator) {
    els.floorTypeSelect.options[0].textContent = "请选择楼梯类型";
  } else {
    els.floorTypeSelect.options[0].textContent = "无需选择";
  }
}

function buildManualCustomerAddress() {
  const province = getSelectedProvince();
  const city = getSelectedCity();
  const district = getSelectedDistrict();
  const detail = clean(els.addressInput.value);

  if (!province) return { address: "", error: "省为必选项。" };
  if (!city) return { address: province.name, error: "市为必选项。" };

  const parts = [province.name];
  if (city.name && !sameText(city.name, province.name)) parts.push(city.name);
  if (district?.name) parts.push(district.name);
  if (detail) parts.push(detail);
  return { address: parts.join(""), error: "" };
}

function recognizePastedAddress() {
  const parsed = parsePastedAddress(els.pastedAddressInput.value);
  if (parsed.error) {
    toast(parsed.error);
    return;
  }

  els.provinceSelect.value = parsed.province.code;
  renderCityOptions();
  els.citySelect.value = parsed.city.code;
  renderDistrictOptions();
  els.districtSelect.value = parsed.district?.code || "";
  els.addressInput.value = parsed.detail;
  toast("地址识别完成。");
}

function parsePastedAddress(address) {
  const text = clean(address).replace(/\s+/g, "");
  if (!text) return { error: "请先粘贴顾客地址。" };

  const provinceMatch = findRegionMatch(text, getChinaRegions());
  let province = provinceMatch?.region || null;
  let city = null;
  let cityMatch = null;
  let citySearchText = text;

  if (province) {
    citySearchText = text.slice(provinceMatch.index + provinceMatch.alias.length);
    if (isDirectProvince(province)) {
      city = getCityOptions(province)[0] || null;
    } else {
      cityMatch = findRegionMatch(citySearchText, getCityOptions(province));
      city = cityMatch?.region || null;
    }
  } else {
    const inferred = inferProvinceByCity(text);
    province = inferred?.province || null;
    cityMatch = inferred?.cityMatch || null;
    city = cityMatch?.region || null;
    citySearchText = text;
  }

  if (!province) return { error: "未识别到省份，请检查地址内容。" };
  if (!city) return { error: "未识别到城市，请检查地址内容。" };

  const afterCity = cityMatch
    ? citySearchText.slice(cityMatch.index + cityMatch.alias.length)
    : citySearchText;
  const districtMatch = findRegionMatch(afterCity, city.children || []);
  const detail = districtMatch
    ? afterCity.slice(districtMatch.index + districtMatch.alias.length)
    : afterCity;

  return {
    province,
    city,
    district: districtMatch?.region || null,
    detail: detail.replace(/^[,，、\s-]+/, ""),
    error: ""
  };
}

function updateProductInfoFields() {
  const shortName = clean(els.productShortNameInput.value);
  if (!shortName) {
    delete els.productShortNameInput.dataset.productIndex;
    els.materialCodeInput.value = "";
    els.salesProductLineInput.value = "";
    els.salesSeriesInput.value = "";
    els.modelInput.value = "";
    return null;
  }
  const selected = getSelectedProductFromInput();
  if (selected) {
    fillProductInfoFields(selected);
    return selected;
  }
  const match = findProductMatch({
    shortName
  });
  const product = match.product;
  if (product) {
    const index = state.products.indexOf(product);
    if (index >= 0 && sameText(product.shortName, shortName)) {
      els.productShortNameInput.dataset.productIndex = String(index);
    }
  }
  fillProductInfoFields(product);
  return product;
}

function fillProductInfoFields(product) {
  els.materialCodeInput.value = product?.materialCode || "";
  els.salesProductLineInput.value = product?.salesProductLine || "";
  els.salesSeriesInput.value = product?.salesSeries || "";
  els.modelInput.value = product?.model || "";
}

function getSelectedProductFromInput() {
  const index = Number(els.productShortNameInput.dataset.productIndex);
  if (!Number.isInteger(index) || index < 0 || index >= state.products.length) return null;
  const product = state.products[index];
  return clean(els.productShortNameInput.value) === clean(product.shortName) ? product : null;
}

function renderProductSuggestions() {
  const suggestions = els.productSuggestions;
  if (!suggestions) return;
  const candidates = findProductCandidates(els.productShortNameInput.value, PRODUCT_SUGGESTION_LIMIT);
  if (!candidates.length) {
    suggestions.hidden = true;
    suggestions.innerHTML = "";
    return;
  }
  suggestions.innerHTML = candidates.map(({ product }, index) => {
    const productIndex = state.products.indexOf(product);
    const title = product.shortName || product.name || product.materialCode || "-";
    const meta = [product.materialCode, product.salesProductLine, product.salesSeries, product.model]
      .filter(Boolean)
      .join(" / ");
    return `
      <button type="button" class="product-suggestion ${index === 0 ? "is-active" : ""}" data-product-index="${productIndex}">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(meta || "商品包装明细")}</span>
      </button>
    `;
  }).join("");
  suggestions.hidden = false;
  suggestions.querySelectorAll(".product-suggestion").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => selectProductSuggestion(Number(button.dataset.productIndex)));
  });
}

function hideProductSuggestions() {
  if (!els.productSuggestions) return;
  els.productSuggestions.hidden = true;
}

function selectProductSuggestion(index) {
  const product = state.products[index];
  if (!product) return;
  els.productShortNameInput.value = product.shortName || product.name || product.materialCode || "";
  els.productShortNameInput.dataset.productIndex = String(index);
  fillProductInfoFields(product);
  hideProductSuggestions();
}

function handleProductSuggestionKeys(event) {
  if (!els.productSuggestions || els.productSuggestions.hidden) return;
  const buttons = Array.from(els.productSuggestions.querySelectorAll(".product-suggestion"));
  if (!buttons.length) return;
  const currentIndex = Math.max(0, buttons.findIndex((button) => button.classList.contains("is-active")));
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    buttons[currentIndex]?.classList.remove("is-active");
    const nextIndex = event.key === "ArrowDown"
      ? Math.min(buttons.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    buttons[nextIndex].classList.add("is-active");
    buttons[nextIndex].scrollIntoView({ block: "nearest" });
  }
  if (event.key === "Enter") {
    const active = buttons[currentIndex] || buttons[0];
    if (active) {
      event.preventDefault();
      selectProductSuggestion(Number(active.dataset.productIndex));
    }
  }
  if (event.key === "Escape") hideProductSuggestions();
}

async function runSingleQuery() {
  if (els.runQuery.disabled) return;
  if (state.libraryLoading) {
    toast("维度库正在加载，请等待加载完成后再查询。");
    return;
  }
  if (!state.libraryReady) {
    toast("维度库未加载完整，请先维护并刷新维度表库。");
    return;
  }
  const requiredCheck = validateManualRequiredFields();
  if (!requiredCheck.valid) {
    showRequiredFieldsWarning(requiredCheck);
    return;
  }
  els.runQuery.disabled = true;
  setQueryProgress("正在准备查询...", 20, "loading");
  try {
    await nextFrame();
    const product = updateProductInfoFields();
    const addressData = buildManualCustomerAddress();
    setQueryProgress("正在匹配商品、地址和报价...", 65, "loading");
    await nextFrame();
    const result = calculateBestOption({
      origin: els.originSelect.value,
      elevatorService: els.elevatorSelect.value,
      floorType: els.floorTypeSelect.value,
      address: addressData.address,
      addressError: addressData.error,
      model: product?.model || els.modelInput.value.trim(),
      shortName: els.productShortNameInput.value.trim(),
      materialCode: product?.materialCode || els.materialCodeInput.value.trim(),
      salesProductLine: product?.salesProductLine || els.salesProductLineInput.value.trim(),
      salesSeries: product?.salesSeries || els.salesSeriesInput.value.trim(),
      purchaseQty: parsePurchaseQty(els.quantityInput.value)
    });
    state.results = [result];
    renderResults();
    setQueryProgress(result.failureReason ? "查询完成，请查看失败原因。" : "查询完成。", 100, result.failureReason ? "warning" : "done");
  } catch (error) {
    console.error(error);
    setQueryProgress(error.message || "查询失败，请检查维度表。", 100, "error");
    toast(error.message || "查询失败");
  } finally {
    els.runQuery.disabled = !state.libraryReady || state.libraryLoading;
  }
}

function validateManualRequiredFields() {
  const checks = [
    { label: "发货地", el: els.originSelect, valid: !!clean(els.originSelect.value) },
    { label: "是否上楼", el: els.elevatorSelect, valid: !!clean(els.elevatorSelect.value) },
    { label: "楼梯类型", el: els.floorTypeSelect, valid: clean(els.elevatorSelect.value) !== "需上楼" || !!clean(els.floorTypeSelect.value) },
    { label: "省", el: els.provinceSelect, valid: !!clean(els.provinceSelect.value) },
    { label: "市", el: els.citySelect, valid: !!clean(els.citySelect.value) },
    { label: "货品简称", el: els.productShortNameInput, valid: !!clean(els.productShortNameInput.value) },
    { label: "购买件数", el: els.quantityInput, valid: !!clean(els.quantityInput.value) && parseNumber(els.quantityInput.value) >= 1 }
  ];
  const missing = checks.filter((item) => !item.valid);
  return {
    valid: missing.length === 0,
    missing: missing.map((item) => item.label),
    firstEl: missing[0]?.el || null
  };
}

function showRequiredFieldsWarning(check) {
  const message = `请填写必填项：${check.missing.join("、")}`;
  toast(message);
  setQueryProgress(message, 100, "warning");
  els.resultHint.textContent = message;
  check.firstEl?.focus?.();
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function setQueryProgress(message, percent, status = "loading") {
  if (!els.queryProgress) return;
  els.queryProgress.hidden = false;
  els.queryProgress.dataset.status = status;
  els.queryProgressText.textContent = message;
  els.queryProgressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function setLibraryProgress(message, percent, status = "loading") {
  if (!els.libraryProgress) return;
  const safePercent = Math.max(0, Math.min(100, percent));
  els.libraryProgress.dataset.status = status;
  els.libraryProgressText.textContent = `${message} ${safePercent}%`;
  els.libraryProgressBar.style.width = `${safePercent}%`;
}

function getMissingLibraryParts() {
  const missing = [];
  if (!state.origins.length) missing.push("发货地址");
  if (!state.productInfo.length) missing.push("商品信息");
  if (!state.products.length) missing.push("商品包装明细");
  if (!state.quotes.length) missing.push("物流公司报价");
  return missing;
}

async function importBatchFile(file) {
  if (state.libraryLoading) {
    toast("维度库正在加载，请等待加载完成后再批量导入。");
    return;
  }
  if (!state.libraryReady) {
    toast("维度库未加载完整，请先维护并刷新维度表库。");
    return;
  }
  try {
    const workbook = readWorkbook(file.name, await file.arrayBuffer());
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false });
    const headers = getWorksheetHeaders(worksheet);
    state.batchImportHeaders = headers;
    state.results = rows.map((row, index) => {
      const result = calculateBestOption({
        origin: pick(row, ["发货地", "供应商简称", "发货仓", "仓库"]) || els.originSelect.value,
        elevatorService: pick(row, ["是否上楼", "上楼服务", "上楼", "需上楼"]) || els.elevatorSelect.value,
        floorType: pick(row, ["楼梯类型", "上楼类型", "楼梯"]) || els.floorTypeSelect.value,
        address: pick(row, ["顾客地址", "客户地址", "收货地址", "地址"]) || "",
        shortName: pick(row, ["货品简称", "货品名称简称", "货品简名", "简称"]) || "",
        purchaseQty: parsePurchaseQty(pick(row, ["购买件数", "商品购买件数", "件数", "数量"]))
      });
      result.importSource = {
        rowNumber: index + 2,
        headers,
        row: buildImportSourceRow(row, headers)
      };
      return result;
    });
    renderResults();
    toast(`已导入 ${state.results.length} 条地址查询。`);
  } catch (error) {
    console.error(error);
    toast(error.message || "导入失败");
  }
}

function calculateBestOption(input) {
  const originName = clean(input.origin);
  const elevatorService = clean(input.elevatorService);
  const floorType = clean(input.floorType);
  const address = clean(input.address);
  const shortName = clean(input.shortName);
  const materialCode = clean(input.materialCode);
  const purchaseQty = parsePurchaseQty(input.purchaseQty);
  const origin = findOrigin(originName);
  const match = findProductMatch({ shortName, materialCode });
  const product = match.product;
  const model = product?.model || clean(input.model);
  const salesSeries = product?.salesSeries || clean(input.salesSeries);
  const addressCheck = validateCustomerAddress(address);

  if (!originName) {
    return buildResult(input, origin, product, null, [], "发货地为必选项。");
  }
  if (!elevatorService) {
    return buildResult(input, origin, product, null, [], "是否上楼为必选项。");
  }
  if (elevatorService === "需上楼" && !floorType) {
    return buildResult(input, origin, product, null, [], "楼梯类型为必选项。");
  }
  if (input.addressError) {
    return buildResult(input, origin, product, null, [], input.addressError);
  }
  if (!address) {
    return buildResult(input, origin, product, null, [], "顾客地址为必填项。");
  }
  if (!addressCheck.valid) {
    return buildResult(input, origin, product, null, [], addressCheck.message);
  }
  if (!shortName) {
    return buildResult(input, origin, product, null, [], "货品简称为必填项。");
  }
  if (!origin) {
    return buildResult(input, origin, product, null, [], "发货地址表中未找到该发货地。");
  }
  if (match.error) {
    return buildResult(input, origin, product, null, [], match.error);
  }
  if (!product.packageCount || (!product.totalVolume && !product.singleChargeWeight)) {
    return buildResult(input, origin, product, null, [], "该物料缺少总体积或有效包裹计费重量。");
  }

  const candidates = state.quotes
    .filter((quote) => matchesQuoteOrigin(quote, originName))
    .filter((quote) => quote.canShip)
    .map((quote) => {
      const addressMatch = matchAddress(quote, address);
      if (!addressMatch.matched) return null;
      const totalChargeWeight = calculateLogisticsChargeWeight(product, purchaseQty, quote);
      if (!Number.isFinite(totalChargeWeight) || totalChargeWeight <= 0) return null;
      const costDetail = calculateCostDetail(quote, totalChargeWeight);
      const floorFeeDetail = calculateFloorFeeDetail({
        quote,
        product,
        purchaseQty,
        totalChargeWeight,
        elevatorService,
        floorType
      });
      const totalCost = roundMoney(costDetail.total + floorFeeDetail.fee);
      return {
        quote,
        match: addressMatch,
        totalChargeWeight,
        baseCost: costDetail.total,
        floorFee: floorFeeDetail.fee,
        floorFeeDetail,
        cost: totalCost,
        costDetail
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

function getWorksheetHeaders(worksheet) {
  if (!worksheet?.["!ref"]) return [];
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const headers = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })];
    const header = clean(cell?.v ?? cell?.w ?? "");
    if (header) headers.push(header);
  }
  return headers;
}

function buildImportSourceRow(row, headers) {
  return headers.reduce((output, header) => {
    output[header] = row?.[header] ?? "";
    return output;
  }, {});
}

function matchesQuoteOrigin(quote, originName) {
  const quoteOrigin = normalizeText(quote.originName);
  const origin = normalizeText(originName);
  return quoteOrigin === origin || quoteOrigin.includes(origin) || origin.includes(quoteOrigin);
}

function validateCustomerAddress(address) {
  const parts = parseCustomerAddress(address);
  const missing = [];
  if (!parts.province) missing.push("省份");
  if (!parts.city) missing.push("市");
  if (missing.length) {
    return {
      valid: false,
      parts,
      message: `顾客地址必须包含${missing.join("和")}。`
    };
  }
  return { valid: true, parts, message: "" };
}

function parseCustomerAddress(address) {
  const text = clean(address);
  if (!text) return { province: "", city: "" };
  const compact = text.replace(/\s+/g, "");
  const province = findProvinceName(compact);
  const afterProvince = province ? compact.slice(compact.indexOf(province.matchText) + province.matchText.length) : compact;
  const city = findCityName(afterProvince, province);
  return {
    province: province?.name || "",
    city: city || ""
  };
}

function findProvinceName(text) {
  const provinces = [
    ["北京市", "北京"],
    ["天津市", "天津"],
    ["上海市", "上海"],
    ["重庆市", "重庆"],
    ["河北省", "河北"],
    ["山西省", "山西"],
    ["辽宁省", "辽宁"],
    ["吉林省", "吉林"],
    ["黑龙江省", "黑龙江"],
    ["江苏省", "江苏"],
    ["浙江省", "浙江"],
    ["安徽省", "安徽"],
    ["福建省", "福建"],
    ["江西省", "江西"],
    ["山东省", "山东"],
    ["河南省", "河南"],
    ["湖北省", "湖北"],
    ["湖南省", "湖南"],
    ["广东省", "广东"],
    ["海南省", "海南"],
    ["四川省", "四川"],
    ["贵州省", "贵州"],
    ["云南省", "云南"],
    ["陕西省", "陕西"],
    ["甘肃省", "甘肃"],
    ["青海省", "青海"],
    ["台湾省", "台湾"],
    ["内蒙古自治区", "内蒙古"],
    ["广西壮族自治区", "广西"],
    ["西藏自治区", "西藏"],
    ["宁夏回族自治区", "宁夏"],
    ["新疆维吾尔自治区", "新疆"],
    ["香港特别行政区", "香港"],
    ["澳门特别行政区", "澳门"]
  ];
  for (const [name, shortName] of provinces) {
    const candidates = [name, shortName];
    const matchText = candidates.find((candidate) => text.includes(candidate));
    if (matchText) return { name, shortName, matchText };
  }
  return null;
}

function findCityName(text, province) {
  if (province && ["北京", "天津", "上海", "重庆", "香港", "澳门"].includes(province.shortName)) {
    return province.name;
  }
  const cityMatch = text.match(/([\u4e00-\u9fa5]{2,12}?(?:市|自治州|地区|盟|县))/);
  return cityMatch ? cityMatch[1] : "";
}

function findProductMatch({ shortName, materialCode }) {
  let matches = state.products;
  if (shortName) matches = findProductCandidates(shortName, state.products.length).map((item) => item.product);
  if (materialCode) matches = matches.filter((item) => (item.materialCodes || [item.materialCode]).some((code) => sameText(code, materialCode)));
  if (!matches.length) {
    return {
      product: null,
      error: materialCode
        ? "商品包装明细中未找到同时匹配货品简称和物料编码的商品。"
        : "商品包装明细中未找到匹配的货品简称。"
    };
  }
  if (matches.length > 1) {
    const preferred = matches.find((item) => sameText(item.shortName, shortName))
      || matches.find((item) => item.totalVolume || item.packageCount || item.materialCode)
      || matches[0];
    return { product: preferred, error: "" };
  }
  return { product: matches[0], error: "" };
}

function findProductCandidates(query, limit = PRODUCT_SUGGESTION_LIMIT) {
  const normalizedQuery = normalizeSearchToken(query);
  const initialQuery = normalizedQuery.replace(/[^a-z0-9]/g, "");
  const products = state.products || [];
  const scored = products.map((product) => {
    const score = scoreProductCandidate(product, normalizedQuery, initialQuery);
    return score > 0 || !normalizedQuery ? { product, score } : null;
  }).filter(Boolean);
  return scored
    .sort((a, b) => b.score - a.score || productDisplayName(a.product).localeCompare(productDisplayName(b.product), "zh-CN"))
    .slice(0, limit);
}

function scoreProductCandidate(product, normalizedQuery, initialQuery) {
  if (!normalizedQuery) return 1;
  let best = 0;
  for (const field of getProductSearchFields(product)) {
    const normalizedField = normalizeSearchToken(field);
    if (!normalizedField) continue;
    if (normalizedField === normalizedQuery) best = Math.max(best, 1000);
    else if (normalizedField.startsWith(normalizedQuery)) best = Math.max(best, 850);
    else if (normalizedField.includes(normalizedQuery)) best = Math.max(best, 700);

    const initials = getSearchInitials(field);
    if (initialQuery && initials) {
      if (initials === initialQuery) best = Math.max(best, 650);
      else if (initials.startsWith(initialQuery)) best = Math.max(best, 540);
      else if (initials.includes(initialQuery)) best = Math.max(best, 460);
    }
  }
  if (product.shortName && sameText(product.shortName, normalizedQuery)) best = Math.max(best, 1100);
  return best;
}

function getProductSearchFields(product) {
  const rawValues = Object.values(product?.raw || {}).map((value) => clean(value)).filter(Boolean);
  return [...new Set([
    productDisplayName(product),
    product?.shortName,
    product?.name,
    product?.materialCode,
    ...(product?.materialCodes || []),
    product?.model,
    product?.salesProductLine,
    product?.salesSeries,
    ...rawValues
  ].map((value) => clean(value)).filter(Boolean))];
}

function productDisplayName(product) {
  return clean(product?.shortName || product?.name || product?.materialCode || "");
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

function calculateLogisticsChargeWeight(product, purchaseQty, quote) {
  if (product?.totalVolume && quote?.bubbleRatio) {
    return roundWeight(product.totalVolume * purchaseQty / quote.bubbleRatio);
  }
  return roundWeight((product?.singleChargeWeight || 0) * purchaseQty);
}

function calculateCostDetail(quote, weight) {
  const detail = {
    firstWeight: quote?.firstWeight || 0,
    firstFee: quote?.firstFee || 0,
    minFee: quote?.minFee || 0,
    chargeWeight: weight,
    lines: [],
    subtotal: Number.NaN,
    total: Number.NaN
  };
  if (!quote?.firstWeight || !quote?.firstFee) return detail;
  let cost = quote.firstFee;
  detail.lines.push({
    label: `首重 ${quote.firstWeight}kg`,
    formula: `${formatNumber(quote.firstFee)} 元`,
    amount: roundMoney(quote.firstFee)
  });
  if (weight > quote.firstWeight) {
    const sortedSteps = [...(quote.steps || [])].sort((a, b) => a.from - b.from);
    for (const [index, step] of sortedSteps.entries()) {
      const from = index === 0 ? quote.firstWeight : Math.max(step.from, quote.firstWeight);
      const to = Number.isFinite(step.to) ? step.to : weight;
      const billable = Math.max(0, Math.min(weight, to) - from);
      if (billable > 0) {
        const amount = billable * step.fee;
        cost += amount;
        detail.lines.push({
          label: Number.isFinite(step.to) ? `续重 ${from}-${step.to}kg` : `续重 ${from}kg以上`,
          formula: `${formatNumber(billable)}kg × ${formatNumber(step.fee)} 元/kg`,
          amount: roundMoney(amount)
        });
      }
      if (weight <= to) break;
    }
  }
  detail.subtotal = roundMoney(cost);
  if (quote.minFee && cost < quote.minFee) {
    detail.lines.push({
      label: "最低收费调整",
      formula: `max(${formatNumber(cost)}, ${formatNumber(quote.minFee)})`,
      amount: roundMoney(quote.minFee - cost)
    });
    cost = quote.minFee;
  }
  detail.total = roundMoney(cost);
  return detail;
}

function calculateCost(quote, weight) {
  return calculateCostDetail(quote, weight).total;
}

function calculateFloorFeeDetail({ quote, product, totalChargeWeight, elevatorService, floorType }) {
  const detail = {
    service: elevatorService || "",
    floorType: floorType || "",
    status: elevatorService === "需上楼" ? "需上楼" : "无需上楼",
    fee: 0,
    displayFee: "0",
    discount: 1,
    rate: 0,
    lines: [],
    childWeights: [],
    message: ""
  };
  if (elevatorService !== "需上楼") {
    detail.lines.push({ label: "上楼服务", formula: "无需上楼，上楼费用=0", amount: Number.NaN });
    return detail;
  }
  const floorRule = findFloorFeeRule(quote.carrier, floorType);
  if (!floorRule) {
    detail.status = "上楼费规则缺失，未计入上楼费";
    detail.displayFee = "未计入";
    detail.message = detail.status;
    detail.lines.push({ label: "上楼费", formula: `未找到 ${quote.carrier || "-"} / ${floorType || "-"} 的上楼收费规则`, amount: Number.NaN });
    return detail;
  }
  detail.discount = floorRule.discount;
  detail.childWeights = calculatePackageFloorWeights(product, quote);
  detail.lines.push({ label: "上楼收费规则", formula: `${floorRule.carrier}/${floorRule.floorType}：${floorRule.ruleText}`, amount: Number.NaN });
  detail.lines.push({ label: "子包裹判断重量", formula: formatFloorPackageWeightDetails(detail.childWeights), amount: Number.NaN });
  if (!detail.childWeights.length) {
    detail.status = "子包裹体积缺失，未计入上楼费";
    detail.displayFee = "未计入";
    detail.message = detail.status;
    detail.lines.push({ label: "上楼费", formula: "缺少体积1、体积2等子包裹体积", amount: Number.NaN });
    return detail;
  }
  const matched = matchFloorFeeRule(floorRule.rules, detail.childWeights, totalChargeWeight);
  if (!matched) {
    detail.status = "上楼费规则无法识别，未计入上楼费";
    detail.displayFee = "未计入";
    detail.message = detail.status;
    detail.lines.push({ label: "上楼规则命中", formula: `未命中可识别规则，未计入上楼费`, amount: Number.NaN });
    return detail;
  }
  detail.lines.push({ label: "上楼规则命中", formula: matched.description || "命中上楼收费规则", amount: Number.NaN });
  if (matched.unavailable) {
    detail.status = "可发货但不可上楼";
    detail.displayFee = "不可上楼";
    detail.message = detail.status;
    detail.lines.push({ label: "上楼状态", formula: "可发货但不可上楼，上楼费用不计入总费用", amount: Number.NaN });
    return detail;
  }
  const fee = roundMoney(totalChargeWeight * matched.rate * floorRule.discount);
  detail.rate = matched.rate;
  detail.fee = fee;
  detail.displayFee = formatMoney(fee);
  detail.status = "可上楼";
  detail.lines.push({
    label: "上楼费",
    formula: `整单总计费重量 ${formatNumber(totalChargeWeight)}kg × ${formatNumber(matched.rate)} 元/kg × 折扣 ${formatPercent(floorRule.discount)}`,
    amount: fee
  });
  return detail;
}

function findFloorFeeRule(carrier, floorType) {
  if (!carrier || !floorType) return null;
  return state.floorFees.find((item) => sameText(item.carrier, carrier) && sameText(item.floorType, floorType)) || null;
}

function calculatePackageFloorWeights(product, quote) {
  const bubbleRatio = quote?.bubbleRatio || 0;
  if (!bubbleRatio) return [];
  return (product?.packages || [])
    .map((pkg) => ({
      index: pkg.index,
      volume: pkg.volume || 0,
      bubbleRatio,
      weight: pkg.volume ? roundWeight(pkg.volume / bubbleRatio) : 0
    }))
    .filter((item) => item.weight > 0);
}

function matchFloorFeeRule(rules, childWeights, totalChargeWeight) {
  for (const rule of rules || []) {
    if (floorRuleMatches(rule, childWeights, totalChargeWeight)) return rule;
  }
  return null;
}

function floorRuleMatches(rule, childWeights, totalChargeWeight) {
  const weights = childWeights.map((item) => item.weight);
  if (rule.anyGte !== null && !weights.some((weight) => weight >= rule.anyGte)) return false;
  if (rule.allLt !== null && !weights.every((weight) => weight < rule.allLt)) return false;
  if (rule.totalGte !== null && !(totalChargeWeight >= rule.totalGte)) return false;
  if (rule.totalLt !== null && !(totalChargeWeight < rule.totalLt)) return false;
  return true;
}

function buildResult(input, origin, product, best, candidates, message) {
  const purchaseQty = parsePurchaseQty(input.purchaseQty);
  const singleWeight = product?.singleWeight || 0;
  const singleChargeWeight = product?.singleChargeWeight || 0;
  const totalActualWeight = product?.totalActualWeight || (product ? roundWeight(singleWeight * purchaseQty) : 0);
  const quote = best?.quote || {};
  const totalChargeWeight = best?.totalChargeWeight || 0;
  const alternatives = best
    ? candidates.filter((item) => item !== best)
    : candidates;
  const floorFeeDetail = best?.floorFeeDetail || null;
  const totalVolume = product?.totalVolume || 0;
  const purchasedVolume = product ? roundWeight(totalVolume * purchaseQty) : 0;
  return {
    origin: clean(input.origin),
    elevatorService: clean(input.elevatorService),
    floorType: clean(input.floorType),
    quoteZone: origin?.quoteZone || normalizeQuoteZone(input.origin) || "",
    address: clean(input.address),
    shortName: product?.shortName || clean(input.shortName),
    model: product?.model || clean(input.model),
    materialCode: product?.materialCode || clean(input.materialCode),
    salesProductLine: product?.salesProductLine || clean(input.salesProductLine),
    salesSeries: product?.salesSeries || clean(input.salesSeries),
    productName: product?.name || product?.shortName || "",
    purchaseQty,
    packageCount: product?.packageCount || 0,
    totalActualWeight,
    singleChargeWeight,
    totalChargeWeight,
    baseCost: best ? best.baseCost : "",
    floorStatus: floorFeeDetail?.status || "",
    floorFee: best ? floorFeeDetail?.fee || 0 : "",
    floorFeeDisplay: best ? floorFeeDetail?.displayFee || "0" : "",
    carrier: quote.carrier || "",
    cost: best ? best.cost : "",
    region: best?.match?.label || "",
    candidateCount: candidates.length,
    backupCarriers: alternatives.map((item) => item.quote.carrier).join("、"),
    backupCosts: alternatives.map(formatBackupCost).join("；"),
    calculationDetails: candidates.map((item) => buildCalculationDetail({
      item,
      isBest: item === best,
      product,
      purchaseQty,
      totalVolume,
      purchasedVolume
    })),
    message: message || quote.remark || quote.limit || "费用最低"
  };
}

function buildCalculationDetail({ item, isBest, product, purchaseQty, totalVolume, purchasedVolume }) {
  const quote = item.quote || {};
  const floorDetail = item.floorFeeDetail || {};
  return {
    carrier: quote.carrier || "",
    role: isBest ? "推荐物流" : "备选物流",
    sheetName: quote.sheetName || "",
    matchedRegion: item.match?.label || "",
    bubbleRatio: quote.bubbleRatio || 0,
    purchaseQty,
    singleVolume: totalVolume || 0,
    purchasedVolume,
    chargeWeight: item.totalChargeWeight,
    baseCost: item.baseCost,
    floorFee: item.floorFee,
    floorFeeDisplay: floorDetail.displayFee || "0",
    floorStatus: floorDetail.status || "",
    floorPackageWeights: floorDetail.childWeights || [],
    cost: item.cost,
    costLines: item.costDetail?.lines || [],
    floorLines: floorDetail.lines || [],
    formula: quote.bubbleRatio
      ? `${formatNumber(totalVolume)} × ${purchaseQty} ÷ ${formatNumber(quote.bubbleRatio)} = ${formatNumber(item.totalChargeWeight)}kg`
      : `${formatNumber(product?.singleChargeWeight || 0)} × ${purchaseQty} = ${formatNumber(item.totalChargeWeight)}kg`
  };
}

function formatBackupCost(item) {
  return `${item.quote.carrier}：总费用${formatMoney(item.cost)}，基础费用${formatMoney(item.baseCost)}，上楼费用${item.floorFeeDetail?.displayFee || formatMoney(item.floorFee || 0)}`;
}

function formatFloorPackageWeights(weights) {
  if (!weights?.length) return "-";
  return weights.map((item) => `体积${item.index}:${formatNumber(item.weight)}kg`).join("；");
}

function formatFloorPackageWeightDetails(weights) {
  if (!weights?.length) return "无子包裹体积";
  return weights.map((item) => (
    `体积${item.index} ${formatNumber(item.volume)} ÷ 泡比 ${formatNumber(item.bubbleRatio)} = ${formatNumber(item.weight)}kg`
  )).join("；");
}

function renderResults() {
  if (!state.results.length) {
    els.resultBody.innerHTML = `<tr><td colspan="20" class="empty">暂无查询结果</td></tr>`;
    renderCalculationSelector();
    els.exportResults.disabled = true;
    return;
  }
  els.resultBody.innerHTML = state.results.map((row, index) => `
    <tr class="result-main-row">
      <td>${index + 1}</td>
      <td>${escapeHtml(row.salesProductLine)}</td>
      <td>${escapeHtml(row.salesSeries)}</td>
      <td>${escapeHtml(row.model)}</td>
      <td>${escapeHtml(row.materialCode)}</td>
      <td>${escapeHtml(row.productName)}</td>
      <td>${escapeHtml(row.purchaseQty)}</td>
      <td>${escapeHtml(row.packageCount)}</td>
      <td>${escapeHtml(row.totalActualWeight)}</td>
      <td>${escapeHtml(row.totalChargeWeight)}</td>
      <td>${escapeHtml(row.origin)}</td>
      <td>${escapeHtml(row.elevatorService)}</td>
      <td>${escapeHtml(row.floorType || "-")}</td>
      <td>${row.baseCost === "" ? "未匹配" : escapeHtml(row.baseCost)}</td>
      <td>${escapeHtml(row.floorStatus || "-")}</td>
      <td>${escapeHtml(row.floorFeeDisplay || "")}</td>
      <td>${escapeHtml(row.carrier || "未匹配")}</td>
      <td>${row.cost === "" ? "未匹配" : escapeHtml(row.cost)}</td>
      <td>${escapeHtml(row.backupCarriers)}</td>
      <td>${escapeHtml(row.backupCosts)}</td>
    </tr>
  `).join("");
  renderCalculationSelector(true);
  const matched = state.results.filter((row) => row.carrier).length;
  const firstFailure = state.results.find((row) => !row.carrier && row.message);
  els.resultHint.textContent = firstFailure
    ? `共 ${state.results.length} 条，已匹配 ${matched} 条。未匹配原因：${firstFailure.message}`
    : `共 ${state.results.length} 条，已匹配 ${matched} 条。`;
  els.exportResults.disabled = false;
}

function clearQueryInfo() {
  state.results = [];
  state.batchImportHeaders = [];
  els.pastedAddressInput.value = "";
  els.originSelect.value = "";
  els.elevatorSelect.value = "";
  updateFloorTypeState();
  els.provinceSelect.value = "";
  renderCityOptions();
  renderDistrictOptions();
  els.addressInput.value = "";
  els.productShortNameInput.value = "";
  delete els.productShortNameInput.dataset.productIndex;
  hideProductSuggestions();
  els.materialCodeInput.value = "";
  els.salesProductLineInput.value = "";
  els.salesSeriesInput.value = "";
  els.modelInput.value = "";
  els.quantityInput.value = "1";
  els.batchFile.value = "";
  els.queryProgress.hidden = true;
  els.queryProgress.dataset.status = "";
  els.queryProgressText.textContent = "等待查询";
  els.queryProgressBar.style.width = "0%";
  els.resultHint.textContent = "请输入查询条件。";
  renderResults();
  toast("查询信息已清除。");
}

function renderCalculationSelector(forceFirst = false) {
  if (!state.results.length) {
    els.calculationSelect.innerHTML = `<option value="">暂无明细</option>`;
    els.calculationSelect.disabled = true;
    els.calculationHint.textContent = "暂无详细计算过程";
    els.calculationDetailBody.innerHTML = `<div class="calculation-empty">暂无详细计算过程</div>`;
    return;
  }
  const current = Number(els.calculationSelect.value);
  const selectedIndex = !forceFirst && Number.isInteger(current) && current >= 0 && current < state.results.length ? current : 0;
  els.calculationSelect.innerHTML = state.results.map((row, index) => {
    const label = `${index + 1}｜${row.materialCode || "-"}｜${row.carrier || "未匹配"}`;
    return `<option value="${index}">${escapeHtml(label)}</option>`;
  }).join("");
  els.calculationSelect.value = String(selectedIndex);
  els.calculationSelect.disabled = false;
  renderSelectedCalculationDetail();
}

function renderSelectedCalculationDetail() {
  if (!state.results.length) {
    els.calculationDetailBody.innerHTML = `<div class="calculation-empty">暂无详细计算过程</div>`;
    return;
  }
  const index = Math.max(0, Math.min(Number(els.calculationSelect.value) || 0, state.results.length - 1));
  const row = state.results[index];
  els.calculationHint.textContent = `当前展示序号 ${index + 1}，物料编码 ${row.materialCode || "-"}，推荐物流 ${row.carrier || "未匹配"}。`;
  els.calculationDetailBody.innerHTML = renderCalculationDetails(row, index);
}

function renderCalculationDetails(row, index) {
  const sequence = index + 1;
  const title = `第 ${sequence} 条 · ${row.materialCode || "-"} · ${row.carrier || "未匹配"}`;
  if (!row.calculationDetails?.length) {
    return `<div class="calculation-empty"><strong>${escapeHtml(title)}</strong>：${escapeHtml(row.message || "没有匹配到可用物流报价。")}</div>`;
  }
  const list = row.calculationDetails.map((detail) => `
    <div class="calculation-item ${detail.role === "推荐物流" ? "is-best" : ""}">
      <div class="calculation-title">
        <strong>${escapeHtml(detail.role)}：${escapeHtml(detail.carrier)}</strong>
        <span>总费用 ${escapeHtml(formatMoney(detail.cost))} 元</span>
      </div>
      <div class="calculation-grid">
        <span>报价 Sheet：${escapeHtml(detail.sheetName || "-")}</span>
        <span>匹配区域：${escapeHtml(detail.matchedRegion || "-")}</span>
        <span>单件总体积：${escapeHtml(formatNumber(detail.singleVolume))}</span>
        <span>购买件数：${escapeHtml(detail.purchaseQty)}</span>
        <span>购买总体积：${escapeHtml(formatNumber(detail.purchasedVolume))}</span>
        <span>泡比：${escapeHtml(formatNumber(detail.bubbleRatio))}</span>
        <span>计费重量：${escapeHtml(detail.formula)}</span>
        <span>子包裹判断重量：${escapeHtml(formatFloorPackageWeightDetails(detail.floorPackageWeights))}</span>
        <span>上楼状态：${escapeHtml(detail.floorStatus || "-")}</span>
      </div>
      <div class="calculation-steps">
        ${detail.costLines.map((line) => `
          <span>${escapeHtml(line.label)}：${escapeHtml(line.formula)} = ${escapeHtml(formatMoney(line.amount))} 元</span>
        `).join("")}
        <strong>基础费用：${escapeHtml(formatMoney(detail.baseCost))} 元</strong>
        ${detail.floorLines.map((line) => `
          <span>${escapeHtml(line.label)}：${escapeHtml(line.formula)}${Number.isFinite(Number(line.amount)) ? ` = ${escapeHtml(formatMoney(line.amount))} 元` : ""}</span>
        `).join("")}
        <strong>上楼费用：${escapeHtml(detail.floorFeeDisplay || formatMoney(detail.floorFee || 0))}</strong>
        <strong>总费用：${escapeHtml(formatMoney(detail.cost))} 元</strong>
      </div>
    </div>
  `).join("");
  return `<div class="calculation-box"><div class="calculation-label">${escapeHtml(title)} · 详细计算过程</div><div class="calculation-list">${list}</div></div>`;
}

function downloadBatchTemplate() {
  const originNames = state.origins.map((origin) => origin.supplierShortName || origin.name).filter(Boolean);
  if (!originNames.length) {
    toast("发货地选项为空，请先在维度表库上传并应用发货地址。");
  }
  const templateRows = [
    ["订单号", "原始单号", "店铺", "仓库", "客服备注", "顾客地址", "货品简称", "是否上楼", "楼梯类型", "购买件数", "发货地"],
    ["", "", "", "", "", "", "示例货品A", "无需上楼", "", 1, ""],
    ["", "", "", "", "", "", "示例货品B", "需上楼", "电梯", 2, ""]
  ];
  const workbookBytes = createBatchTemplateWorkbook(templateRows, originNames);
  downloadBinaryFile("物流地址查询导入模板.xlsx", workbookBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function createBatchTemplateWorkbook(rows, originNames) {
  const optionNames = originNames.length ? originNames : [""];
  const files = {
    "[Content_Types].xml": buildContentTypesXml(),
    "_rels/.rels": buildRootRelsXml(),
    "xl/workbook.xml": buildWorkbookXml(),
    "xl/_rels/workbook.xml.rels": buildWorkbookRelsXml(),
    "xl/styles.xml": buildStylesXml(),
    "xl/worksheets/sheet1.xml": buildTemplateSheetXml(rows, optionNames.length),
    "xl/worksheets/sheet2.xml": buildOriginOptionsSheetXml(optionNames)
  };
  return createZip(files);
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function buildWorkbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="地址查询导入模板" sheetId="1" r:id="rId1"/>
    <sheet name="发货地选项" sheetId="2" state="hidden" r:id="rId2"/>
  </sheets>
</workbook>`;
}

function buildWorkbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildTemplateSheetXml(rows, optionCount) {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => buildCellXml(rowIndex + 1, colIndex + 1, value, rowIndex === 0 ? 1 : 0)).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:K501"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="1" width="9" customWidth="1"/><col min="6" max="6" width="9" customWidth="1"/><col min="7" max="7" width="18" customWidth="1"/><col min="8" max="8" width="14" customWidth="1"/><col min="10" max="10" width="12" customWidth="1"/><col min="11" max="11" width="22" customWidth="1"/></cols>
  <sheetData>${sheetRows}</sheetData>
  <dataValidations count="3">
    <dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="H2:H501">
      <formula1>"需上楼,无需上楼"</formula1>
    </dataValidation>
    <dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="I2:I501">
      <formula1>"电梯,步行梯"</formula1>
    </dataValidation>
    <dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="K2:K501">
      <formula1>发货地选项!$A$1:$A$${optionCount}</formula1>
    </dataValidation>
  </dataValidations>
</worksheet>`;
}

function buildOriginOptionsSheetXml(originNames) {
  const rows = originNames.map((name, index) => `<row r="${index + 1}">${buildCellXml(index + 1, 1, name)}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:A${originNames.length}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <sheetData>${rows}</sheetData>
</worksheet>`;
}

function buildCellXml(rowIndex, colIndex, value, styleIndex = 0) {
  const ref = `${columnName(colIndex)}${rowIndex}`;
  const style = styleIndex ? ` s="${styleIndex}"` : "";
  if (typeof value === "number") return `<c r="${ref}"${style}><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEscape(value)}</t></is></c>`;
}

function columnName(index) {
  let name = "";
  while (index > 0) {
    const mod = (index - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content.replace(/\r?\n/g, ""));
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centralParts.length, true);
  endView.setUint16(10, centralParts.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  return concatUint8Arrays([...localParts, ...centralParts, end]);
}

function crc32(bytes) {
  const table = crc32.table || (crc32.table = buildCrc32Table());
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}

function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function downloadBinaryFile(fileName, bytes, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function xmlEscape(value) {
  return String(value ?? "").replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  }[char]));
}

function exportResults() {
  const resultColumns = getResultExportColumns();
  const hasBatchSource = state.results.some((row) => row.importSource?.headers?.length);
  const worksheet = hasBatchSource
    ? buildBatchResultWorksheet(resultColumns)
    : XLSX.utils.json_to_sheet(state.results.map((row) => buildResultExportRow(row, resultColumns)));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "物流查询结果");
  XLSX.writeFile(workbook, `物流查询结果_${formatDateForFileName(new Date())}.xlsx`);
}

function getResultExportColumns() {
  return [
    ["销售产品线", (row) => row.salesProductLine],
    ["销售系列", (row) => row.salesSeries],
    ["销售型号", (row) => row.model],
    ["物料编码（主）", (row) => row.materialCode],
    ["商品名称", (row) => row.productName],
    ["购买数量", (row) => row.purchaseQty],
    ["单件包裹数", (row) => row.packageCount],
    ["总实际重量", (row) => row.totalActualWeight],
    ["总推荐物流计费重量", (row) => row.totalChargeWeight],
    ["发货地", (row) => row.origin],
    ["是否上楼", (row) => row.elevatorService],
    ["楼梯类型", (row) => row.floorType],
    ["基础费用", (row) => row.baseCost],
    ["上楼状态", (row) => row.floorStatus],
    ["上楼费用", (row) => row.floorFeeDisplay],
    ["推荐物流", (row) => row.carrier],
    ["预估费用", (row) => row.cost],
    ["备选物流", (row) => row.backupCarriers],
    ["备选物流费用", (row) => row.backupCosts],
    ["详细计算过程", (row) => formatCalculationDetailsForExport(row)]
  ];
}

function buildResultExportRow(row, resultColumns) {
  return resultColumns.reduce((output, [label, getter]) => {
    output[label] = getter(row);
    return output;
  }, {});
}

function buildBatchResultWorksheet(resultColumns) {
  const importHeaders = getBatchImportHeadersForExport();
  const resultHeaders = resultColumns.map(([label]) => `查询结果-${label}`);
  const data = state.results.map((row) => [
    ...importHeaders.map((header) => row.importSource?.row?.[header] ?? ""),
    ...resultColumns.map(([, getter]) => getter(row))
  ]);
  return XLSX.utils.aoa_to_sheet([[...importHeaders, ...resultHeaders], ...data]);
}

function getBatchImportHeadersForExport() {
  const headers = [];
  for (const header of state.batchImportHeaders || []) {
    if (header && !headers.includes(header)) headers.push(header);
  }
  for (const row of state.results) {
    for (const header of row.importSource?.headers || []) {
      if (header && !headers.includes(header)) headers.push(header);
    }
  }
  return headers;
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

function normalizeSearchToken(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function getSearchInitials(value) {
  return String(value || "")
    .normalize("NFKC")
    .split("")
    .map((char) => {
      if (/[a-zA-Z0-9]/.test(char)) return char.toLowerCase();
      if (/[\u4e00-\u9fa5]/.test(char)) return getChineseInitial(char).toLowerCase();
      return "";
    })
    .join("");
}

function getChineseInitial(char) {
  for (let index = pinyinInitialBoundaries.length - 1; index >= 0; index -= 1) {
    const [letter, boundary] = pinyinInitialBoundaries[index];
    if (pinyinCollator.compare(char, boundary) >= 0) return letter;
  }
  return "";
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

function normalizeProductKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[‐‑‒–—―－_]/g, "-")
    .replace(/-/g, "")
    .toLowerCase();
}

function sameProductKey(a, b) {
  return normalizeProductKey(a) === normalizeProductKey(b);
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

function formatNumber(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "";
  return String(Math.round(num * 100) / 100);
}

function formatMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "";
  return (Math.round(num * 100) / 100).toFixed(2).replace(/\.00$/, "");
}

function formatPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "100%";
  return `${formatNumber(num * 100)}%`;
}

function formatCalculationDetailsForExport(row) {
  if (!row.calculationDetails?.length) return row.message || "";
  return row.calculationDetails.map((detail) => {
    const lines = [
      `${detail.role}：${detail.carrier}`,
      `报价Sheet：${detail.sheetName || "-"}`,
      `匹配区域：${detail.matchedRegion || "-"}`,
      `计费重量：${detail.formula}`,
      `子包裹判断重量：${formatFloorPackageWeightDetails(detail.floorPackageWeights)}`,
      ...(detail.costLines || []).map((line) => `${line.label}：${line.formula} = ${formatMoney(line.amount)}元`),
      `基础费用：${formatMoney(detail.baseCost)}元`,
      `上楼状态：${detail.floorStatus || "-"}`,
      ...(detail.floorLines || []).map((line) => `${line.label}：${line.formula}${Number.isFinite(Number(line.amount)) ? ` = ${formatMoney(line.amount)}元` : ""}`),
      `上楼费用：${detail.floorFeeDisplay || formatMoney(detail.floorFee || 0)}`,
      `总费用：${formatMoney(detail.cost)}元`
    ];
    return lines.join("；");
  }).join("\n");
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
