import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, Building2, Check, X, ShieldCheck, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { sapService } from '../services/sapService';
import { formatTaxId, matchPartnerQuery } from '../utils/taxUtils';

export interface CustomerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (customer: { cardCode: string; cardName: string; federalTaxId: string }) => void;
  title?: string;
  partnerType?: 'customer' | 'supplier' | 'all';
}

export function CustomerSelectionModal({
  isOpen,
  onClose,
  onSelect,
  title = "Selecionar Cliente",
  partnerType = "customer"
}: CustomerSelectionModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [rawResults, setRawResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  const loadData = async (query = '') => {
    setIsLoading(true);
    try {
      const data = await sapService.searchBusinessPartnersWithTaxId(query, partnerType);
      setRawResults(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn('Erro ao buscar parceiros no modal:', error);
      setRawResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedCode(null);
      setCurrentPage(1);
      loadData('');
    } else {
      setSearchTerm('');
      setRawResults([]);
      setSelectedCode(null);
      setCurrentPage(1);
    }
  }, [isOpen, partnerType]);

  // For supplier type, debounce search to SAP if typed
  useEffect(() => {
    if (!isOpen) return;
    if (partnerType === 'customer') return; // Customers are fully loaded and matched client-side instantly
    const timer = setTimeout(() => {
      loadData(searchTerm.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm, isOpen, partnerType]);

  // Client-side smart/fuzzy/CNPJ filter across all loaded records
  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return rawResults;
    return rawResults.filter((bp: any) => matchPartnerQuery(bp, searchTerm));
  }, [rawResults, searchTerm]);

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));

  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

  const handleSelectItem = (bp: any) => {
    setSelectedCode(bp.CardCode);
    onSelect({
      cardCode: bp.CardCode || '',
      cardName: bp.CardName || '',
      federalTaxId: bp.FederalTaxID || ''
    });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredList.length >= 1) {
        handleSelectItem(filteredList[0]);
      }
    }
  };

  // Generate page numbers window
  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  const startRecord = filteredList.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, filteredList.length);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[92vh] flex flex-col p-0 rounded-none border-t-4 border-evo-teal shadow-2xl bg-white overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-6 bg-slate-50 border-b border-evo-bg flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-evo-teal/10 text-evo-teal">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black uppercase tracking-tight text-evo-dark">
                  {title}
                </DialogTitle>
                <p className="text-[11px] font-bold text-evo-dark/40 uppercase tracking-widest mt-0.5">
                  Selecione por Código, Razão Social ou CNPJ
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase px-2.5 py-1 bg-evo-dark text-white tracking-widest">
                {isLoading ? 'Consultando SAP...' : searchTerm.trim() ? `${filteredList.length} de ${rawResults.length} Registro(s)` : `${filteredList.length} Registro(s)`}
              </span>
            </div>
          </div>

          {/* Search bar inside header */}
          <div className="relative mt-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-evo-dark/30" />
            <Input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite o código (ex: C001, C000016), nome (ex: ForSea) ou CNPJ..."
              className="pl-10 pr-10 h-11 rounded-none border-evo-bg font-bold text-xs uppercase tracking-wider focus:border-evo-teal"
              autoFocus
            />
            {searchTerm && (
              <button 
                type="button" 
                onClick={() => setSearchTerm('')} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-evo-dark/30 hover:text-evo-dark"
                title="Limpar pesquisa"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </DialogHeader>

        {/* Results List / Table */}
        <div className="flex-1 overflow-y-auto divide-y divide-evo-bg min-h-[360px] max-h-[520px]">
          {isLoading && rawResults.length === 0 ? (
            <div className="py-24 text-center flex flex-col items-center justify-center gap-3 text-evo-dark/40">
              <Loader2 className="w-6 h-6 animate-spin text-evo-teal" />
              <p className="text-xs font-black uppercase tracking-widest">Carregando parceiros no SAP...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-24 text-center text-evo-dark/30 flex flex-col items-center justify-center gap-2">
              <Building2 className="w-8 h-8 opacity-20" />
              <p className="text-xs font-black uppercase tracking-widest">Nenhum cliente ou parceiro localizado</p>
              <p className="text-[10px] font-bold text-evo-dark/20 uppercase tracking-wider">
                Verifique os termos da busca digitados acima (ex: código, nome ou CNPJ)
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-evo-dark/5 sticky top-0 z-10 text-[10px] font-black uppercase tracking-widest text-evo-dark/60 border-b border-evo-bg">
                <tr>
                  <th className="px-5 py-3">Código</th>
                  <th className="px-5 py-3">Nome / Razão Social</th>
                  <th className="px-5 py-3">CNPJ / CPF</th>
                  <th className="px-5 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-evo-bg">
                {paginatedList.map((bp) => {
                  const isSelected = selectedCode === bp.CardCode;
                  const formattedTax = formatTaxId(bp.FederalTaxID);
                  return (
                    <tr
                      key={bp.CardCode}
                      onClick={() => handleSelectItem(bp)}
                      className={`hover:bg-evo-teal/5 transition-colors cursor-pointer group ${
                        isSelected ? 'bg-evo-teal/10' : ''
                      }`}
                    >
                      <td className="px-5 py-3.5 font-black text-xs text-evo-dark font-mono whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-evo-dark/5 border border-evo-dark/10 group-hover:border-evo-teal/40 group-hover:text-evo-teal transition-colors">
                          {bp.CardCode}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-black text-xs text-evo-dark uppercase group-hover:text-evo-teal transition-colors leading-tight">
                          {bp.CardName || '-'}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] font-bold text-evo-dark/70 whitespace-nowrap">
                        {formattedTax !== '-' ? (
                          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 border border-slate-200">
                            <ShieldCheck className="w-3 h-3 text-evo-teal" />
                            {formattedTax}
                          </span>
                        ) : (
                          <span className="text-evo-dark/20">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectItem(bp);
                          }}
                          className="h-8 px-4 rounded-none bg-evo-dark hover:bg-evo-teal hover:text-evo-dark text-white font-black text-[10px] uppercase tracking-widest transition-all"
                        >
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Selecionar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination & Footer */}
        <div className="p-4 bg-slate-50 border-t border-evo-bg flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-bold text-evo-dark/70 uppercase tracking-widest flex-shrink-0">
          <div className="flex items-center gap-2">
            <span>
              Exibindo <strong className="text-evo-dark">{startRecord} - {endRecord}</strong> de <strong className="text-evo-dark">{filteredList.length}</strong> registro(s)
            </span>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0 rounded-none border-evo-bg disabled:opacity-30"
                title="Primeira Página"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0 rounded-none border-evo-bg disabled:opacity-30"
                title="Página Anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>

              {pageNumbers.map(page => (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className={`h-8 min-w-[32px] px-2 rounded-none text-[10px] font-black ${
                    page === currentPage
                      ? 'bg-evo-dark text-white'
                      : 'border-evo-bg hover:bg-slate-200'
                  }`}
                >
                  {page}
                </Button>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0 rounded-none border-evo-bg disabled:opacity-30"
                title="Próxima Página"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0 rounded-none border-evo-bg disabled:opacity-30"
                title="Última Página"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-none border-evo-bg font-bold uppercase text-[10px] tracking-widest h-8 px-5 hover:bg-slate-200"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
