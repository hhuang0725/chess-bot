import { useState, useCallback, useEffect, useRef } from 'react';
import { createInitialState, getLegalMoves, makeMove, getMoveNotation, getCapturedPiece, isPromotionMove, getGameStatus } from './game/chessLogic';
import { getBotMove } from './game/botApi';
import GameModeSelect from './components/GameModeSelect';
import Chessboard from './components/Chessboard';
import CapturedMaterial from './components/CapturedMaterial';
import MoveHistory from './components/MoveHistory';
import './App.css';

function App() {
  const [gameMode, setGameMode] = useState(null);
  const [gameState, setGameState] = useState(createInitialState);
  const [moveHistory, setMoveHistory] = useState([]);
  const [capturedByWhite, setCapturedByWhite] = useState([]);
  const [capturedByBlack, setCapturedByBlack] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [botThinking, setBotThinking] = useState(false);

  // Track the latest gameState for async bot callbacks
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  // Which color does the bot play?
  const botColor = gameMode === 'white-vs-bot' ? 'b'
    : gameMode === 'black-vs-bot' ? 'w'
      : null; // null = 2-player, no bot

  // We need a version of finalizeMove that can work with a given state
  // (for bot moves that happen after async delay)
  const applyMove = useCallback((state, fromRow, fromCol, toRow, toCol, promotionPiece) => {
    const notation = getMoveNotation(state, fromRow, fromCol, toRow, toCol, promotionPiece);
    const captured = getCapturedPiece(state, fromRow, fromCol, toRow, toCol);
    const color = state.turn;

    const newState = makeMove(state, fromRow, fromCol, toRow, toCol, promotionPiece);
    setGameState(newState);
    setLastMove({ from: [fromRow, fromCol], to: [toRow, toCol] });
    setMoveHistory(prev => [...prev, { notation, color }]);

    if (captured) {
      if (color === 'w') {
        setCapturedByWhite(prev => [...prev, captured]);
      } else {
        setCapturedByBlack(prev => [...prev, captured]);
      }
    }

    // Check game end
    const result = getGameStatus(newState);
    if (result.status !== 'playing') {
      setGameResult(result);
      setShowResultPopup(true);
    }

    return newState;
  }, []);

  const onMove = useCallback((fromRow, fromCol, toRow, toCol) => {
    if (gameResult) return false;
    if (botThinking) return false;

    // Don't allow moving bot's pieces
    const piece = gameState.board[fromRow][fromCol];
    if (botColor && piece) {
      const pieceColor = piece === piece.toUpperCase() ? 'w' : 'b';
      if (pieceColor === botColor) return false;
    }

    const moves = getLegalMoves(gameState, fromRow, fromCol);
    const isLegal = moves.some(([r, c]) => r === toRow && c === toCol);
    if (!isLegal) return false;

    if (isPromotionMove(gameState, fromRow, fromCol, toRow)) {
      setPendingPromotion({ fromRow, fromCol, toRow, toCol });
      return true;
    }

    applyMove(gameState, fromRow, fromCol, toRow, toCol, null);
    return true;
  }, [gameState, applyMove, gameResult, botThinking, botColor]);

  const onPromotionSelect = useCallback((pieceType) => {
    if (!pendingPromotion) return;
    const { fromRow, fromCol, toRow, toCol } = pendingPromotion;
    const color = gameState.turn;
    const promotionPiece = color === 'w' ? pieceType.toUpperCase() : pieceType.toLowerCase();
    applyMove(gameState, fromRow, fromCol, toRow, toCol, promotionPiece);
    setPendingPromotion(null);
  }, [pendingPromotion, gameState, applyMove]);

  const onPromotionCancel = useCallback(() => {
    setPendingPromotion(null);
  }, []);

  const resetGame = useCallback(() => {
    setGameState(createInitialState());
    setMoveHistory([]);
    setCapturedByWhite([]);
    setCapturedByBlack([]);
    setLastMove(null);
    setPendingPromotion(null);
    setGameResult(null);
    setShowResultPopup(false);
    setBotThinking(false);
    setGameMode(null);
  }, []);

  const handleModeSelect = useCallback((mode) => {
    setGameState(createInitialState());
    setMoveHistory([]);
    setCapturedByWhite([]);
    setCapturedByBlack([]);
    setLastMove(null);
    setPendingPromotion(null);
    setGameResult(null);
    setShowResultPopup(false);
    setBotThinking(false);
    setGameMode(mode);
  }, []);

  // ---- Bot auto-play effect ----
  useEffect(() => {
    if (!botColor) return;
    if (gameResult) return;
    if (gameState.turn !== botColor) return;
    if (botThinking) return;

    setBotThinking(true);

    getBotMove(gameState)
      .then((move) => {
        // Use ref to get the latest state (in case something changed)
        const currentState = gameStateRef.current;
        if (currentState.turn !== botColor) {
          setBotThinking(false);
          return;
        }

        const { fromRow, fromCol, toRow, toCol, promotion } = move;
        let promotionPiece = null;
        if (promotion) {
          promotionPiece = botColor === 'w' ? promotion.toUpperCase() : promotion.toLowerCase();
        }

        applyMove(currentState, fromRow, fromCol, toRow, toCol, promotionPiece);
        setBotThinking(false);
      })
      .catch((err) => {
        console.error('Bot move error:', err);
        setBotThinking(false);
      });
  }, [gameState.turn, botColor, gameResult, botThinking, applyMove, gameState]);

  // Mode label for display
  const modeLabel = gameMode === 'white-vs-bot' ? 'White vs Engine'
    : gameMode === 'black-vs-bot' ? 'Black vs Engine'
      : '2 Player';

  // Build result message
  let resultMessage = '';
  let resultSubtext = '';
  if (gameResult) {
    if (gameResult.status === 'checkmate') {
      resultMessage = gameResult.winner === 'w' ? 'White Wins!' : 'Black Wins!';
      resultSubtext = 'by checkmate';
    } else if (gameResult.status === 'stalemate') {
      resultMessage = 'Draw';
      resultSubtext = 'by stalemate';
    } else if (gameResult.status === 'draw') {
      resultMessage = 'Draw';
      resultSubtext = 'by 50-move rule';
    }
  }

  // Show mode selection screen
  if (!gameMode) {
    return (
      <div className="app-container">
        <GameModeSelect onSelect={handleModeSelect} />
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="app-mode-bar">
        <span className="app-mode-label">{modeLabel}</span>
      </div>

      <main className="game-area">
        <div className="board-column">
          <Chessboard
            gameState={gameState}
            onMove={onMove}
            lastMove={lastMove}
            pendingPromotion={pendingPromotion}
            onPromotionSelect={onPromotionSelect}
            onPromotionCancel={onPromotionCancel}
          />
          <div className="bot-thinking" style={{ visibility: botThinking ? 'visible' : 'hidden' }}>
            <span className="bot-thinking__spinner" />
            Engine thinking…
          </div>
          {gameResult && !showResultPopup && (
            <button className="reset-button" onClick={resetGame}>
              New Game
            </button>
          )}
        </div>
        <CapturedMaterial
          capturedByWhite={capturedByWhite}
          capturedByBlack={capturedByBlack}
        />
        <MoveHistory moves={moveHistory} />
      </main>

      {/* Game Over Popup */}
      {showResultPopup && (
        <div className="game-over-overlay" onClick={() => setShowResultPopup(false)}>
          <div className="game-over-popup" onClick={(e) => e.stopPropagation()}>
            <div className="game-over-icon">
              {gameResult.status === 'checkmate' ? '♚' : '½'}
            </div>
            <h2 className="game-over-title">{resultMessage}</h2>
            <p className="game-over-subtext">{resultSubtext}</p>
            <div className="game-over-actions">
              <button className="game-over-button game-over-button--primary" onClick={resetGame}>
                New Game
              </button>
              <button className="game-over-button game-over-button--secondary" onClick={() => setShowResultPopup(false)}>
                Review Board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
