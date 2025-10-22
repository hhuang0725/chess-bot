const { useMemo, useState, useEffect, useRef } = React;

const ICON_BY_TYPE = { k: 'fa-chess-king', q: 'fa-chess-queen', r: 'fa-chess-rook', b: 'fa-chess-bishop', n: 'fa-chess-knight', p: 'fa-chess-pawn' };
const files = 'abcdefgh'.split('');
function coordToSquare(r, c) { return files[c] + (8 - r); }
function squareToCoord(sq) { const c = files.indexOf(sq[0]); const r = 8 - parseInt(sq[1], 10); return [r, c]; }
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function cloneBoard(board) { return board.map(row => row.map(cell => (cell ? { type: cell.type, color: cell.color } : null))); }
function cloneState(state) {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    canCastle: { w: { k: state.canCastle.w.k, q: state.canCastle.w.q }, b: { k: state.canCastle.b.k, q: state.canCastle.b.q } },
    enPassant: state.enPassant,
    history: state.history.slice(),
    halfmove: state.halfmove || 0,
    fullmove: state.fullmove || 1,
    posCounts: Object.assign({}, state.posCounts || {}),
  };
}

function initialBoard() {
  const empty = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const b = empty.map(r => r.slice());
  b[0] = back.map(t => ({ type: t, color: 'b' }));
  b[1] = Array(8).fill({ type: 'p', color: 'b' });
  b[6] = Array(8).fill({ type: 'p', color: 'w' });
  b[7] = back.map(t => ({ type: t, color: 'w' }));
  return b;
}

function createInitialState() {
  const base = {
    board: initialBoard(),
    turn: 'w',
    canCastle: { w: { k: true, q: true }, b: { k: true, q: true } },
    enPassant: null,
    history: [], // array of pretty strings
    halfmove: 0,
    fullmove: 1,
    posCounts: {},
  };
  const key = positionKey(base);
  base.posCounts[key] = 1;
  return base;
}

function positionKey(state) {
  // Encode board + turn + castling + en passant
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) { row += '.'; }
      else {
        const ch = p.type;
        row += p.color === 'w' ? ch.toUpperCase() : ch;
      }
    }
    rows.push(row);
  }
  const castle = `${state.canCastle.w.k?'K':''}${state.canCastle.w.q?'Q':''}${state.canCastle.b.k?'k':''}${state.canCastle.b.q?'q':''}` || '-';
  const ep = state.enPassant || '-';
  return rows.join('/') + ' ' + state.turn + ' ' + castle + ' ' + ep;
}

function toFEN(state) {
  // Pieces
  const ranks = [];
  for (let r = 0; r < 8; r++) {
    let run = 0;
    let s = '';
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) { run += 1; continue; }
      if (run) { s += String(run); run = 0; }
      const ch = p.type;
      s += p.color === 'w' ? ch.toUpperCase() : ch;
    }
    if (run) s += String(run);
    ranks.push(s);
  }
  const pieces = ranks.join('/');
  const side = state.turn;
  const castle = `${state.canCastle.w.k?'K':''}${state.canCastle.w.q?'Q':''}${state.canCastle.b.k?'k':''}${state.canCastle.b.q?'q':''}` || '-';
  const ep = state.enPassant || '-';
  const hm = state.halfmove || 0;
  const fm = state.fullmove || 1;
  return `${pieces} ${side} ${castle} ${ep} ${hm} ${fm}`;
}

function fromFEN(fen) {
  const parts = fen.trim().split(/\s+/);
  const [piecePart, side, castling, ep, hmStr, fmStr] = parts;
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const ranks = piecePart.split('/');
  for (let r = 0; r < 8; r++) {
    let c = 0;
    for (const ch of ranks[r]) {
      if (/[1-8]/.test(ch)) {
        c += parseInt(ch, 10);
      } else {
        const isUpper = ch === ch.toUpperCase();
        const type = ch.toLowerCase();
        board[r][c] = { type, color: isUpper ? 'w' : 'b' };
        c += 1;
      }
    }
  }
  const state = {
    board,
    turn: side === 'w' ? 'w' : 'b',
    canCastle: { w: { k: false, q: false }, b: { k: false, q: false } },
    enPassant: ep === '-' ? null : ep,
    history: [],
    halfmove: parseInt(hmStr || '0', 10) || 0,
    fullmove: parseInt(fmStr || '1', 10) || 1,
    posCounts: {},
  };
  if (castling && castling !== '-') {
    if (castling.indexOf('K') !== -1) state.canCastle.w.k = true;
    if (castling.indexOf('Q') !== -1) state.canCastle.w.q = true;
    if (castling.indexOf('k') !== -1) state.canCastle.b.k = true;
    if (castling.indexOf('q') !== -1) state.canCastle.b.q = true;
  }
  const key = positionKey(state);
  state.posCounts[key] = 1;
  return state;
}

