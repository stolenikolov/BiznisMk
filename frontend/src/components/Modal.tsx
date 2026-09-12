import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  labelledBy: string;
  /** Widens the panel for multi-column forms. */
  wide?: boolean;
}

export function Modal({ onClose, children, labelledBy, wide = false }: ModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-panel${wide ? ' modal-panel--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
