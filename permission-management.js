const auth = window.LogisticsAuth;
const currentUser = auth?.requirePage("permissionManagement");

const els = {
  refreshUsersBtn: document.getElementById("refreshUsersBtn"),
  permissionSummary: document.getElementById("permissionSummary"),
  newUserName: document.getElementById("newUserName"),
  newUserPassword: document.getElementById("newUserPassword"),
  createUserBtn: document.getElementById("createUserBtn"),
  permissionUserBody: document.getElementById("permissionUserBody")
};

if (currentUser) {
  bindEvents();
  renderUsers();
}

function bindEvents() {
  els.refreshUsersBtn?.addEventListener("click", renderUsers);
  els.createUserBtn?.addEventListener("click", createUser);
  els.permissionUserBody?.addEventListener("change", handlePermissionChange);
  els.permissionUserBody?.addEventListener("click", handleTableAction);
}

async function renderUsers() {
  const users = await auth.getUsersAsync();
  els.permissionSummary.textContent = `注册用户 ${users.length} 个`;
  els.permissionUserBody.innerHTML = users.map(renderUserRow).join("");
}

function renderUserRow(user) {
  const isPrimaryAdmin = user.name === auth.DEFAULT_ADMIN.name;
  const access = new Set(auth.normalizePageAccess(user.pageAccess));
  const status = user.role === auth.ROLE_ADMIN
    ? "管理员"
    : (access.size ? "已授权" : "待授权");
  return `
    <tr data-user-id="${escapeHtml(user.id)}">
      <td>
        <strong>${escapeHtml(user.name)}</strong>
        ${isPrimaryAdmin ? "<small>内置管理员</small>" : ""}
      </td>
      <td>${escapeHtml(user.role)}</td>
      <td><span class="permission-status ${access.size || user.role === auth.ROLE_ADMIN ? "active" : "pending"}">${escapeHtml(status)}</span></td>
      <td>
        <div class="permission-checkbox-grid">
          ${auth.PAGE_OPTIONS.map((page) => renderPageCheckbox(page, access, isPrimaryAdmin)).join("")}
        </div>
      </td>
      <td>
        <div class="permission-actions">
          <button type="button" data-action="save" ${isPrimaryAdmin ? "disabled" : ""}>保存授权</button>
          <button type="button" class="secondary" data-action="reset" ${isPrimaryAdmin ? "disabled" : ""}>重置密码</button>
          <button type="button" class="danger" data-action="delete" ${isPrimaryAdmin ? "disabled" : ""}>删除账号</button>
        </div>
      </td>
    </tr>
  `;
}

function renderPageCheckbox(page, access, isPrimaryAdmin) {
  const checked = isPrimaryAdmin || access.has(page.key);
  const disabled = isPrimaryAdmin || page.key === "permissionManagement";
  return `
    <label class="permission-checkbox">
      <input type="checkbox" value="${escapeHtml(page.key)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
      <span>${escapeHtml(page.label)}</span>
    </label>
  `;
}

function handlePermissionChange(event) {
  const row = event.target.closest("tr[data-user-id]");
  if (!row) return;
  row.classList.add("is-dirty");
}

async function handleTableAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest("tr[data-user-id]");
  const userId = row?.dataset.userId;
  if (!userId) return;
  const users = await auth.getUsersAsync();
  const user = users.find((item) => item.id === userId);
  if (!user) {
    toast("用户不存在，请刷新后重试");
    return;
  }
  const action = button.dataset.action;
  if (action === "save") saveUserAccess(row, user);
  if (action === "reset") resetUserPassword(user);
  if (action === "delete") deleteUser(user);
}

async function saveUserAccess(row, user) {
  const selected = Array.from(row.querySelectorAll("input[type='checkbox']:checked")).map((input) => input.value);
  if (await auth.updateUserAccessAsync(user.id, selected)) {
    toast("已保存授权");
    renderUsers();
  } else {
    toast("保存失败");
  }
}

async function resetUserPassword(user) {
  const password = window.prompt(`请输入 ${user.name} 的新密码（至少 4 位）`);
  if (password === null) return;
  const result = await auth.resetPasswordAsync(user.id, password);
  if (!result.ok) {
    toast(result.message || "重置失败");
    return;
  }
  toast("已重置密码");
}

async function deleteUser(user) {
  if (!window.confirm(`确认删除账号：${user.name}？`)) return;
  if (await auth.deleteUserAsync(user.id)) {
    toast("已删除账号");
    renderUsers();
  } else {
    toast("删除失败");
  }
}

async function createUser() {
  const result = await auth.createUserAsync(els.newUserName.value, els.newUserPassword.value);
  if (!result.ok) {
    toast(result.message || "创建失败");
    return;
  }
  els.newUserName.value = "";
  els.newUserPassword.value = "";
  toast("已创建用户，请在下方授权");
  renderUsers();
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2400);
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
