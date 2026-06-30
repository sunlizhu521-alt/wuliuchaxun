(function () {
  const USERS_KEY = "logistics-query-auth-users";
  const CURRENT_USER_KEY = "logistics-query-current-user";
  const ROLE_ADMIN = "管理员";
  const ROLE_USER = "普通用户";
  const DEFAULT_ADMIN = {
    id: "u-admin",
    name: "孙立柱",
    password: "521sunlizhu",
    role: ROLE_ADMIN,
    pageAccess: ["query", "dimensionLibrary", "permissionManagement"]
  };
  const PAGE_OPTIONS = [
    { key: "query", label: "物流查询", href: "index.html" },
    { key: "dimensionLibrary", label: "维度表库", href: "dimension-library.html" },
    { key: "permissionManagement", label: "权限管理", href: "permission-management.html" }
  ];

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `u-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalize(value) {
    return String(value || "").trim();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeUser(user) {
    const isAdmin = user.name === DEFAULT_ADMIN.name || user.role === ROLE_ADMIN;
    return {
      id: user.id || createId(),
      name: normalize(user.name),
      password: String(user.password || ""),
      role: isAdmin ? ROLE_ADMIN : ROLE_USER,
      pageAccess: isAdmin ? PAGE_OPTIONS.map((page) => page.key) : normalizePageAccess(user.pageAccess)
    };
  }

  function normalizePageAccess(pageAccess) {
    const allowed = new Set(PAGE_OPTIONS.map((page) => page.key));
    return [...new Set((Array.isArray(pageAccess) ? pageAccess : []).filter((page) => allowed.has(page)))];
  }

  function ensureUsers() {
    const rawUsers = readJson(USERS_KEY, []);
    const byName = new Map();
    [DEFAULT_ADMIN, ...rawUsers].forEach((user) => {
      const normalized = normalizeUser(user);
      if (normalized.name) byName.set(normalized.name, normalized);
    });
    if (!byName.has(DEFAULT_ADMIN.name)) byName.set(DEFAULT_ADMIN.name, clone(DEFAULT_ADMIN));
    const users = Array.from(byName.values()).map((user) => (
      user.name === DEFAULT_ADMIN.name ? normalizeUser({ ...DEFAULT_ADMIN, ...user, role: ROLE_ADMIN }) : normalizeUser(user)
    ));
    writeJson(USERS_KEY, users);
    return users;
  }

  function getUsers() {
    return ensureUsers();
  }

  function saveUsers(users) {
    const normalized = [DEFAULT_ADMIN, ...(Array.isArray(users) ? users : [])]
      .map(normalizeUser)
      .reduce((map, user) => map.set(user.name, user), new Map());
    writeJson(USERS_KEY, Array.from(normalized.values()));
  }

  function getCurrentUser() {
    const saved = readJson(CURRENT_USER_KEY, null);
    if (!saved?.id && !saved?.name) return null;
    const users = getUsers();
    return users.find((user) => user.id === saved.id || user.name === saved.name) || null;
  }

  function setCurrentUser(user) {
    writeJson(CURRENT_USER_KEY, { id: user.id, name: user.name });
  }

  function clearCurrentUser() {
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  function canAccessPage(user, pageKey) {
    if (!user) return false;
    if (user.name === DEFAULT_ADMIN.name || user.role === ROLE_ADMIN) return true;
    return normalizePageAccess(user.pageAccess).includes(pageKey);
  }

  function hasAnyPageAccess(user) {
    return PAGE_OPTIONS.some((page) => canAccessPage(user, page.key));
  }

  function login(name, password) {
    const user = getUsers().find((item) => item.name === normalize(name));
    if (!user || user.password !== String(password || "")) {
      return { ok: false, message: "姓名或密码不正确" };
    }
    setCurrentUser(user);
    return { ok: true, user };
  }

  function register(name, password) {
    const nextName = normalize(name);
    const nextPassword = String(password || "").trim();
    if (!nextName || !nextPassword) return { ok: false, message: "请输入姓名和密码" };
    if (nextPassword.length < 4) return { ok: false, message: "密码至少4位" };
    const users = getUsers();
    if (users.some((user) => user.name === nextName)) return { ok: false, message: "该姓名已存在" };
    users.push({
      id: createId(),
      name: nextName,
      password: nextPassword,
      role: ROLE_USER,
      pageAccess: []
    });
    saveUsers(users);
    return { ok: true, message: "注册成功，请联系管理员授权后登录" };
  }

  function createUser(name, password) {
    return register(name, password);
  }

  function updateUserAccess(userId, pageAccess) {
    const users = getUsers();
    const target = users.find((user) => user.id === userId);
    if (!target || target.name === DEFAULT_ADMIN.name) return false;
    target.pageAccess = normalizePageAccess(pageAccess);
    saveUsers(users);
    return true;
  }

  function resetPassword(userId, password) {
    const nextPassword = String(password || "").trim();
    if (nextPassword.length < 4) return { ok: false, message: "密码至少4位" };
    const users = getUsers();
    const target = users.find((user) => user.id === userId);
    if (!target || target.name === DEFAULT_ADMIN.name) return { ok: false, message: "内置管理员不能在此重置" };
    target.password = nextPassword;
    saveUsers(users);
    return { ok: true };
  }

  function deleteUser(userId) {
    const users = getUsers();
    const target = users.find((user) => user.id === userId);
    if (!target || target.name === DEFAULT_ADMIN.name) return false;
    saveUsers(users.filter((user) => user.id !== userId));
    const current = getCurrentUser();
    if (current?.id === userId) clearCurrentUser();
    return true;
  }

  function pageHref(page) {
    return `${page.href}?v=20260687`;
  }

  function renderNavigation(activeKey) {
    const nav = document.querySelector(".nav");
    const user = getCurrentUser();
    if (!nav || !user) return;
    nav.innerHTML = PAGE_OPTIONS
      .filter((page) => canAccessPage(user, page.key))
      .map((page) => `<a class="${page.key === activeKey ? "active" : ""}" href="${pageHref(page)}">${escapeHtml(page.label)}</a>`)
      .join("");
    applyLinkPermissions(user);
  }

  function applyLinkPermissions(user) {
    const linkRules = [
      ["dimension-library", "dimensionLibrary"],
      ["permission-management", "permissionManagement"],
      ["index.html", "query"]
    ];
    document.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href") || "";
      const matched = linkRules.find(([pattern]) => href.includes(pattern));
      if (!matched) return;
      const pageKey = matched[1];
      if (!canAccessPage(user, pageKey)) link.hidden = true;
    });
  }

  function renderSession(activeKey) {
    renderNavigation(activeKey);
    const sidebar = document.querySelector(".sidebar");
    const user = getCurrentUser();
    if (!sidebar || !user) return;
    let panel = sidebar.querySelector(".session-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "session-panel";
      sidebar.appendChild(panel);
    }
    panel.innerHTML = `
      <span>当前用户</span>
      <strong>${escapeHtml(user.name)}</strong>
      <small>${escapeHtml(user.role)}</small>
      <button type="button" data-auth-logout>退出登录</button>
    `;
    panel.querySelector("[data-auth-logout]")?.addEventListener("click", () => {
      clearCurrentUser();
      window.location.href = "index.html?v=20260687";
    });
  }

  function requirePage(pageKey) {
    const user = getCurrentUser();
    if (!user) {
      renderAuthScreen({ pageKey, mode: "login" });
      return null;
    }
    if (!hasAnyPageAccess(user)) {
      renderWaitingScreen(user);
      return null;
    }
    if (!canAccessPage(user, pageKey)) {
      renderDeniedScreen(user, pageKey);
      return null;
    }
    renderSession(pageKey);
    return user;
  }

  function renderAuthScreen({ pageKey, mode = "login", message = "" }) {
    document.body.className = "auth-page";
    document.body.innerHTML = `
      <main class="auth-shell">
        <form class="auth-panel" data-auth-form autocomplete="off">
          <div>
            <h1>物流查询系统</h1>
            <p>登录后进入系统；新用户可先注册，注册后需管理员孙立柱授权页面权限。</p>
          </div>
          <div class="auth-tabs">
            <button type="button" class="${mode === "login" ? "active" : ""}" data-auth-mode="login">登录</button>
            <button type="button" class="${mode === "register" ? "active" : ""}" data-auth-mode="register">新用户注册</button>
          </div>
          <label class="field">
            <span>姓名</span>
            <input name="authName" autocomplete="off" required>
          </label>
          <label class="field">
            <span>密码</span>
            <input name="authPassword" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required>
          </label>
          <p class="auth-message" data-auth-message>${escapeHtml(message)}</p>
          <button class="button primary" type="submit">${mode === "login" ? "登录" : "提交注册"}</button>
        </form>
      </main>
    `;
    const form = document.querySelector("[data-auth-form]");
    const messageNode = document.querySelector("[data-auth-message]");
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => renderAuthScreen({ pageKey, mode: button.dataset.authMode }));
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const name = formData.get("authName");
      const password = formData.get("authPassword");
      if (mode === "register") {
        const result = register(name, password);
        if (!result.ok) {
          messageNode.textContent = result.message;
          return;
        }
        renderAuthScreen({ pageKey, mode: "login", message: result.message });
        return;
      }
      const result = login(name, password);
      if (!result.ok) {
        messageNode.textContent = result.message;
        return;
      }
      if (!hasAnyPageAccess(result.user)) {
        renderWaitingScreen(result.user);
        return;
      }
      const targetPage = canAccessPage(result.user, pageKey)
        ? PAGE_OPTIONS.find((page) => page.key === pageKey)
        : PAGE_OPTIONS.find((page) => canAccessPage(result.user, page.key));
      window.location.href = pageHref(targetPage || PAGE_OPTIONS[0]);
    });
  }

  function renderWaitingScreen(user) {
    document.body.className = "auth-page";
    document.body.innerHTML = `
      <main class="auth-shell">
        <section class="auth-panel waiting-panel">
          <h1>等待授权</h1>
          <p>账号 ${escapeHtml(user.name)} 已注册，请联系管理员孙立柱在“权限管理”页面授权后再进入系统。</p>
          <button class="button primary" type="button" data-auth-logout>退出登录</button>
        </section>
      </main>
    `;
    document.querySelector("[data-auth-logout]")?.addEventListener("click", () => {
      clearCurrentUser();
      renderAuthScreen({ pageKey: "query" });
    });
  }

  function renderDeniedScreen(user, pageKey) {
    const available = PAGE_OPTIONS.find((page) => canAccessPage(user, page.key));
    document.body.className = "auth-page";
    document.body.innerHTML = `
      <main class="auth-shell">
        <section class="auth-panel waiting-panel">
          <h1>无权访问</h1>
          <p>账号 ${escapeHtml(user.name)} 暂无当前页面权限，请联系管理员调整授权。</p>
          <div class="auth-actions">
            ${available ? `<a class="button primary" href="${pageHref(available)}">进入${escapeHtml(available.label)}</a>` : ""}
            <button class="button" type="button" data-auth-logout>退出登录</button>
          </div>
        </section>
      </main>
    `;
    document.querySelector("[data-auth-logout]")?.addEventListener("click", () => {
      clearCurrentUser();
      renderAuthScreen({ pageKey });
    });
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

  window.LogisticsAuth = {
    PAGE_OPTIONS,
    ROLE_ADMIN,
    ROLE_USER,
    DEFAULT_ADMIN,
    getUsers,
    getCurrentUser,
    canAccessPage,
    requirePage,
    renderSession,
    login,
    register,
    createUser,
    updateUserAccess,
    resetPassword,
    deleteUser,
    logout: clearCurrentUser,
    normalizePageAccess
  };
})();
