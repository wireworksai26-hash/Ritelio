import { useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/format';
import { Icon } from '../icons/Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

const maxWidths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

export function Modal({ open, onClose, title, children, maxWidth = 'lg' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden="true" />
      <div
        className={cn(
          'relative w-full bg-paper border border-ash rounded-t-2xl sm:rounded-2xl',
          'max-h-[90dvh] overflow-y-auto overscroll-contain px-4 pt-3 sm:p-6',
          maxWidths[maxWidth],
        )}
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-ash" aria-hidden="true" />
        {(title || true) && (
          <div className="flex items-start justify-between gap-4 mb-4">
            {title ? <h3 className="text-heading-sm font-light text-ink">{title}</h3> : <span />}
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="text-fossil hover:text-ink transition-colors p-2 -m-2"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
