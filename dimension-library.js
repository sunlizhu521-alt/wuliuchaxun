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
  },
  {
    id: "dim-reserved",
    name: "备用维度",
    description: "备用槽位，后续按业务规则扩展，当前不参与查询计算。",
    template: ""
  }
];

const grid = document.getElementById("slotGrid");
const applyAllButton = document.getElementById("applyAll");
let records = new Map();

init();

async function init() {
  await window.LogisticsSharedLibrary?.importSharedLibrary?.();
  records = await loadRecords();
  render();
  applyAllButton.addEventListener("click", applyAllSlots);
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
  const templateButton = slot.template
    ? `<button class="button" data-template="${slot.template}">下载模板</button>`
    : "";

  return `
    <article class="slot-card">
      <div class="slot-title">
        <h2>${escapeHtml(slot.name)}</h2>
        <span class="badge ${status.className}">${status.label}</span>
      </div>
      <p>${escapeHtml(slot.description)}</p>
      <div class="slot-drop" data-drop="${slot.id}">
        <span>拖拽 Excel/CSV 到此槽位，或点击替换文件</span>
        <input type="file" accept=".xlsx,.xls,.csv" data-file="${slot.id}" hidden>
      </div>
      <div class="slot-meta">
        <span>文件：${escapeHtml(fileName)}</span>
        <span>工作表：${escapeHtml(sheetNames)}</span>
        <span>更新时间：${savedAt}</span>
      </div>
      <div class="slot-actions">
        <label class="button">
          替换文件
          <input type="file" accept=".xlsx,.xls,.csv" data-file="${slot.id}" hidden>
        </label>
        <button class="button primary" data-apply="${slot.id}" ${record?.pendingFile || record?.fileBuffer ? "" : "disabled"}>应用刷新</button>
        <button class="button" data-delete="${slot.id}" ${record ? "" : "disabled"}>删除</button>
        ${templateButton}
      </div>
    </article>
  `;
}

function getStatus(record) {
  if (!record) return { label: "缺失", className: "missing" };
  if (record.pendingFile) return { label: "待应用", className: "pending" };
  if (record.applied) return { label: "已应用", className: "applied" };
  return { label: "待应用", className: "pending" };
}

function bindDropZone(drop, slotId) {
  const input = drop.querySelector("input");
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("dragging");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("dragging");
    const file = event.dataTransfer.files?.[0];
    if (file) savePendingFile(slotId, file);
  });
}

async function savePendingFile(slotId, file) {
  try {
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
      fileBuffer: buffer,
      sheetNames: workbook.SheetNames,
      savedAt: new Date().toISOString(),
      sharedSavedAt: ""
    };
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
  if (!record?.fileBuffer) return;
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
  const targets = [...records.values()].filter((record) => record.pendingFile || record.fileBuffer);
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

function inferFileType(name) {
  if (/\.csv$/i.test(name)) return "text/csv";
  if (/\.xlsx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/vnd.ms-excel";
}

function formatDate(value) {
  if (!value) return "无";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
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