function getPiece(board, sq) { const rc = squareToCoord(sq); return board[rc[0]][rc[1]]; }
function setPiece(board, sq, piece) { const rc = squareToCoord(sq); board[rc[0]][rc[1]] = piece; }

function kingSquare(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === color) return coordToSquare(r, c);
    }
  }
  return null;
}

function isSquareAttacked(board, sq, byColor) {
  const rc = squareToCoord(sq);
  const r = rc[0], c = rc[1];
  // Pawn attacks
  const dr = byColor === 'w' ? -1 : 1;
  const pawnAttackers = [ [r - dr, c - 1], [r - dr, c + 1] ]; // reverse from target
  for (let i = 0; i < pawnAttackers.length; i++) {
    const pr = pawnAttackers[i][0], pc = pawnAttackers[i][1];
    if (inBounds(pr, pc)) {
      const p = board[pr][pc];
      if (p && p.color === byColor && p.type === 'p') return true;
    }
  }
  // Knights
  const kJumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (let i = 0; i < kJumps.length; i++) {
    const pr = r + kJumps[i][0], pc = c + kJumps[i][1];
    if (inBounds(pr, pc)) { const p = board[pr][pc]; if (p && p.color === byColor && p.type === 'n') return true; }
  }
  // Sliders (bishops/rooks/queens)
  const rays = [
    { d:[-1,0], types:['r','q'] }, { d:[1,0], types:['r','q'] }, { d:[0,-1], types:['r','q'] }, { d:[0,1], types:['r','q'] },
    { d:[-1,-1], types:['b','q'] }, { d:[-1,1], types:['b','q'] }, { d:[1,-1], types:['b','q'] }, { d:[1,1], types:['b','q'] },
  ];
  for (let i = 0; i < rays.length; i++) {
    let pr = r + rays[i].d[0], pc = c + rays[i].d[1];
    while (inBounds(pr, pc)) {
      const p = board[pr][pc];
      if (p) { if (p.color === byColor && (rays[i].types.indexOf(p.type) !== -1)) return true; else break; }
      pr += rays[i].d[0]; pc += rays[i].d[1];
    }
  }
  // King neighbors
  for (let dr2 = -1; dr2 <= 1; dr2++) for (let dc2 = -1; dc2 <= 1; dc2++) {
    if (dr2 === 0 && dc2 === 0) continue;
    const pr = r + dr2, pc = c + dc2;
    if (inBounds(pr, pc)) { const p = board[pr][pc]; if (p && p.color === byColor && p.type === 'k') return true; }
  }
  return false;
}

