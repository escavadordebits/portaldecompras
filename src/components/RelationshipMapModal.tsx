import React, { useEffect, useState } from 'react';
import { X, GitBranch, ArrowRight, FileText, CheckCircle2, Clock, RefreshCw, Building2, Calendar, DollarSign } from 'lucide-react';
import { sapService } from '../services/sapService';

interface RelationshipMapModalProps {
  doc: any;
  currentTypeHint?: 'request' | 'quotation' | 'order' | 'downpayment' | string;
  onClose: () => void;
}

export const RelationshipMapModal: React.FC<RelationshipMapModalProps> = ({
  doc,
  currentTypeHint = 'order',
  onClose
}) => {
  const [loading, setLoading] = useState(true);
  const [mapData, setMapData] = useState<{
    baseDocs: any[];
    currentDoc: any;
    targetDocs: any[];
  } | null>(null);

  const loadMap = async () => {
    if (!doc) return;
    setLoading(true);
    try {
      const data = await sapService.getDocumentRelationshipMap(doc, currentTypeHint);
      setMapData(data);
    } catch (err) {
      console.error('Erro ao carregar Mapa de Relação:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMap();
  }, [doc, currentTypeHint]);

  if (!doc) return null;

  const formatDate = (d?: string) => {
    if (!d) return '-';
    const s = String(d).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, day] = s.split('-');
      return `${day}/${m}/${y}`;
    }
    return s;
  };

  const renderNodeCard = (node: any, role: 'base' | 'current' | 'target') => {
    const isCurrent = role === 'current';
    const isClosed = node.status === 'Fechado';
    const borderClass = isCurrent
      ? 'border-2 border-[#0ea5e9] bg-[#f0f9ff] shadow-lg ring-4 ring-[#0ea5e9]/15'
      : role === 'base'
      ? 'border border-amber-300 bg-amber-50/50 hover:shadow-md'
      : 'border border-emerald-300 bg-emerald-50/50 hover:shadow-md';

    const headerBg = isCurrent
      ? 'bg-[#0ea5e9] text-white'
      : role === 'base'
      ? 'bg-amber-600 text-white'
      : 'bg-emerald-600 text-white';

    return (
      <div
        key={`${role}-${node.typeLabel}-${node.docEntry}`}
        className={`rounded-2xl overflow-hidden transition-all w-full max-w-[290px] ${borderClass}`}
      >
        <div className={`px-4 py-2.5 flex items-center justify-between text-[11px] font-black uppercase tracking-wider ${headerBg}`}>
          <span className="truncate flex items-center gap-1.5">
            <FileText size={13} />
            {node.typeLabel}
          </span>
          {node.isDraft && (
            <span className="px-1.5 py-0.5 rounded bg-white/20 text-[9px] font-black">
              ESBOÇO
            </span>
          )}
        </div>
        <div className="p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Nº Documento
            </span>
            <span className="text-sm font-black text-[#121926]">
              #{node.docNum || node.docEntry}
              {node.docEntry && node.docNum && node.docEntry !== node.docNum ? (
                <span className="text-[10px] font-bold text-slate-400 ml-1">(ID: {node.docEntry})</span>
              ) : null}
            </span>
          </div>

          <div className="flex items-start gap-2 text-slate-700">
            <Building2 size={13} className="text-slate-400 shrink-0 mt-0.5" />
            <span className="font-bold text-[11px] line-clamp-2 leading-tight">
              {node.partnerName || '-'}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
            <span className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold">
              <Calendar size={12} className="text-slate-400" />
              {formatDate(node.date)}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                isClosed
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {isClosed ? <CheckCircle2 size={11} /> : <Clock size={11} />}
              {node.status}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <DollarSign size={11} /> Total
            </span>
            <span className="text-xs font-black text-[#0f172a]">
              {node.currency || 'R$'}{' '}
              {Number(node.total || 0).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-[#121926]/75 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#121926] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0ea5e9]/20 border border-[#0ea5e9]/40 flex items-center justify-center text-[#38bdf8]">
              <GitBranch size={20} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-wider">
                Mapa de Relações de Compras (SAP Business One)
              </h3>
              <p className="text-[11px] text-slate-300 font-medium">
                Rastreabilidade completa entre Documento Base, Documento Atual e Documento de Destino
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadMap}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
              title="Atualizar Mapa de Relação"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/70">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
              <RefreshCw size={28} className="animate-spin text-[#0ea5e9]" />
              <p className="text-xs font-black uppercase tracking-widest">
                Consultando vínculos de documentos no SAP Business One...
              </p>
            </div>
          ) : mapData ? (
            <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
              {/* Column 1: Base Documents */}
              <div className="md:col-span-3 flex flex-col items-center gap-3">
                <div className="text-[11px] font-black uppercase tracking-widest text-amber-700 bg-amber-100/80 px-3 py-1 rounded-full border border-amber-200">
                  Documento(s) Base (Origem)
                </div>
                {mapData.baseDocs.length === 0 ? (
                  <div className="w-full max-w-[270px] rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-slate-400">
                    <p className="text-xs font-bold">Sem Documento Base</p>
                    <p className="text-[10px] mt-1">
                      Este documento foi originado diretamente sem vínculo anterior.
                    </p>
                  </div>
                ) : (
                  mapData.baseDocs.map(b => renderNodeCard(b, 'base'))
                )}
              </div>

              {/* Arrow 1 */}
              <div className="md:col-span-1 flex flex-col items-center justify-center py-2">
                <div className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-[#0ea5e9]">
                  <ArrowRight size={20} />
                </div>
              </div>

              {/* Column 2: Current Document */}
              <div className="md:col-span-3 flex flex-col items-center gap-3">
                <div className="text-[11px] font-black uppercase tracking-widest text-[#0284c7] bg-[#e0f2fe] px-3 py-1 rounded-full border border-[#bae6fd]">
                  Documento Selecionado
                </div>
                {renderNodeCard(mapData.currentDoc, 'current')}
              </div>

              {/* Arrow 2 */}
              <div className="md:col-span-1 flex flex-col items-center justify-center py-2">
                <div className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-emerald-600">
                  <ArrowRight size={20} />
                </div>
              </div>

              {/* Column 3: Target Documents */}
              <div className="md:col-span-3 flex flex-col items-center gap-3">
                <div className="text-[11px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100/80 px-3 py-1 rounded-full border border-emerald-200">
                  Documento(s) Destino
                </div>
                {mapData.targetDocs.length === 0 ? (
                  <div className="w-full max-w-[270px] rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-slate-400">
                    <p className="text-xs font-bold">Nenhum Documento de Destino</p>
                    <p className="text-[10px] mt-1">
                      Ainda não há cotação, pedido ou adiantamento posterior vinculado.
                    </p>
                  </div>
                ) : (
                  mapData.targetDocs.map(t => renderNodeCard(t, 'target'))
                )}
              </div>
            </div>
          ) : null}

          {/* Raw Observations / Reference Info */}
          {doc.Comments && (
            <div className="mt-6 p-4 rounded-2xl bg-white border border-slate-200">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                Observações / Referências Gravadas no Documento
              </div>
              <p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap">
                {doc.Comments}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium">
            Fluxo padrão SAP B1: Solicitação de Compra → Oferta de Compra (Cotação) → Pedido de Compra → Adiantamento / Recebimento
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#121926] hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider transition-all"
          >
            Fechar Mapa
          </button>
        </div>
      </div>
    </div>
  );
};

