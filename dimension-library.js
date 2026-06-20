const DB_NAME = "logistics-query-dimension-library";
const DB_VERSION = 1;
const STORE_NAME = "dimension-files";

const slots = [
  {
    id: "dim-origin-address",
    name: "发货地址",
    description: "发货地、报价区域、仓库地址、省市区、联系人等发货信息。",
    template: "origin"
  },
  {
    id: "dim-product-info",
    name: "商品信息表",
    description: "商品基础信息维护槽位，当前用于资料维护，费用计算仍以商品包装明细为准。",
    template: "product"
  },
  {
    id: "dim-product-package",
    name: "商品包装明细",
    description: "型号、商品名称、包裹1到包裹6的尺寸、重量和计费重量。",
    template: "package"
  },
  {
    id: "quote-sf-hebei",
    name: "顺丰-河北报价",
    description: "河北发货地使用的顺丰报价表。",
    template: "quote"
  },
  {
    id: "quote-jd-hebei",
    name: "京东-河北报价",
    description: "河北发货地使用的京东报价表。",
    template: "quote"
  },
  {
    id: "quote-sf-ningbo",
    name: "顺丰-宁波报价",
    description: "宁波发货地使用的顺丰报价表。",
    template: "quote"
  },
  {
    id: "quote-jd-ningbo",
    name: "京东-宁波报价",
    description: "宁波发货地使用的京东报价表。",
    template: "quote"
  },
  {
    id: "quote-zt-hebei",
    name: "中通-河北报价",
    description: "河北发货地使用的中通报价表。",
    template: "quote"
  }
];

const grid = document.getElementById("slotGrid");
const applyAllButton = document.getElementById("applyAll");
let records = new Map();

init();

async function init() {
  try {
    await window.LogisticsSharedLibrary?.importSharedLibrary?.();
    records = await loadRecords();
    render();
    applyAllButton.addEventListener("click", applyAllSlots);
  } catch (error) {
    console.error(error);
    toast(error.message || "维度表库初始化失败");
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

async function loadRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(new Map(request.result.map((item) => [item.slotId, item])));
    request.onerror = () => reject(request.error);
  });
}

async function saveRecord(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
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

function render() {
  grid.innerHTML = slots.map(renderSlot).join("");
  grid.querySelectorAll("[data-file]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) savePendingFile(input.dataset.file, file);
      event.target.value = "";
    });
  });
  grid.querySelectorAll("[data-choose]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`[data-file="${button.dataset.choose}"]`)?.click();
    });
  });
  grid.querySelectorAll("[data-apply]").forEach((button) => {
    button.addEventListener("click", () => applySlot(button.dataset.apply));
  });
  grid.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => removeSlot(button.dataset.delete));
  });
  grid.querySelectorAll("[data-template]").forEach((button) => {
    button.addEventListener("click", () => downloadSlotTemplate(button.dataset.template));
  });
  grid.querySelectorAll("[data-drop]").forEach((drop) => bindDropZone(drop, drop.dataset.drop));
}

function renderSlot(slot) {
  const record = records.get(slot.id);
  const status = getStatus(record);
  const fileName = record?.fileName || record?.pendingName || "未上传";
  const savedAt = formatDate(record?.appliedAt || record?.savedAt);
  const sheetNames = record?.sheetNames?.length ? record.sheetNames.join("、") : "待应用后识别";
  const size = formatFileSize(record?.fileSize || record?.size || 0);
  const templateButton = slot.template
    ? `<button class="button" type="button" data-template="${slot.template}">下载模板</button>`
    : "";

  return `
    <article class="library-card file-slot" data-drop="${slot.id}" data-slot-id="${slot.id}">
      <div class="slot-head">
        <span class="slot-kicker">DIMENSION SLOT</span>
        <span class="slot-state ${status.className}">${status.label}</span>
      </div>
      <h2>${escapeHtml(slot.name)}</h2>
      <p class="slot-description">${escapeHtml(slot.description)}</p>
      <h3>${escapeHtml(fileName)}</h3>
      <p class="file-kind">Excel / CSV · ${size}</p>
      <div class="slot-info">
        <span>工作表</span>
        <strong>${escapeHtml(sheetNames)}</strong>
      </div>
      <div class="slot-info">
        <span>更新时间</span>
        <strong>${savedAt}</strong>
      </div>
      <input class="slot-file-input" type="file" accept=".xlsx,.xlsm,.xls,.csv" data-file="${slot.id}">
      <div class="slot-actions card-actions">
        <button class="button" type="button" data-choose="${slot.id}">替换文件</button>
        <button class="button primary" type="button" data-apply="${slot.id}" ${record?.pendingFile || record?.fileData || record?.fileBuffer ? "" : "disabled"}>应用刷新</button>
        <button class="button" type="button" data-delete="${slot.id}" ${record ? "" : "disabled"}>删除</button>
        ${templateButton}
      </div>
    </article>
  `;
}