function generatePseudoFrom(state, from) {
  const board = state.board;
  const rc = squareToCoord(from);
  const r = rc[0], c = rc[1];
  const p = board[r][c];
  if (!p) return [];
  const color = p.color;
  const moves = [];
  const push = (to, extra) => { moves.push(Object.assign({ from, to, piece: p, capture: false }, extra || {})); };

  if (p.type === 'p') {
    const dir = color === 'w' ? -1 : 1;
    // one forward
    const r1 = r + dir;
    if (inBounds(r1, c) && !board[r1][c]) {
      const to = coordToSquare(r1, c);
      const promo = (color === 'w' && r1 === 0) || (color === 'b' && r1 === 7);
      push(to, { promotion: promo ? true : false });
      // two forward
      const startRank = color === 'w' ? 6 : 1;
      const r2 = r + 2*dir;
      if (r === startRank && !board[r2][c]) {
        push(coordToSquare(r2, c), { double: true, epTarget: coordToSquare(r1, c) });
      }
    }
    // captures
    for (let dc = -1; dc <= 1; dc += 2) {
      const rr = r + dir, cc = c + dc;
      if (!inBounds(rr, cc)) continue;
      const target = board[rr][cc];
      const to = coordToSquare(rr, cc);
      if (target && target.color !== color) {
        const promo = (color === 'w' && rr === 0) || (color === 'b' && rr === 7);
        push(to, { capture: true, captured: target, promotion: promo ? true : false });
      }
    }
    // en passant
    if (state.enPassant) {
      const ep = squareToCoord(state.enPassant);
      if (ep[0] === r + dir && (ep[1] === c - 1 || ep[1] === c + 1)) {
        const to = coordToSquare(ep[0], ep[1]);
        push(to, { capture: true, enPassant: true });
      }
    }
  } else if (p.type === 'n') {
    const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (let i = 0; i < jumps.length; i++) {
      const rr = r + jumps[i][0], cc = c + jumps[i][1];
      if (!inBounds(rr, cc)) continue;
      const t = board[rr][cc];
      if (!t || t.color !== color) push(coordToSquare(rr, cc), { capture: !!t });
    }
  } else if (p.type === 'b' || p.type === 'r' || p.type === 'q') {
    const dirs = [];
    if (p.type !== 'r') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
    if (p.type !== 'b') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
    for (let i = 0; i < dirs.length; i++) {
      let rr = r + dirs[i][0], cc = c + dirs[i][1];
      while (inBounds(rr, cc)) {
        const t = board[rr][cc];
        if (!t) { push(coordToSquare(rr, cc)); }
        else { if (t.color !== color) push(coordToSquare(rr, cc), { capture: true }); break; }
        rr += dirs[i][0]; cc += dirs[i][1];
      }
    }
  } else if (p.type === 'k') {
    for (let dr2 = -1; dr2 <= 1; dr2++) for (let dc2 = -1; dc2 <= 1; dc2++) {
      if (dr2 === 0 && dc2 === 0) continue;
      const rr = r + dr2, cc = c + dc2;
      if (!inBounds(rr, cc)) continue;
      const t = board[rr][cc];
      if (!t || t.color !== color) push(coordToSquare(rr, cc), { capture: !!t });
    }
    // Castling
    const rights = state.canCastle[color];
    const rank = color === 'w' ? 7 : 0;
    if (r === rank && c === 4) {
      // King side
      if (rights.k && !board[rank][5] && !board[rank][6]) {
        push(coordToSquare(rank, 6), { castle: 'K' });
      }
      // Queen side
      if (rights.q && !board[rank][1] && !board[rank][2] && !board[rank][3]) {
        push(coordToSquare(rank, 2), { castle: 'Q' });
      }
    }
  }
  return moves;
}

function applyMove(state, move, promotionChoice) {
  // returns new state if legal, else null
  const next = cloneState(state);
  const fromPiece = getPiece(next.board, move.from);
  if (!fromPiece) return null;
  // handle castling rook move
  if (fromPiece.type === 'k' && Math.abs(squareToCoord(move.to)[1] - squareToCoord(move.from)[1]) === 2) {
    // castling
    const color = fromPiece.color;
    const rank = color === 'w' ? 7 : 0;
    if (squareToCoord(move.to)[1] === 6) {
      // King side: move rook h -> f
      setPiece(next.board, coordToSquare(rank, 5), getPiece(next.board, coordToSquare(rank, 7)));
      setPiece(next.board, coordToSquare(rank, 7), null);
    } else {
      // Queen side: move rook a -> d
      setPiece(next.board, coordToSquare(rank, 3), getPiece(next.board, coordToSquare(rank, 0)));
      setPiece(next.board, coordToSquare(rank, 0), null);
    }
  }
  // en passant capture
  if (move.enPassant) {
    const dir = fromPiece.color === 'w' ? 1 : -1; // captured pawn is behind target
    const toRC = squareToCoord(move.to);
    const capSq = coordToSquare(toRC[0] + dir, toRC[1]);
    setPiece(next.board, capSq, null);
  }
  // move the piece
  setPiece(next.board, move.to, fromPiece);
  setPiece(next.board, move.from, null);
  // promotion
  if (move.promotion) {
    const choice = promotionChoice || 'q';
    const promoted = { type: choice, color: fromPiece.color };
    setPiece(next.board, move.to, promoted);
  }
  // halfmove clock
  const wasPawn = fromPiece.type === 'p';
  const wasCapture = !!move.capture || !!move.enPassant;
  next.halfmove = (wasPawn || wasCapture) ? 0 : (next.halfmove + 1);
  // fullmove number increases after black moves
  if (state.turn === 'b') next.fullmove = (next.fullmove || 1) + 1;
  // update castling rights
  if (fromPiece.type === 'k') {
    next.canCastle[fromPiece.color].k = false;
    next.canCastle[fromPiece.color].q = false;
  }
  if (fromPiece.type === 'r') {
    const fromRC = squareToCoord(move.from);
    const color = fromPiece.color;
    if (color === 'w' && fromRC[0] === 7 && fromRC[1] === 0) next.canCastle.w.q = false;
    if (color === 'w' && fromRC[0] === 7 && fromRC[1] === 7) next.canCastle.w.k = false;
    if (color === 'b' && fromRC[0] === 0 && fromRC[1] === 0) next.canCastle.b.q = false;
    if (color === 'b' && fromRC[0] === 0 && fromRC[1] === 7) next.canCastle.b.k = false;
  }
  // if a rook got captured on its original square, update opponent rights
  if (move.capture && move.captured) {
    const toRC = squareToCoord(move.to);
    const capColor = move.captured.color;
    if (capColor === 'w' && toRC[0] === 7 && toRC[1] === 0 && move.captured.type === 'r') next.canCastle.w.q = false;
    if (capColor === 'w' && toRC[0] === 7 && toRC[1] === 7 && move.captured.type === 'r') next.canCastle.w.k = false;
    if (capColor === 'b' && toRC[0] === 0 && toRC[1] === 0 && move.captured.type === 'r') next.canCastle.b.q = false;
    if (capColor === 'b' && toRC[0] === 0 && toRC[1] === 7 && move.captured.type === 'r') next.canCastle.b.k = false;
  }
  // update enPassant
  if (move.double && move.epTarget) next.enPassant = move.epTarget; else next.enPassant = null;
  // toggle turn
  next.turn = state.turn === 'w' ? 'b' : 'w';
  return next;
}

