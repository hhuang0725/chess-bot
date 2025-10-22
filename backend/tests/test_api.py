import json
import re

import pytest

import os
import sys
from pathlib import Path

# Ensure backend package is importable whether run from repo root or backend dir
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from server import app


@pytest.fixture()
def client():
    app.testing = True
    with app.test_client() as c:
        yield c


def test_health_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data == {"ok": True}


def test_move_from_start_returns_uci_and_fen(client):
    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    resp = client.post(
        "/api/move",
        data=json.dumps({"fen": start_fen}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert "uci" in data and data["uci"]
    assert "san" in data and data["san"]
    assert "fen" in data and data["fen"]
    # FEN should now be side to move = black
    assert data["fen"].split()[1] == "b"


def test_move_handles_illegal_or_finished_position_gracefully(client):
    # Build a known checkmated position (Fool's mate): 1.f3 e5 2.g4 Qh4#
    import chess
    board = chess.Board()
    board.push_san("f3")
    board.push_san("e5")
    board.push_san("g4")
    board.push_san("Qh4#")
    finished_fen = board.fen()
    resp = client.post(
        "/api/move",
        data=json.dumps({"fen": finished_fen}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data.get("uci") is None
    assert data.get("game_over") is True
    assert data.get("result") in {"0-1", "1-0", "1/2-1/2"}
