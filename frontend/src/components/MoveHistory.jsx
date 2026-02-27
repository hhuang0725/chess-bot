import { useEffect, useRef } from 'react';
import './MoveHistory.css';

function MoveHistory({ moves = [] }) {
  const bodyRef = useRef(null);

  // Auto-scroll to the latest move
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [moves.length]);

  // Group moves into pairs: [ {num, white, black}, ... ]
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i]?.notation || '',
      black: moves[i + 1]?.notation || '',
    });
  }

  return (
    <div className="move-history">
      <div className="move-history__header">
        <h2 className="move-history__title">Move History</h2>
        <span className="move-history__badge">{moves.length} move{moves.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="move-history__body" ref={bodyRef}>
        {moves.length === 0 ? (
          <div className="move-history__empty">
            <div className="move-history__empty-icon">♟</div>
            <p className="move-history__empty-text">
              No moves yet
            </p>
            <p className="move-history__empty-hint">
              Make a move to begin the game
            </p>
          </div>
        ) : (
          <table className="move-history__table">
            <thead>
              <tr>
                <th className="move-history__th move-history__th--num">#</th>
                <th className="move-history__th">White</th>
                <th className="move-history__th">Black</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.num} className="move-history__row">
                  <td className="move-history__td move-history__td--num">{row.num}.</td>
                  <td className="move-history__td">{row.white}</td>
                  <td className="move-history__td">{row.black}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default MoveHistory;