function isInCheck(state, color) {
  const ks = kingSquare(state.board, color);
  return isSquareAttacked(state.board, ks, color === 'w' ? 'b' : 'w');
}

function generateLegalFrom(state, from) {
  const piece = getPiece(state.board, from);
  if (!piece || piece.color !== state.turn) return [];
  const pseudo = generatePseudoFrom(state, from);
  const legal = [];
  for (let i = 0; i < pseudo.length; i++) {
    const m = pseudo[i];
    // disallow moving into/through check for castling
    if (m.castle) {
      const color = piece.color;
      const rank = color === 'w' ? 7 : 0;
      const path = m.castle === 'K' ? [4,5,6] : [4,3,2];
      let safe = true;
      for (let j = 0; j < path.length; j++) {
        const sq = coordToSquare(rank, path[j]);
        const temp = cloneState(state);
        // simulate king stepping onto sq
        setPiece(temp.board, sq, { type: 'k', color });
        setPiece(temp.board, coordToSquare(rank, 4), null);
        if (isSquareAttacked(temp.board, sq, color === 'w' ? 'b' : 'w')) { safe = false; break; }
      }
      if (!safe) continue;
    }
    // simulate move to see if own king ends up in check
    const next = applyMove(state, m, m.promotion ? 'q' : null);
    if (!next) continue;
    if (!isInCheck(next, piece.color)) legal.push(m);
  }
  return legal;
}

function formatMove(stateBefore, stateAfter, move) {
  // Simple notation: castling, captures with x, promotion =Q, +/#
  const pieceLetter = { p:'', n:'N', b:'B', r:'R', q:'Q', k:'K' };
  const opp = stateBefore.turn === 'w' ? 'b' : 'w';
  let s = '';
  if (move.castle === 'K') s = 'O-O';
  else if (move.castle === 'Q') s = 'O-O-O';
  else {
    const fromPiece = move.piece;
    if (fromPiece.type === 'p' && move.capture) s += fromSquareFile(move.from);
    else s += pieceLetter[fromPiece.type];
    s += move.capture ? 'x' : '';
    s += move.to;
    if (move.promotion) s += '=Q';
  }
  const check = isInCheck(stateAfter, opp);
  // checkmate detection: no legal moves for opponent
  const oppHasMove = hasAnyLegalMove(stateAfter, opp);
  if (check && !oppHasMove) s += '#'; else if (check) s += '+';
  return s;
}

function fromSquareFile(sq) { return sq[0]; }

function hasAnyLegalMove(state, color) {
  // temporarily set turn and scan
  const savedTurn = state.turn; state.turn = color;
  let found = false;
  outer: for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.color === color) {
        const from = coordToSquare(r, c);
        const legal = generateLegalFrom(state, from);
        if (legal.length > 0) { found = true; break outer; }
      }
    }
  }
  state.turn = savedTurn;
  return found;
}

