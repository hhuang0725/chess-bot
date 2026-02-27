import { useState, useCallback, useRef, memo } from 'react';
import { getLegalMoves } from '../game/chessLogic';
import './Chessboard.css';

// Unicode chess pieces
const PIECES = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const PROMOTION_PIECES = ['Q', 'R', 'B', 'N'];

function pieceColor(p) {
  if (!p) return null;
  return p === p.toUpperCase() ? 'w' : 'b';
}

// ---- Individual Square Component ----

const Square = memo(function Square({
  rowIdx, colIdx, piece, turn, isSelected, isLegalTarget, isLastMoveSquare,
  promoIndex, isWhitePromotion, pendingPromotion,
  onClick, onDragOver, onDrop, onDragStart, onDragEnd, onPromotionSelect,
}) {
  const isLight = (rowIdx + colIdx) % 2 === 0;
  const squareId = `${FILES[colIdx]}${RANKS[rowIdx]}`;
  const pColor = pieceColor(piece);
  const isCapture = isLegalTarget && piece != null;
  const isPromoSquare = promoIndex >= 0 && promoIndex < 4;

  let squareClass = `square ${isLight ? 'square--light' : 'square--dark'}`;
  if (isSelected) squareClass += ' square--selected';
  if (isLastMoveSquare && !isSelected) squareClass += ' square--last-move';

  return (
    <div
      key={squareId}
      id={`square-${squareId}`}
      className={squareClass}
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Normal piece rendering (hide if promotion picker covers this square) */}
      {piece && !isPromoSquare && (
        <span
          className={`piece piece--${pColor === 'w' ? 'white' : 'black'}${pColor === turn ? ' piece--draggable' : ''
            }`}
          data-piece={piece}
          draggable={pColor === turn && !pendingPromotion}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          {PIECES[piece]}
        </span>
      )}

      {/* Promotion picker option */}
      {isPromoSquare && (
        <div
          className={`promotion-option ${promoIndex === 0 ? 'promotion-option--first' : ''} ${promoIndex === 3 ? 'promotion-option--last' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onPromotionSelect(PROMOTION_PIECES[promoIndex]);
          }}
        >
          <span className={`promotion-piece piece--${isWhitePromotion ? 'white' : 'black'}`}>
            {isWhitePromotion
              ? PIECES[PROMOTION_PIECES[promoIndex]]
              : PIECES[PROMOTION_PIECES[promoIndex].toLowerCase()]
            }
          </span>
        </div>
      )}

      {isLegalTarget && !isCapture && !isPromoSquare && (
        <div className="move-dot" />
      )}
      {isCapture && !isPromoSquare && (
        <div className="capture-ring" />
      )}
    </div>
  );
});

// ---- Chessboard Component ----

function Chessboard({ gameState, onMove, lastMove, pendingPromotion, onPromotionSelect, onPromotionCancel }) {
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const dragSource = useRef(null);

  const tryMove = useCallback((fromRow, fromCol, toRow, toCol) => {
    const success = onMove(fromRow, fromCol, toRow, toCol);
    if (success) {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
    return success;
  }, [onMove]);

  const handleSquareClick = useCallback((rowIdx, colIdx) => {
    if (pendingPromotion) return;

    const piece = gameState.board[rowIdx][colIdx];

    if (selectedSquare) {
      const [selRow, selCol] = selectedSquare;

      if (selRow === rowIdx && selCol === colIdx) {
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      if (tryMove(selRow, selCol, rowIdx, colIdx)) return;
    }

    if (piece && pieceColor(piece) === gameState.turn) {
      const moves = getLegalMoves(gameState, rowIdx, colIdx);
      setSelectedSquare([rowIdx, colIdx]);
      setLegalMoves(moves);
      return;
    }

    setSelectedSquare(null);
    setLegalMoves([]);
  }, [gameState, selectedSquare, tryMove, pendingPromotion]);

  const handleDragStart = useCallback((e, rowIdx, colIdx) => {
    if (pendingPromotion) { e.preventDefault(); return; }
    const piece = gameState.board[rowIdx][colIdx];
    if (!piece || pieceColor(piece) !== gameState.turn) {
      e.preventDefault();
      return;
    }

    dragSource.current = [rowIdx, colIdx];
    const moves = getLegalMoves(gameState, rowIdx, colIdx);
    setSelectedSquare([rowIdx, colIdx]);
    setLegalMoves(moves);

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${rowIdx},${colIdx}`);
    if (e.target) {
      e.dataTransfer.setDragImage(e.target, 30, 30);
    }
  }, [gameState, pendingPromotion]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e, toRow, toCol) => {
    e.preventDefault();
    if (!dragSource.current) return;

    const [fromRow, fromCol] = dragSource.current;
    tryMove(fromRow, fromCol, toRow, toCol);
    dragSource.current = null;
  }, [tryMove]);

  const handleDragEnd = useCallback(() => {
    dragSource.current = null;
    if (!pendingPromotion) {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  }, [pendingPromotion]);

  const legalMoveSet = new Set(legalMoves.map(([r, c]) => `${r},${c}`));

  // Promotion picker state
  const isWhitePromotion = pendingPromotion && pendingPromotion.toRow === 0;
  const promoCol = pendingPromotion ? pendingPromotion.toCol : -1;

  return (
    <div className="board-wrapper">
      <div className="board-container">
        <div className="rank-labels">
          {RANKS.map((rank) => (
            <span key={rank} className="rank-label">{rank}</span>
          ))}
        </div>

        <div className="board-grid">
          {pendingPromotion && (
            <div className="promotion-overlay" onClick={onPromotionCancel} />
          )}

          {gameState.board.map((row, rowIdx) =>
            row.map((piece, colIdx) => {
              const promoIndex = pendingPromotion && colIdx === promoCol
                ? (isWhitePromotion
                  ? (rowIdx >= 0 && rowIdx < 4 ? rowIdx : -1)
                  : (rowIdx >= 4 && rowIdx < 8 ? 7 - rowIdx : -1))
                : -1;

              return (
                <Square
                  key={`${FILES[colIdx]}${RANKS[rowIdx]}`}
                  rowIdx={rowIdx}
                  colIdx={colIdx}
                  piece={piece}
                  turn={gameState.turn}
                  isSelected={selectedSquare && selectedSquare[0] === rowIdx && selectedSquare[1] === colIdx}
                  isLegalTarget={legalMoveSet.has(`${rowIdx},${colIdx}`)}
                  isLastMoveSquare={lastMove && (
                    (lastMove.from[0] === rowIdx && lastMove.from[1] === colIdx) ||
                    (lastMove.to[0] === rowIdx && lastMove.to[1] === colIdx)
                  )}
                  promoIndex={promoIndex}
                  isWhitePromotion={isWhitePromotion}
                  pendingPromotion={!!pendingPromotion}
                  onClick={() => handleSquareClick(rowIdx, colIdx)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, rowIdx, colIdx)}
                  onDragStart={(e) => handleDragStart(e, rowIdx, colIdx)}
                  onDragEnd={handleDragEnd}
                  onPromotionSelect={onPromotionSelect}
                />
              );
            })
          )}
        </div>

        <div className="file-labels">
          <div className="file-labels-spacer" />
          {FILES.map((file) => (
            <span key={file} className="file-label">{file}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Chessboard;
