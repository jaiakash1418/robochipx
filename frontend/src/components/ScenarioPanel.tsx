import { useState, useEffect } from 'react';
import { Save, Upload, Trash2, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSimulation } from '../context/SimulationContext';
import InfoTooltip from './InfoTooltip';

export default function ScenarioPanel() {
  const { t } = useTranslation();
  const { state, saveScenario, loadScenario, listScenarios, deleteScenario } =
    useSimulation();
  const { step, stats } = state;
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    setScenarios(listScenarios());
  }, [listScenarios, step]);

  const handleSave = () => {
    const n = name.trim() || `Scenario ${new Date().toLocaleString()}`;
    saveScenario(n);
    setName('');
    setScenarios(listScenarios());
  };

  const handleLoad = (n: string) => {
    loadScenario(n);
  };

  const handleDelete = (n: string) => {
    deleteScenario(n);
    setScenarios(listScenarios());
  };

  return (
    <div className="panel scenario-panel">
      <h3>
        <FileText size={14} /> Scenarios
        <InfoTooltip text={t('tooltips.scenario')} />
      </h3>

      <div className="scenario-save-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Scenario name..."
          className="scenario-input"
        />
        <button className="btn btn-primary" onClick={handleSave} disabled={step === 0}>
          <Save size={14} /> Save
        </button>
      </div>

      {scenarios.length > 0 && (
        <div className="scenario-list">
          {scenarios.map((n) => (
            <div key={n} className="scenario-item">
              <div className="scenario-item-info" onClick={() => handleLoad(n)}>
                <Upload size={14} />
                <span>{n}</span>
              </div>
              <button
                className="btn scenario-delete"
                onClick={() => handleDelete(n)}
                title="Delete scenario"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {scenarios.length === 0 && (
        <p className="scenario-empty">
          No saved scenarios yet. Run a simulation and save it.
        </p>
      )}
    </div>
  );
}