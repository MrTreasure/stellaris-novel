import { AlertIcon } from '@/components/Icons';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认删除',
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="panel w-full max-w-md p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#8e5c54] bg-[#351918] text-[#efa098]">
            <AlertIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 id="confirm-title" className="text-lg font-semibold text-[#e4eeee]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#8da4a5]">{description}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>取消</button>
          <button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? '正在删除' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
