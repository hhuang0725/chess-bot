from __future__ import annotations

import os
import random
import logging
from typing import Any, Dict

from flask import Flask, jsonify, request

# Initialize app and logging before any usage
app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

try:
    import chess
except Exception:  # pragma: no cover
    chess = None

# Optional: Inception model-based engine
ENGINE = None
try:  # pragma: no cover
    import torch  # noqa: F401
    from model.inception_net import InceptionNet
    from model.mcts import MCTS

    torch.set_default_device("cuda" if torch.cuda.is_available() else "cpu")

    def _load_engine():
        model = InceptionNet(14, 180, 180, 5)
        # Choose device and place model consistently
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        # Load weights onto the same device
        import os
        weight_path = os.path.join(os.path.dirname(__file__), 'model', 'inception_net_pretrained.pt')
        state = torch.load(weight_path, map_location=device)
        model.load_state_dict(state)
        model.to(device)
        model.eval()
        return MCTS(model)

    ENGINE = _load_engine()
    app.logger.info("Inception engine loaded.")
except Exception as e:  # pragma: no cover
    ENGINE = None
    app.logger.warning("Falling back to random move engine: %s", e)


@app.after_request
def add_cors(resp):
    origin = request.headers.get("Origin") or "*"
    resp.headers["Access-Control-Allow-Origin"] = origin
    resp.headers["Vary"] = "Origin"
    resp.headers["Access-Control-Allow-Headers"] = request.headers.get(
        "Access-Control-Request-Headers", "Content-Type"
    )
    resp.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
    return resp


@app.route("/api/health", methods=["GET", "OPTIONS"])
def health():
    if request.method == "OPTIONS":
        return ("", 204)
    return jsonify({"ok": True})


@app.route("/api/move", methods=["POST", "OPTIONS"])
def api_move():
    if request.method == "OPTIONS":
        return ("", 204)

    if chess is None:
        return jsonify({"error": "python-chess not installed on server"}), 500

    payload: Dict[str, Any] = request.get_json(silent=True) or {}
    fen = payload.get("fen")
    if not fen:
        return jsonify({"error": "missing fen"}), 400

    app.logger.info("/api/move from %s", request.remote_addr)

    try:
        board = chess.Board(fen)
    except Exception as e:
        return jsonify({"error": f"invalid fen: {e}"}), 400

    legal = list(board.legal_moves)
    if not legal:
        # No legal moves; return game over info
        outcome = board.outcome()
        result = outcome.result() if outcome else board.result(claim_draw=True)
        reason = outcome.termination.name if outcome else "game_over"
        return jsonify({
            "uci": None,
            "san": None,
            "fen": board.fen(),
            "game_over": True,
            "result": result,
            "reason": reason,
        })

    if ENGINE is not None:
        try:
            # Use a modest number of searches for responsiveness
            move = ENGINE.search(board.copy(), searches=75)
        except Exception as e:
            app.logger.warning("Engine search failed, falling back to random: %s", e)
            move = random.choice(legal)
    else:
        move = random.choice(legal)
    san = board.san(move)
    uci = move.uci()
    board.push(move)
    new_fen = board.fen()

    # Post-move status
    outcome = board.outcome()
    status = {
        "game_over": board.is_game_over(claim_draw=True),
        "in_check": board.is_check(),
        "result": outcome.result() if outcome else None,
        "reason": outcome.termination.name if outcome else None,
    }

    return jsonify({
        "uci": uci,
        "san": san,
        "fen": new_fen,
        **status,
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
