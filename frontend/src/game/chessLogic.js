// ============================================================
// Chess Logic Module
// Pure JS — no React dependencies
// ============================================================

// ---- Constants ------------------------------------------------

const WHITE = 'w';
const BLACK = 'b';

function pieceColor(p) {
  if (!p) return null;
  return p === p.toUpperCase() ? WHITE : BLACK;
}

function pieceType(p) {
  return p ? p.toUpperCase() : null;
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

// ---- State Creation -------------------------------------------

export function createInitialState() {
  return {
    board: [
      ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
      ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
      ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
    ],
    turn: WHITE,
    // Characters present = right available. K=white kingside, Q=white queenside, k/q=black
    castling: { K: true, Q: true, k: true, q: true },
    enPassant: null, // [row, col] of the square *behind* the double-pushed pawn
    halfmove: 0,
    fullmove: 1,
  };
}

// Deep-clone state (boards are small, this is fine)
function cloneState(state) {
  return {
    board: state.board.map(row => [...row]),
    turn: state.turn,
    castling: { ...state.castling },
    enPassant: state.enPassant ? [...state.enPassant] : null,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
  };
}

// ---- Square Attacked ------------------------------------------

export function isSquareAttacked(state, row, col, byColor) {
  const { board } = state;

  // --- Knight attacks ---
  const knightOffsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const knightChar = byColor === WHITE ? 'N' : 'n';
  for (const [dr, dc] of knightOffsets) {
    const r = row + dr, c = col + dc;
    if (inBounds(r, c) && board[r][c] === knightChar) return true;
  }

  // --- King attacks ---
  const kingChar = byColor === WHITE ? 'K' : 'k';
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr, c = col + dc;
      if (inBounds(r, c) && board[r][c] === kingChar) return true;
    }
  }

  // --- Pawn attacks ---
  const pawnChar = byColor === WHITE ? 'P' : 'p';
  const pawnDir = byColor === WHITE ? 1 : -1; // pawns attack "upward" from their perspective
  for (const dc of [-1, 1]) {
    const r = row + pawnDir, c = col + dc;
    if (inBounds(r, c) && board[r][c] === pawnChar) return true;
  }

  // --- Sliding attacks (rook/queen on straights, bishop/queen on diagonals) ---
  const straightDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  const rookChar = byColor === WHITE ? 'R' : 'r';
  const bishopChar = byColor === WHITE ? 'B' : 'b';
  const queenChar = byColor === WHITE ? 'Q' : 'q';

  for (const [dr, dc] of straightDirs) {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p === rookChar || p === queenChar) return true;
        break; // blocked
      }
      r += dr; c += dc;
    }
  }

  for (const [dr, dc] of diagDirs) {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p === bishopChar || p === queenChar) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  return false;
}

// ---- Check Detection ------------------------------------------

function findKing(board, color) {
  const king = color === WHITE ? 'K' : 'k';
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c] === king) return [r, c];
  return null;
}

export function isInCheck(state, color) {
  const kingPos = findKing(state.board, color);
  if (!kingPos) return false;
  const enemy = color === WHITE ? BLACK : WHITE;
  return isSquareAttacked(state, kingPos[0], kingPos[1], enemy);
}

// ---- Make Move (returns new state) ----------------------------

export function makeMove(state, fromRow, fromCol, toRow, toCol, promotionPiece) {
  const ns = cloneState(state);
  const piece = ns.board[fromRow][fromCol];
  const captured = ns.board[toRow][toCol];
  const pt = pieceType(piece);
  const color = pieceColor(piece);

  // Move piece
  ns.board[toRow][toCol] = piece;
  ns.board[fromRow][fromCol] = null;

  // ---- En passant capture ----
  if (pt === 'P' && ns.enPassant && toRow === ns.enPassant[0] && toCol === ns.enPassant[1]) {
    // Remove the captured pawn
    const capturedPawnRow = color === WHITE ? toRow + 1 : toRow - 1;
    ns.board[capturedPawnRow][toCol] = null;
  }

  // ---- Update en passant square ----
  if (pt === 'P' && Math.abs(toRow - fromRow) === 2) {
    ns.enPassant = [(fromRow + toRow) / 2, fromCol];
  } else {
    ns.enPassant = null;
  }

  // ---- Pawn promotion ----
  if (pt === 'P' && (toRow === 0 || toRow === 7)) {
    const promo = promotionPiece || (color === WHITE ? 'Q' : 'q');
    ns.board[toRow][toCol] = promo;
  }

  // ---- Castling move (move rook) ----
  if (pt === 'K') {
    const dc = toCol - fromCol;
    if (Math.abs(dc) === 2) {
      // Kingside
      if (dc === 2) {
        ns.board[fromRow][5] = ns.board[fromRow][7];
        ns.board[fromRow][7] = null;
      }
      // Queenside
      if (dc === -2) {
        ns.board[fromRow][3] = ns.board[fromRow][0];
        ns.board[fromRow][0] = null;
      }
    }
    // King moved → remove all castling rights for this side
    if (color === WHITE) { ns.castling.K = false; ns.castling.Q = false; }
    else { ns.castling.k = false; ns.castling.q = false; }
  }

  // ---- Rook moved or captured → update castling ----
  if (pt === 'R') {
    if (color === WHITE) {
      if (fromRow === 7 && fromCol === 7) ns.castling.K = false;
      if (fromRow === 7 && fromCol === 0) ns.castling.Q = false;
    } else {
      if (fromRow === 0 && fromCol === 7) ns.castling.k = false;
      if (fromRow === 0 && fromCol === 0) ns.castling.q = false;
    }
  }
  // If a rook is captured on its home square
  if (toRow === 0 && toCol === 0) ns.castling.q = false;
  if (toRow === 0 && toCol === 7) ns.castling.k = false;
  if (toRow === 7 && toCol === 0) ns.castling.Q = false;
  if (toRow === 7 && toCol === 7) ns.castling.K = false;

  // ---- Half/full move counters ----
  if (pt === 'P' || captured) ns.halfmove = 0;
  else ns.halfmove++;
  if (color === BLACK) ns.fullmove++;

  // ---- Switch turn ----
  ns.turn = color === WHITE ? BLACK : WHITE;

  return ns;
}

