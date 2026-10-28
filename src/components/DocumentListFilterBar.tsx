import React, { useState } from 'react';
import { Search, RotateCw, X, Building2, Hash, FolderKanban, Tag, ShieldCheck, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CustomerSelectionModal } from './CustomerSelectionModal';
import { formatTaxId, matchPartnerQuery } from '../utils/taxUtils';
import { sapService } from '../services/sapService';

export interface DocumentFilters {
  docNum: string;
  wo: string;
  po: string;
  clientCode: string;
  clientName: string;
  clientCnpj: string;
}

export interface DocumentListFilterBarProps {
  docNumberLabel?: string;
  docNumberPlaceholder?: string;
  clientLabel?: string;
  partnerType?: 'customer' | 'supplier' | 'all';
  filters: DocumentFilters;
  onChangeFilters: (filters: DocumentFilters) => void;
  onSearch: (filters: DocumentFilters) => void;
  onClear: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
  statusFilter?: 'all' | 'open' | 'closed';
  onChangeStatusFilter?: (status: 'all' | 'open' | 'closed') => void;
  appliedFiltersSummary?: string | null;
  totalResults?: number;
}

export function DocumentListFilterBar({
  docNumberLabel = "Nº Documento",
  docNumberPlaceholder = "Ex: 1029...",
  clientLabel = "Cliente",
  partnerType = "customer",
  filters,
  onChangeFilters,
  onSearch,
  onClear,
  onRefresh,
  isLoading = false,
  statusFilter,
  onChangeStatusFilter,
  appliedFiltersSummary,
  totalResults
}: DocumentListFilterBarProps) {
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Prefetch customers on mount
  React.useEffect(() => {
    if (partnerType === 'customer') {
      sapService.getAllCustomers().catch(() => {});
    }
  }, [partnerType]);

  // Validation state: WO requires Cliente only for sales orders (customer)
  const isWoFilled = Boolean(filters.wo && filters.wo.trim() !== '');
  const isClientFilled = Boolean(
    (filters.clientCode && filters.clientCode.trim() !== '') ||
    (filters.clientName && filters.clientName.trim() !== '')
  );
  const isClientMissingForWo = partnerType === 'customer' && isWoFilled && !isClientFilled;

  const handleFieldChange = (field: keyof DocumentFilters, value: string) => {
    onChangeFilters({
      ...filters,
      [field]: value
    });
  };

  const handleClientNameChange = async (val: string) => {
    handleFieldChange('clientName', val);
    if (val.trim().length >= 2 && partnerType === 'customer') {
      try {
        const all = await sapService.getAllCustomers();
        const matches = all.filter((c: any) => matchPartnerQuery(c, val)).slice(0, 5);
        setSuggestions(matches);
        setShowSuggestions(matches.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectCustomer = (customer: { cardCode: string; cardName: string; federalTaxId: string }) => {
    setShowSuggestions(false);
    onChangeFilters({
      ...filters,
      clientCode: customer.cardCode,
      clientName: customer.cardName,
      clientCnpj: customer.federalTaxId
    });
  };

  const handleClearClient = () => {
    setShowSuggestions(false);
    onChangeFilters({
      ...filters,
      clientCode: '',
      clientName: '',
      clientCnpj: ''
    });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setShowSuggestions(false);

    // Auto-resolve typed client name/cnpj/code against customer base
    let currentFilters = { ...filters };
    if (currentFilters.clientName.trim() && !currentFilters.clientCode.trim()) {
      const match = sapService.findCustomerMatch(currentFilters.clientName);
      if (match) {
        currentFilters = {
          ...currentFilters,
          clientCode: match.CardCode || '',
          clientName: match.CardName || currentFilters.clientName,
          clientCnpj: match.FederalTaxID || ''
        };
        onChangeFilters(currentFilters);
      }
    }

    const isClientNowFilled = Boolean(
      (currentFilters.clientCode && currentFilters.clientCode.trim() !== '') ||
      (currentFilters.clientName && currentFilters.clientName.trim() !== '')
    );

    // Mandatory rule: WO requires Cliente
    if (isWoFilled && !isClientNowFilled && partnerType === 'customer') {
      toast.error('O preenchimento do Cliente é obrigatório quando a WO é informada.');
      setIsClientModalOpen(true);
      return;
    }

    onSearch(currentFilters);
  };

  const hasAnyFilter = Boolean(
    filters.docNum.trim() ||
    filters.wo.trim() ||
    filters.po.trim() ||
    filters.clientCode.trim() ||
    filters.clientName.trim() ||
    filters.clientCnpj.trim()
  );

  return (
    <div className="flex flex-col gap-4 bg-white p-6 border border-evo-bg shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 5 Discrete Filter Fields Grid with well-aligned inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
          {/* Field 1: Document Number */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/60 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-evo-teal" />
              {docNumberLabel}
            </label>
            <div className="relative">
              <Input
                value={filters.docNum}
                onChange={(e) => handleFieldChange('docNum', e.target.value)}
                placeholder={docNumberPlaceholder}
                className="rounded-none border-evo-bg h-11 text-xs font-bold uppercase tracking-wider focus:border-evo-teal"
              />
              {filters.docNum && (
                <button
                  type="button"
                  onClick={() => handleFieldChange('docNum', '')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-evo-dark/30 hover:text-evo-dark"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Field 2: Cliente / Fornecedor (Interactive + Modal Selection) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/60 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-evo-teal" />
                {clientLabel}
                {isWoFilled && partnerType === 'customer' && <span className="text-rose-500 font-black">*</span>}
              </label>
              {isClientMissingForWo && (
                <span className="text-[9px] font-black uppercase text-rose-600 flex items-center gap-1 animate-pulse">
                  <AlertCircle className="w-3 h-3" /> Obrigatório
                </span>
              )}
            </div>

            {/* If Client is selected via code */}
            {filters.clientCode ? (
              <div 
                onClick={() => setIsClientModalOpen(true)}
                className={`relative flex items-center justify-between h-11 px-3 border cursor-pointer group bg-slate-50 transition-all ${
                  isClientMissingForWo ? 'border-rose-400 bg-rose-50/20' : 'border-evo-bg hover:border-evo-teal'
                }`}
                title="Clique para alterar"
              >
                <div className="flex items-center gap-1.5 overflow-hidden mr-5">
                  <span className="font-mono text-[10px] font-black text-evo-teal bg-evo-teal/10 px-1 py-0.5 border border-evo-teal/20 shrink-0">
                    {filters.clientCode}
                  </span>
                  <span className="font-black text-xs text-evo-dark uppercase truncate">
                    {filters.clientName || 'Selecionado'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearClient();
                  }}
                  className="text-evo-dark/30 hover:text-rose-600 p-1"
                  title="Remover"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* If Client is NOT yet selected, allow typing or clicking to open modal */
              <div className="relative flex">
                <Input
                  value={filters.clientName}
                  onChange={(e) => handleClientNameChange(e.target.value)}
                  onFocus={() => {
                    if (filters.clientName.trim().length >= 2 && suggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  placeholder="Nome ou Razão Social..."
                  className={`rounded-none h-11 text-xs font-bold uppercase tracking-wider pr-16 ${
                    isClientMissingForWo 
                      ? 'border-rose-400 bg-rose-50/20 placeholder:text-rose-400' 
                      : 'border-evo-bg focus:border-evo-teal'
                  }`}
                />
                <Button
                  type="button"
                  onClick={() => {
                    setShowSuggestions(false);
                    setIsClientModalOpen(true);
                  }}
                  className="absolute right-0 top-0 h-11 rounded-none px-2.5 bg-evo-dark/5 hover:bg-evo-teal hover:text-evo-dark text-evo-dark border-l border-evo-bg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-none"
                  title="Abrir modal para selecionar Código, Razão Social e CNPJ"
                >
                  <Search className="w-3.5 h-3.5" />
                </Button>

                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-evo-bg shadow-2xl z-50 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {suggestions.map((s) => (
                      <div
                        key={s.CardCode}
                        onMouseDown={() => handleSelectCustomer({ cardCode: s.CardCode, cardName: s.CardName, federalTaxId: s.FederalTaxID })}
                        className="p-2.5 hover:bg-evo-teal/10 cursor-pointer flex items-center justify-between text-left transition-colors"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="font-mono text-[10px] font-black px-1.5 py-0.5 bg-evo-dark/5 text-evo-dark shrink-0">
                            {s.CardCode}
                          </span>
                          <span className="font-bold text-xs uppercase text-evo-dark truncate">
                            {s.CardName}
                          </span>
                        </div>
                        {s.FederalTaxID && (
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 border border-slate-200 shrink-0 ml-2">
                            {formatTaxId(s.FederalTaxID)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Field 3: CNPJ (Direct input and search) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/60 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-evo-teal" />
              CNPJ
            </label>
            <div className="relative">
              <Input
                value={filters.clientCnpj}
                onChange={(e) => handleFieldChange('clientCnpj', e.target.value)}
                placeholder="00.000.000/0000-00"
                className="rounded-none border-evo-bg h-11 text-xs font-bold font-mono tracking-wider focus:border-evo-teal"
              />
              {filters.clientCnpj && (
                <button
                  type="button"
                  onClick={() => handleFieldChange('clientCnpj', '')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-evo-dark/30 hover:text-evo-dark"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Field 4: WO (Work Order / Projeto) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/60 flex items-center gap-1.5">
                <FolderKanban className="w-3.5 h-3.5 text-evo-teal" />
                WO (Projeto)
              </label>
              {isWoFilled && partnerType === 'customer' && (
                <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-50 px-1.5 py-0.5 border border-amber-200">
                  Exige Cliente
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                value={filters.wo}
                onChange={(e) => handleFieldChange('wo', e.target.value)}
                placeholder="Ex: 2040 ou BASE..."
                className={`rounded-none h-11 text-xs font-bold uppercase tracking-wider ${
                  isClientMissingForWo ? 'border-amber-400 bg-amber-50/20' : 'border-evo-bg focus:border-evo-teal'
                }`}
              />
              {filters.wo && (
                <button
                  type="button"
                  onClick={() => handleFieldChange('wo', '')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-evo-dark/30 hover:text-evo-dark"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Field 5: PO (PO Cliente / Pedido Ref) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-evo-dark/60 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-evo-teal" />
              PO (Ref / Pedido)
            </label>
            <div className="relative">
              <Input
                value={filters.po}
                onChange={(e) => handleFieldChange('po', e.target.value)}
                placeholder="Ex: PO-4500..."
                className="rounded-none border-evo-bg h-11 text-xs font-bold uppercase tracking-wider focus:border-evo-teal"
              />
              {filters.po && (
                <button
                  type="button"
                  onClick={() => handleFieldChange('po', '')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-evo-dark/30 hover:text-evo-dark"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>


        {/* Action Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-evo-bg/60">
          {/* Left Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={isLoading}
              className="h-11 rounded-none bg-evo-dark hover:bg-evo-dark/90 text-white font-black uppercase text-[10px] tracking-widest px-7 shadow-sm flex items-center gap-2"
            >
              <Search className="w-3.5 h-3.5 text-evo-teal" />
              Buscar
            </Button>

            {hasAnyFilter && (
              <Button
                type="button"
                onClick={onClear}
                variant="outline"
                className="h-11 rounded-none border-evo-bg font-bold uppercase text-[10px] tracking-widest px-4 hover:bg-slate-100"
              >
                Limpar Filtros
              </Button>
            )}

            <Button
              type="button"
              onClick={onRefresh}
              variant="outline"
              className="h-11 rounded-none border-evo-bg font-bold uppercase text-[10px] tracking-widest px-4 flex items-center gap-1.5"
              title="Recarregar dados"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Right: Status Filters if provided */}
          {statusFilter && onChangeStatusFilter && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                onClick={() => onChangeStatusFilter('all')}
                className={`rounded-none uppercase text-[9px] font-black tracking-widest h-11 px-5 ${
                  statusFilter === 'all' ? 'bg-evo-dark text-white' : 'border-evo-bg'
                }`}
              >
                Todos
              </Button>
              <Button
                type="button"
                variant={statusFilter === 'open' ? 'default' : 'outline'}
                onClick={() => onChangeStatusFilter('open')}
                className={`rounded-none uppercase text-[9px] font-black tracking-widest h-11 px-5 ${
                  statusFilter === 'open' ? 'bg-evo-teal text-evo-dark' : 'border-evo-bg'
                }`}
              >
                Abertos
              </Button>
              <Button
                type="button"
                variant={statusFilter === 'closed' ? 'default' : 'outline'}
                onClick={() => onChangeStatusFilter('closed')}
                className={`rounded-none uppercase text-[9px] font-black tracking-widest h-11 px-5 ${
                  statusFilter === 'closed' ? 'bg-gray-200 text-gray-700' : 'border-evo-bg'
                }`}
              >
                Fechados
              </Button>
            </div>
          )}
        </div>
      </form>

      {/* Applied Filters Banner */}
      {appliedFiltersSummary && (
        <div className="bg-evo-teal/10 border border-evo-teal/30 px-4 py-2.5 flex flex-wrap items-center justify-between text-xs font-bold text-evo-dark gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Search className="w-3.5 h-3.5 text-evo-teal shrink-0" />
            <span>
              Filtro ativo: <span className="text-evo-teal font-black">{appliedFiltersSummary}</span>
              {totalResults !== undefined && ` (${totalResults} resultado(s) retornado(s))`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] uppercase font-black text-evo-teal hover:underline cursor-pointer"
          >
            Limpar Filtro
          </button>
        </div>
      )}

      {/* Customer Selection Modal */}
      <CustomerSelectionModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onSelect={handleSelectCustomer}
        title={partnerType === 'supplier' ? 'Selecionar Fornecedor / Parceiro' : 'Selecionar Cliente'}
        partnerType={partnerType}
      />
    </div>
  );
}
