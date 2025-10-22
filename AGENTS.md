# Repository Guidelines

## Project Structure & Module Organization
- Code lives under `src/` (e.g., `src/chess_bot/`).
- Tests live in `tests/` mirroring package paths (e.g., `tests/chess_bot/`).
- Data/assets in `assets/` (fen/pgn samples, piece sprites).
- Utility scripts in `scripts/` (one-task helpers, tooling).

## Build, Test, and Development Commands
- Environment (PowerShell): `python -m venv .venv; . .venv/Scripts/Activate.ps1`
- Install deps: `pip install -U pip && pip install -r requirements.txt` (or `requirements-dev.txt` for tooling).
- Run tests: `pytest -q` (use `-k pattern` to filter).
- Lint/format: `ruff check .` and `black .`.
- Type checks: `mypy src`.
- Optional Make targets if a Makefile exists: `make init test lint type format`.

## Coding Style & Naming Conventions
- Python 3.10+ recommended.
- Follow PEP 8. Use `black` (88 cols) and `ruff` to enforce.
- Naming: packages/modules `snake_case`; classes `PascalCase`; functions/vars `snake_case`.
- Keep functions focused; prefer pure logic in `src/` and I/O in thin wrappers.

## Testing Guidelines
- Framework: `pytest` with plain asserts; fixtures in `tests/conftest.py`.
- Test naming: files `test_*.py`; functions `test_*`.
- Mirror module paths (e.g., `src/chess_bot/engine.py` → `tests/chess_bot/test_engine.py`).
- Aim for coverage of core engine, move generation, validation, and time controls.
- Run `pytest --maxfail=1 -q` locally before pushing.

## Commit & Pull Request Guidelines
- Commits: concise, imperative subject (≤ 72 chars). Example: `fix(engine): handle en passant edge case`.
- Reference issues in body (`Closes #123`). Group related changes; avoid drive-by edits.
- PRs: clear description, rationale, screenshots/logs for UX/CLI, and steps to reproduce/fix.
- Requirements: green CI, no new lint errors, tests added/updated for behavior changes.

## Security & Configuration Tips
- Do not commit secrets; use environment variables and `.env.example`.
- Validate PGN/FEN inputs; treat opponent/engine I/O as untrusted.
- Keep engine time/move limits configurable (e.g., `CHESSBOT_TIME_MS`).