function getStatus(record) {
  if (!record) return { label: "缺失", className: "empty" };
  if (record.pendingFile) return { label: "待应用", className: "pending" };
  if (record.applied) return { label: "已应用", className: "applied" };
  return { label: "待应用", className: "pending" };
}

function bindDropZone(drop, slotId) {
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("is-drag-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-drag-over"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("is-drag-over");
    const file = event.dataTransfer.files?.[0];
    if (file) savePendingFile(slotId, file);
  });
}

async function savePendingFile(slotId, file) {
  try {
    if (!isAcceptedFile(file)) {
      toast("请上传 .xlsx、.xlsm、.xls 或 .csv 文件。");
      return;
    }
    const buffer = await file.arrayBuffer();
    const workbook = readWorkbook(file.name, buffer);
    const previous = records.get(slotId) || {};
    const record = {
      ...previous,
      slotId,
      pendingFile: true,
      pendingName: file.name,
      fileName: previous.fileName || file.name,
      fileSize: file.size,
      fileType: file.type || inferFileType(file.name),
      fileData: arrayBufferToBase64(buffer),
      sheetNames: workbook.SheetNames,
      savedAt: new Date().toISOString(),
      sharedSavedAt: ""
    };
    delete record.fileBuffer;
    records.set(slotId, record);
    await saveRecord(record);
    render();
    toast(`已上传 ${file.name}，请点击应用刷新。`);
  } catch (error) {
    console.error(error);
    toast(error.message || "上传失败");
  }
}

async function applySlot(slotId) {
  const record = records.get(slotId);
  if (!record?.fileData && !record?.fileBuffer) return;
  const applied = {
    ...record,
    pendingFile: false,
    fileName: record.pendingName || record.fileName,
    applied: true,
    appliedAt: new Date().toISOString()
  };
  delete applied.pendingName;
  records.set(slotId, applied);
  await saveRecord(applied);
  render();
  toast("应用刷新完成。");
}

async function applyAllSlots() {
  const targets = [...records.values()].filter((record) => record.pendingFile || record.fileData || record.fileBuffer);
  for (const record of targets) {
    await applySlot(record.slotId);
  }
  toast(`已应用 ${targets.length} 个槽位。`);
}

async function removeSlot(slotId) {
  await deleteRecord(slotId);
  records.delete(slotId);
  render();
  toast("已删除本地槽位文件。");
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
          型号: "A100",
          物料编码: "MAT-A100",
          销售系列: "示例系列",
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
    型号: "A100",
    物料编码: "MAT-A100",
    销售系列: "示例系列",
    商品名称: "示例商品",
    备注: ""
  };
  for (let i = 1; i <= 6; i += 1) {
    row[`包裹${i}长cm`] = i === 1 ? 60 : "";
    row[`包裹${i}宽cm`] = i === 1 ? 40 : "";
    row[`包裹${i}高cm`] = i === 1 ? 30 : "";
    row[`包裹${i}重量kg`] = i === 1 ? 12 : "";
    row[`包裹${i}计费重量kg`] = i === 1 ? 12 : "";
  }
  return row;
}

function readWorkbook(fileName, buffer) {
  if (!window.XLSX) throw new Error("XLSX 解析库未加载");
  if (/\.csv$/i.test(fileName)) {
    const text = new TextDecoder("utf-8").decode(buffer);
    return XLSX.read(text, { type: "string" });
  }
  return XLSX.read(buffer, { type: "array", cellDates: true });
}

function isAcceptedFile(file) {
  return /\.(xlsx|xlsm|xls|csv)$/i.test(file?.name || "");
}

function inferFileType(name) {
  if (/\.csv$/i.test(name)) return "text/csv";
  if (/\.xlsx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/vnd.ms-excel";
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

function formatDate(value) {
  if (!value) return "无";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
