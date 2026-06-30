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


def main():
    root = os.environ.get("APP_DIR", os.getcwd())
    port = int(os.environ.get("PORT", "4004"))
    os.chdir(root)
    server = ThreadingHTTPServer(("0.0.0.0", port), Utf8StaticHandler)
    print(f"Serving {root} on 0.0.0.0:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
