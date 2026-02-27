import './GameModeSelect.css';

const MODES = [
  {
    id: 'white-vs-bot',
    icon: '♔',
    title: 'Play as White',
    description: 'You play White against the AI engine',
    accent: 'white',
  },
  {
    id: 'black-vs-bot',
    icon: '♚',
    title: 'Play as Black',
    description: 'You play Black against the AI engine',
    accent: 'black',
  },
  {
    id: 'two-player',
    icon: '⚔',
    title: '2 Player',
    description: 'Play against a friend locally',
    accent: 'neutral',
  },
];

function GameModeSelect({ onSelect }) {
  return (
    <div className="mode-select">
      <div className="mode-select__header">
        <h1 className="mode-select__title">Chess Engine</h1>
        <p className="mode-select__subtitle">Select Game Mode</p>
      </div>

      <div className="mode-select__cards">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            className={`mode-card mode-card--${mode.accent}`}
            onClick={() => onSelect(mode.id)}
          >
            <span className="mode-card__icon">{mode.icon}</span>
            <h2 className="mode-card__title">{mode.title}</h2>
            <p className="mode-card__desc">{mode.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default GameModeSelect;
