from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os


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
            "/wuliuchaxun/index": "/wuliuchaxun/index.html",
            "/wuliuchaxun/dimension-library": "/wuliuchaxun/dimension-library.html",
        }
        return super().translate_path(route_map.get(clean_path, path))


def main():
    root = os.environ.get("APP_DIR", os.getcwd())
    port = int(os.environ.get("PORT", "4004"))
    os.chdir(root)
    server = ThreadingHTTPServer(("0.0.0.0", port), Utf8StaticHandler)
    print(f"Serving {root} on 0.0.0.0:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
