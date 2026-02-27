import json
import logging
import os
import chess
import torch

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Import model components (copied into the Docker image)
from model.inception_net import InceptionNet
from model.mcts import MCTS

# ---- Global model loading (stays warm between Lambda invocations) ----

MODEL_PATH = os.environ.get("MODEL_PATH", "/var/task/model/inception_net_pretrained.pt")
DEFAULT_SEARCHES = int(os.environ.get("DEFAULT_SEARCHES", "100"))

# Initialize model once globally
device = torch.device("cpu")
model = InceptionNet(in_planes=14, filters=180, squeeze_channels=180, n_inc=5, drop_p=0.0)
model.load_state_dict(torch.load(MODEL_PATH, map_location=device, weights_only=True))
model.eval()

mcts = MCTS(model, C=2.0)


def lambda_handler(event, context):
  """
  Lambda handler for chess bot move generation.

  Expects JSON body:
    { "fen": "<FEN string>", "searches": <optional int> }

  Returns:
    { "move": "<UCI string, e.g. 'e2e4'>" }
  """

  try:
    # Parse request body
    body = event.get("body", "{}")
    if isinstance(body, str):
      body = json.loads(body)

    fen = body.get("fen")
    if not fen:
      return _error(400, "Missing 'fen' in request body")

    searches = body.get("searches", DEFAULT_SEARCHES)

    # Create board from FEN
    try:
      board = chess.Board(fen)
    except ValueError as e:
      return _error(400, f"Invalid FEN: {str(e)}")

    # Check if game is already over
    if board.is_game_over():
      return _error(400, "Game is already over")

    # Run MCTS search
    best_move = mcts.search(board, searches)

    if best_move is None:
      return _error(500, "MCTS failed to find a move")

    uci = best_move.uci()
    logger.info("move=%s fen=%s", uci, fen)

    return {
      "statusCode": 200,
      "headers": {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      "body": json.dumps({
        "move": uci,
      }),
    }

  except Exception as e:
    return _error(500, f"Internal error: {str(e)}")


def _error(status_code, message):
  return {
    "statusCode": status_code,
    "headers": {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    "body": json.dumps({"error": message}),
  }
