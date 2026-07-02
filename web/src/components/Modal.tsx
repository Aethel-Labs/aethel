import { ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  closeDisabled?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

const Modal = ({
  open,
  onClose,
  title,
  children,
  closeDisabled = false,
  size = 'md',
}: ModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    if (!closeDisabled) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      className="modal-dialog"
    >
      <div className={`modal-panel ${sizeMap[size]}`}>
        <div className="modal-header">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            onClick={handleClose}
            className="rounded p-1 text-faint transition-colors hover:bg-surface-hover hover:text-ink disabled:pointer-events-none disabled:opacity-50"
            aria-label="Close"
            disabled={closeDisabled}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  );
};

export default Modal;
