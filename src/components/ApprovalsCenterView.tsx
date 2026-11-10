import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  Monitor,
  Globe,
  ShieldCheck,
  ChevronRight,
  X,
  Layers,
  Check,
  Ban,
  Search,
  Lock,
  Mail
} from 'lucide-react';
import { toast } from 'sonner';
import { sapService } from '../services/sapService';

interface ApprovalsCenterViewProps {
  userEmail?: string;
  userName?: string;
}

/**
 * Strict security verification: checks if the logged-in user's email matches the stage approver's email.
 */
const isEmailAuthorizedForStage = (
  loggedEmail?: string | null,
  stageApproverEmail?: string | null
): boolean => {
  const cleanUser = String(loggedEmail || '').trim().toLowerCase();
  if (!cleanUser) return false;
  const allowedEmails = String(stageApproverEmail || '')
    .split(/[,;/]+/)
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return allowedEmails.includes(cleanUser);
};

export const ApprovalsCenterView: React.FC<ApprovalsCenterViewProps> = ({
  userEmail = '',
  userName = ''
}) => {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<{
    models: any[];
    authors: any[];
    approvers: any[];
  }>({ models: [], authors: [], approvers: [] });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showSapFilterModal, setShowSapFilterModal] = useState<boolean>(true);

  // SAP Desktop-style filter criteria ("Relatório de decisão de autorização - critérios de seleção")
  const [decisionW, setDecisionW] = useState<boolean>(true); // Nenhuma decisão ainda
  const [decisionY, setDecisionY] = useState<boolean>(false); // Autorizado
  const [decisionN, setDecisionN] = useState<boolean>(false); // Recusado
  const [onlyMyEmailStages, setOnlyMyEmailStages] = useState<boolean>(false);

  const [authorFrom, setAuthorFrom] = useState<string>('');
  const [authorTo, setAuthorTo] = useState<string>('');
  const [approverFrom, setApproverFrom] = useState<string>('');
  const [approverTo, setApproverTo] = useState<string>('');
  const [modelFrom, setModelFrom] = useState<string>('');
  const [modelTo, setModelTo] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Additional Portal Filters
  const [originFilter, setOriginFilter] = useState<'ALL' | 'PORTAL' | 'SAP_DESKTOP'>('ALL');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal state for inspecting & deciding line-by-line
  const [selectedApproval, setSelectedApproval] = useState<any | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [remarks, setRemarks] = useState<string>('');

  const normalizedLoggedEmail = useMemo(() => String(userEmail || '').trim().toLowerCase(), [userEmail]);

  const getObjectTypeName = (type: string | number) => {
    const types: Record<string, string> = {
      '18': 'Nota Fiscal de Entrada',
      '22': 'Pedido de Compra',
      '112': 'Esboço (Draft)',
      '204': 'Adiantamento a Fornecedor',
      '1470000113': 'Solicitação de Compra',
      '540000006': 'Oferta de Compra'
    };
    return types[String(type)] || `Documento (${type})`;
  };

  const fetchUnifiedData = async () => {
    setIsLoading(true);
    try {
      const data = await sapService.getUnifiedApprovals();
      if (data) {
        setApprovals(Array.isArray(data.approvals) ? data.approvals : []);
        if (data.catalog) {
          setCatalog({
            models: data.catalog.models || [],
            authors: data.catalog.authors || [],
            approvers: data.catalog.approvers || []
          });
        }
      }
    } catch (err: any) {
      console.error('Erro ao buscar aprovações unificadas:', err);
      toast.error('Erro ao carregar fila de aprovações.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUnifiedData();
  }, []);

  // Helper to check if a document has any stage assigned to the logged-in user's email
  const documentHasStageForLoggedUser = (item: any): boolean => {
    if (!normalizedLoggedEmail) return false;
    const lines = item.lines || [];
    if (lines.length > 0) {
      return lines.some((l: any) =>
        (l.requiredApprovers || []).some((a: any) =>
          isEmailAuthorizedForStage(normalizedLoggedEmail, a.approverEmail)
        )
      );
    }
    const sapLines = item.sapApprovalRequestLines || [];
    if (sapLines.length > 0) {
      return sapLines.some((al: any) => {
        const p = catalog.approvers.find((ap: any) => ap.id === Number(al.UserID));
        return p && isEmailAuthorizedForStage(normalizedLoggedEmail, p.email);
      });
    }
    const matchedModel = catalog.models.find((m: any) => m.code === Number(item.modelCode));
    if (matchedModel) {
      return (matchedModel.stages || []).some((st: any) =>
        (st.approvers || []).some((ap: any) =>
          isEmailAuthorizedForStage(normalizedLoggedEmail, ap.email)
        )
      );
    }
    return false;
  };

  // Count how many PENDING ('W') stages in the currently selected document belong to the logged-in user's email
  const myPendingStagesInSelected = useMemo(() => {
    if (!selectedApproval || !normalizedLoggedEmail) return 0;
    let count = 0;
    (selectedApproval.lines || []).forEach((line: any) => {
      (line.requiredApprovers || []).forEach((app: any) => {
        if (app.status === 'W' && isEmailAuthorizedForStage(normalizedLoggedEmail, app.approverEmail)) {
          count += 1;
        }
      });
    });
    return count;
  }, [selectedApproval, normalizedLoggedEmail]);

  const handleOpenDecisionModal = async (item: any) => {
    setSelectedApproval(item);
    setRemarks('');
    if (item.draftDocEntry && (!item.lines || item.lines.length === 0)) {
      setIsDetailLoading(true);
      try {
        const detail = await sapService.getApprovalDraftDetail(Number(item.draftDocEntry));
        if (detail?.approvalRecord) {
          setSelectedApproval((prev: any) => ({
            ...prev,
            ...detail.approvalRecord,
            sapCode: prev?.sapCode || prev?.code,
            origin: prev?.origin || detail.approvalRecord.origin
          }));
          setApprovals(prevList =>
            prevList.map(a =>
              a.draftDocEntry === item.draftDocEntry
                ? { ...a, ...detail.approvalRecord, origin: a.origin || detail.approvalRecord.origin }
                : a
            )
          );
        }
      } catch (err) {
        console.warn('Não foi possível carregar linhas detalhadas do esboço:', err);
      } finally {
        setIsDetailLoading(false);
      }
    }
  };

  const handleDecideLineOrDocument = async (params: {
    decision: 'ardApproved' | 'ardNotApproved';
    lineNum?: number;
    stageCode?: number;
    approveAllLines?: boolean;
  }) => {
    if (!selectedApproval) return;

    if (!normalizedLoggedEmail) {
      toast.error('Bloqueio de Segurança: Usuário sem e-mail autenticado não pode aprovar ou recusar etapas.');
      return;
    }

    // Frontend security guard: verify stage email ownership before calling backend
    if (params.lineNum !== undefined && params.stageCode !== undefined && !params.approveAllLines) {
      const targetLine = (selectedApproval.lines || []).find((l: any) => l.lineNum === Number(params.lineNum));
      const targetStage = (targetLine?.requiredApprovers || []).find((a: any) => a.stageCode === Number(params.stageCode));
      if (!targetStage || !isEmailAuthorizedForStage(normalizedLoggedEmail, targetStage.approverEmail)) {
        toast.error(
          `Bloqueio de Segurança: Somente o aprovador titular (${targetStage?.approverEmail || 'N/D'}) pode aprovar ou recusar esta etapa.`
        );
        return;
      }
    } else if (myPendingStagesInSelected === 0 && !documentHasStageForLoggedUser(selectedApproval)) {
      toast.error(
        `Bloqueio de Segurança: O seu e-mail (${normalizedLoggedEmail}) não pertence a nenhuma etapa pendente deste documento.`
      );
      return;
    }

    setIsActionLoading(true);
    try {
      // If it's a pure SAP ApprovalRequest without a DraftEntry, fallback to SAP ApprovalRequests PATCH after checking email
      if (!selectedApproval.draftDocEntry && selectedApproval.code) {
        await sapService.updateApprovalRequest(
          selectedApproval.code,
          params.decision,
          remarks || (params.decision === 'ardApproved' ? `Aprovado via Portal por ${normalizedLoggedEmail}` : `Recusado via Portal por ${normalizedLoggedEmail}`)
        );
        toast.success(
          params.decision === 'ardApproved'
            ? 'Solicitação aprovada no SAP!'
            : 'Solicitação recusada no SAP!'
        );
        setSelectedApproval(null);
        await fetchUnifiedData();
        return;
      }

      const result = await sapService.decideUnifiedApproval({
        draftDocEntry: Number(selectedApproval.draftDocEntry),
        decision: params.decision,
        remarks: remarks || undefined,
        approverName: userName || normalizedLoggedEmail,
        approverEmail: normalizedLoggedEmail,
        lineNum: params.lineNum,
        stageCode: params.stageCode,
        approveAllLines: params.approveAllLines
      });

      if (result?.approvalRecord) {
        setSelectedApproval(result.approvalRecord);
      }

      if (result?.convertedDocEntry) {
        toast.success(
          `Todas as etapas concluídas! Documento efetivado no SAP: Nº ${result.convertedDocNum || result.convertedDocEntry} (Esboço #${selectedApproval.draftDocEntry})`
        );
      } else {
        toast.success(result?.message || 'Decisão da sua etapa registrada com sucesso!');
      }

      await fetchUnifiedData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao processar decisão de aprovação.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Helper for string range comparison ("De ... Até ...") like SAP B1
  const matchesRange = (value: string, from: string, to: string): boolean => {
    const valNorm = String(value || '').trim().toUpperCase();
    const fromNorm = String(from || '').trim().toUpperCase();
    const toNorm = String(to || '').trim().toUpperCase();

    if (!fromNorm && !toNorm) return true;
    if (fromNorm && toNorm && fromNorm === toNorm) {
      return valNorm.includes(fromNorm);
    }
    if (fromNorm && !toNorm) {
      return valNorm.includes(fromNorm) || valNorm >= fromNorm;
    }
    if (!fromNorm && toNorm) {
      return valNorm.includes(toNorm) || valNorm <= toNorm;
    }
    return (valNorm >= fromNorm && valNorm <= toNorm + '\uffff') || valNorm.includes(fromNorm) || valNorm.includes(toNorm);
  };

  // Filtered list
  const filteredApprovals = useMemo(() => {
    return approvals.filter(item => {
      // 1. Decision checkboxes (W, Y, N)
      const st = item.status || 'W';
      if (st === 'W' && !decisionW) return false;
      if (st === 'Y' && !decisionY) return false;
      if (st === 'N' && !decisionN) return false;

      // 1b. Filter only documents where logged user's email is an approver
      if (onlyMyEmailStages && !documentHasStageForLoggedUser(item)) return false;

      // 2. Origin filter (SAP Desktop vs Portal de Compras)
      if (originFilter !== 'ALL' && item.origin !== originFilter) return false;

      // 3. Document Type filter
      if (docTypeFilter !== 'ALL' && String(item.objectType) !== docTypeFilter) return false;

      // 4. Author range ("Autor de ... Até ...")
      const authorLabel = `${item.authorName || ''} ${item.authorEmail || ''} ${item.authorCode || ''}`;
      if (!matchesRange(authorLabel, authorFrom, authorTo)) return false;

      // 5. Approver range ("Autorizador de ... Até ...")
      if (approverFrom || approverTo) {
        const lineApprovers = (item.lines || [])
          .flatMap((l: any) => (l.requiredApprovers || []).map((a: any) => `${a.approverName} ${a.approverEmail} ${a.approverCode} ${a.stageName}`))
          .join(' ');
        const sapApprovers = (item.sapApprovalRequestLines || [])
          .map((al: any) => {
            const p = catalog.approvers.find((ap: any) => ap.id === Number(al.UserID));
            return p ? `${p.name} ${p.email} ${p.code}` : String(al.UserID);
          })
          .join(' ');
        const combinedApprovers = `${lineApprovers} ${sapApprovers}`;
        if (!matchesRange(combinedApprovers, approverFrom, approverTo)) return false;
      }

      // 6. Model range ("Modelo de ... Até ...")
      if (modelFrom || modelTo) {
        const lineModels = (item.lines || []).map((l: any) => `${l.modelName} ${l.modelDescription} ${l.costCenter}`).join(' ');
        const topModel = `${item.modelName || ''} ${item.modelDescription || ''} ${lineModels}`;
        if (!matchesRange(topModel, modelFrom, modelTo)) return false;
      }

      // 7. Date range ("Data solicitação de ... Até ...")
      if (dateFrom || dateTo) {
        const itemDateStr = item.creationDate ? String(item.creationDate).split('T')[0] : '';
        if (dateFrom && itemDateStr && itemDateStr < dateFrom) return false;
        if (dateTo && itemDateStr && itemDateStr > dateTo) return false;
      }

      // 8. Free text search
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const hay = `${item.code} ${item.draftDocEntry} ${item.convertedDocNum || ''} ${item.authorName || ''} ${item.cardName || ''} ${item.comments || ''} ${item.modelName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    approvals,
    decisionW,
    decisionY,
    decisionN,
    onlyMyEmailStages,
    originFilter,
    docTypeFilter,
    authorFrom,
    authorTo,
    approverFrom,
    approverTo,
    modelFrom,
    modelTo,
    dateFrom,
    dateTo,
    searchTerm,
    catalog.approvers,
    normalizedLoggedEmail
  ]);

  const stats = useMemo(() => {
    const pending = approvals.filter(a => a.status === 'W').length;
    const approved = approvals.filter(a => a.status === 'Y').length;
    const rejected = approvals.filter(a => a.status === 'N').length;
    const portalCount = approvals.filter(a => a.origin === 'PORTAL').length;
    const sapCount = approvals.filter(a => a.origin === 'SAP_DESKTOP').length;
    return { pending, approved, rejected, portalCount, sapCount };
  }, [approvals]);

  const handleClearFilters = () => {
    setDecisionW(true);
    setDecisionY(true);
    setDecisionN(true);
    setOnlyMyEmailStages(false);
    setAuthorFrom('');
    setAuthorTo('');
    setApproverFrom('');
    setApproverTo('');
    setModelFrom('');
    setModelTo('');
    setDateFrom('');
    setDateTo('');
    setOriginFilter('ALL');
    setDocTypeFilter('ALL');
    setSearchTerm('');
  };

  const getLineProgress = (item: any) => {
    const lines = item.lines || [];
    if (lines.length === 0) {
      return null;
    }
    let totalStages = 0;
    let approvedStages = 0;
    lines.forEach((l: any) => {
      (l.requiredApprovers || []).forEach((a: any) => {
        totalStages += 1;
        if (a.status === 'Y') approvedStages += 1;
      });
    });
    return { totalLines: lines.length, totalStages, approvedStages };
  };

  return (
    <div className="space-y-6">
      {/* Security Identity Banner */}
      <div className="bg-slate-900 text-white px-5 py-3 rounded-xl border border-slate-700 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 border border-emerald-400/30 rounded-lg text-emerald-300">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                Controle de Segurança por E-mail de Alçada Ativo
              </span>
              <span className="px-2 py-0.5 bg-white/10 rounded text-[11px] font-mono text-white flex items-center gap-1">
                <Mail className="w-3 h-3 text-sky-400" />
                {normalizedLoggedEmail || 'E-mail não identificado'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Cada aprovador só pode aprovar ou recusar a sua própria etapa vinculada exatamente ao e-mail do usuário logado.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-xs font-semibold">
          <input
            type="checkbox"
            checked={onlyMyEmailStages}
            onChange={e => setOnlyMyEmailStages(e.target.checked)}
            className="rounded border-slate-400 text-sky-500 focus:ring-sky-500 w-4 h-4"
          />
          <span>Exibir apenas documentos da minha alçada ({normalizedLoggedEmail || 'meu e-mail'})</span>
        </label>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <button
          type="button"
          onClick={() => {
            setDecisionW(true);
            setDecisionY(false);
            setDecisionN(false);
          }}
          className={`text-left bg-white p-5 rounded-xl border transition-all shadow-sm ${
            decisionW && !decisionY && !decisionN ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-200 hover:border-amber-300'
          } border-l-4 border-l-amber-500`}
        >
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Nenhuma Decisão Ainda</p>
          <h3 className="text-2xl font-black text-amber-600">{stats.pending}</h3>
          <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold">Esboços Aguardando Aprovação</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setDecisionW(false);
            setDecisionY(true);
            setDecisionN(false);
          }}
          className={`text-left bg-white p-5 rounded-xl border transition-all shadow-sm ${
            !decisionW && decisionY && !decisionN ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 hover:border-emerald-300'
          } border-l-4 border-l-emerald-500`}
        >
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Autorizado</p>
          <h3 className="text-2xl font-black text-emerald-600">{stats.approved}</h3>
          <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold">Convertidos em Doc. Efetivo</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setDecisionW(false);
            setDecisionY(false);
            setDecisionN(true);
          }}
          className={`text-left bg-white p-5 rounded-xl border transition-all shadow-sm ${
            !decisionW && !decisionY && decisionN ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-200 hover:border-rose-300'
          } border-l-4 border-l-rose-500`}
        >
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Recusado</p>
          <h3 className="text-2xl font-black text-rose-600">{stats.rejected}</h3>
          <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold">Esboços Cancelados</p>
        </button>

        <button
          type="button"
          onClick={() => setOriginFilter(originFilter === 'PORTAL' ? 'ALL' : 'PORTAL')}
          className={`text-left bg-white p-5 rounded-xl border transition-all shadow-sm ${
            originFilter === 'PORTAL' ? 'border-sky-600 ring-2 ring-sky-500/20' : 'border-slate-200 hover:border-sky-300'
          } border-l-4 border-l-sky-600`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Portal de Compras</p>
            <Globe className="w-4 h-4 text-sky-600" />
          </div>
          <h3 className="text-2xl font-black text-sky-700">{stats.portalCount}</h3>
          <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold">Solicitação / Pedido / Adiant.</p>
        </button>

        <button
          type="button"
          onClick={() => setOriginFilter(originFilter === 'SAP_DESKTOP' ? 'ALL' : 'SAP_DESKTOP')}
          className={`text-left bg-white p-5 rounded-xl border transition-all shadow-sm ${
            originFilter === 'SAP_DESKTOP' ? 'border-indigo-600 ring-2 ring-indigo-500/20' : 'border-slate-200 hover:border-indigo-300'
          } border-l-4 border-l-indigo-600`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">SAP Desktop (B1)</p>
            <Monitor className="w-4 h-4 text-indigo-600" />
          </div>
          <h3 className="text-2xl font-black text-indigo-700">{stats.sapCount}</h3>
          <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold">Workflow Nativo OWDD</p>
        </button>
      </div>

      {/* SAP Desktop Style Filter Box: "Relatório de decisão de autorização - critérios de seleção" */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        <div
          className="bg-[#34495e] text-white px-5 py-3 flex items-center justify-between cursor-pointer"
          onClick={() => setShowSapFilterModal(!showSapFilterModal)}
        >
          <div className="flex items-center gap-2.5">
            <Filter className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold tracking-wide">
              Relatório de decisão de autorização - critérios de seleção (SAP B1 & Portal de Compras)
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] bg-white/10 px-2.5 py-1 rounded font-semibold">
              {catalog.models.length} Modelos Carregados (regrasdeaprovacao.xlsx)
            </span>
            <span className="text-xs font-bold text-amber-300">
              {showSapFilterModal ? 'Ocultar Critérios ▲' : 'Expandir Critérios ▼'}
            </span>
          </div>
        </div>

        {showSapFilterModal && (
          <div className="p-6 bg-[#f8fafc] border-t border-slate-200 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Decisão Checkboxes + Origem + Tipo de Documento */}
              <div className="lg:col-span-4 space-y-4 bg-white p-4 rounded-lg border border-slate-200">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 underline mb-3">Decisão</h4>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={decisionW}
                        onChange={e => setDecisionW(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
                      />
                      <span>Nenhuma decisão ainda (Pendente / Esboço)</span>
                    </label>
                    <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={decisionY}
                        onChange={e => setDecisionY(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
                      />
                      <span>Autorizado (Efetivado no SAP)</span>
                    </label>
                    <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={decisionN}
                        onChange={e => setDecisionN(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
                      />
                      <span>Recusado</span>
                    </label>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Origem do Documento
                    </label>
                    <select
                      value={originFilter}
                      onChange={e => setOriginFilter(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-semibold text-slate-700"
                    >
                      <option value="ALL">Todas as Origens</option>
                      <option value="PORTAL">Portal de Compras</option>
                      <option value="SAP_DESKTOP">SAP Desktop</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Tipo de Documento
                    </label>
                    <select
                      value={docTypeFilter}
                      onChange={e => setDocTypeFilter(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-semibold text-slate-700"
                    >
                      <option value="ALL">Todos os Tipos</option>
                      <option value="1470000113">Solicitação de Compra</option>
                      <option value="22">Pedido de Compra</option>
                      <option value="204">Adiantamento a Fornecedor</option>
                      <option value="18">Nota Fiscal de Entrada</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Right Column: SAP B1 "De ... Até ..." Range Inputs */}
              <div className="lg:col-span-8 bg-white p-4 rounded-lg border border-slate-200 space-y-3">
                {/* Autor de ... Até ... */}
                <div className="grid grid-cols-12 items-center gap-2">
                  <label className="col-span-3 text-xs font-semibold text-slate-700">Autor de</label>
                  <div className="col-span-4">
                    <input
                      type="text"
                      list="sap-authors-list"
                      value={authorFrom}
                      onChange={e => {
                        setAuthorFrom(e.target.value);
                        if (!authorTo) setAuthorTo(e.target.value);
                      }}
                      placeholder="Ex: Deborah Simone"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-sky-600 focus:outline-none"
                    />
                  </div>
                  <label className="col-span-1 text-xs font-semibold text-slate-600 text-center">Até</label>
                  <div className="col-span-4">
                    <input
                      type="text"
                      list="sap-authors-list"
                      value={authorTo}
                      onChange={e => setAuthorTo(e.target.value)}
                      placeholder="Ex: Deborah Simone"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-sky-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Autorizador de ... Até ... */}
                <div className="grid grid-cols-12 items-center gap-2">
                  <label className="col-span-3 text-xs font-semibold text-slate-700">Autorizador de</label>
                  <div className="col-span-4">
                    <input
                      type="text"
                      list="sap-approvers-list"
                      value={approverFrom}
                      onChange={e => {
                        setApproverFrom(e.target.value);
                        if (!approverTo) setApproverTo(e.target.value);
                      }}
                      placeholder="Ex: Fabio Sousa / Diretoria"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-sky-600 focus:outline-none"
                    />
                  </div>
                  <label className="col-span-1 text-xs font-semibold text-slate-600 text-center">Até</label>
                  <div className="col-span-4">
                    <input
                      type="text"
                      list="sap-approvers-list"
                      value={approverTo}
                      onChange={e => setApproverTo(e.target.value)}
                      placeholder="Ex: Fabio Sousa / Diretoria"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-sky-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Modelo de ... Até ... */}
                <div className="grid grid-cols-12 items-center gap-2">
                  <label className="col-span-3 text-xs font-semibold text-slate-700">Modelo de</label>
                  <div className="col-span-4">
                    <input
                      type="text"
                      list="sap-models-list"
                      value={modelFrom}
                      onChange={e => {
                        setModelFrom(e.target.value);
                        if (!modelTo) setModelTo(e.target.value);
                      }}
                      placeholder="Ex: OPEROFF 0 a 10k (N)"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-sky-600 focus:outline-none"
                    />
                  </div>
                  <label className="col-span-1 text-xs font-semibold text-slate-600 text-center">Até</label>
                  <div className="col-span-4">
                    <input
                      type="text"
                      list="sap-models-list"
                      value={modelTo}
                      onChange={e => setModelTo(e.target.value)}
                      placeholder="Ex: OPEROFF acima de 100k [F]"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-sky-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Data solicitação de ... Até ... */}
                <div className="grid grid-cols-12 items-center gap-2">
                  <label className="col-span-3 text-xs font-semibold text-slate-700">Data solicitação de</label>
                  <div className="col-span-4">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-sky-600 focus:outline-none"
                    />
                  </div>
                  <label className="col-span-1 text-xs font-semibold text-slate-600 text-center">Até</label>
                  <div className="col-span-4">
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:border-sky-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Datalists populated from regrasdeaprovacao.xlsx */}
                <datalist id="sap-authors-list">
                  {catalog.authors.map((a: any) => (
                    <option key={a.id} value={a.name}>
                      {a.code} ({a.email})
                    </option>
                  ))}
                </datalist>
                <datalist id="sap-approvers-list">
                  {catalog.approvers.map((ap: any) => (
                    <option key={ap.id} value={ap.name}>
                      {ap.code} ({ap.email})
                    </option>
                  ))}
                </datalist>
                <datalist id="sap-models-list">
                  {catalog.models.map((m: any) => (
                    <option key={m.code} value={m.name}>
                      {m.description}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            {/* Bottom bar with OK / Limpar / Busca rápida */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Pesquisar por Nº Esboço, Nº Documento, Fornecedor, Centro de Custo ou Observações..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:border-sky-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchUnifiedData}
                  className="px-4 py-1.5 bg-[#34495e] hover:bg-slate-800 text-white text-xs font-bold rounded shadow-sm flex items-center gap-1.5 transition-all border-l-4 border-l-amber-400"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  OK / Atualizar Relatório
                </button>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded transition-all"
                >
                  Limpar Critérios
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Documentos Encontrados ({filteredApprovals.length})
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Validação de segurança por e-mail do aprovador titular ativa • Gravação em Esboço (ODRF) até aprovação final
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1e293b] text-white">
                <th className="px-5 py-3.5 text-[9px] font-bold uppercase tracking-widest">ID / Origem</th>
                <th className="px-5 py-3.5 text-[9px] font-bold uppercase tracking-widest">Tipo de Documento</th>
                <th className="px-5 py-3.5 text-[9px] font-bold uppercase tracking-widest">Esboço / Doc. Final</th>
                <th className="px-5 py-3.5 text-[9px] font-bold uppercase tracking-widest">Autor & Data</th>
                <th className="px-5 py-3.5 text-[9px] font-bold uppercase tracking-widest">Modelo(s) / Centro de Custo</th>
                <th className="px-5 py-3.5 text-[9px] font-bold uppercase tracking-widest">Status por Linha</th>
                <th className="px-5 py-3.5 text-[9px] font-bold uppercase tracking-widest text-right">Ações Decisórias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        Sincronizando Esboços do Portal e SAP Service Layer...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredApprovals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-400 text-xs italic">
                    Nenhum documento encontrado para os critérios de seleção informados.
                  </td>
                </tr>
              ) : (
                filteredApprovals.map(item => {
                  const progress = getLineProgress(item);
                  const isUserApproverForDoc = documentHasStageForLoggedUser(item);
                  const uniqueModels: string[] = Array.from(
                    new Set(
                      (item.lines || []).map((l: any) => `${l.modelName} (${l.costCenter})`).filter(Boolean)
                    )
                  );
                  const displayModels =
                    uniqueModels.length > 0
                      ? uniqueModels
                      : item.modelName
                      ? [`${item.modelName}${item.modelDescription ? ` - ${item.modelDescription}` : ''}`]
                      : ['Regra por Centro de Custo'];

                  return (
                    <tr key={item.id || item.code} className="hover:bg-slate-50/90 transition-colors">
                      {/* ID & Origin Badge */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-slate-900 text-xs">#{item.code}</span>
                          {item.origin === 'PORTAL' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-sky-100 text-sky-800 border border-sky-200 w-fit">
                              <Globe className="w-2.5 h-2.5" /> PORTAL DE COMPRAS
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200 w-fit">
                              <Monitor className="w-2.5 h-2.5" /> SAP DESKTOP
                            </span>
                          )}
                          {isUserApproverForDoc && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 w-fit">
                              <Check className="w-2.5 h-2.5" /> SUA ALÇADA
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Document Type & Partner */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 text-xs uppercase tracking-tight">
                            {getObjectTypeName(item.objectType)}
                          </span>
                          {item.cardName && (
                            <span className="text-[11px] text-slate-500 font-medium truncate max-w-[210px]">
                              {item.cardName}
                            </span>
                          )}
                          {item.docTotal > 0 && (
                            <span className="text-[11px] font-bold text-emerald-700 mt-0.5">
                              {Number(item.docTotal).toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL'
                              })}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Draft Entry & Converted Effective Document */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-[10px] font-bold text-amber-800 w-fit">
                            Esboço (ODRF): #{item.draftDocEntry || 'N/A'}
                          </span>
                          {item.convertedDocEntry ? (
                            <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded text-[10px] font-bold text-emerald-800 w-fit flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Doc. Efetivo: #{item.convertedDocNum || item.convertedDocEntry}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              Aguardando efetivação
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Author & Date */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">
                            {item.authorName || 'Usuário SAP'}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {item.creationDate
                              ? new Date(item.creationDate).toLocaleDateString('pt-BR')
                              : 'Data N/D'}
                          </span>
                        </div>
                      </td>

                      {/* Models / Cost Centers */}
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {displayModels.map((m, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-bold text-slate-700"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                        {item.comments && (
                          <p className="text-[10px] text-slate-400 italic mt-1 truncate max-w-xs">
                            {item.comments}
                          </p>
                        )}
                      </td>

                      {/* Status & Line Progress */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          {item.status === 'W' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase">
                              <Clock className="w-3.5 h-3.5" /> Nenhuma decisão ainda
                            </span>
                          )}
                          {item.status === 'Y' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Autorizado & Efetivado
                            </span>
                          )}
                          {item.status === 'N' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 uppercase">
                              <XCircle className="w-3.5 h-3.5" /> Recusado
                            </span>
                          )}

                          {progress && (
                            <div className="mt-0.5">
                              <div className="text-[10px] font-semibold text-slate-600">
                                {progress.approvedStages}/{progress.totalStages} aprovações ({progress.totalLines}{' '}
                                {progress.totalLines === 1 ? 'linha' : 'linhas'})
                              </div>
                              <div className="w-28 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                                <div
                                  className="h-full bg-emerald-500 transition-all"
                                  style={{
                                    width: `${
                                      progress.totalStages > 0
                                        ? Math.round((progress.approvedStages / progress.totalStages) * 100)
                                        : 0
                                    }%`
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenDecisionModal(item)}
                          className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm inline-flex items-center gap-1.5"
                        >
                          {item.status === 'W' ? 'Analisar Linhas / Decidir' : 'Ver Aprovações por Linha'}
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Line-by-Line Approval & Draft-to-Document Conversion */}
      {selectedApproval && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#1e293b] text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    Análise de Aprovação por Linha — Esboço #{selectedApproval.draftDocEntry || selectedApproval.code}
                  </h3>
                  {selectedApproval.origin === 'PORTAL' ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                      PORTAL DE COMPRAS
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                      SAP DESKTOP
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Logado: {normalizedLoggedEmail || 'Sem e-mail'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">
                  {getObjectTypeName(selectedApproval.objectType)} • Autor: {selectedApproval.authorName} •{' '}
                  {selectedApproval.convertedDocEntry
                    ? `Convertido no Documento Efetivo Nº ${selectedApproval.convertedDocNum || selectedApproval.convertedDocEntry}`
                    : 'Somente o aprovador com o mesmo e-mail do usuário logado pode aprovar sua própria etapa'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedApproval(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50">
              {/* Summary Bar */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Fornecedor / Solicitante</span>
                  <span className="text-xs font-bold text-slate-800">
                    {selectedApproval.cardName || selectedApproval.authorName || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Filial</span>
                  <span className="text-xs font-bold text-slate-800">
                    {selectedApproval.bplName || 'QUALITECH MATRIZ'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Valor Total do Esboço</span>
                  <span className="text-sm font-black text-emerald-700">
                    {Number(selectedApproval.docTotal || 0).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Status de Efetivação SAP</span>
                  {selectedApproval.convertedDocEntry ? (
                    <span className="text-xs font-black text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Efetivado (DocNum: {selectedApproval.convertedDocNum || selectedApproval.convertedDocEntry})
                    </span>
                  ) : selectedApproval.status === 'N' ? (
                    <span className="text-xs font-black text-rose-600 flex items-center gap-1">
                      <XCircle className="w-4 h-4" /> Esboço Recusado / Cancelado
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                      <Clock className="w-4 h-4" /> Em Esboço (Aguardando Aprovadores)
                    </span>
                  )}
                </div>
              </div>

              {/* Line-by-line Rules & Approvers Table */}
              {isDetailLoading ? (
                <div className="py-12 text-center text-slate-500">
                  <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs font-bold uppercase">Carregando linhas do Esboço no SAP e avaliando regras...</p>
                </div>
              ) : (selectedApproval.lines || []).length === 0 ? (
                <div className="bg-white p-6 rounded-xl border border-slate-200 text-center space-y-2">
                  <p className="text-xs font-bold text-slate-700">
                    Modelo SAP: {selectedApproval.modelName || `Template #${selectedApproval.modelCode}`}
                  </p>
                  <p className="text-xs text-slate-500">{selectedApproval.comments || 'Sem observações adicionais.'}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-sky-600" />
                    Regras de Aprovação Aplicadas por Linha (Centro de Custo × Filial × Alçada de Valor)
                  </h4>

                  {(selectedApproval.lines || []).map((line: any, idx: number) => {
                    const allLineStagesApproved = (line.requiredApprovers || []).every(
                      (a: any) => a.status === 'Y'
                    );
                    return (
                      <div
                        key={line.lineNum ?? idx}
                        className={`bg-white rounded-xl border p-4 shadow-sm transition-all ${
                          allLineStagesApproved ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-slate-800 text-white rounded text-[10px] font-bold">
                                Linha #{Number(line.lineNum ?? idx) + 1}
                              </span>
                              <span className="text-xs font-black text-slate-900">
                                {line.itemCode} — {line.itemDescription}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-slate-600">
                              <span>
                                <strong>Qtd:</strong> {line.quantity}
                              </span>
                              <span>
                                <strong>Preço Unit.:</strong>{' '}
                                {Number(line.unitPrice || 0).toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL'
                                })}
                              </span>
                              <span>
                                <strong>Total da Linha:</strong>{' '}
                                <span className="font-bold text-slate-900">
                                  {Number(line.lineTotal || 0).toLocaleString('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL'
                                  })}
                                </span>
                              </span>
                              <span className="px-2 py-0.5 bg-sky-50 text-sky-800 border border-sky-200 rounded font-bold">
                                CC (Dim 3): {line.costCenter}
                              </span>
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded font-bold">
                                Filial (Dim 2): {line.branch}
                              </span>
                              <span className="px-2 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 rounded font-bold">
                                Projeto (Dim 4): {line.project}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">
                              Modelo Aplicado (regrasdeaprovacao.xlsx)
                            </span>
                            <span className="text-xs font-black text-sky-700">
                              {line.modelName} — {line.modelDescription}
                            </span>
                          </div>
                        </div>

                        {/* Required Approvers for this Line */}
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(line.requiredApprovers || []).map((approver: any) => {
                            const isMyStage = isEmailAuthorizedForStage(
                              normalizedLoggedEmail,
                              approver.approverEmail
                            );
                            return (
                              <div
                                key={`${line.lineNum}-${approver.stageCode}`}
                                className={`p-3 rounded-lg border flex items-center justify-between gap-2 ${
                                  approver.status === 'Y'
                                    ? 'bg-emerald-50 border-emerald-200'
                                    : approver.status === 'N'
                                    ? 'bg-rose-50 border-rose-200'
                                    : isMyStage
                                    ? 'bg-sky-50/70 border-sky-400 ring-1 ring-sky-400/30'
                                    : 'bg-slate-50 border-slate-200 opacity-80'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                                      Etapa: {approver.stageName}
                                    </span>
                                    {isMyStage && approver.status === 'W' && (
                                      <span className="px-1.5 py-0.2 bg-sky-600 text-white rounded text-[8px] font-extrabold uppercase">
                                        Sua Etapa
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs font-bold text-slate-800 block truncate mt-0.5">
                                    {approver.approverName}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-500 block truncate">
                                    {approver.approverEmail || 'E-mail não cadastrado'}
                                  </span>
                                  {approver.approvedBy && (
                                    <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">
                                      Decidido por: {approver.approvedBy}
                                    </span>
                                  )}
                                </div>

                                <div className="shrink-0">
                                  {approver.status === 'Y' ? (
                                    <span className="px-2 py-1 bg-emerald-600 text-white rounded text-[9px] font-bold uppercase flex items-center gap-1">
                                      <Check className="w-3 h-3" /> Aprovado
                                    </span>
                                  ) : approver.status === 'N' ? (
                                    <span className="px-2 py-1 bg-rose-600 text-white rounded text-[9px] font-bold uppercase flex items-center gap-1">
                                      <Ban className="w-3 h-3" /> Recusado
                                    </span>
                                  ) : isMyStage ? (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={isActionLoading}
                                        onClick={() =>
                                          handleDecideLineOrDocument({
                                            decision: 'ardApproved',
                                            lineNum: line.lineNum,
                                            stageCode: approver.stageCode,
                                            approveAllLines: false
                                          })
                                        }
                                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold uppercase shadow-sm transition-all disabled:opacity-50"
                                      >
                                        Aprovar Minha Etapa
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isActionLoading}
                                        onClick={() =>
                                          handleDecideLineOrDocument({
                                            decision: 'ardNotApproved',
                                            lineNum: line.lineNum,
                                            stageCode: approver.stageCode,
                                            approveAllLines: false
                                          })
                                        }
                                        className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-bold uppercase transition-all disabled:opacity-50"
                                      >
                                        Recusar
                                      </button>
                                    </div>
                                  ) : (
                                    <span
                                      title={`Por questão de segurança, somente o usuário logado com o e-mail ${approver.approverEmail} pode aprovar esta etapa.`}
                                      className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-[9px] font-bold uppercase flex items-center gap-1 cursor-not-allowed"
                                    >
                                      <Lock className="w-3 h-3 text-slate-500" /> Outra Alçada
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Decision Remarks Input */}
              {selectedApproval.status === 'W' && myPendingStagesInSelected > 0 && (
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Observações / Justificativa da Sua Decisão ({normalizedLoggedEmail})
                  </label>
                  <textarea
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    placeholder="Informe um parecer ou observação para a aprovação/recusa da sua etapa..."
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs h-20 resize-none focus:outline-none focus:border-sky-600"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500">
                {selectedApproval.status === 'W' && myPendingStagesInSelected === 0 ? (
                  <span className="text-amber-700 font-semibold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Nenhuma etapa pendente para o seu e-mail ({normalizedLoggedEmail || 'não identificado'}). Somente o aprovador titular de cada etapa pode aprová-la.
                  </span>
                ) : (
                  <span>
                    Quando todos os aprovadores titulares de todas as linhas aprovarem, o sistema executa{' '}
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">
                      POST /b1s/v1/DraftsService_SaveDraftToDocument
                    </code>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {selectedApproval.status === 'W' && myPendingStagesInSelected > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() =>
                        handleDecideLineOrDocument({
                          decision: 'ardNotApproved',
                          approveAllLines: true
                        })
                      }
                      className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      Recusar Minha(s) Etapa(s)
                    </button>
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={() =>
                        handleDecideLineOrDocument({
                          decision: 'ardApproved',
                          approveAllLines: true
                        })
                      }
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {isActionLoading
                        ? 'Processando...'
                        : `Aprovar Todas as Minhas Etapas (${myPendingStagesInSelected})`}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedApproval(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
