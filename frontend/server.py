from __future__ import annotations

import os
from flask import Flask, send_from_directory


BASE_DIR = os.path.dirname(__file__)
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

app = Flask(
    __name__,
    static_folder=PUBLIC_DIR,
    static_url_path="/",
)


@app.route("/")
def index():
    return send_from_directory(PUBLIC_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("FRONTEND_PORT", "5173"))
    app.run(host="0.0.0.0", port=port)

