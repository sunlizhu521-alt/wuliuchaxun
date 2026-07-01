from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from urllib.parse import unquote
from uuid import uuid4


ROLE_ADMIN = "管理员"
ROLE_USER = "普通用户"
PAGE_KEYS = ["query", "dimensionLibrary", "permissionManagement"]
DEFAULT_ADMIN_USER = {
    "id": "u-admin",
    "name": "孙立柱",
    "password": "521sunlizhu",
    "role": ROLE_ADMIN,
    "pageAccess": PAGE_KEYS,
}


class Utf8StaticHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".csv": "text/csv; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
    }

    def translate_path(self, path):
        clean_path = path.split("?", 1)[0].split("#", 1)[0].rstrip("/")
        route_map = {
            "/index": "/index.html",
            "/dimension-library": "/dimension-library.html",
            "/permission-management": "/permission-management.html",
            "/wuliuchaxun/index": "/index.html",
            "/wuliuchaxun/index.html": "/index.html",
            "/wuliuchaxun/dimension-library": "/dimension-library.html",
            "/wuliuchaxun/dimension-library.html": "/dimension-library.html",
            "/wuliuchaxun/permission-management": "/permission-management.html",
            "/wuliuchaxun/permission-management.html": "/permission-management.html",
        }
        return super().translate_path(route_map.get(clean_path, path))

    def do_OPTIONS(self):
        if self.clean_request_path().startswith("/api/"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Auth-User-Id, X-Auth-User-Name")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
            self.end_headers()
            return
        super().do_OPTIONS()

    def do_GET(self):
        path = self.clean_request_path()
        if path == "/api/auth/me":
            user = self.current_user()
            if not user:
                self.send_json({"error": "未登录或账号不存在"}, 401)
                return
            self.send_json({"user": self.public_user(user)})
            return
        if path == "/api/auth/users":
            if not self.require_admin():
                return
            users = self.load_users()
            self.send_json({"users": [self.public_user(user) for user in users]})
            return
        if path.startswith("/api/"):
            self.send_json({"error": "接口不存在"}, 404)
            return
        super().do_GET()

    def do_POST(self):
        path = self.clean_request_path()
        if path == "/api/auth/login":
            payload = self.read_json_body()
            name = str(payload.get("name") or "").strip()
            password = str(payload.get("password") or "").strip()
            user = next((item for item in self.load_users() if item.get("name") == name), None)
            if not user or str(user.get("password") or "") != password:
                self.send_json({"error": "姓名或密码不正确"}, 401)
                return
            self.send_json({"user": self.public_user(user)})
            return
        if path == "/api/auth/register":
            payload = self.read_json_body()
            name = str(payload.get("name") or "").strip()
            password = str(payload.get("password") or "").strip()
            if not name or not password:
                self.send_json({"error": "请输入姓名和密码"}, 400)
                return
            if len(password) < 4:
                self.send_json({"error": "密码至少4位"}, 400)
                return
            users = self.load_users()
            if any(item.get("name") == name for item in users):
                self.send_json({"error": "该姓名已存在"}, 409)
                return
            users.append(self.normalize_user({
                "id": f"u-{uuid4().hex}",
                "name": name,
                "password": password,
                "role": ROLE_USER,
                "pageAccess": [],
            }))
            self.save_users(users)
            self.send_json({"message": "注册成功，请联系管理员授权后登录"})
            return
        if path == "/api/auth/users/sync-local":
            if not self.require_admin():
                return
            payload = self.read_json_body()
            incoming = payload.get("users") if isinstance(payload.get("users"), list) else []
            users = self.load_users()
            users_by_name = {item.get("name"): item for item in users if item.get("name")}
            for raw_user in incoming:
                user = self.normalize_user(raw_user)
                if not user.get("name") or user.get("name") == DEFAULT_ADMIN_USER["name"]:
                    continue
                existing = users_by_name.get(user["name"])
                if existing:
                    existing["pageAccess"] = self.normalize_page_access(user.get("pageAccess"))
                    if user.get("password"):
                        existing["password"] = user["password"]
                else:
                    users.append(user)
                    users_by_name[user["name"]] = user
            self.save_users(users)
            self.send_json({"users": [self.public_user(user) for user in self.load_users()]})
            return
        if path.startswith("/api/auth/users/") and path.endswith("/reset-password"):
            if not self.require_admin():
                return
            user_id = unquote(path[len("/api/auth/users/"):-len("/reset-password")])
            payload = self.read_json_body()
            password = str(payload.get("password") or "").strip()
            if len(password) < 4:
                self.send_json({"error": "密码至少4位"}, 400)
                return
            users = self.load_users()
            target = next((item for item in users if item.get("id") == user_id), None)
            if not target or target.get("name") == DEFAULT_ADMIN_USER["name"]:
                self.send_json({"error": "账号不存在或不能重置"}, 404)
                return
            target["password"] = password
            self.save_users(users)
            self.send_json({"ok": True})
            return
        if path.startswith("/api/"):
            self.send_json({"error": "接口不存在"}, 404)
            return
        self.send_json({"error": "接口不存在"}, 404)

    def do_PATCH(self):
        path = self.clean_request_path()
        if path.startswith("/api/auth/users/") and path.endswith("/access"):
            if not self.require_admin():
                return
            user_id = unquote(path[len("/api/auth/users/"):-len("/access")])
            payload = self.read_json_body()
            users = self.load_users()
            target = next((item for item in users if item.get("id") == user_id), None)
            if not target or target.get("name") == DEFAULT_ADMIN_USER["name"]:
                self.send_json({"error": "账号不存在或不能修改"}, 404)
                return
            target["pageAccess"] = self.normalize_page_access(payload.get("pageAccess"))
            self.save_users(users)
            self.send_json({"user": self.public_user(target)})
            return
        self.send_json({"error": "接口不存在"}, 404)

    def do_DELETE(self):
        path = self.clean_request_path()
        if path.startswith("/api/auth/users/"):
            if not self.require_admin():
                return
            user_id = unquote(path[len("/api/auth/users/"):])
            users = self.load_users()
            target = next((item for item in users if item.get("id") == user_id), None)
            if not target or target.get("name") == DEFAULT_ADMIN_USER["name"]:
                self.send_json({"error": "账号不存在或不能删除"}, 404)
                return
            self.save_users([item for item in users if item.get("id") != user_id])
            self.send_json({"ok": True})
            return
        self.send_json({"error": "接口不存在"}, 404)

    def clean_request_path(self):
        return self.path.split("?", 1)[0].split("#", 1)[0].rstrip("/") or "/"

    def auth_data_path(self):
        return os.path.join(os.environ.get("APP_DIR", os.getcwd()), "data", "auth-users.json")

    def load_users(self):
        path = self.auth_data_path()
        users = []
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    payload = json.load(handle)
                if isinstance(payload, dict):
                    users = payload.get("users", [])
                elif isinstance(payload, list):
                    users = payload
                else:
                    users = []
            except Exception as error:
                print(f"Failed to read auth users: {error}", flush=True)
                users = []
        by_name = {}
        for user in [DEFAULT_ADMIN_USER, *users]:
            normalized = self.normalize_user(user)
            if normalized.get("name"):
                by_name[normalized["name"]] = normalized
        by_name[DEFAULT_ADMIN_USER["name"]] = self.normalize_user({
            **DEFAULT_ADMIN_USER,
            **by_name.get(DEFAULT_ADMIN_USER["name"], {}),
            "role": ROLE_ADMIN,
            "pageAccess": PAGE_KEYS,
        })
        normalized_users = list(by_name.values())
        if not os.path.exists(path):
            self.save_users(normalized_users)
        return normalized_users

    def save_users(self, users):
        path = self.auth_data_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        normalized_users = [self.normalize_user(user) for user in users]
        tmp_path = f"{path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as handle:
            json.dump({"users": normalized_users}, handle, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)

    def normalize_user(self, user):
        name = str(user.get("name") or "").strip()
        is_admin = name == DEFAULT_ADMIN_USER["name"] or user.get("role") == ROLE_ADMIN
        return {
            "id": str(user.get("id") or f"u-{uuid4().hex}"),
            "name": name,
            "password": str(user.get("password") or ""),
            "role": ROLE_ADMIN if is_admin else ROLE_USER,
            "pageAccess": PAGE_KEYS if is_admin else self.normalize_page_access(user.get("pageAccess")),
        }

    def normalize_page_access(self, page_access):
        if not isinstance(page_access, list):
            return []
        return list(dict.fromkeys([page for page in page_access if page in PAGE_KEYS]))

    def public_user(self, user):
        return {
            "id": user.get("id"),
            "name": user.get("name"),
            "role": user.get("role"),
            "pageAccess": PAGE_KEYS if self.is_admin(user) else self.normalize_page_access(user.get("pageAccess")),
        }

    def current_user(self):
        user_id = self.headers.get("X-Auth-User-Id", "").strip()
        user_name = unquote(self.headers.get("X-Auth-User-Name", "").strip())
        if not user_id and not user_name:
            return None
        return next((user for user in self.load_users() if user.get("id") == user_id or user.get("name") == user_name), None)

    def is_admin(self, user):
        return bool(user and (user.get("name") == DEFAULT_ADMIN_USER["name"] or user.get("role") == ROLE_ADMIN))

    def require_admin(self):
        user = self.current_user()
        if not self.is_admin(user):
            self.send_json({"error": "无权限"}, 403)
            return None
        return user

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if not length:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main():
    root = os.environ.get("APP_DIR", os.getcwd())
    port = int(os.environ.get("PORT", "4004"))
    os.chdir(root)
    server = ThreadingHTTPServer(("0.0.0.0", port), Utf8StaticHandler)
    print(f"Serving {root} on 0.0.0.0:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
