import { useState, useRef, useEffect } from 'react';
import { Bot, Send, MessageSquare, Map, ChevronLeft, ChevronRight } from 'lucide-react';
import MapView from '../components/MapView';
import Legend from '../components/Legend';
import { useSimulation } from '../context/SimulationContext';
import { queryLLM } from '../api/endpoints';
import type { LiveFire } from '../api/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIPage() {
  const { state } = useSimulation();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I\'m your wildfire AI assistant. I have access to live simulation data including weather conditions, fire spread, and your location. Ask me about the current fire situation, risks, or recommendations.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [gridCenter, setGridCenter] = useState<[number, number]>([38, -121.5]);
  const [flyToFire, setFlyToFire] = useState<[number, number] | null>(null);
  const liveFires: LiveFire[] = [];
  const userLocation: [number, number] | null = state.userLocation
    ? [state.userLocation.lat, state.userLocation.lon]
    : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const context: Record<string, unknown> = {};
      if (state.userLocation) {
        context.lat = state.userLocation.lat;
        context.lon = state.userLocation.lon;
      }
      const res = await queryLLM({ query: input, context });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t process your request. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-page">
      <div className="ai-page-header">
        <div className="ai-page-header-left">
          <Bot size={18} />
          <span className="ai-page-title">AI Assistant</span>
          <span className="ai-page-subtitle">RAG-powered wildfire analysis</span>
        </div>
        <button className="btn ai-toggle-map-btn" onClick={() => setShowMap((p) => !p)}>
          {showMap ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          <Map size={14} />
          {showMap ? 'Hide' : 'Show'} Map
        </button>
      </div>

      <div className="ai-page-body">
        {showMap && (
          <div className="ai-page-map">
            <div className="ai-page-map-inner">
              <MapView
                igniteMode="point"
                gridCenter={gridCenter}
                onGridCenterChange={setGridCenter}
                liveFires={liveFires}
                flyToFire={flyToFire}
                onFlyDone={() => setFlyToFire(null)}
                userLocation={userLocation}
              />
              <Legend />
            </div>
          </div>
        )}

        <div className="ai-page-chat">
          <div className="ai-chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`ai-chat-msg ${msg.role}`}>
                <div className="ai-chat-msg-header">
                  {msg.role === 'assistant' ? <Bot size={14} /> : <MessageSquare size={14} />}
                  <strong>{msg.role === 'user' ? 'You' : 'AI Assistant'}</strong>
                </div>
                <div className="ai-chat-msg-content">{msg.content}</div>
              </div>
            ))}
            {loading && (
              <div className="ai-chat-msg assistant">
                <div className="ai-chat-msg-header">
                  <Bot size={14} />
                  <strong>AI Assistant</strong>
                </div>
                <div className="ai-chat-msg-content">
                  <span className="ai-chat-thinking">Thinking</span>
                  <span className="ai-chat-dots">
                    <span>.</span><span>.</span><span>.</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="ai-chat-input-row">
            <input
              ref={inputRef}
              type="text"
              className="ai-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about the fire situation..."
              disabled={loading}
            />
            <button
              className="btn btn-primary ai-chat-send-btn"
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