function gameStatus(state) {
  const color = state.turn; // side to move
  // Draws by rule
  if ((state.halfmove || 0) >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule' };
  if ((state.halfmove || 0) >= 150) return { over: true, result: '1/2-1/2', reason: 'seventy-five-move rule' };
  const key = positionKey(state);
  const count = (state.posCounts && state.posCounts[key]) || 0;
  if (count >= 5) return { over: true, result: '1/2-1/2', reason: 'fivefold repetition' };
  if (count >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition' };
  if (insufficientMaterial(state)) return { over: true, result: '1/2-1/2', reason: 'insufficient material' };
  const any = hasAnyLegalMove(state, color);
  if (any) return { over: false };
  const inCheck = isInCheck(state, color);
  if (inCheck) {
    const winner = color === 'w' ? 'b' : 'w';
    return { over: true, result: winner === 'w' ? '1-0' : '0-1', reason: 'checkmate' };
  }
  return { over: true, result: '1/2-1/2', reason: 'stalemate' };
}

function insufficientMaterial(state) {
  // Returns true if neither side can possibly checkmate
  let bishops = []; // track color square of bishops
  let knights = 0;
  let other = 0;
  function squareColor(r, c) { return (r + c) % 2; } // 0 light, 1 dark
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p || p.type === 'k') continue;
      if (p.type === 'p' || p.type === 'q' || p.type === 'r') { other++; }
      else if (p.type === 'n') { knights++; }
      else if (p.type === 'b') { bishops.push(squareColor(r, c)); }
    }
  }
  if (other > 0) return false;
  if (knights === 0 && bishops.length === 0) return true; // K vs K
  if (knights === 1 && bishops.length === 0) return true; // K+N vs K
  if (knights === 0 && bishops.length === 1) return true; // K+B vs K
  if (knights === 0 && bishops.length > 0) {
    // Only bishops remain: if all bishops on the same color complex -> draw
    const allSame = bishops.every(x => x === bishops[0]);
    if (allSame) return true;
  }
  return false;
}

function Square({ rView, cView, square, selected, isTarget, onClick }) {
  const dark = (rView + cView) % 2 === 1;
  const classes = `square ${dark ? 'square--dark' : 'square--light'} ${selected ? 'square--selected' : ''}`;
  return (
    <div
      className={classes}
      role="gridcell"
      aria-label={square}
      draggable={false}
      onClick={() => onClick(square)}
    >
      {isTarget && <div className="square__dot" />}
    </div>
  );
}

