import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ConfirmCloseModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmCloseModal({
  isOpen,
  onConfirm,
  onCancel,
  title = "Confirmação de Fechamento",
  message = "Deseja fechar sem atualizar/Gravar?",
  confirmLabel = "Sim, Fechar sem Gravar",
  cancelLabel = "Não, Continuar Editando"
}: ConfirmCloseModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div 
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-md bg-white border-t-4 border-amber-500 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        <div className="bg-[#1b2a4e] p-5 text-white flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider">{title}</h3>
            <p className="text-[10px] uppercase font-bold text-white/50 tracking-widest">Alterações pendentes</p>
          </div>
        </div>

        <div className="p-6 space-y-3 bg-white">
          <p className="text-base font-bold text-slate-800 tracking-tight leading-snug">
            {message}
          </p>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Se você fechar a tela agora, todos os dados preenchidos ou modificados nesta sessão não serão salvos.
          </p>
        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="rounded-none uppercase text-[10px] font-black tracking-widest h-10 px-5 border-slate-300 hover:bg-slate-100"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            className="rounded-none uppercase text-[10px] font-black tracking-widest h-10 px-5 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmCloseModal;
