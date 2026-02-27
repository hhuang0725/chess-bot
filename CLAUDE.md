# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chess Bot is a full-stack web application where players compete against a neural network AI. The stack:
- **Frontend**: React 19 + Vite (browser chess UI with drag-and-drop)
- **Backend**: AWS Lambda (Python, handles bot move requests)
- **Model**: PyTorch InceptionNet + MCTS (lives in `backend/model/`, deployed inside the Lambda container)

## Commands

### Frontend
```bash
cd frontend
npm install       # Install dependencies
npm run dev       # Dev server on localhost:3000 (auto-opens browser)
npm run build     # Production bundle
npm run preview   # Preview production build
```

### Backend / Docker
```bash
pip install -r backend/requirements.txt

# Build and run locally (Lambda Runtime Interface Emulator)
docker build -t chess-bot .
docker run -p 9000:8080 chess-bot

# Test locally (matches the default API_URL in botApi.js)
curl -X POST http://localhost:9000/2015-03-31/functions/function/invocations \
  -d '{"body": "{\"fen\": \"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1\"}"}'
```

No test runner is configured in this project.

### Environment Variables
- `VITE_BOT_API_URL` — override the Lambda endpoint for the frontend (defaults to `http://localhost:9000/2015-03-31/functions/function/invocations`)
- `MODEL_PATH` — path to the `.pt` weights inside the container (default: `/var/task/model/inception_net_pretrained.pt`)
- `DEFAULT_SEARCHES` — number of MCTS iterations per move (default: `100`)

## Architecture

### Data Flow
1. User makes a move in the browser → `chessLogic.js` validates legality
2. If it's the bot's turn, `botApi.js` encodes the board as a FEN string and POSTs to AWS Lambda
3. `backend/handler.py` loads `model/inception_net_pretrained.pt`, runs `mcts.py` (100 iterations by default), and returns the best move in UCI format
4. Frontend decodes UCI coordinates and updates the board

### Frontend (`frontend/src/`)
- **`App.jsx`** — top-level game orchestrator: holds all game state (board array, turn, castling rights, en passant square, captured pieces, move history), handles game mode selection, and triggers bot moves automatically
- **`components/Chessboard.jsx`** — drag-and-drop board UI; highlights legal move dots/rings; renders pawn promotion overlay
- **`game/chessLogic.js`** — self-contained pure JS chess rules engine (legal move generation, FEN encoding, checkmate/stalemate detection)
- **`game/botApi.js`** — converts game state → FEN, calls Lambda, converts UCI response → board coordinates

### Backend / Model (`backend/`)
- **`backend/handler.py`** — Lambda entry point; receives FEN, invokes MCTS, returns UCI move
- **`backend/model/inception_net.py`** — dual-head PyTorch network: policy head outputs 1968 move probabilities, value head outputs position evaluation (–1 to 1); uses multi-scale inception blocks with squeeze-excitation
- **`backend/model/utils.py`** — encodes board into a 14-channel tensor (6 own-piece channels, 6 opponent-piece channels, 2 legal-move channels); maps between UCI strings and the 1968-move action space
- **`backend/model/mcts.py`** + **`backend/model/node.py`** — UCB1-based Monte Carlo Tree Search using the network for policy and value estimation
- **`backend/model/inception_net_pretrained.pt`** — ~52 MB pre-trained weights bundled into the Docker image

## Git Workflow

### Branch structure
```
main        ← always deployable; matches what's live on AWS
dev         ← integration branch; test here before releasing
feature/*   ← short-lived feature branches
```

Flow: `feature/*` → `dev` → `main` → deploy.

### Commit message convention
```
feat(backend): add CloudWatch move logging
feat(frontend): add move history panel
fix(backend): increase Lambda timeout to 60s
deploy: v1.1.0 → chess-bot Lambda + S3
```

### Tagging deploys
Each AWS deployment gets a tag so any version can be redeployed:
```bash
git tag -a v1.1.0 -m "Add CloudWatch logging"
git push origin v1.1.0
```

To roll back: `git checkout v1.0.0 -- backend/handler.py` + redeploy.

### Git LFS
Model weights (`*.pt`) are tracked with Git LFS. Run `git lfs install` once after cloning before working with the repo.

### Key implementation details
- The frontend implements its own full chess rules in `chessLogic.js` (independent of any chess library); the backend uses `python-chess` for FEN parsing and move validation
- Board state in the frontend is a flat 64-element array plus separate castling/en-passant/turn fields — **not** a FEN-first design
- The neural network sees all 1968 candidate moves and the output is masked to only legal moves before MCTS selection