function PromotionModal({ request, onChoose, onCancel }) {
  if (!request) return null;
  const pieces = [
    { key: 'q', label: 'Queen', icon: ICON_BY_TYPE.q },
    { key: 'r', label: 'Rook', icon: ICON_BY_TYPE.r },
    { key: 'b', label: 'Bishop', icon: ICON_BY_TYPE.b },
    { key: 'n', label: 'Knight', icon: ICON_BY_TYPE.n },
  ];
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', zIndex: 50,
    }}>
      <div style={{ background: '#161b22', border: '1px solid #2a2f37', borderRadius: 8, padding: 16, width: 260 }}>
        <h3 style={{ margin: '0 0 12px', color: '#e6edf3', fontSize: 16 }}>Promote pawn to</h3>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
          {pieces.map(p => (
            <button key={p.key} onClick={() => onChoose(p.key)} style={{
              display: 'grid', placeItems: 'center', padding: 10, borderRadius: 6, background: '#0f1216', color: '#e6edf3',
              border: '1px solid #2a2f37', cursor: 'pointer', width: 56, height: 56
            }}>
              <i className={`fa-solid ${p.icon}`} />
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button onClick={onCancel} style={{ background: 'transparent', color: '#9aa7b3', border: 'none', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Board({ state, setState, bottomSide }) {
  const [selected, setSelected] = useState(null);
  const [targets, setTargets] = useState([]);
  const [promotionReq, setPromotionReq] = useState(null);
  const [drag, setDrag] = useState(null); // { from, piece, x, y, offsetX, offsetY }
  const boardRef = useRef(null);
  const [squareSize, setSquareSize] = useState(0);
  const board = state.board;

  function measureBoard() {
    const el = boardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const size = rect.width / 8;
    if (size && Math.abs(size - squareSize) > 0.5) setSquareSize(size);
  }

  React.useLayoutEffect(() => {
    measureBoard();
  }, []);

  useEffect(() => {
    const onResize = () => measureBoard();
    window.addEventListener('resize', onResize);
    window.addEventListener('load', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('load', onResize);
    };
  }, []);

  function posToSquare(clientX, clientY) {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const size = rect.width / 8;
    const cView = Math.floor(x / size);
    const rView = Math.floor(y / size);
    if (!inBounds(rView, cView)) return null;
    const rModel = bottomSide === 'w' ? rView : 7 - rView;
    const cModel = bottomSide === 'w' ? cView : 7 - cView;
    return coordToSquare(rModel, cModel);
  }

  function handleSquareClick(square) {
    if (window.__botSide && state.turn === window.__botSide) return; // block human when bot to move
    const rc = squareToCoord(square);
    const piece = board[rc[0]][rc[1]];
    if (selected === null) {
      if (piece && piece.color === state.turn) {
        setSelected(square);
        const moves = generateLegalFrom(state, square);
        setTargets(moves.map(m => m.to));
      }
      return;
    }

    if (square === selected) {
      setSelected(null); setTargets([]);
      return;
    }

    const legal = generateLegalFrom(state, selected).filter(m => m.to === square);
    if (legal.length === 0) {
      // Switch selection if clicking own piece
      if (piece && piece.color === state.turn) {
        setSelected(square);
        setTargets(generateLegalFrom(state, square).map(m => m.to));
      }
      return;
    }

    // If promotion is needed, ask user
    const needsPromotion = legal.some(m => m.promotion);
    if (needsPromotion) {
      setPromotionReq({ from: selected, to: square });
      return;
    }

    const move = legal[0];
    const next = applyMove(state, move, null);
    setState(prev => {
      const notation = formatMove(prev, next, move);
      const updated = cloneState(next);
      updated.history.push(notation);
      // update repetition map
      const key = positionKey(updated);
      updated.posCounts[key] = (updated.posCounts[key] || 0) + 1;
      return updated;
    });
    setSelected(null); setTargets([]);
  }

  function startDrag(from, clientX, clientY) {
    if (window.__botSide && state.turn === window.__botSide) return;
    const [r, c] = squareToCoord(from);
    const piece = board[r][c];
    if (!piece || piece.color !== state.turn) return;
    const size = squareSize;
    const el = boardRef.current;
    const rect = el.getBoundingClientRect();
    const viewC = bottomSide === 'w' ? c : 7 - c;
    const viewR = bottomSide === 'w' ? r : 7 - r;
    const originX = viewC * size + rect.left + size / 2;
    const originY = viewR * size + rect.top + size / 2;
    setSelected(from);
    setTargets(generateLegalFrom(state, from).map(m => m.to));
    setDrag({ from, piece, x: originX, y: originY, offsetX: 0, offsetY: 0 });
  }

  function onMouseMove(e) {
    if (!drag) return;
    setDrag(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
  }

  function endDrag(e) {
    if (!drag) return;
    const to = posToSquare(e.clientX, e.clientY);
    const legal = to ? generateLegalFrom(state, drag.from).filter(m => m.to === to) : [];
    if (legal.length === 0) {
      setDrag(null);
      return;
    }
    const move = legal[0];
    if (move.promotion) {
      setPromotionReq({ from: move.from, to: move.to });
      setDrag(null);
      return;
    }
    const next = applyMove(state, move, null);
    setState(prev => {
      const notation = formatMove(prev, next, move);
      const updated = cloneState(next);
      updated.history.push(notation);
      const key = positionKey(updated);
      updated.posCounts[key] = (updated.posCounts[key] || 0) + 1;
      return updated;
    });
    setSelected(null); setTargets([]);
    setDrag(null);
  }

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', endDrag);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', endDrag);
    };
  }, [drag, state]);

  function choosePromotion(piece) {
    const { from, to } = promotionReq;
    const legal = generateLegalFrom(state, from).filter(m => m.to === to);
    if (legal.length === 0) { setPromotionReq(null); return; }
    const move = legal.find(m => m.promotion) || legal[0];
    const next = applyMove(state, move, piece);
    setState(prev => {
      const notation = formatMove(prev, next, move);
      const updated = cloneState(next);
      updated.history.push(notation);
      const key = positionKey(updated);
      updated.posCounts[key] = (updated.posCounts[key] || 0) + 1;
      return updated;
    });
    setPromotionReq(null);
    setSelected(null); setTargets([]);
  }

  return (
    <>
      <div className="board" role="grid" aria-label="chessboard" ref={boardRef}
        onMouseLeave={() => { /* optional: could cancel drag */ }}>
        {Array.from({ length: 8 }).map((_, rView) =>
          Array.from({ length: 8 }).map((__, cView) => {
            const rModel = bottomSide === 'w' ? rView : 7 - rView;
            const cModel = bottomSide === 'w' ? cView : 7 - cView;
            const sq = coordToSquare(rModel, cModel);
            return (
              <Square
                key={`${rView}-${cView}`}
                rView={rView}
                cView={cView}
                square={sq}
                selected={sq === selected}
                isTarget={targets.includes(sq)}
                onClick={handleSquareClick}
              />
            );
          })
        )}
        {/* Pieces overlay */}
        {squareSize > 0 && <div className="pieces">
          {board.flatMap((row, r) => row.map((piece, c) => ({ piece, r, c }))).filter(x => !!x.piece).map(({ piece, r, c }) => {
            const from = coordToSquare(r, c);
            const isDragging = drag && drag.from === from;
            // compute top/left
            const rect = boardRef.current.getBoundingClientRect();
            const size = squareSize;
            const viewC = bottomSide === 'w' ? c : 7 - c;
            const viewR = bottomSide === 'w' ? r : 7 - r;
            const left = isDragging ? (drag.x - rect.left - size/2) : viewC * size;
            const top = isDragging ? (drag.y - rect.top - size/2) : viewR * size;
            const icon = ICON_BY_TYPE[piece.type];
            const color = piece.color === 'w' ? 'white' : 'black';
            return (
              <div
                key={from}
                className={`piece-ab ${isDragging ? 'dragging' : ''}`}
                style={{ left: left + 'px', top: top + 'px' }}
                onMouseDown={(e) => startDrag(from, e.clientX, e.clientY)}
              >
                <i className={`fa-solid ${icon} piece piece--${color}`} aria-hidden="true" />
              </div>
            );
          })}
        </div>}
      </div>
      <PromotionModal
        request={promotionReq}
        onChoose={choosePromotion}
        onCancel={() => setPromotionReq(null)}
      />
    </>
  );
}

function formatMovePairs(moves) {
  const lines = [];
  for (let i = 0; i < moves.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const white = moves[i] ? moves[i] : '';
    const black = moves[i + 1] ? moves[i + 1] : '';
    lines.push(`${moveNum}. ${white}${black ? ' ' + black : ''}`);
  }
  return lines;
}

function MoveHistory({ state }) {
  const moves = state.history;
  const lines = useMemo(() => formatMovePairs(moves), [moves]);
  return (
    <aside className="history" aria-label="move history">
      <h2>Moves</h2>
      <ol className="history__list">
        {lines.map((m, idx) => (
          <li key={idx}>{m}</li>
        ))}
      </ol>
    </aside>
  );
}

function App() {
  const [phase, setPhase] = useState('menu'); // 'menu' | 'playing'
  const [state, setState] = useState(createInitialState());
  const status = useMemo(() => phase === 'playing' ? gameStatus(state) : { over: false }, [state, phase]);
  const [botSide, setBotSide] = useState(null); // 'w' | 'b' | null
  const [botThinking, setBotThinking] = useState(false);
  const [bottomSide, setBottomSide] = useState('w'); // which side is at the bottom of the board

  // Expose botSide for Board to block human moves without deep prop drilling
  useEffect(() => { window.__botSide = botSide; return () => { delete window.__botSide; }; }, [botSide]);

  function startGame(mode = 'local') {
    setState(createInitialState());
    setPhase('playing');
    if (mode === 'bot_white') setBotSide('b');
    else if (mode === 'bot_black') setBotSide('w');
    else setBotSide(null);
    setBottomSide(mode === 'bot_black' ? 'b' : 'w');
  }

  function EndModal({ status, onRestart }) {
    if (!status || !status.over) return null;
    const title = status.reason === 'checkmate' ? 'Checkmate' : 'Draw';
    const msg = status.reason === 'checkmate' ? `Result: ${status.result}` : `Result: ${status.result} (${status.reason})`;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', zIndex: 60 }}>
        <div style={{ background: '#161b22', border: '1px solid #2a2f37', borderRadius: 8, padding: 16, width: 300 }}>
          <h3 style={{ margin: '0 0 8px', color: '#e6edf3', fontSize: 18 }}>{title}</h3>
          <div style={{ color: '#9aa7b3', marginBottom: 12 }}>{msg}</div>
          <div style={{ textAlign: 'right' }}>
            <button onClick={onRestart} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer' }}>Play Again</button>
          </div>
        </div>
      </div>
    );
  }

  // Backend bot endpoint (override with window.BOT_URL in console if needed)
  const BOT_URL = (window.BOT_URL || 'http://localhost:5000/api/move');

  async function requestBotMove(current) {
    const fen = toFEN(current);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(BOT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!resp.ok) {
        console.error('Bot server error:', resp.status, await resp.text());
        return null;
      }
      const data = await resp.json();
      if (!data || !data.uci) return null;
      return data.uci; // e2e4, e7e8q
    } catch (e) {
      console.error('Bot fetch failed:', e);
      return null; // frontend will fallback to random
    }
  }

  function applyBotUCIMove(uci) {
    // Map UCI to our legal move list
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.length > 4 ? uci[4] : null;
    const legal = generateLegalFrom(state, from).filter(m => m.to === to);
    let move = legal[0];
    if (!move) return false;
    const next = applyMove(state, move, promo);
    setState(prev => {
      const notation = formatMove(prev, next, move);
      const updated = cloneState(next);
      updated.history.push(notation);
      const key = positionKey(updated);
      updated.posCounts[key] = (updated.posCounts[key] || 0) + 1;
      return updated;
    });
    return true;
  }

  function applyBotResponse(data) {
    // Prefer server-provided FEN to avoid desync on castling/EP rules
    if (data && data.fen) {
      setState(prev => {
        const next = fromFEN(data.fen);
        next.history = prev.history.slice();
        if (data.san) next.history.push(data.san);
        const key = positionKey(next);
        next.posCounts[key] = (next.posCounts[key] || 0) + 1;
        return next;
      });
      return true;
    }
    if (data && data.uci) return applyBotUCIMove(data.uci);
    return false;
  }

  function applyRandomBotMove() {
    // Fallback: pick random legal move from current state
    // Scan all from-squares for current side
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (p && p.color === state.turn) {
          const from = coordToSquare(r, c);
          const ls = generateLegalFrom(state, from);
          for (let i = 0; i < ls.length; i++) moves.push(ls[i]);
        }
      }
    }
    if (moves.length === 0) return false;
    const move = moves[Math.floor(Math.random() * moves.length)];
    const next = applyMove(state, move, move.promotion ? 'q' : null);
    setState(prev => {
      const notation = formatMove(prev, next, move);
      const updated = cloneState(next);
      updated.history.push(notation);
      const key = positionKey(updated);
      updated.posCounts[key] = (updated.posCounts[key] || 0) + 1;
      return updated;
    });
    return true;
  }

  useEffect(() => {
    if (phase !== 'playing') return;
    if (!botSide) return;
    if (status.over) return;
    if (state.turn !== botSide) return;
    let aborted = false;
    setBotThinking(true);
    (async () => {
      const fen = toFEN(state);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const resp = await fetch(BOT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fen }),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (aborted) return;
        if (resp.ok) {
          const data = await resp.json();
          const applied = applyBotResponse(data);
          if (!applied) {
            const uci = data && data.uci ? data.uci : null;
            if (uci) applyBotUCIMove(uci); else applyRandomBotMove();
          }
        } else {
          console.error('Bot server error:', resp.status);
          applyRandomBotMove();
        }
      } catch (e) {
        console.error('Bot fetch failed:', e);
        if (!aborted) applyRandomBotMove();
      } finally {
        if (!aborted) setBotThinking(false);
      }
    })();
    return () => { aborted = true; };
  }, [phase, botSide, state.turn, status.over]);

  function StartMenu({ onStart }) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ background: '#161b22', border: '1px solid #2a2f37', borderRadius: 10, padding: 24, width: 360, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
          <h1 style={{ margin: '0 0 8px', color: '#e6edf3', fontSize: 22 }}>Chess</h1>
          <p style={{ margin: '0 0 16px', color: '#9aa7b3' }}>Choose a mode to start.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <button onClick={() => onStart('bot_white')} style={{ width: '100%', background: '#2563eb', color: 'white', border: 'none', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>Play as White vs Bot</button>
            <button onClick={() => onStart('bot_black')} style={{ width: '100%', background: '#0ea5e9', color: 'white', border: 'none', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>Play as Black vs Bot</button>
            <button onClick={() => onStart('local')} style={{ width: '100%', background: '#10b981', color: 'white', border: 'none', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>Play Local (Two Players)</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'menu') {
    return <StartMenu onStart={startGame} />;
  }

  return (
    <main className="app" aria-label="chess app">
      <Board state={state} setState={setState} bottomSide={bottomSide} />
      <div>
        <MoveHistory state={state} />
        {botSide && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#9aa7b3' }}>
            Bot: {botThinking ? 'thinking…' : (state.turn === botSide ? 'ready' : 'waiting for player')}
          </div>
        )}
      </div>
      <EndModal status={status} onRestart={startGame} />
    </main>
  );
}

// Track global drag source for convenience
window.addEventListener('dragstart', (e) => {
  const data = e.dataTransfer.getData('text/plain');
  if (data) window.dragSource = data;
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
