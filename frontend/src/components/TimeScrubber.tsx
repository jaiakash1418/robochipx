import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSimulation } from '../context/SimulationContext';

export default function TimeScrubber() {
  const { state, doScrubTo } = useSimulation();
  const { history, historyIndex } = state;

  if (history.length < 2) return null;

  return (
    <div className="time-scrubber">
      <div className="scrubber-left">
        <History size={14} />
        <span className="scrubber-label">Timeline</span>
      </div>
      <div className="scrubber-controls">
        <button
          className="btn scrubber-btn"
          onClick={() => doScrubTo(Math.max(0, historyIndex - 1))}
          disabled={historyIndex <= 0}
        >
          <ChevronLeft size={14} />
        </button>
        <input
          type="range"
          className="scrubber-range"
          min={0}
          max={history.length - 1}
          value={historyIndex}
          onChange={(e) => doScrubTo(Number(e.target.value))}
        />
        <button
          className="btn scrubber-btn"
          onClick={() =>
            doScrubTo(Math.min(history.length - 1, historyIndex + 1))
          }
          disabled={historyIndex >= history.length - 1}
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <span className="scrubber-step">
        Step {historyIndex + 1} / {history.length}
      </span>
    </div>
  );
}