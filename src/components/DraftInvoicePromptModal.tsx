import React from 'react';
import { CheckCircle2, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DraftInvoicePromptModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  order?: any;
}

export function DraftInvoicePromptModal({
  isOpen,
  onConfirm,
  onCancel,
  order
}: DraftInvoicePromptModalProps) {
  if (!isOpen) return null;

  const docNum = order?.DocNum || order?.DocEntry;
  const cardName = order?.CardName;

  return (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div 
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md bg-white border-t-4 border-evo-teal shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="bg-[#1b2a4e] p-5 text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider">Draft Invoice Gerado</h3>
            <p className="text-[10px] uppercase font-bold text-white/50 tracking-widest">
              {docNum ? `Pedido de Venda #${docNum}` : 'Sucesso no SAP B1'}
            </p>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4 bg-white">
          <div className="space-y-1.5">
            <h4 className="text-lg font-black text-slate-800 tracking-tight leading-snug">
              Draft Invoice gerado com sucesso!! Deseja Abrir?
            </h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              O pedido de venda foi registrado no SAP. Deseja abrir a janela do espelho exibindo os itens com as opções e botões de layout (impressão, PDF e envio por e-mail)?
            </p>
          </div>

          {(docNum || cardName) && (
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-none flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 overflow-hidden">
                <FileText className="w-4 h-4 text-evo-teal shrink-0" />
                <div className="truncate">
                  {docNum && (
                    <span className="font-mono font-bold text-slate-800 mr-2">
                      Doc #{docNum}
                    </span>
                  )}
                  {cardName && (
                    <span className="text-slate-600 truncate block sm:inline text-[11px]">
                      {cardName}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 shrink-0">
                Criado
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="rounded-none uppercase text-[10px] font-black tracking-wider px-5 h-10 border-slate-300 hover:bg-slate-100 text-slate-600"
          >
            Não, Fechar
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className="evo-button-primary rounded-none uppercase text-[10px] font-black tracking-wider px-6 h-10 shadow-md flex items-center justify-center gap-1.5"
          >
            <span>Sim, Abrir</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DraftInvoicePromptModal;
