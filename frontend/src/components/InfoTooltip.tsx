import { useState, useRef, useEffect } from 'react';
import { Info, X } from 'lucide-react';

interface InfoTooltipProps {
  text: string;
}

export default function InfoTooltip({ text }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  return (
    <span className="info-tooltip-wrapper">
      <Info
        size={12}
        className="info-tooltip-icon"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      />
      {open && (
        <div className="info-tooltip-overlay" onClick={() => setOpen(false)}>
          <div className="info-tooltip-content" ref={contentRef} onClick={(e) => e.stopPropagation()}>
            <button className="info-tooltip-close" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
            {text}
          </div>
        </div>
      )}
    </span>
  );
}
