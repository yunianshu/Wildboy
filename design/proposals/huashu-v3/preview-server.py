"""Local design previews. Always serve fresh files; never expose the repo root."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    directory=Path(__file__).resolve().parent/'design-demos'
    ThreadingHTTPServer(('127.0.0.1',15483),partial(PreviewHandler,directory=str(directory))).serve_forever()
