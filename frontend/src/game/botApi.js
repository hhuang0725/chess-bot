// ---- Bot API — communicates with the Lambda chess engine ----

const API_URL = import.meta.env.VITE_BOT_API_URL || 'http://localhost:9000/2015-03-31/functions/function/invocations';

const FILES_STR = 'abcdefgh';
const RANKS_STR = '87654321';

/**
 * Converts the frontend game state to a FEN string for the backend.
 *
 * Frontend state has:
 *   board: 8x8 array (uppercase = white, lowercase = black)
 *   turn: 'w' | 'b'
 *   castling: { K, Q, k, q }
 *   enPassant: [row, col] | null
 *   halfmove: number
 *   fullmove: number
 */
export function gameStateToFen(state) {
  // 1. Piece placement
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const piece = state.board[r][c];
      if (piece) {
        if (empty > 0) { row += empty; empty = 0; }
        row += piece;
      } else {
        empty++;
      }
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }
  const placement = rows.join('/');

  // 2. Active color
  const color = state.turn;

  // 3. Castling
  let castling = '';
  if (state.castling.K) castling += 'K';
  if (state.castling.Q) castling += 'Q';
  if (state.castling.k) castling += 'k';
  if (state.castling.q) castling += 'q';
  if (!castling) castling = '-';

  // 4. En passant
  let ep = '-';
  if (state.enPassant) {
    const [epRow, epCol] = state.enPassant;
    ep = FILES_STR[epCol] + RANKS_STR[epRow];
  }

  // 5. Halfmove clock and fullmove number
  const halfmove = state.halfmove || 0;
  const fullmove = state.fullmove || 1;

  return `${placement} ${color} ${castling} ${ep} ${halfmove} ${fullmove}`;
}

/**
 * Converts a UCI move string (e.g. "e2e4", "a7a8q") to board coordinates.
 * Returns { fromRow, fromCol, toRow, toCol, promotion }
 */
export function uciToCoords(uci) {
  const fromCol = FILES_STR.indexOf(uci[0]);
  const fromRow = RANKS_STR.indexOf(uci[1]);
  const toCol = FILES_STR.indexOf(uci[2]);
  const toRow = RANKS_STR.indexOf(uci[3]);
  const promotion = uci.length > 4 ? uci[4] : null;
  return { fromRow, fromCol, toRow, toCol, promotion };
}

/**
 * Calls the bot API to get the best move for the given game state.
 * Returns { fromRow, fromCol, toRow, toCol, promotion } or throws on error.
 */
export async function getBotMove(gameState, searches = 100) {
  const fen = gameStateToFen(gameState);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen, searches }),
  });

  const data = await response.json();

  // Lambda wraps the body as a string for API Gateway responses
  const body = typeof data.body === 'string' ? JSON.parse(data.body) : data;

  if (body.error) {
    throw new Error(body.error);
  }

  return uciToCoords(body.move);
}
