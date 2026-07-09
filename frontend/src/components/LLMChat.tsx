import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { queryLLM } from '../api/endpoints';
import { Bot, Send, X, MessageSquare } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function LLMChat() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: t('chat.welcome') },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      const res = await queryLLM({ query: input });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: t('chat.error') }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open && (
        <button className="btn btn-primary chat-fab" onClick={() => setOpen(true)}>
          <MessageSquare size={18} />
          <Bot size={18} />
        </button>
      )}

      {open && (
        <div className="chat-drawer">
          <div className="chat-drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bot size={18} />
              <span style={{ fontWeight: 600 }}>{t('chat.title')}</span>
            </div>
            <button className="btn" onClick={() => setOpen(false)} style={{ padding: '4px 8px', flex: 0 }}>
              <X size={16} />
            </button>
          </div>

          <div className="chat-drawer-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role}`}>
                <strong>{msg.role === 'user' ? t('chat.you') : t('chat.assistant')}</strong>
                <p>{msg.content}</p>
              </div>
            ))}
            {loading && (
              <div className="chat-msg assistant">
                <em>{t('chat.thinking')}...</em>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chat-drawer-input">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={t('chat.placeholder')}
              disabled={loading}
            />
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              style={{ flex: 0, padding: '8px 12px' }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}