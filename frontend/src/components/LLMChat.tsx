import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useSimulation } from '../context/SimulationContext';
import { Bot, Send, X, MessageSquare } from 'lucide-react';
import InfoTooltip from './InfoTooltip';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function LLMChat() {
  const { t } = useTranslation();
  const { state, doLLMQuery } = useSimulation();
  const { llmAnswer, llmLoading } = state;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: t('chat.welcome') },
  ]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, llmAnswer]);

  useEffect(() => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant' && llmAnswer) {
        next[next.length - 1] = { ...last, content: llmAnswer };
      }
      return next;
    });
  }, [llmAnswer]);

  const handleSend = () => {
    if (!input.trim() || llmLoading) return;
    setMessages((prev) => [...prev, { role: 'user', content: input }, { role: 'assistant', content: '' }]);
    doLLMQuery(input);
    setInput('');
  };

  const lastMsg = messages[messages.length - 1];
  const streaming = llmLoading && lastMsg?.role === 'assistant' && !lastMsg.content;

  return (
    <AnimatePresence mode="wait">
      {!open ? (
        <motion.button
          key="fab"
          className="btn btn-primary chat-fab"
          onClick={() => setOpen(true)}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        >
          <MessageSquare size={18} />
          <Bot size={18} />
        </motion.button>
      ) : (
        <motion.div
          key="drawer"
          className="chat-drawer"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div className="chat-drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bot size={18} />
              <span style={{ fontWeight: 600 }}>{t('chat.title')}</span>
              <InfoTooltip text={t('tooltips.chat')} />
            </div>
            <button className="btn" onClick={() => setOpen(false)} style={{ padding: '4px 8px', flex: 0 }}>
              <X size={16} />
            </button>
          </div>

          <div className="chat-drawer-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role}`}>
                <strong>{msg.role === 'user' ? t('chat.you') : t('chat.assistant')}</strong>
                <p>
                  {msg.content ||
                    (streaming && i === messages.length - 1
                      ? `${t('chat.thinking')}...`
                      : '')}
                </p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="chat-drawer-input">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={t('chat.placeholder')}
              disabled={llmLoading}
            />
            <button
              className="btn btn-primary"
              onClick={handleSend}
              disabled={llmLoading || !input.trim()}
              style={{ flex: 0, padding: '8px 12px' }}
            >
              <Send size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
