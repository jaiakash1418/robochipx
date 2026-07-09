import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface Toast {
  id: number;
  message: string;
  severity: 'danger' | 'warning' | 'info';
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, severity: Toast['severity']) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, severity: Toast['severity']) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, severity }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="toast-container">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className={`toast toast-${t.severity}`}
              onClick={() => removeToast(t.id)}
              initial={{ x: '120%', opacity: 0, scale: 0.8 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: '120%', opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', damping: 20, stiffness: 260 }}
              layout
            >
              <span className="toast-icon">
                {t.severity === 'danger' ? '⚠️' : t.severity === 'warning' ? '⚡' : 'ℹ️'}
              </span>
              <span className="toast-message">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