// ---- Pseudo-Legal Move Generation -----------------------------

function addSlidingMoves(board, row, col, color, directions, moves) {
  for (const [dr, dc] of directions) {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
      const target = board[r][c];
      if (!target) {
        moves.push([r, c]);
      } else {
        if (pieceColor(target) !== color) moves.push([r, c]); // capture
        break;
      }
      r += dr; c += dc;
    }
  }
}

export function getPseudoLegalMoves(state, row, col) {
  const { board, castling, enPassant } = state;
  const piece = board[row][col];
  if (!piece) return [];

  const color = pieceColor(piece);
  const pt = pieceType(piece);
  const moves = [];

  const straightDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  switch (pt) {
    case 'P': {
      const dir = color === WHITE ? -1 : 1;
      const startRow = color === WHITE ? 6 : 1;

      // Single push
      const r1 = row + dir;
      if (inBounds(r1, col) && !board[r1][col]) {
        moves.push([r1, col]);
        // Double push
        const r2 = row + 2 * dir;
        if (row === startRow && !board[r2][col]) {
          moves.push([r2, col]);
        }
      }

      // Captures
      for (const dc of [-1, 1]) {
        const r = row + dir, c = col + dc;
        if (!inBounds(r, c)) continue;
        const target = board[r][c];
        if (target && pieceColor(target) !== color) {
          moves.push([r, c]);
        }
        // En passant
        if (enPassant && r === enPassant[0] && c === enPassant[1]) {
          moves.push([r, c]);
        }
      }
      break;
    }

    case 'N': {
      const offsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      for (const [dr, dc] of offsets) {
        const r = row + dr, c = col + dc;
        if (inBounds(r, c)) {
          const target = board[r][c];
          if (!target || pieceColor(target) !== color) moves.push([r, c]);
        }
      }
      break;
    }

    case 'B':
      addSlidingMoves(board, row, col, color, diagDirs, moves);
      break;

    case 'R':
      addSlidingMoves(board, row, col, color, straightDirs, moves);
      break;

    case 'Q':
      addSlidingMoves(board, row, col, color, [...straightDirs, ...diagDirs], moves);
      break;

    case 'K': {
      // Normal king moves
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const r = row + dr, c = col + dc;
          if (inBounds(r, c)) {
            const target = board[r][c];
            if (!target || pieceColor(target) !== color) moves.push([r, c]);
          }
        }
      }

      // Castling
      const enemy = color === WHITE ? BLACK : WHITE;
      const homeRow = color === WHITE ? 7 : 0;
      if (row === homeRow && col === 4) {
        // Don't castle out of check
        if (!isSquareAttacked(state, homeRow, 4, enemy)) {
          // Kingside
          const ksKey = color === WHITE ? 'K' : 'k';
          if (castling[ksKey] &&
            !board[homeRow][5] && !board[homeRow][6] &&
            !isSquareAttacked(state, homeRow, 5, enemy) &&
            !isSquareAttacked(state, homeRow, 6, enemy)) {
            moves.push([homeRow, 6]);
          }
          // Queenside
          const qsKey = color === WHITE ? 'Q' : 'q';
          if (castling[qsKey] &&
            !board[homeRow][3] && !board[homeRow][2] && !board[homeRow][1] &&
            !isSquareAttacked(state, homeRow, 3, enemy) &&
            !isSquareAttacked(state, homeRow, 2, enemy)) {
            moves.push([homeRow, 2]);
          }
        }
      }
      break;
    }

    default:
      break;
  }

  return moves;
}

// ---- Legal Move Generation ------------------------------------

export function getLegalMoves(state, row, col) {
  const piece = state.board[row][col];
  if (!piece) return [];

  const color = pieceColor(piece);
  const pseudoMoves = getPseudoLegalMoves(state, row, col);

  return pseudoMoves.filter(([toRow, toCol]) => {
    const newState = makeMove(state, row, col, toRow, toCol);
    return !isInCheck(newState, color);
  });
}

