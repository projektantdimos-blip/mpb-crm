"""Локальный стенд для проверки v2: раздаёт папку v2 и подмешивает демо-API (dev/mock.js)
в каждую HTML-страницу. Только для разработки — в продакшен не загружается."""
import http.server, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
INJECT = b'<script src="/dev/mock.js"></script>'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8778


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        path = self.translate_path(self.path.split('?')[0])
        if path.endswith('.html') and os.path.isfile(path):
            data = open(path, 'rb').read()
            i = data.lower().find(b'<head>')
            if i >= 0:
                data = data[:i + 6] + INJECT + data[i + 6:]
            else:
                data = INJECT + data
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
