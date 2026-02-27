import './CapturedMaterial.css';

// Standard piece values
const PIECE_VALUES = { P: 1, N: 3, B: 3, R: 5, Q: 9, p: 1, n: 3, b: 3, r: 5, q: 9 };

const PIECES = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

// Sort order: Q, R, B, N, P (highest value first)
const SORT_ORDER = { Q: 0, R: 1, B: 2, N: 3, P: 4, q: 0, r: 1, b: 2, n: 3, p: 4 };

function sortPieces(pieces) {
  return [...pieces].sort((a, b) => (SORT_ORDER[a] ?? 5) - (SORT_ORDER[b] ?? 5));
}

function CapturedMaterial({ capturedByWhite = [], capturedByBlack = [] }) {
  const whiteValue = capturedByWhite.reduce((sum, p) => sum + (PIECE_VALUES[p] || 0), 0);
  const blackValue = capturedByBlack.reduce((sum, p) => sum + (PIECE_VALUES[p] || 0), 0);
  const advantage = whiteValue - blackValue;

  const sortedWhiteCaptures = sortPieces(capturedByWhite);
  const sortedBlackCaptures = sortPieces(capturedByBlack);

  return (
    <div className="captured-material">
      {/* Black's captured pieces (white pieces taken by black) */}
      <div className="captured-material__section">
        <span className="captured-material__label">Black</span>
        <div className="captured-material__pieces">
          {sortedBlackCaptures.length === 0 ? (
            <span className="captured-material__empty">—</span>
          ) : (
            sortedBlackCaptures.map((piece, i) => (
              <span key={i} className="captured-material__piece captured-material__piece--white">
                {PIECES[piece]}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Material advantage */}
      <div className="captured-material__advantage">
        <span className={`captured-material__value ${advantage > 0 ? 'captured-material__value--white' :
            advantage < 0 ? 'captured-material__value--black' : ''
          }`}>
          {advantage === 0 ? '=' : advantage > 0 ? `+${advantage}` : `${advantage}`}
        </span>
      </div>

      {/* White's captured pieces (black pieces taken by white) */}
      <div className="captured-material__section">
        <span className="captured-material__label">White</span>
        <div className="captured-material__pieces">
          {sortedWhiteCaptures.length === 0 ? (
            <span className="captured-material__empty">—</span>
          ) : (
            sortedWhiteCaptures.map((piece, i) => (
              <span key={i} className="captured-material__piece captured-material__piece--black">
                {PIECES[piece]}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default CapturedMaterial;