// ---- Move Notation (Algebraic) --------------------------------

const FILES_STR = 'abcdefgh';
const RANKS_STR = '87654321';

function squareName(row, col) {
  return FILES_STR[col] + RANKS_STR[row];
}

export function getMoveNotation(state, fromRow, fromCol, toRow, toCol, promotionPiece) {
  const piece = state.board[fromRow][fromCol];
  if (!piece) return '';

  const pt = pieceType(piece);
  const color = pieceColor(piece);
  const captured = state.board[toRow][toCol];
  const isEnPassant = pt === 'P' && state.enPassant &&
    toRow === state.enPassant[0] && toCol === state.enPassant[1];
  const isCapture = captured || isEnPassant;

  // Castling
  if (pt === 'K' && Math.abs(toCol - fromCol) === 2) {
    const notation = toCol > fromCol ? 'O-O' : 'O-O-O';
    const newState = makeMove(state, fromRow, fromCol, toRow, toCol);
    const enemy = color === WHITE ? BLACK : WHITE;
    if (isInCheck(newState, enemy)) return notation + '+';
    return notation;
  }

  let notation = '';

  // Piece letter (pawns omitted)
  if (pt !== 'P') {
    notation += pt;

    // Disambiguation: check if another piece of same type can reach the same square
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === fromRow && c === fromCol) continue;
        const other = state.board[r][c];
        if (!other || pieceType(other) !== pt || pieceColor(other) !== color) continue;
        const otherMoves = getLegalMoves(state, r, c);
        if (otherMoves.some(([mr, mc]) => mr === toRow && mc === toCol)) {
          if (c !== fromCol) notation += FILES_STR[fromCol];
          else if (r !== fromRow) notation += RANKS_STR[fromRow];
          else notation += squareName(fromRow, fromCol);
          break;
        }
      }
    }
  }

  // Pawn captures include the file
  if (pt === 'P' && isCapture) {
    notation += FILES_STR[fromCol];
  }

  if (isCapture) notation += 'x';
  notation += squareName(toRow, toCol);

  // Promotion
  if (pt === 'P' && (toRow === 0 || toRow === 7)) {
    const promoLetter = promotionPiece ? promotionPiece.toUpperCase() : 'Q';
    notation += `=${promoLetter}`;
  }

  // Check / checkmate (simulate with the correct promotion piece)
  const newState = makeMove(state, fromRow, fromCol, toRow, toCol, promotionPiece);
  const enemy = color === WHITE ? BLACK : WHITE;
  if (isInCheck(newState, enemy)) {
    let hasLegalMove = false;
    for (let r = 0; r < 8 && !hasLegalMove; r++) {
      for (let c = 0; c < 8 && !hasLegalMove; c++) {
        if (newState.board[r][c] && pieceColor(newState.board[r][c]) === enemy) {
          if (getLegalMoves(newState, r, c).length > 0) hasLegalMove = true;
        }
      }
    }
    notation += hasLegalMove ? '+' : '#';
  }

  return notation;
}

// ---- Get Captured Piece ----------------------------------------

export function getCapturedPiece(state, fromRow, fromCol, toRow, toCol) {
  const piece = state.board[fromRow][fromCol];
  const pt = pieceType(piece);
  const color = pieceColor(piece);

  // Normal capture
  const captured = state.board[toRow][toCol];
  if (captured) return captured;

  // En passant capture
  if (pt === 'P' && state.enPassant &&
    toRow === state.enPassant[0] && toCol === state.enPassant[1]) {
    return color === WHITE ? 'p' : 'P';
  }

  return null;
}

// ---- Promotion Detection ---------------------------------------

export function isPromotionMove(state, fromRow, fromCol, toRow) {
  const piece = state.board[fromRow][fromCol];
  if (!piece) return false;
  return piece.toUpperCase() === 'P' && (toRow === 0 || toRow === 7);
}

// ---- Game Status -----------------------------------------------
// Returns: { status: 'playing'|'checkmate'|'stalemate'|'draw', winner: 'w'|'b'|null }

export function getGameStatus(state) {
  const color = state.turn;
  const enemy = color === WHITE ? BLACK : WHITE;

  // Check if the current side has any legal moves
  let hasLegalMove = false;
  for (let r = 0; r < 8 && !hasLegalMove; r++) {
    for (let c = 0; c < 8 && !hasLegalMove; c++) {
      const piece = state.board[r][c];
      if (piece && pieceColor(piece) === color) {
        if (getLegalMoves(state, r, c).length > 0) {
          hasLegalMove = true;
        }
      }
    }
  }

  if (!hasLegalMove) {
    if (isInCheck(state, color)) {
      // Checkmate — the other side wins
      return { status: 'checkmate', winner: enemy };
    }
    // Stalemate — draw
    return { status: 'stalemate', winner: null };
  }

  // 50-move rule
  if (state.halfmove >= 100) {
    return { status: 'draw', winner: null };
  }

  return { status: 'playing', winner: null };
}
