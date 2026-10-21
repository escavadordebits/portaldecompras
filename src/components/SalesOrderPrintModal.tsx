import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Printer, 
  Download, 
  X, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Minimize2, 
  FileText, 
  ArrowRight,
  RotateCw,
  Eye,
  Mail,
  Send,
  Key,
  CheckCircle2,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Settings,
  ExternalLink,
  LogOut,
  ShieldCheck,
  Copy,
  Globe,
  Edit
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogClose 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sapService } from '../services/sapService';
import { 
  enviarEmailComAnexoReal, 
  parseEmailRecipients 
} from '../services/microsoftGraphEmailService';
import { loadStoredAttachments, StoredAttachment } from './DocumentAttachmentsSection';
import { 
  getStoredMicrosoftAccount, 
  getStoredMicrosoftConfig, 
  loginWithMicrosoftPopup, 
  saveMicrosoftConfig, 
  clearMicrosoftSession,
  DEFAULT_CLIENT_ID,
  DEFAULT_TENANT_ID,
  MicrosoftAccount 
} from '../services/microsoftAuthService';

interface SalesOrderPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  userEmail?: string;
  onEdit?: (order: any) => void;
}

export function SalesOrderPrintModal({ isOpen, onClose, order, userEmail, onEdit }: SalesOrderPrintModalProps) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullOrder, setFullOrder] = useState<any>(null);
  const [customerBP, setCustomerBP] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Layout Language: 'pt' (Português) or 'en' (English)
  const [layoutLang, setLayoutLang] = useState<'pt' | 'en'>('pt');

  // Email sending state (Microsoft Graph & OAuth)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailLang, setEmailLang] = useState<'pt' | 'en'>('pt');
  const [emailHasPO, setEmailHasPO] = useState<boolean>(true);
  const [emailPONeedsAdjustment, setEmailPONeedsAdjustment] = useState<boolean>(false);
  const [emailUnit, setEmailUnit] = useState('');
  const [emailWO, setEmailWO] = useState('');
  const [emailPO, setEmailPO] = useState('');
  const [emailScope, setEmailScope] = useState('');
  const [emailPeriod, setEmailPeriod] = useState('');
  const [showRefDetails, setShowRefDetails] = useState(false);

  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [msGraphToken, setMsGraphToken] = useState(() => {
    return localStorage.getItem('ms_graph_token') || '';
  });
  const [msAccount, setMsAccount] = useState<MicrosoftAccount | null>(() => {
    return getStoredMicrosoftAccount();
  });
  const [azureClientId, setAzureClientId] = useState(() => {
    return getStoredMicrosoftConfig().clientId || DEFAULT_CLIENT_ID;
  });
  const [azureTenantId, setAzureTenantId] = useState(() => {
    return getStoredMicrosoftConfig().tenantId || DEFAULT_TENANT_ID;
  });
  const [azureRedirectUri, setAzureRedirectUri] = useState(() => {
    return getStoredMicrosoftConfig().redirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '');
  });
  const [isLoggingInMs, setIsLoggingInMs] = useState(false);
  const [showAzureConfig, setShowAzureConfig] = useState(false);
  const [saveToken, setSaveToken] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [pdfFileForEmail, setPdfFileForEmail] = useState<File | null>(null);
  const [extraAttachmentsForEmail, setExtraAttachmentsForEmail] = useState<StoredAttachment[]>([]);
  const [selectedExtraAttachmentIds, setSelectedExtraAttachmentIds] = useState<string[]>([]);
  const [personalCosts, setPersonalCosts] = useState<Record<string, any>>({});
  const [rentalCosts, setRentalCosts] = useState<Record<string, any>>({});

  // Load detailed order & BP data when modal opens
  useEffect(() => {
    if (!isOpen || !order) return;

    let isMounted = true;
    const loadDetails = async () => {
      setIsLoading(true);
      try {
        let currentOrderData = order;
        if (order.DocEntry) {
          try {
            const fetched = await sapService.getOrder(order.DocEntry);
            if (fetched && isMounted) {
              currentOrderData = fetched;
            }
          } catch (e) {
            console.warn('Usando dados em memória do pedido:', e);
          }
        }
        if (isMounted) setFullOrder(currentOrderData);

        // Fetch real measurements from SAP for all lines (@CUSTOSPESSOAL and @CUSTOSLOC)
        const rawLines = Array.isArray(currentOrderData?.DocumentLines) ? currentOrderData.DocumentLines : [];
        const pCostMap: Record<string, any> = {};
        const rCostMap: Record<string, any> = {};

        await Promise.all(rawLines.map(async (line: any) => {
          const nItem = line.U_nItem ?? line.U_nITEM;
          const itemLoc = line.U_ItemLoc ?? line.U_ITEMLOC;
          if (nItem !== null && nItem !== undefined && String(nItem).trim() !== '') {
            try {
              const pc = await sapService.getPersonnelCost(String(nItem));
              if (pc) pCostMap[String(nItem)] = pc;
            } catch (e) {
              console.warn(`Erro ao carregar custo pessoal #${nItem}:`, e);
            }
          }
          if (itemLoc !== null && itemLoc !== undefined && String(itemLoc).trim() !== '') {
            try {
              const rc = await sapService.getRentalCost(String(itemLoc));
              if (rc) rCostMap[String(itemLoc)] = rc;
            } catch (e) {
              console.warn(`Erro ao carregar custo locação #${itemLoc}:`, e);
            }
          }
        }));

        if (isMounted) {
          setPersonalCosts(pCostMap);
          setRentalCosts(rCostMap);
        }

        const cardCode = currentOrderData.CardCode || order.CardCode;
        if (cardCode) {
          try {
            const bp = await sapService.getBusinessPartner(cardCode);
            if (bp && isMounted) {
              setCustomerBP(bp);
              // Ensure emailTo is updated if client email is found and accounts receivable is retained
              const defaultAR = 'BR-ACCOUNTSRECEIVABLES@qualitechirm.com';
              const bpEmail = (bp.EmailAddress || bp.Email || '').trim();
              if (bpEmail) {
                setEmailTo(prev => {
                  if (!prev || prev === 'destinatario@outlook.com' || prev === defaultAR) {
                    return `${bpEmail}, ${defaultAR}`;
                  }
                  if (!prev.toLowerCase().includes(bpEmail.toLowerCase())) {
                    return `${bpEmail}, ${prev}`;
                  }
                  return prev;
                });
              }
            }
          } catch (e) {
            console.warn('Erro ao carregar dados do cliente:', e);
          }
        }
      } catch (err) {
        console.error('Erro ao preparar layout de impressão:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadDetails();

    return () => {
      isMounted = false;
    };
  }, [isOpen, order]);

  const currentDoc = fullOrder || order || {};

  // Formatted Document Metadata
  const docNum = currentDoc.DocNum || currentDoc.DocEntry || '1029';
  const docNumFormatted = Number(docNum) ? Number(docNum).toLocaleString('pt-BR') : docNum;
  const docDateFormatted = currentDoc.DocDate 
    ? new Date(currentDoc.DocDate).toLocaleDateString('pt-BR') 
    : (currentDoc.DocDueDate ? new Date(currentDoc.DocDueDate).toLocaleDateString('pt-BR') : '17/09/2025');

  // Customer Information
  const customerName = currentDoc.CardName || customerBP?.CardName || 'MODEC SERVICOS DE PETROLEO DO BRASIL LTDA';
  const customerCnpj = customerBP?.FederalTaxID || currentDoc.FederalTaxID || '05.217.376/0006-80';
  const customerIE = customerBP?.StateTaxId || customerBP?.TaxId0 || '082.853.50-9';
  const customerAddress = customerBP?.Address || currentDoc.Address || 'ESTJERONIMO MONTEIRO,S/N';
  const customerCityState = customerBP?.ZipCode 
    ? `${customerBP.ZipCode} - ${customerBP.City || 'VILA VELHA'}-${customerBP.State || 'RJ'}` 
    : '29.115 045-VILA VELHA-RJ';

  // Middle Block References
  const numPedido = currentDoc.NumAtCard || currentDoc.U_POCliente || '4500263057_0';
  const proposta = currentDoc.U_Proposta || currentDoc.Project || currentDoc.U_Projeto || 'teste de escopo';
  const escopo = currentDoc.Comments || currentDoc.U_Escopo || 'proppsta';

  // Helper to format numeric values safely
  const formatNum = (val: any) => {
    if (val === undefined || val === null || val === '') return '0';
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
    if (isNaN(n)) return String(val);
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const formatDateDisplay = (dateVal: any, fallback: string) => {
    if (!dateVal) return fallback;
    try {
      const dStr = String(dateVal).split('T')[0];
      if (dStr.includes('-')) {
        const parts = dStr.split('-');
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('pt-BR');
      }
    } catch {}
    return fallback;
  };

  // Extract lines and categorize into Services and Equipment
  const { serviceLines, rentalLines, servPrestado, equipLocados, descontos, totalGeral } = useMemo(() => {
    const rawLines = Array.isArray(currentDoc.DocumentLines) && currentDoc.DocumentLines.length > 0 
      ? currentDoc.DocumentLines 
      : [];

    const services: any[] = [];
    const rentals: any[] = [];

    rawLines.forEach((line: any, idx: number) => {
      const desc = (line.ItemDescription || line.ItemName || line.Dscription || '').toLowerCase();
      const code = (line.ItemCode || '').toLowerCase();
      const isLogistics = desc.includes('logistica') || desc.includes('logística') || code.includes('log') || code === 's000073';
      const isRental = !isLogistics && (line.U_ItemLoc || desc.includes('equipamento') || desc.includes('loca') || desc.includes('kit') || desc.includes('rope') || code.includes('eq') || code.includes('loc'));

      const qty = Number(line.Quantity || 1);
      const unitPrice = Number(line.Price || line.UnitPrice || 0);

      // Parse taxa flexibly (supports "10", "10,5", 10, CommissionPercent, Commission, etc.)
      const parseTaxaVal = (val: any) => {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        const cleaned = String(val).replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
      };

      const rawTaxa = line.Taxa !== undefined && line.Taxa !== null && line.Taxa !== ''
        ? line.Taxa
        : (line.CommisionPercent ?? line.CommissionPercent ?? line.Commission);
      const taxaVal = parseTaxaVal(rawTaxa);
      const hasTaxa = taxaVal > 0;
      const baseCalc = hasTaxa ? (unitPrice * (taxaVal / 100)) * qty : (unitPrice * qty);
      const lineDiscPct = Number(line.DiscountPercent) || 0;
      const lineTotal = Number(line.LineTotal) || (baseCalc * (1 - lineDiscPct / 100));

      if (isRental) {
        const itemLocKey = String(line.U_ItemLoc ?? line.U_ITEMLOC ?? '').trim();
        const custoLoc = (itemLocKey ? rentalCosts[itemLocKey] : null) || (line as any)._rentCost || (line as any).rentalCost;

        const vlrOnSiteNum = custoLoc?.U_VlOnSite !== undefined && Number(custoLoc.U_VlOnSite) > 0
          ? Number(custoLoc.U_VlOnSite)
          : (custoLoc?.U_ValorBase !== undefined && Number(custoLoc.U_ValorBase) > 0)
            ? Number(custoLoc.U_ValorBase)
            : Number(line.Price || line.UnitPrice || 60);

        const vlrInTransitNum = (custoLoc?.U_InTransit !== undefined && Number(custoLoc.U_InTransit) > 0)
          ? Number(custoLoc.U_InTransit)
          : (custoLoc?.U_VlInTransit !== undefined && Number(custoLoc.U_VlInTransit) > 0)
            ? Number(custoLoc.U_VlInTransit)
            : (vlrOnSiteNum * ((Number(custoLoc?.U_PercInTransit ?? custoLoc?.percInTransit) || 50) / 100));

        const rentTotalFinal = (custoLoc?.U_Total !== undefined && Number(custoLoc.U_Total) > 0)
          ? Number(custoLoc.U_Total)
          : lineTotal;

        const rawStartDate = custoLoc?.U_DtInicial || custoLoc?.U_DataInicial || line.U_DataInicial || line.U_DtInicial;
        const rawEndDate = custoLoc?.U_DtFinal || custoLoc?.U_DataFinal || line.U_DataFinal || line.U_DtFinal;

        let calculatedDays = 0;
        if (rawStartDate && rawEndDate) {
          try {
            const d1 = new Date(String(rawStartDate).split('T')[0]);
            const d2 = new Date(String(rawEndDate).split('T')[0]);
            if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
              calculatedDays = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);
            }
          } catch {}
        }

        const qtdDiasABordo = custoLoc?.U_QtdDiariasBordo !== undefined && Number(custoLoc.U_QtdDiariasBordo) > 0
          ? Number(custoLoc.U_QtdDiariasBordo)
          : custoLoc?.U_QtdDiariasABordo !== undefined && Number(custoLoc.U_QtdDiariasABordo) > 0
            ? Number(custoLoc.U_QtdDiariasABordo)
            : custoLoc?.U_QtdDias !== undefined && Number(custoLoc.U_QtdDias) > 0
              ? Number(custoLoc.U_QtdDias)
              : (calculatedDays > 0 ? calculatedDays : 11);

        const qtdDiasTotal = calculatedDays > 0 ? calculatedDays : qtdDiasABordo;

        const qtdDiariasInTransit = custoLoc?.U_QtdDiariasInTransit !== undefined
          ? Number(custoLoc.U_QtdDiariasInTransit)
          : 0;

        const qtdDiariasOnSite = custoLoc?.U_QtdDiariasOnSite !== undefined && Number(custoLoc.U_QtdDiariasOnSite) > 0
          ? Number(custoLoc.U_QtdDiariasOnSite)
          : Math.max(0, qtdDiasABordo - qtdDiariasInTransit);

        const equipQty = custoLoc?.U_Qtd_Dias !== undefined && Number(custoLoc.U_Qtd_Dias) > 0
          ? Number(custoLoc.U_Qtd_Dias)
          : custoLoc?.U_Quantidade !== undefined && Number(custoLoc.U_Quantidade) > 0
            ? Number(custoLoc.U_Quantidade)
            : Number(line.Quantity || 1);

        rentals.push({
          inicio: formatDateDisplay(rawStartDate, '03/04/2025'),
          final: formatDateDisplay(rawEndDate, '20/04/2025'),
          qtde: equipQty.toFixed(2).replace('.', ','),
          descricao: custoLoc?.Name || custoLoc?.U_Recurso || line.ItemDescription || line.ItemName || line.Dscription || 'LOCAÇÃO DE EQUIPAMENTOS',
          qtdeDias: qtdDiasTotal,
          vlrOnSite: vlrOnSiteNum.toFixed(2).replace('.', ','),
          vlrInTransit: vlrInTransitNum.toFixed(2).replace('.', ','),
          qtdeDiariasABordo: qtdDiasABordo,
          qtdeDiariasOnSite: qtdDiariasOnSite,
          qtdeDiariasInTransit: qtdDiariasInTransit,
          taxaPct: hasTaxa ? `${taxaVal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%` : '-',
          total: rentTotalFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        });
      } else {
        const custoPessoal = personalCosts[String(line.U_nItem ?? line.U_nITEM ?? '')] || (line as any)._persCost;

        const vlrNormalNum = (custoPessoal?.U_VlNormal !== undefined && Number(custoPessoal.U_VlNormal) > 0)
          ? Number(custoPessoal.U_VlNormal)
          : Number(line.Price || line.UnitPrice || 500);

        const standByRateNum = (custoPessoal?.U_StandBy !== undefined && Number(custoPessoal.U_StandBy) > 0)
          ? Number(custoPessoal.U_StandBy)
          : (vlrNormalNum * 0.5);

        const qtdDobra = Number(custoPessoal?.U_QtdDobra ?? line.U_QtdDobra ?? 0);
        const percDobra = Number(custoPessoal?.U_PercDobra ?? line.U_PercDobra ?? 50);
        const valDobra = qtdDobra * (vlrNormalNum * (percDobra / 100));

        // When line has Taxa or Dobra, reflect clearly in print draft
        const valTaxaItem = hasTaxa ? (unitPrice * (taxaVal / 100) * qty) : 0;
        const totalTaxasLinha = valDobra > 0 ? valDobra : valTaxaItem;

        // Dobra / Taxas Extras column:
        const hrExtraDiurna = Number(custoPessoal?.U_HrExtraDiurna || 0);
        const hrExtraNot = Number(custoPessoal?.U_HrExtraNot || 0);

        let taxaDobText = '0,00  0,00';
        if (hrExtraDiurna > 0 || hrExtraNot > 0) {
          taxaDobText = `${formatNum(hrExtraDiurna)}  ${formatNum(hrExtraNot)}`;
        } else if (qtdDobra > 0) {
          taxaDobText = `${valDobra.toFixed(2).replace('.', ',')} (${percDobra}%)`;
        } else if (hasTaxa) {
          taxaDobText = `${taxaVal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
        }

        const totalTaxasVal = (custoPessoal?.U_TotalGeral !== undefined && Number(custoPessoal.U_TotalGeral) >= 0)
          ? Number(custoPessoal.U_TotalGeral)
          : totalTaxasLinha;

        const totalTaxasStr = totalTaxasVal > 0 
          ? totalTaxasVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '0,00';

        const lineTotalFinal = (custoPessoal?.U_Total !== undefined && Number(custoPessoal.U_Total) > 0)
          ? Number(custoPessoal.U_Total)
          : lineTotal;

        const qtdDiariasNormal = custoPessoal?.U_QtdDiarias !== undefined ? Number(custoPessoal.U_QtdDiarias) : qty;
        const qtdDiariasStandBy = custoPessoal?.U_QtdDiariasSt !== undefined ? Number(custoPessoal.U_QtdDiariasSt) : 0;
        const noturnoNormal = custoPessoal?.U_NotNor !== undefined ? Number(custoPessoal.U_NotNor) : 0;
        const noturnoDob = custoPessoal?.U_NotNob !== undefined ? Number(custoPessoal.U_NotNob) : 0;
        const hExtraDiu = custoPessoal?.U_HExtraDiu !== undefined ? Number(custoPessoal.U_HExtraDiu) : 0;
        const hExtraNot = custoPessoal?.U_HExtraNot !== undefined ? Number(custoPessoal.U_HExtraNot) : 0;

        const isLogistics = desc.includes('logistica') || desc.includes('logística') || code.includes('log') || code === 's000073';

        if (isLogistics) {
          services.push({
            inicio: '-',
            fim: '-',
            cargo: line.ItemDescription || line.ItemName || line.Dscription || 'SERVICO - LOGISTICA',
            colaborador: '-',
            vlrNormal: unitPrice > 0 
              ? unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
              : vlrNormalNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            taxaPct: hasTaxa ? `${taxaVal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%` : '-',
            standByRate: '-',
            diariasNormalMob: `${formatNum(qty)}`,
            noturnoNorDob: '-',
            hrExtrasDiurNot: '-',
            taxaDobDiurNot: '-',
            totalTaxas: '-',
            totalGeral: lineTotalFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          });
        } else {
          const rawPersStartDate = custoPessoal?.U_DtInicial || custoPessoal?.U_DataInicial || line.U_DataInicial || line.U_DtInicial;
          const rawPersEndDate = custoPessoal?.U_DtFinal || custoPessoal?.U_DataFinal || line.U_DataFinal || line.U_DtFinal;

          services.push({
            inicio: formatDateDisplay(rawPersStartDate, idx === 0 ? '04/04/2026' : idx === 1 ? '07/12/2025' : '04/01/2026'),
            fim: formatDateDisplay(rawPersEndDate, idx === 0 ? '14/04/2026' : idx === 1 ? '14/12/2025' : '14/01/2026'),
            cargo: line.ItemDescription || line.ItemName || line.Dscription || custoPessoal?.Name || 'SERVICO - LOGISTICA',
            colaborador: custoPessoal?.U_Colaborador || line.U_Colaborador || (idx === 2 ? 'Cleiton Ramos dos Santos' : 'Julio Scofano'),
            vlrNormal: vlrNormalNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            taxaPct: hasTaxa ? `${taxaVal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%` : '-',
            standByRate: standByRateNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            diariasNormalMob: `${formatNum(qtdDiariasNormal)}  ${formatNum(qtdDiariasStandBy)}`,
            noturnoNorDob: `${formatNum(noturnoNormal)}  ${formatNum(noturnoDob)}`,
            hrExtrasDiurNot: `${formatNum(hExtraDiu)}  ${formatNum(hExtraNot)}`,
            taxaDobDiurNot: taxaDobText,
            totalTaxas: totalTaxasStr,
            totalGeral: lineTotalFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          });
        }
      }
    });

    // If no raw lines (e.g. fresh draft or demo view), provide the official Qualitech test template lines matching user screenshot
    if (services.length === 0 && rentals.length === 0) {
      services.push(
        {
          inicio: '04/04/2026',
          fim: '14/04/2026',
          cargo: 'Project Supervisor (NDT Specialist)/IRATA Level I or II',
          colaborador: 'Julio Scofano',
          vlrNormal: '500,00',
          taxaPct: '-',
          standByRate: '250,00',
          diariasNormalMob: '1  1',
          noturnoNorDob: '1  1',
          hrExtrasDiurNot: '1  1',
          taxaDobDiurNot: '0,00  0,00',
          totalTaxas: '0,00',
          totalGeral: '5.668,33'
        },
        {
          inicio: '-',
          fim: '-',
          cargo: 'SERVICO - LOGISTICA',
          colaborador: '-',
          vlrNormal: '2.540,75',
          taxaPct: '-',
          standByRate: '-',
          diariasNormalMob: '1',
          noturnoNorDob: '-',
          hrExtrasDiurNot: '-',
          taxaDobDiurNot: '-',
          totalTaxas: '-',
          totalGeral: '2.540,75'
        },
        {
          inicio: '-',
          fim: '-',
          cargo: 'SERVICO - LOGISTICA',
          colaborador: '-',
          vlrNormal: '9.180,00',
          taxaPct: '-',
          standByRate: '-',
          diariasNormalMob: '2',
          noturnoNorDob: '-',
          hrExtrasDiurNot: '-',
          taxaDobDiurNot: '-',
          totalTaxas: '-',
          totalGeral: '18.360,00'
        }
      );

      rentals.push({
        inicio: '03/04/2025',
        final: '20/04/2025',
        qtde: '13,00',
        descricao: 'Rope Access Kits - Each',
        qtdeDias: 13,
        vlrOnSite: '60,00',
        vlrInTransit: '30,00',
        qtdeDiariasABordo: 18,
        qtdeDiariasOnSite: 16,
        qtdeDiariasInTransit: 2,
        taxaPct: '-',
        total: '13.260,00'
      });
    }

    const calcServ = services.reduce((acc, s) => {
      const num = parseFloat(s.totalGeral.replace(/\./g, '').replace(',', '.')) || 0;
      return acc + num;
    }, 0);

    const calcRent = rentals.reduce((acc, r) => {
      const num = parseFloat(r.total.replace(/\./g, '').replace(',', '.')) || 0;
      return acc + num;
    }, 0);

    let disc = 0;
    if (currentDoc.TotalDiscount && Number(currentDoc.TotalDiscount) > 0) {
      disc = Number(currentDoc.TotalDiscount);
    } else if (currentDoc.DiscountPercent && Number(currentDoc.DiscountPercent) > 0) {
      disc = (calcServ + calcRent) * ((Number(currentDoc.DiscountPercent) || 0) / 100);
    }

    const total = (currentDoc.DocTotal && Number(currentDoc.DocTotal) > 0)
      ? Number(currentDoc.DocTotal)
      : Math.max(0, calcServ + calcRent - disc);

    return {
      serviceLines: services,
      rentalLines: rentals,
      servPrestado: calcServ > 0 ? calcServ : (services.length > 0 ? 0 : 26918.00),
      equipLocados: calcRent > 0 ? calcRent : (rentals.length > 0 ? 0 : 1867.64),
      descontos: disc,
      totalGeral: total > 0 ? total : Math.max(0, calcServ + calcRent - disc)
    };
  }, [currentDoc, personalCosts, rentalCosts]);

  // Unified page distribution:
  // If items fit on Page 1 (<= 5 items), it remains a single-page document with services and rentals together.
  // If items overflow (> 5 items), Page 2 repeats the header and continues with remaining rows.
  const previewPages = useMemo(() => {
    const totalCount = serviceLines.length + rentalLines.length;

    if (totalCount <= 5) {
      return [
        {
          pageNumber: 1,
          services: serviceLines,
          rentals: rentalLines,
          isFirstPage: true,
          isLastPage: true
        }
      ];
    }

    const pages: Array<{
      pageNumber: number;
      services: typeof serviceLines;
      rentals: typeof rentalLines;
      isFirstPage: boolean;
      isLastPage: boolean;
    }> = [];

    if (serviceLines.length <= 4) {
      const page1RentalsCount = Math.max(0, 4 - serviceLines.length);
      pages.push({
        pageNumber: 1,
        services: serviceLines,
        rentals: rentalLines.slice(0, page1RentalsCount),
        isFirstPage: true,
        isLastPage: false
      });
      pages.push({
        pageNumber: 2,
        services: [],
        rentals: rentalLines.slice(page1RentalsCount),
        isFirstPage: false,
        isLastPage: true
      });
    } else {
      pages.push({
        pageNumber: 1,
        services: serviceLines.slice(0, 4),
        rentals: [],
        isFirstPage: true,
        isLastPage: false
      });
      pages.push({
        pageNumber: 2,
        services: serviceLines.slice(4),
        rentals: rentalLines,
        isFirstPage: false,
        isLastPage: true
      });
    }

    return pages;
  }, [serviceLines, rentalLines]);

  // Helper to build jsPDF document for both download and email attachment
  const generatePdfInstance = (lang: 'pt' | 'en' = layoutLang): { doc: jsPDF; fileName: string } => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = 297;
    const pageHeight = 210;
    const isEn = lang === 'en';

    const drawHeader = (docInstance: jsPDF, pageNum: number, isFirstPage: boolean) => {
      // Top Yellow Bar & DRAFT INVOICE Title
      docInstance.setFillColor(245, 158, 11); // Yellow accent
      docInstance.rect(205, 10, 2.5, 7, 'F');

      docInstance.setFont('helvetica', 'bold');
      docInstance.setFontSize(14);
      docInstance.setTextColor(15, 23, 42);
      docInstance.text('DRAFT INVOICE', 209, 15.5);

      // Subtable (Document No., Page, Issue Date)
      docInstance.setDrawColor(226, 232, 240);
      docInstance.setLineDashPattern([1, 1], 0);
      docInstance.line(205, 18.5, 283, 18.5);
      docInstance.setLineDashPattern([], 0);

      docInstance.setFont('helvetica', 'normal');
      docInstance.setFontSize(7.5);
      docInstance.setTextColor(100, 116, 139);
      docInstance.text(isEn ? 'Document No.' : 'N° Documento', 205, 22.5);
      docInstance.text(isEn ? 'Page' : 'Pagina', 270, 22.5);

      docInstance.setFont('helvetica', 'bold');
      docInstance.setFontSize(8.5);
      docInstance.setTextColor(15, 23, 42);
      docInstance.text(String(docNumFormatted), 205, 27);
      docInstance.text(String(pageNum), 273, 27);

      docInstance.setFont('helvetica', 'normal');
      docInstance.setFontSize(7.5);
      docInstance.setTextColor(100, 116, 139);
      docInstance.text(isEn ? 'Issue Date' : 'Data de Emissão', 205, 32);

      docInstance.setFont('helvetica', 'bold');
      docInstance.setFontSize(8);
      docInstance.setTextColor(15, 23, 42);
      docInstance.text(docDateFormatted, 205, 36.5);

      // Company Header (Left) - Qualitech Brand Logo
      // Draw Qualitech Swirl Ribbon Icon
      docInstance.setFillColor(8, 47, 73);
      docInstance.roundedRect(14, 15, 7.5, 1.8, 0.8, 0.8, 'F');
      docInstance.setFillColor(7, 89, 133);
      docInstance.roundedRect(14.5, 12.8, 6.8, 1.6, 0.7, 0.7, 'F');
      docInstance.setFillColor(3, 105, 161);
      docInstance.roundedRect(15, 10.8, 5.8, 1.5, 0.6, 0.6, 'F');
      docInstance.setFillColor(2, 132, 199);
      docInstance.roundedRect(15.6, 9.0, 4.6, 1.4, 0.5, 0.5, 'F');
      docInstance.setFillColor(14, 165, 233);
      docInstance.roundedRect(16.3, 7.4, 3.2, 1.2, 0.4, 0.4, 'F');
      docInstance.setFillColor(56, 189, 248);
      docInstance.circle(17.9, 6.4, 0.9, 'F');

      // "Quali" (navy) and "tech" (bright blue)
      docInstance.setFont('helvetica', 'bold');
      docInstance.setFontSize(15);
      docInstance.setTextColor(12, 53, 89);
      docInstance.text('Quali', 23, 15);
      docInstance.setTextColor(0, 136, 209);
      docInstance.text('tech', 34.5, 15);

      docInstance.setFont('helvetica', 'bold');
      docInstance.setFontSize(7.5);
      docInstance.setTextColor(15, 23, 42);
      docInstance.text(isEn ? 'QUALITECH INSPECTION, REPAIR AND MAINTENANCE' : 'QUALITECH INSPECAO, REPARO E MANUTENCAO LTDA', 14, 20.5);

      docInstance.setFont('helvetica', 'normal');
      docInstance.setFontSize(7);
      docInstance.setTextColor(71, 85, 105);
      docInstance.text(`CNPJ: 17.417.147/0001-84    ${isEn ? 'State Reg.' : 'Inscrição Estadual'}: 79909564`, 14, 24.5);
      docInstance.text('Jose Silva de Azevedo Neto, 200, Barra da Tijuca, Rio de Janeiro - RJ - BR', 14, 28.5);
      docInstance.text(`${isEn ? 'Phone' : 'Telefone'}: (21) 3500-0000`, 14, 32.5);

      if (isFirstPage) {
        // Full Customer + Middle + Summary box on Page 1
        const blockY = 40;

        // Customer Info
        docInstance.setFillColor(245, 158, 11);
        docInstance.triangle(14, blockY + 2.5, 16.5, blockY + 1.2, 14, blockY, 'F');

        docInstance.setFont('helvetica', 'bold');
        docInstance.setFontSize(7.5);
        docInstance.setTextColor(15, 23, 42);
        docInstance.text(customerName.slice(0, 48), 18, blockY + 2.5);

        docInstance.setFont('helvetica', 'normal');
        docInstance.setFontSize(7);
        docInstance.setTextColor(71, 85, 105);
        docInstance.text('CNPJ', 23, blockY + 8);
        docInstance.text(customerCnpj, 48, blockY + 8);

        docInstance.text(isEn ? 'State Reg.' : 'Inscrição Estadual', 23, blockY + 12);
        docInstance.text(customerIE, 48, blockY + 12);

        docInstance.text(customerAddress, 23, blockY + 17);
        docInstance.text(customerCityState, 23, blockY + 21);
        docInstance.text(isEn ? 'BRAZIL' : 'BRASIL', 23, blockY + 25);

        // Middle Column: PO Number, Proposal, Scope
        docInstance.setFont('helvetica', 'normal');
        docInstance.setFontSize(7);
        docInstance.setTextColor(100, 116, 139);
        docInstance.text(isEn ? 'PO Number' : 'N° Pedido', 110, blockY + 2);
        docInstance.setFont('helvetica', 'bold');
        docInstance.setTextColor(15, 23, 42);
        docInstance.text(numPedido, 110, blockY + 6.5);

        docInstance.setFont('helvetica', 'normal');
        docInstance.setTextColor(100, 116, 139);
        docInstance.text(isEn ? 'Proposal' : 'Proposta', 110, blockY + 12);
        docInstance.setFont('helvetica', 'bold');
        docInstance.setTextColor(15, 23, 42);
        docInstance.text(proposta, 110, blockY + 16.5);

        docInstance.setFont('helvetica', 'normal');
        docInstance.setTextColor(100, 116, 139);
        docInstance.text(isEn ? 'Scope' : 'Escopo', 110, blockY + 22);
        docInstance.setFont('helvetica', 'bold');
        docInstance.setTextColor(15, 23, 42);
        docInstance.text(escopo, 110, blockY + 26.5);

        // Right Summary Box (with solid border)
        docInstance.setDrawColor(51, 65, 85);
        docInstance.setLineWidth(0.3);
        docInstance.rect(205, blockY - 2, 78, 30);

        docInstance.setFont('helvetica', 'normal');
        docInstance.setFontSize(7);
        docInstance.setTextColor(15, 23, 42);
        docInstance.text(isEn ? 'Services Rendered' : 'Serv.Prestado.', 210, blockY + 4);
        docInstance.text(servPrestado.toLocaleString(isEn ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2 }), 278, blockY + 4, { align: 'right' });

        docInstance.text(isEn ? 'Leased Equipment' : 'Equipamentos Locados', 210, blockY + 11);
        docInstance.text(equipLocados.toLocaleString(isEn ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2 }), 278, blockY + 11, { align: 'right' });

        docInstance.text(isEn ? 'Discounts' : 'Descontos', 210, blockY + 18);
        docInstance.text(descontos.toLocaleString(isEn ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2 }), 278, blockY + 18, { align: 'right' });

        docInstance.line(205, blockY + 21, 283, blockY + 21);

        docInstance.setFont('helvetica', 'bold');
        docInstance.text('Total', 245, blockY + 27);
        docInstance.text(totalGeral.toLocaleString(isEn ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2 }), 278, blockY + 27, { align: 'right' });
      } else {
        // Repeated Header on Page 2+
        const blockY = 38;
        docInstance.setFillColor(245, 158, 11);
        docInstance.triangle(14, blockY + 2.5, 16.5, blockY + 1.2, 14, blockY, 'F');

        docInstance.setFont('helvetica', 'bold');
        docInstance.setFontSize(7.5);
        docInstance.setTextColor(15, 23, 42);
        docInstance.text(customerName.slice(0, 48), 18, blockY + 2.5);

        docInstance.setFont('helvetica', 'normal');
        docInstance.setFontSize(7);
        docInstance.setTextColor(71, 85, 105);
        docInstance.text(`CNPJ: ${customerCnpj}  |  ${isEn ? 'State Reg.' : 'IE'}: ${customerIE}`, 18, blockY + 7);

        docInstance.setFont('helvetica', 'normal');
        docInstance.setTextColor(100, 116, 139);
        docInstance.text(isEn ? 'PO Number:' : 'N° Pedido:', 130, blockY + 2.5);
        docInstance.setFont('helvetica', 'bold');
        docInstance.setTextColor(15, 23, 42);
        docInstance.text(numPedido, 145, blockY + 2.5);

        docInstance.setFont('helvetica', 'normal');
        docInstance.setTextColor(100, 116, 139);
        docInstance.text(isEn ? 'Proposal:' : 'Proposta:', 185, blockY + 2.5);
        docInstance.setFont('helvetica', 'bold');
        docInstance.setTextColor(15, 23, 42);
        docInstance.text(proposta.slice(0, 35), 200, blockY + 2.5);

        docInstance.setDrawColor(226, 232, 240);
        docInstance.line(14, blockY + 10, 283, blockY + 10);
      }
    };

    // Draw header on Page 1
    drawHeader(doc, 1, true);

    let currentY = 74;

    // 1. Detalhamento do Serviço Prestado / Breakdown of Services Rendered
    if (serviceLines.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(isEn ? 'Breakdown of Services Rendered:' : 'Detalhamento do Serviço Prestado:', 14, currentY);

      const serviceHeaders = isEn ? [
        'Start', 'End', 'Position / Role', 'Personnel', 'Standard Rate', 'Taxa %',
        'Standby Rate\nor mob x demob', 'Daily Rate\nNormal x mob', 'Night Shift\nNorm x Dbl', 
        'Overtime\nDay - Night', 'Double / Fees\nDay-Night / %', 'Total\nFees', 'Grand\nTotal'
      ] : [
        'Início', 'Fim', 'Cargo', 'Colaborador', 'Vlr. Normal', 'Taxa %',
        'Stand By Rate\nor mob x demob', 'Diarias\nNormal x mob', 'Noturno\nNor x Dob', 
        'Hr. Extras\nDiur. - Not.', 'Taxa Dob\n/ Taxas', 'Total\nTaxas', 'Total\nGeral'
      ];

      const serviceRows = serviceLines.map(s => [
        s.inicio,
        s.fim,
        s.cargo,
        s.colaborador,
        s.vlrNormal,
        s.taxaPct || '-',
        s.standByRate,
        s.diariasNormalMob,
        s.noturnoNorDob,
        s.hrExtrasDiurNot,
        s.taxaDobDiurNot,
        s.totalTaxas,
        s.totalGeral
      ]);

      autoTable(doc, {
        head: [serviceHeaders],
        body: serviceRows,
        startY: currentY + 3,
        margin: { top: 52, bottom: 14, left: 14, right: 14 },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            drawHeader(doc, data.pageNumber, false);
          }
        },
        styles: {
          fontSize: 6.5,
          cellPadding: 1.6,
          textColor: [15, 23, 42],
          lineColor: [241, 245, 249],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          halign: 'left',
          valign: 'middle'
        },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 15 },
          2: { cellWidth: 42 },
          3: { cellWidth: 28 },
          4: { cellWidth: 17, halign: 'right' },
          5: { cellWidth: 13, halign: 'center' },
          6: { cellWidth: 17, halign: 'right' },
          7: { cellWidth: 16, halign: 'center' },
          8: { cellWidth: 16, halign: 'center' },
          9: { cellWidth: 16, halign: 'center' },
          10: { cellWidth: 24, halign: 'center' },
          11: { cellWidth: 22, halign: 'right' },
          12: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
        }
      });

      currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 74;
    }

    // 2. Detalhamento do Equipamento Locado / Breakdown of Leased Equipment
    if (rentalLines.length > 0) {
      if (pageHeight - 16 - currentY < 25) {
        doc.addPage('a4', 'landscape');
        drawHeader(doc, doc.getNumberOfPages(), false);
        currentY = 54;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(isEn ? 'Breakdown of Leased Equipment:' : 'Detalhamento do Equipamento Locado:', 14, currentY);

      const rentalHeaders = isEn ? [
        'Start', 'End', 'Qty', 'Description', 'Days', 
        'On-Site Rate', 'In-Transit Rate', 'Daily Qty\nOnboard', 
        'Daily Qty\nOn Site', 'Daily Qty\nIn Transit', 'Total'
      ] : [
        'Inicio', 'Final', 'Qtde', 'Descrição', 'Qtde Dias', 
        'Vlr OnSite', 'Vlr In Transit', 'Qtde de Diarias\na Bordo', 
        'Qtde de Diarias\nOn Site', 'Qtde de Diarias\nIn Transit', 'Total'
      ];

      const rentalRows = rentalLines.map(r => [
        r.inicio,
        r.final,
        r.qtde,
        r.descricao,
        String(r.qtdeDias),
        r.vlrOnSite,
        r.vlrInTransit,
        String(r.qtdeDiariasABordo),
        String(r.qtdeDiariasOnSite),
        String(r.qtdeDiariasInTransit),
        r.total
      ]);

      autoTable(doc, {
        head: [rentalHeaders],
        body: rentalRows,
        startY: currentY + 3,
        margin: { top: 52, bottom: 14, left: 14, right: 14 },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            drawHeader(doc, data.pageNumber, false);
          }
        },
        styles: {
          fontSize: 6.5,
          cellPadding: 2,
          textColor: [15, 23, 42],
          lineColor: [241, 245, 249],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          halign: 'left',
          valign: 'middle'
        },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 16 },
          2: { cellWidth: 14, halign: 'right' },
          3: { cellWidth: 65 },
          4: { cellWidth: 18, halign: 'center' },
          5: { cellWidth: 20, halign: 'right' },
          6: { cellWidth: 22, halign: 'right' },
          7: { cellWidth: 25, halign: 'center' },
          8: { cellWidth: 25, halign: 'center' },
          9: { cellWidth: 24, halign: 'center' },
          10: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
        }
      });

      currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : currentY;
    }

    // 3. Bottom Totals & Proposal References
    if (pageHeight - 16 - currentY < 24) {
      doc.addPage('a4', 'landscape');
      drawHeader(doc, doc.getNumberOfPages(), false);
      currentY = 52;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(isEn ? 'Total Amount' : 'Valor Total', 210, currentY + 4);
    doc.text(`${isEn ? 'BRL' : 'R$'}      ${totalGeral.toLocaleString(isEn ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2 })}`, 283, currentY + 4, { align: 'right' });

    const cotacaoRefY = currentY + 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(isEn ? 'Based on Quotation 5058' : 'Baseado Na Cotacao 5058', 14, cotacaoRefY);

    // Light gray reference background container
    doc.setFillColor(248, 250, 252);
    doc.rect(14, cotacaoRefY + 2, 269, 20, 'F');

    // 4. Update footers on all pages
    const totalPdfPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPdfPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(isEn ? `Page ${p} of ${totalPdfPages}` : `Página ${p} de ${totalPdfPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
      doc.text(isEn ? 'Printed via SAP Business One' : 'Impresso por SAP Business One', pageWidth - 14, pageHeight - 8, { align: 'right' });
    }

    // File Name
    const fileName = isEn ? `Draft_Invoice_${docNum}_Qualitech_EN.pdf` : `Pedido_Venda_${docNum}_Qualitech.pdf`;
    return { doc, fileName };
  };

  const getPdfFile = (lang: 'pt' | 'en' = layoutLang): File => {
    const { doc, fileName } = generatePdfInstance(lang);
    const blob = doc.output('blob');
    return new File([blob], fileName, { type: 'application/pdf' });
  };

  // Generate & Download PDF using jsPDF + autoTable
  const handleDownloadPDF = async () => {
    setIsGeneratingPdf(true);
    try {
      const { doc, fileName } = generatePdfInstance(layoutLang);
      doc.save(fileName);
      toast.success(layoutLang === 'en' 
        ? `Sales Order Draft Invoice #${docNum} downloaded successfully!`
        : `PDF do Pedido de Venda #${docNum} baixado com sucesso!`);
    } catch (err) {
      console.error('Falha ao exportar PDF:', err);
      toast.error('Erro ao gerar o arquivo PDF do pedido.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Helper to build Subject and Body for Email according to user specifications
  const buildEmailDraft = (
    lang: 'pt' | 'en',
    hasPO: boolean,
    needsAdj: boolean,
    client: string,
    unit: string,
    wo: string,
    po: string,
    scope: string,
    period: string,
    servVal: number,
    rentVal: number,
    totalVal: number,
    docNumber: string
  ) => {
    const isEn = lang === 'en';
    const clientDisplay = client || 'Cliente';
    const unitDisplay = unit || (isEn ? 'Operational Unit' : 'Unidade Operacional');
    const woDisplay = wo || String(docNumber);
    const poDisplay = hasPO ? (po || (isEn ? '[PO number]' : '[número da PO]')) : (isEn ? 'N/A' : 'N/A');
    const scopeDisplay = scope || (isEn ? 'Offshore Inspection, Repair and Maintenance Services' : 'Serviços de Inspeção, Reparo e Manutenção');
    const periodDisplay = period || (isEn ? 'Billing Period' : 'Mês de referência');

    const servFmt = isEn 
      ? servVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : servVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rentFmt = isEn 
      ? rentVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : rentVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalFmt = isEn 
      ? totalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let subject = '';
    let body = '';

    if (isEn) {
      subject = `${clientDisplay} | ${unitDisplay} | WO ${woDisplay} | Draft Invoice ${docNumber} Rev. 0 | Approval for Invoicing`;
      
      let poClause = '';
      if (!hasPO) {
        poClause = '\n\nOnce the Draft Invoice has been approved, we kindly request that the PO be issued and submitted so that we may proceed with issuing and submitting the Brazilian tax invoice (Nota Fiscal) for payment processing.';
      } else if (needsAdj) {
        poClause = '\n\nOnce the Draft Invoice has been approved, we kindly request a supplementary PO or an adjustment to the existing PO so that we may proceed with issuing and submitting the Brazilian tax invoice (Nota Fiscal) for payment processing.';
      }

      body = `Dear all,\n\nPlease find attached Draft Invoice ${docNumber} Rev. 0 for your review and approval, as detailed below:\n\nReferences:\n• PO: ${poDisplay}\n• WO: ${woDisplay}\n• Scope: ${scopeDisplay}\n• Billing period: ${periodDisplay}\n\nFinancial summary:\n• Services: BRL ${servFmt}\n• Equipment: BRL ${rentFmt}\n• Total amount: BRL ${totalFmt}${poClause}`;
    } else {
      subject = `${clientDisplay} | ${unitDisplay} | WO ${woDisplay} | Draft Invoice ${docNumber} Rev. 0 | Aprovação para faturamento`;
      
      let poClause = '';
      if (!hasPO) {
        poClause = '\n\nApós a aprovação da Draft Invoice, ficamos no aguardo da emissão e do envio da PO para prosseguirmos com o envio da Nota Fiscal para faturamento.';
      } else if (needsAdj) {
        poClause = '\n\nApós a aprovação da Draft Invoice, ficamos no aguardo da PO complementar ou ajuste da PO, para cobertura do valor aprovado.';
      }

      body = `Prezados,\n\nEncaminhamos, para análise e aprovação, a Draft Invoice ${docNumber} Rev. 0, conforme abaixo:\n\nReferências:\n• PO ${poDisplay}\n• WO WO ${woDisplay}\n• Escopo: ${scopeDisplay}\n• Mês de referência: ${periodDisplay}\n\nResumo financeiro:\n• Serviços: R$ ${servFmt}\n• Equipamentos: R$ ${rentFmt}\n• Valor total: R$ ${totalFmt}${poClause}`;
    }

    return { subject, body };
  };

  const handleOpenEmailModal = () => {
    try {
      const storedAccount = getStoredMicrosoftAccount();
      if (storedAccount) {
        setMsAccount(storedAccount);
        setMsGraphToken(storedAccount.accessToken);
      }
      const defaultAccountsReceivable = 'BR-ACCOUNTSRECEIVABLES@qualitechirm.com';
      const clientEmail = (
        customerBP?.EmailAddress ||
        customerBP?.Email ||
        currentDoc.ContactEmail ||
        currentDoc.EmailAddress ||
        currentDoc.Email ||
        ''
      ).trim();

      const initialEmailTo = clientEmail
        ? `${clientEmail}, ${defaultAccountsReceivable}`
        : defaultAccountsReceivable;

      setEmailTo(initialEmailTo);

      const initialHasPO = Boolean(numPedido && numPedido.trim() !== '' && numPedido !== '0');
      const initialUnit = currentDoc.U_Unidade || currentDoc.U_Plataforma || currentDoc.ShipToCode || 'FPSO Carioca';
      
      // Resolve WO from lines if not present at header
      const lineWO = (currentDoc.DocumentLines || [])
        .map((l: any) => l.CostingCode4 || l.ProjectCode || l.U_WO || l.U_Projeto || l.Project)
        .find((v: any) => v && String(v).trim() !== '' && String(v).trim().toUpperCase() !== 'BASE');
      const initialWO = currentDoc.U_WO || currentDoc.U_NumWO || currentDoc.Project || lineWO || String(docNum);
      const initialPO = numPedido || '';
      const initialScope = escopo || 'Inspeção, Reparo e Manutenção';
      const initialPeriod = docDateFormatted 
        ? `${new Date().toLocaleDateString(layoutLang === 'en' ? 'en-US' : 'pt-BR', { month: 'long', year: 'numeric' })}` 
        : (layoutLang === 'en' ? 'April 2026' : 'Abril/2026');

      setEmailLang(layoutLang);
      setEmailHasPO(initialHasPO);
      setEmailPONeedsAdjustment(false);
      setEmailUnit(initialUnit);
      setEmailWO(initialWO);
      setEmailPO(initialPO);
      setEmailScope(initialScope);
      setEmailPeriod(initialPeriod);

      const { subject, body } = buildEmailDraft(
        layoutLang,
        initialHasPO,
        false,
        customerName,
        initialUnit,
        initialWO,
        initialPO,
        initialScope,
        initialPeriod,
        servPrestado,
        equipLocados,
        totalGeral,
        String(docNum)
      );
      setEmailSubject(subject);
      setEmailBody(body);

      const file = getPdfFile(layoutLang);
      setPdfFileForEmail(file);

      // Load document attachments (PO, Quotation, approval emails, etc.)
      const docEntryId = fullOrder?.DocEntry || order?.DocEntry || 'draft';
      const stored = loadStoredAttachments('order', docEntryId);
      setExtraAttachmentsForEmail(stored);
      // Select all stored attachments by default so they go along with the draft
      setSelectedExtraAttachmentIds(stored.map((a, idx) => a.id || String(idx)));

      setIsEmailModalOpen(true);
    } catch (err) {
      console.error('Erro ao preparar arquivo PDF para envio:', err);
      toast.error('Erro ao preparar o arquivo PDF em anexo.');
    }
  };

  const handleSwitchEmailLanguage = (newLang: 'pt' | 'en') => {
    setEmailLang(newLang);
    const { subject, body } = buildEmailDraft(
      newLang,
      emailHasPO,
      emailPONeedsAdjustment,
      customerName,
      emailUnit,
      emailWO,
      emailPO,
      emailScope,
      emailPeriod,
      servPrestado,
      equipLocados,
      totalGeral,
      String(docNum)
    );
    setEmailSubject(subject);
    setEmailBody(body);

    try {
      const file = getPdfFile(newLang);
      setPdfFileForEmail(file);
    } catch (e) {
      console.warn('Erro ao atualizar anexo para o novo idioma:', e);
    }
  };

  const handleUpdatePOStatus = (hasPO: boolean, needsAdj: boolean) => {
    setEmailHasPO(hasPO);
    setEmailPONeedsAdjustment(needsAdj);
    const { subject, body } = buildEmailDraft(
      emailLang,
      hasPO,
      needsAdj,
      customerName,
      emailUnit,
      emailWO,
      emailPO,
      emailScope,
      emailPeriod,
      servPrestado,
      equipLocados,
      totalGeral,
      String(docNum)
    );
    setEmailSubject(subject);
    setEmailBody(body);
  };

  const handleUpdateRefField = (field: string, value: string) => {
    let nextUnit = emailUnit;
    let nextWO = emailWO;
    let nextPO = emailPO;
    let nextScope = emailScope;
    let nextPeriod = emailPeriod;

    if (field === 'unit') { nextUnit = value; setEmailUnit(value); }
    if (field === 'wo') { nextWO = value; setEmailWO(value); }
    if (field === 'po') { nextPO = value; setEmailPO(value); }
    if (field === 'scope') { nextScope = value; setEmailScope(value); }
    if (field === 'period') { nextPeriod = value; setEmailPeriod(value); }

    const { subject, body } = buildEmailDraft(
      emailLang,
      emailHasPO,
      emailPONeedsAdjustment,
      customerName,
      nextUnit,
      nextWO,
      nextPO,
      nextScope,
      nextPeriod,
      servPrestado,
      equipLocados,
      totalGeral,
      String(docNum)
    );
    setEmailSubject(subject);
    setEmailBody(body);
  };

  const handleMicrosoftLogin = async () => {
    const effectiveClientId = (azureClientId || '').trim() || DEFAULT_CLIENT_ID;
    const effectiveTenantId = (azureTenantId || '').trim() || DEFAULT_TENANT_ID;
    const effectiveRedirectUri = (azureRedirectUri || '').trim() || (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '');

    saveMicrosoftConfig(effectiveClientId, effectiveTenantId, effectiveRedirectUri);
    setIsLoggingInMs(true);

    try {
      toast.loading('Abrindo janela de login oficial da Microsoft...', { id: 'ms-auth-login' });
      const account = await loginWithMicrosoftPopup({
        clientId: effectiveClientId,
        tenantId: effectiveTenantId,
        redirectUri: effectiveRedirectUri
      });
      setMsAccount(account);
      setMsGraphToken(account.accessToken);
      toast.success(`Conectado com sucesso como ${account.name || account.email}!`, { id: 'ms-auth-login' });
    } catch (err: any) {
      console.error('Erro na autenticação Microsoft:', err);
      const errMsg = err?.message || 'Falha ao autenticar com a conta Microsoft.';
      if (errMsg.includes('AADSTS50011')) {
        setShowAzureConfig(true);
      }
      toast.error(errMsg, { id: 'ms-auth-login', duration: 8000 });
    } finally {
      setIsLoggingInMs(false);
    }
  };

  const handleDisconnectMicrosoft = () => {
    clearMicrosoftSession();
    setMsAccount(null);
    setMsGraphToken('');
    toast.info('Conta Microsoft desconectada deste navegador.');
  };

  const handleSendEmailViaGraph = async () => {
    let tokenToSend = msGraphToken.trim();

    // If no token exists, trigger 1-click Microsoft login
    if (!tokenToSend) {
      if (!azureClientId.trim()) {
        setShowAzureConfig(true);
        toast.error('Conecte sua conta Microsoft ou configure o Client ID do Azure.');
        return;
      }
      try {
        toast.info('Abrindo autorização da Microsoft...');
        setIsLoggingInMs(true);
        const account = await loginWithMicrosoftPopup({
          clientId: azureClientId.trim(),
          tenantId: azureTenantId.trim()
        });
        setMsAccount(account);
        setMsGraphToken(account.accessToken);
        tokenToSend = account.accessToken;
      } catch (authErr: any) {
        setIsLoggingInMs(false);
        toast.error(authErr?.message || 'Autenticação necessária para enviar e-mail.');
        return;
      } finally {
        setIsLoggingInMs(false);
      }
    }

    const recipientList = parseEmailRecipients(emailTo);

    if (recipientList.length === 0) {
      toast.error('Informe pelo menos um endereço de e-mail de destinatário.');
      return;
    }

    // Validação básica do formato de cada e-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipientList.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      toast.error(`E-mail(s) com formato inválido: ${invalidEmails.join(', ')}`);
      return;
    }

    if (!pdfFileForEmail) {
      toast.error('Arquivo em anexo não encontrado.');
      return;
    }

    setIsSendingEmail(true);
    try {
      // Build attachments array: Draft PDF + any attached documents from the order
      const allFilesToSend: (File | { name: string; type: string; contentBytes: string })[] = [
        pdfFileForEmail
      ];

      extraAttachmentsForEmail.forEach((att, idx) => {
        const id = att.id || String(idx);
        if (selectedExtraAttachmentIds.includes(id) && att.dataUrl) {
          // Extract base64 content
          const base64Data = att.dataUrl.includes(',') 
            ? att.dataUrl.split(',')[1] 
            : att.dataUrl;
          allFilesToSend.push({
            name: att.name,
            type: att.type || 'application/octet-stream',
            contentBytes: base64Data
          });
        }
      });

      await enviarEmailComAnexoReal(
        tokenToSend,
        allFilesToSend,
        recipientList,
        emailSubject.trim(),
        emailBody.trim()
      );
      const recipientSummary = recipientList.length === 1 
        ? recipientList[0] 
        : `${recipientList.length} destinatários (${recipientList.join('; ')})`;
      const filesCount = allFilesToSend.length;
      toast.success(
        `E-mail com ${filesCount} anexo(s) (Draft Invoice + anexos) enviado com sucesso para ${recipientSummary}!`
      );
      setIsEmailModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao enviar e-mail via Microsoft Graph:', err);
      if (err?.message?.includes('token') || err?.message?.includes('401') || err?.message?.includes('CompactToken')) {
        handleDisconnectMicrosoft();
        toast.error('Sessão expirada. Por favor, reconecte sua conta Microsoft.');
      } else {
        toast.error(err?.message || 'Erro ao enviar e-mail pela API Microsoft Graph.');
      }
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Direct print using native browser dialog with print styles
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Media print styles for crisp browser printing of landscape A4 */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-layout-container, #print-layout-container * {
            visibility: visible !important;
          }
          #print-layout-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .print-page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }
      `}</style>

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent 
          showCloseButton={false}
          className="w-[98vw] max-w-[98vw] sm:max-w-[98vw] 2xl:max-w-[1700px] h-[95vh] max-h-[96vh] flex flex-col p-0 rounded-none border border-white/10 shadow-2xl bg-neutral-900 text-white overflow-hidden"
        >
          {/* Modal Header Bar */}
          <DialogHeader className="bg-evo-dark p-3 sm:p-4 px-4 sm:px-6 text-white border-b border-white/10 flex flex-row items-center justify-between shrink-0 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-evo-teal text-white flex items-center justify-center rounded">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                  Espelho Pedido de Venda • Layout de Impressão SAP (Draft Invoice)
                  <span className="bg-evo-teal/20 text-evo-teal text-xs px-2 py-0.5 rounded font-mono font-bold">
                    #{docNum}
                  </span>
                </DialogTitle>
                <p className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">
                  Visualização fiel ao Crystal Reports / SAP Business One com download em PDF
                </p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Layout Language Selector (PT / EN) */}
              <div className="flex bg-white/10 p-0.5 rounded border border-white/15 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setLayoutLang('pt')}
                  className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${layoutLang === 'pt' ? 'bg-evo-teal text-evo-dark font-black shadow-sm' : 'text-white/70 hover:text-white'}`}
                  title="Visualizar em Português"
                >
                  <span>🇧🇷</span>
                  <span>PT</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutLang('en')}
                  className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${layoutLang === 'en' ? 'bg-evo-teal text-evo-dark font-black shadow-sm' : 'text-white/70 hover:text-white'}`}
                  title="View in English"
                >
                  <span>🇺🇸</span>
                  <span>EN</span>
                </button>
              </div>

              {/* Page Selector Tabs */}
              {previewPages.length > 1 && (
                <div className="hidden md:flex bg-white/10 p-0.5 rounded border border-white/15 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={`px-3 py-1 rounded transition-colors ${activeTab === 'all' ? 'bg-evo-teal text-evo-dark font-black' : 'text-white/70 hover:text-white'}`}
                  >
                    {layoutLang === 'en' ? `All Pages (${previewPages.length})` : `Todas as Páginas (${previewPages.length})`}
                  </button>
                  {previewPages.map((p) => (
                    <button
                      key={p.pageNumber}
                      type="button"
                      onClick={() => setActiveTab(`page${p.pageNumber}`)}
                      className={`px-3 py-1 rounded transition-colors ${activeTab === `page${p.pageNumber}` ? 'bg-evo-teal text-evo-dark font-black' : 'text-white/70 hover:text-white'}`}
                    >
                      {layoutLang === 'en' ? `Page ${p.pageNumber}` : `Pág. ${p.pageNumber}`}
                    </button>
                  ))}
                </div>
              )}

              {/* Zoom Controls */}
              <div className="flex items-center bg-white/10 rounded border border-white/15 px-1 py-0.5">
                <button 
                  type="button" 
                  onClick={() => setZoom(Math.max(60, zoom - 10))} 
                  className="p-1 hover:bg-white/15 text-white/80 rounded"
                  title={layoutLang === 'en' ? 'Zoom Out' : 'Diminuir Zoom'}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono px-2 text-white/90">{zoom}%</span>
                <button 
                  type="button" 
                  onClick={() => setZoom(Math.min(150, zoom + 10))} 
                  className="p-1 hover:bg-white/15 text-white/80 rounded"
                  title={layoutLang === 'en' ? 'Zoom In' : 'Aumentar Zoom'}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button 
                  type="button" 
                  onClick={() => setZoom(100)} 
                  className="text-[10px] uppercase font-bold text-evo-teal px-1.5 hover:underline"
                  title={layoutLang === 'en' ? 'Reset 100%' : 'Ajustar 100%'}
                >
                  100%
                </button>
              </div>

              {/* Print Button */}
              <Button
                type="button"
                variant="outline"
                onClick={handlePrint}
                className="rounded-none bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs font-black uppercase tracking-wider h-9 px-4 flex items-center gap-1.5"
                title={layoutLang === 'en' ? 'Print layout' : 'Imprimir layout'}
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">{layoutLang === 'en' ? 'Print' : 'Imprimir'}</span>
              </Button>

              {/* Download PDF Button */}
              <Button
                type="button"
                onClick={handleDownloadPDF}
                disabled={isGeneratingPdf}
                className="rounded-none bg-evo-teal hover:bg-evo-teal-dark text-white text-xs font-black uppercase tracking-wider h-9 px-4 sm:px-5 flex items-center gap-1.5 shadow-lg shadow-evo-teal/20"
                title={layoutLang === 'en' ? 'Download PDF document' : 'Baixar em arquivo PDF'}
              >
                {isGeneratingPdf ? (
                  <RotateCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{layoutLang === 'en' ? 'Download PDF' : 'Baixar PDF'}</span>
              </Button>

              {/* Send Email via Microsoft Graph Button */}
              <Button
                type="button"
                onClick={handleOpenEmailModal}
                className="rounded-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider h-9 px-4 flex items-center gap-1.5 shadow-lg shadow-blue-600/20"
                title={layoutLang === 'en' ? 'Send Draft by Email via Microsoft Graph' : 'Enviar Draft por E-mail via Microsoft Graph'}
              >
                <Mail className="w-4 h-4" />
                <span className="hidden sm:inline">{layoutLang === 'en' ? 'Send by Email' : 'Enviar por E-mail'}</span>
              </Button>

              {/* Edit Sales Order Button */}
              {onEdit && (
                <Button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEdit(currentDoc);
                  }}
                  className="rounded-none bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-black uppercase tracking-wider h-9 px-4 flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
                  title={layoutLang === 'en' ? 'Edit Sales Order' : 'Editar Pedido de Venda'}
                >
                  <Edit className="w-4 h-4" />
                  <span className="hidden sm:inline">{layoutLang === 'en' ? 'Edit Order' : 'Editar Pedido'}</span>
                </Button>
              )}

              {/* Close Button */}
              <DialogClose render={<Button variant="ghost" className="text-white hover:bg-white/20 p-2 h-9 w-9 flex items-center justify-center rounded-none" />}>
                <X className="w-5 h-5" />
              </DialogClose>
            </div>
          </DialogHeader>

          {/* Document Display Canvas */}
          <div className="flex-1 overflow-auto p-4 sm:p-8 bg-neutral-900/95 flex flex-col items-center gap-8 w-full min-w-0">
            {isLoading && (
              <div className="flex items-center gap-2 text-white/60 text-xs uppercase font-bold tracking-widest mb-2 animate-pulse">
                <RotateCw className="w-4 h-4 animate-spin text-evo-teal" /> Sincronizando dados do pedido e parceiro...
              </div>
            )}

            <div 
              id="print-layout-container"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}
              className="flex flex-col gap-12 items-center min-w-fit pb-12"
            >
              {previewPages.map((pageData) => {
                const isTabVisible = activeTab === 'all' || activeTab === `page${pageData.pageNumber}`;
                if (!isTabVisible) return null;

                return (
                  <div 
                    key={pageData.pageNumber}
                    className="w-[1100px] min-h-[770px] bg-white text-slate-900 shadow-2xl p-10 flex flex-col justify-between print-page-break select-text font-sans"
                  >
                    <div>
                      {/* --- HEADER --- */}
                      {pageData.isFirstPage ? (
                        /* PAGE 1 FULL HEADER */
                        <>
                          <div className="flex justify-between items-start pb-6 border-b border-slate-100">
                            {/* Left Company Header */}
                            <div className="space-y-1">
                              <div className="flex items-center mb-2">
                                <img 
                                  src="/qualitech-logo.svg" 
                                  alt="Qualitech" 
                                  className="h-10 w-auto object-contain" 
                                  onError={(e) => {
                                    // Fallback if SVG fails to load
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              </div>
                              <h2 className="text-xs font-black uppercase text-slate-900 tracking-tight">
                                {layoutLang === 'en' 
                                  ? 'QUALITECH INSPECTION, REPAIR AND MAINTENANCE' 
                                  : 'QUALITECH INSPECAO, REPARO E MANUTENCAO LTDA'}
                              </h2>
                              <div className="grid grid-cols-2 gap-x-6 text-[11px] text-slate-600 font-medium">
                                <div>
                                  <span className="font-bold text-slate-700">CNPJ:</span> 17.417.147/0001-84
                                </div>
                                <div>
                                  <span className="font-bold text-slate-700">
                                    {layoutLang === 'en' ? 'State Reg.:' : 'Inscrição Estadual:'}
                                  </span> 79909564
                                </div>
                              </div>
                              <p className="text-[11px] text-slate-600">
                                Jose Silva de Azevedo Neto, 200, Barra da Tijuca, Rio de Janeiro - RJ - BR
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {layoutLang === 'en' ? 'Phone: +55 (21) 3500-0000' : 'Telefone: (21) 3500-0000'}
                              </p>
                            </div>

                            {/* Right Title & Subtable */}
                            <div className="w-[280px]">
                              <div className="flex items-center gap-2 justify-end mb-2">
                                <div className="w-1.5 h-6 bg-[#F59E0B]"></div>
                                <h1 className="text-xl font-black uppercase tracking-wider text-slate-900">DRAFT INVOICE</h1>
                              </div>
                              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                                <div className="flex justify-between text-[11px] text-slate-500">
                                  <span>{layoutLang === 'en' ? 'Document No.' : 'N° Documento'}</span>
                                  <span>{layoutLang === 'en' ? 'Page' : 'Pagina'}</span>
                                </div>
                                <div className="flex justify-between text-xs font-black text-slate-900">
                                  <span className="text-sm">{docNumFormatted}</span>
                                  <span>{pageData.pageNumber}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 pt-1">
                                  <span>{layoutLang === 'en' ? 'Issue Date' : 'Data de Emissão'}</span>
                                  <div className="text-xs font-bold text-slate-900">{docDateFormatted}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Customer & Document Information Row */}
                          <div className="grid grid-cols-12 gap-4 py-6 text-xs border-b border-slate-100">
                            {/* Customer Block (Col 1-5) */}
                            <div className="col-span-5 space-y-1 pr-4">
                              <div className="flex items-start gap-1.5">
                                <span className="text-[#F59E0B] font-black text-sm leading-none">➔</span>
                                <span className="font-black text-slate-900 uppercase text-xs leading-snug">
                                  {customerName}
                                </span>
                              </div>
                              <div className="pl-4 space-y-0.5 text-[11px] text-slate-600">
                                <div><span className="font-bold text-slate-700">CNPJ:</span> {customerCnpj}</div>
                                <div><span className="font-bold text-slate-700">{layoutLang === 'en' ? 'State Reg.:' : 'Inscrição Estadual:'}</span> {customerIE}</div>
                                <div className="pt-1">{customerAddress}</div>
                                <div>{customerCityState}</div>
                                <div className="font-bold">{layoutLang === 'en' ? 'BRAZIL' : 'BRASIL'}</div>
                              </div>
                            </div>

                            {/* Middle Order Meta (Col 6-8) */}
                            <div className="col-span-3 space-y-3 px-2 border-l border-slate-100">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                  {layoutLang === 'en' ? 'PO Number' : 'N° Pedido'}
                                </span>
                                <div className="font-black text-slate-900 text-xs font-mono">{numPedido}</div>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                  {layoutLang === 'en' ? 'Proposal' : 'Proposta'}
                                </span>
                                <div className="font-bold text-slate-900 text-xs">{proposta}</div>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                  {layoutLang === 'en' ? 'Scope' : 'Escopo'}
                                </span>
                                <div className="font-medium text-slate-700 text-xs truncate">{escopo}</div>
                              </div>
                            </div>

                            {/* Right Summary Box (Col 9-12) */}
                            <div className="col-span-4 pl-4">
                              <div className="border border-slate-700 rounded-sm p-3 text-xs space-y-1.5 bg-slate-50/50">
                                <div className="flex justify-between items-center text-slate-700 font-medium">
                                  <span>{layoutLang === 'en' ? 'Services Rendered' : 'Serv.Prestado.'}</span>
                                  <span className="font-mono font-bold">{servPrestado.toLocaleString(layoutLang === 'en' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-700 font-medium">
                                  <span>{layoutLang === 'en' ? 'Leased Equipment' : 'Equipamentos Locados'}</span>
                                  <span className="font-mono font-bold">{equipLocados.toLocaleString(layoutLang === 'en' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-700 font-medium">
                                  <span>{layoutLang === 'en' ? 'Discounts' : 'Descontos'}</span>
                                  <span className="font-mono font-bold">{descontos.toLocaleString(layoutLang === 'en' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="border-t border-slate-700 pt-1.5 flex justify-between items-center text-slate-900 font-black">
                                  <span className="text-right flex-1 pr-4">{layoutLang === 'en' ? 'Total' : 'Total'}</span>
                                  <span className="font-mono text-sm">{totalGeral.toLocaleString(layoutLang === 'en' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        /* PAGE 2+ REPEATED HEADER */
                        <>
                          <div className="flex justify-between items-start pb-4 border-b border-slate-200">
                            {/* Left Company Header */}
                            <div className="space-y-1">
                              <div className="flex items-center mb-1">
                                <img 
                                  src="/qualitech-logo.svg" 
                                  alt="Qualitech" 
                                  className="h-8 w-auto object-contain" 
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              </div>
                              <h2 className="text-xs font-black uppercase text-slate-900 tracking-tight">
                                {layoutLang === 'en' 
                                  ? 'QUALITECH INSPECTION, REPAIR AND MAINTENANCE' 
                                  : 'QUALITECH INSPECAO, REPARO E MANUTENCAO LTDA'}
                              </h2>
                              <div className="grid grid-cols-2 gap-x-6 text-[11px] text-slate-600 font-medium">
                                <div>
                                  <span className="font-bold text-slate-700">CNPJ:</span> 17.417.147/0001-84
                                </div>
                                <div>
                                  <span className="font-bold text-slate-700">
                                    {layoutLang === 'en' ? 'State Reg.:' : 'Inscrição Estadual:'}
                                  </span> 79909564
                                </div>
                              </div>
                              <p className="text-[11px] text-slate-600">
                                Jose Silva de Azevedo Neto, 200, Barra da Tijuca, Rio de Janeiro - RJ - BR
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {layoutLang === 'en' ? 'Phone: +55 (21) 3500-0000' : 'Telefone: (21) 3500-0000'}
                              </p>
                            </div>

                            {/* Right Title & Subtable */}
                            <div className="w-[280px]">
                              <div className="flex items-center gap-2 justify-end mb-1">
                                <div className="w-1.5 h-6 bg-[#F59E0B]"></div>
                                <h1 className="text-xl font-black uppercase tracking-wider text-slate-900">DRAFT INVOICE</h1>
                              </div>
                              <div className="border-t border-dashed border-slate-300 pt-1.5 space-y-1">
                                <div className="flex justify-between text-[11px] text-slate-500">
                                  <span>{layoutLang === 'en' ? 'Document No.' : 'N° Documento'}</span>
                                  <span>{layoutLang === 'en' ? 'Page' : 'Pagina'}</span>
                                </div>
                                <div className="flex justify-between text-xs font-black text-slate-900">
                                  <span className="text-sm">{docNumFormatted}</span>
                                  <span>{pageData.pageNumber}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 pt-0.5">
                                  <span>{layoutLang === 'en' ? 'Issue Date' : 'Data de Emissão'}</span>
                                  <div className="text-xs font-bold text-slate-900">{docDateFormatted}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Customer & Order Reference Bar on Page 2+ */}
                          <div className="flex items-center justify-between py-2.5 px-3 bg-slate-50 border-b border-slate-200 text-xs mb-4">
                            <div className="flex items-center gap-2">
                              <span className="text-[#F59E0B] font-black text-sm">➔</span>
                              <span className="font-black text-slate-900 uppercase text-xs">{customerName}</span>
                              <span className="text-slate-400">|</span>
                              <span className="text-slate-600 font-medium">CNPJ: {customerCnpj}</span>
                              <span className="text-slate-400">|</span>
                              <span className="text-slate-600 font-medium">
                                {layoutLang === 'en' ? 'State Reg.: ' : 'IE: '}
                                {customerIE}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                              <div>
                                <span className="text-slate-400 text-[10px] uppercase font-bold mr-1">
                                  {layoutLang === 'en' ? 'PO No.:' : 'N° Pedido:'}
                                </span>
                                <span className="font-mono font-black text-slate-900">{numPedido}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-[10px] uppercase font-bold mr-1">
                                  {layoutLang === 'en' ? 'Proposal:' : 'Proposta:'}
                                </span>
                                <span className="font-bold text-slate-900">{proposta}</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {/* --- SERVICES TABLE --- */}
                      {pageData.services.length > 0 && (
                        <div className="pt-4">
                          <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-2">
                            {layoutLang === 'en' 
                              ? (pageData.isFirstPage ? 'Breakdown of Services Rendered:' : 'Breakdown of Services Rendered (Continued):')
                              : (pageData.isFirstPage ? 'Detalhamento do Serviço Prestado:' : 'Detalhamento do Serviço Prestado (Continuação):')}
                          </h3>

                          <div className="border border-slate-200 overflow-hidden">
                            <table className="w-full text-left border-collapse text-[10px]">
                              <thead>
                                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                                  <th className="p-2 py-2.5">{layoutLang === 'en' ? 'Start' : 'Início'}</th>
                                  <th className="p-2 py-2.5">{layoutLang === 'en' ? 'End' : 'Fim'}</th>
                                  <th className="p-2 py-2.5 min-w-[180px]">{layoutLang === 'en' ? 'Position / Role' : 'Cargo'}</th>
                                  <th className="p-2 py-2.5">{layoutLang === 'en' ? 'Personnel' : 'Colaborador'}</th>
                                  <th className="p-2 py-2.5 text-right">{layoutLang === 'en' ? 'Standard Rate' : 'Vlr. Normal'}</th>
                                  <th className="p-2 py-2.5 text-center text-evo-teal font-black">{layoutLang === 'en' ? 'Taxa %' : 'Taxa %'}</th>
                                  <th className="p-2 py-2.5 text-right leading-tight">
                                    {layoutLang === 'en' ? 'Standby Rate' : 'Stand By Rate'}
                                    <br/><span className="text-[8px] font-normal text-slate-500">or mob x demob</span>
                                  </th>
                                  <th className="p-2 py-2.5 text-center leading-tight">
                                    {layoutLang === 'en' ? 'Daily Rates' : 'Diarias'}
                                    <br/><span className="text-[8px] font-normal text-slate-500">Normal x mob</span>
                                  </th>
                                  <th className="p-2 py-2.5 text-center leading-tight">
                                    {layoutLang === 'en' ? 'Night Shift' : 'Noturno'}
                                    <br/><span className="text-[8px] font-normal text-slate-500">Nor x Dob</span>
                                  </th>
                                  <th className="p-2 py-2.5 text-center leading-tight">
                                    {layoutLang === 'en' ? 'Overtime' : 'Hr. Extras'}
                                    <br/><span className="text-[8px] font-normal text-slate-500">Diur. - Not.</span>
                                  </th>
                                  <th className="p-2 py-2.5 text-center leading-tight">
                                    {layoutLang === 'en' ? 'Double / Rate' : 'Taxa Dob / Taxas'}
                                    <br/><span className="text-[8px] font-normal text-slate-500">{layoutLang === 'en' ? 'Day - Night / %' : 'Diur. - Not. / %'}</span>
                                  </th>
                                  <th className="p-2 py-2.5 text-right leading-tight">
                                    {layoutLang === 'en' ? 'Total' : 'Total'}
                                    <br/><span className="text-[8px] font-normal text-slate-500">{layoutLang === 'en' ? 'Fees' : 'Taxas'}</span>
                                  </th>
                                  <th className="p-2 py-2.5 text-right leading-tight">
                                    {layoutLang === 'en' ? 'Grand' : 'Total'}
                                    <br/><span className="text-[8px] font-normal text-slate-500">{layoutLang === 'en' ? 'Total' : 'Geral'}</span>
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                                {pageData.services.map((line, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                    <td className="p-2 whitespace-nowrap">{line.inicio}</td>
                                    <td className="p-2 whitespace-nowrap">{line.fim}</td>
                                    <td className="p-2 font-bold text-slate-900">{line.cargo}</td>
                                    <td className="p-2 whitespace-nowrap">{line.colaborador}</td>
                                    <td className="p-2 text-right font-mono">{line.vlrNormal}</td>
                                    <td className="p-2 text-center font-mono font-bold text-evo-teal">{line.taxaPct}</td>
                                    <td className="p-2 text-right font-mono">{line.standByRate}</td>
                                    <td className="p-2 text-center font-mono">{line.diariasNormalMob}</td>
                                    <td className="p-2 text-center font-mono">{line.noturnoNorDob}</td>
                                    <td className="p-2 text-center font-mono">{line.hrExtrasDiurNot}</td>
                                    <td className="p-2 text-center font-mono text-slate-700 font-semibold">{line.taxaDobDiurNot}</td>
                                    <td className="p-2 text-right font-mono text-slate-700 font-semibold">{line.totalTaxas}</td>
                                    <td className="p-2 text-right font-mono font-bold text-slate-900">{line.totalGeral}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* --- RENTAL / EQUIPMENT TABLE --- */}
                      {pageData.rentals.length > 0 && (
                        <div className="pt-5 space-y-2">
                          <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                            {layoutLang === 'en' ? 'Breakdown of Leased Equipment:' : 'Detalhamento do Equipamento Locado:'}
                          </h3>

                          <div className="border border-slate-200 overflow-hidden">
                            <table className="w-full text-left border-collapse text-[10px]">
                              <thead>
                                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                                  <th className="p-2 py-2.5">{layoutLang === 'en' ? 'Start' : 'Inicio'}</th>
                                  <th className="p-2 py-2.5">{layoutLang === 'en' ? 'End' : 'Final'}</th>
                                  <th className="p-2 py-2.5 text-right">{layoutLang === 'en' ? 'Qty' : 'Qtde'}</th>
                                  <th className="p-2 py-2.5 min-w-[220px]">{layoutLang === 'en' ? 'Description' : 'Descrição'}</th>
                                  <th className="p-2 py-2.5 text-center">{layoutLang === 'en' ? 'Days' : 'Qtde Dias'}</th>
                                  <th className="p-2 py-2.5 text-right">{layoutLang === 'en' ? 'On-Site Rate' : 'Vlr OnSite'}</th>
                                  <th className="p-2 py-2.5 text-right">{layoutLang === 'en' ? 'In-Transit Rate' : 'Vlr In Transit'}</th>
                                  <th className="p-2 py-2.5 text-center leading-tight">
                                    {layoutLang === 'en' ? 'Daily Qty' : 'Qtde de Diarias'}
                                    <br/><span className="text-[8px] font-normal text-slate-500">{layoutLang === 'en' ? 'Onboard' : 'a Bordo'}</span>
                                  </th>
                                  <th className="p-2 py-2.5 text-center leading-tight">
                                    {layoutLang === 'en' ? 'Daily Qty' : 'Qtde de Diarias'}
                                    <br/><span className="text-[8px] font-normal text-slate-500">On Site</span>
                                  </th>
                                  <th className="p-2 py-2.5 text-center leading-tight">
                                    {layoutLang === 'en' ? 'Daily Qty' : 'Qtde de Diarias'}
                                    <br/><span className="text-[8px] font-normal text-slate-500">In Transit</span>
                                  </th>
                                  <th className="p-2 py-2.5 text-right">{layoutLang === 'en' ? 'Total' : 'Total'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                                {pageData.rentals.map((rent, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                    <td className="p-2 whitespace-nowrap">{rent.inicio}</td>
                                    <td className="p-2 whitespace-nowrap">{rent.final}</td>
                                    <td className="p-2 text-right font-mono">{rent.qtde}</td>
                                    <td className="p-2 font-bold text-slate-900">{rent.descricao}</td>
                                    <td className="p-2 text-center font-mono">{rent.qtdeDias}</td>
                                    <td className="p-2 text-right font-mono">{rent.vlrOnSite}</td>
                                    <td className="p-2 text-right font-mono">{rent.vlrInTransit}</td>
                                    <td className="p-2 text-center font-mono">{rent.qtdeDiariasABordo}</td>
                                    <td className="p-2 text-center font-mono">{rent.qtdeDiariasOnSite}</td>
                                    <td className="p-2 text-center font-mono">{rent.qtdeDiariasInTransit}</td>
                                    <td className="p-2 text-right font-mono font-bold text-slate-900">{rent.total}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* --- TOTALS & BASEADO NA COTAÇÃO (NA ÚLTIMA PÁGINA) --- */}
                      {pageData.isLastPage && (
                        <div className="space-y-4 pt-4">
                          {/* Grand Total Row */}
                          <div className="flex justify-end pt-2 pr-2">
                            <div className="flex items-center gap-6 text-sm font-black text-slate-900">
                              <span>{layoutLang === 'en' ? 'Total Amount' : 'Valor Total'}</span>
                              <span className="font-mono text-base font-black">
                                {layoutLang === 'en' ? 'BRL ' : 'R$ '}
                                {totalGeral.toLocaleString(layoutLang === 'en' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          {/* Proposal reference box */}
                          <div className="pt-4">
                            <p className="text-xs font-bold text-slate-900 mb-2">
                              {layoutLang === 'en' ? 'Based on Quotation 5058' : 'Baseado Na Cotacao 5058'}
                            </p>
                            <div className="w-full h-20 bg-slate-50 border border-slate-100 rounded-sm p-3 text-[11px] text-slate-400">
                              {layoutLang === 'en'
                                ? 'Document generated for billing approval and operational expenditure validation.'
                                : 'Documento comprobatório gerado para faturamento e validação de despesas operacionais.'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* --- FOOTER ON EVERY PAGE --- */}
                    <div className="pt-6 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-500">
                      <div></div>
                      <div className="font-bold">
                        {layoutLang === 'en' 
                          ? `Page ${pageData.pageNumber} of ${previewPages.length}`
                          : `Página ${pageData.pageNumber} de ${previewPages.length}`}
                      </div>
                      <div>
                        {layoutLang === 'en' ? 'Printed via SAP Business One' : 'Impresso por SAP Business One'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Microsoft Graph Email Modal */}
      <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
        <DialogContent className="max-w-xl bg-white p-0 rounded-none border border-slate-200 shadow-2xl overflow-hidden font-sans">
          <DialogHeader className="bg-evo-dark p-5 text-white border-b border-white/10 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 text-white flex items-center justify-center rounded">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                  Enviar Draft por E-mail
                </DialogTitle>
                <p className="text-[10px] text-white/60 uppercase tracking-widest mt-0.5">
                  Microsoft 365 / Outlook (Microsoft Graph API)
                </p>
              </div>
            </div>
            <Button 
              type="button"
              variant="ghost" 
              size="icon" 
              onClick={() => setIsEmailModalOpen(false)} 
              className="text-white hover:bg-white/10 rounded-none h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Microsoft 365 Account / 1-Click Login Card */}
            <div className="border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
              {msAccount || msGraphToken ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-emerald-200 p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    {/* Microsoft 4-Color Logo */}
                    <div className="grid grid-cols-2 gap-0.5 w-6 h-6 shrink-0 p-0.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="bg-[#F25022] rounded-[1px]"></div>
                      <div className="bg-[#7FBA00] rounded-[1px]"></div>
                      <div className="bg-[#00A4EF] rounded-[1px]"></div>
                      <div className="bg-[#FFB900] rounded-[1px]"></div>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-slate-800">
                          {msAccount?.name || 'Conta Microsoft Conectada'}
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded uppercase tracking-wider">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Conectado
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-600 font-mono">
                        {msAccount?.email || userEmail || 'Conta Outlook / M365'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDisconnectMicrosoft}
                      className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 flex items-center gap-1.5 rounded-none font-bold uppercase tracking-wider"
                      title="Desconectar conta Microsoft"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Trocar Conta</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-blue-200 p-3.5 shadow-sm">
                    <div className="flex items-start sm:items-center gap-3">
                      {/* Microsoft 4-Color Logo */}
                      <div className="grid grid-cols-2 gap-0.5 w-7 h-7 shrink-0 p-1 bg-slate-50 border border-slate-200 rounded">
                        <div className="bg-[#F25022] rounded-[1px]"></div>
                        <div className="bg-[#7FBA00] rounded-[1px]"></div>
                        <div className="bg-[#00A4EF] rounded-[1px]"></div>
                        <div className="bg-[#FFB900] rounded-[1px]"></div>
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                          Login Automático com a Microsoft
                        </h4>
                        <p className="text-[11px] text-slate-500 leading-snug">
                          Conecte sua conta corporativa em 1 clique para autorizar o envio direto pela sua caixa de e-mail.
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      onClick={handleMicrosoftLogin}
                      disabled={isLoggingInMs}
                      className="rounded-none bg-[#0078D4] hover:bg-[#006cc1] text-white text-xs font-black uppercase tracking-wider h-9 px-4 shrink-0 flex items-center gap-2 shadow-sm"
                    >
                      {isLoggingInMs ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Conectando...</span>
                        </>
                      ) : (
                        <>
                          {/* Microsoft Mini Logo */}
                          <div className="grid grid-cols-2 gap-0.5 w-3.5 h-3.5">
                            <div className="bg-[#F25022]"></div>
                            <div className="bg-[#7FBA00]"></div>
                            <div className="bg-[#00A4EF]"></div>
                            <div className="bg-[#FFB900]"></div>
                          </div>
                          <span>Entrar com a Microsoft</span>
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] text-slate-500">
                      Disparo autenticado via Microsoft Graph API (/me/sendMail)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAzureConfig(!showAzureConfig)}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 uppercase tracking-wider"
                    >
                      <Settings className="w-3 h-3" />
                      <span>{showAzureConfig ? 'Ocultar Configurações Azure' : 'Configurações do Azure / Client ID'}</span>
                      {showAzureConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Expandable Azure AD App Configuration */}
              {showAzureConfig && (
                <div className="bg-white border border-slate-300 p-4 space-y-3.5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                        Configurações do Azure / Microsoft Entra ID
                      </span>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                        Pré-configurado
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAzureConfig(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-snug">
                    Os dados do Azure da Qualitech já vêm pré-carregados automaticamente. Você <strong>não precisa digitá-los a cada envio</strong>.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-600 uppercase">
                        ID do Aplicativo (Client ID)
                      </Label>
                      <Input
                        type="text"
                        placeholder="Ex: 4b46fdf1-7963-4933-8955-0a730ed95b1d"
                        value={azureClientId}
                        onChange={(e) => setAzureClientId(e.target.value)}
                        className="h-8 text-xs font-mono rounded-none border-slate-300"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-600 uppercase">
                        Tenant ID (Diretório)
                      </Label>
                      <Input
                        type="text"
                        placeholder="common (padrão) ou ID do Tenant"
                        value={azureTenantId}
                        onChange={(e) => setAzureTenantId(e.target.value)}
                        className="h-8 text-xs font-mono rounded-none border-slate-300"
                      />
                    </div>
                  </div>

                  {/* Redirect URI Configuration & Selector */}
                  <div className="bg-slate-50 p-3 border border-slate-200 rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider">
                        URL de Redirecionamento (Redirect URI Ativa)
                      </span>
                      <span className="text-[10px] text-blue-600 font-bold">
                        Selecione a que bate com o Azure:
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const uri = `${window.location.origin}/auth/callback`;
                          setAzureRedirectUri(uri);
                          saveMicrosoftConfig(azureClientId.trim(), azureTenantId.trim(), uri);
                          toast.success('URI alterada para /auth/callback');
                        }}
                        className={`px-2.5 py-1 text-[10px] font-bold border ${
                          azureRedirectUri.endsWith('/auth/callback')
                            ? 'bg-blue-600 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        1. Padrão (/auth/callback)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const uri = `${window.location.origin}/`;
                          setAzureRedirectUri(uri);
                          saveMicrosoftConfig(azureClientId.trim(), azureTenantId.trim(), uri);
                          toast.success('URI alterada para URL Raiz (/)');
                        }}
                        className={`px-2.5 py-1 text-[10px] font-bold border ${
                          azureRedirectUri.endsWith('/') && !azureRedirectUri.includes('/auth/callback')
                            ? 'bg-blue-600 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        2. URL Raiz (/)
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-white px-2.5 py-1.5 border border-slate-200 font-mono text-[11px] text-slate-800">
                      <span className="truncate">{azureRedirectUri}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(azureRedirectUri);
                          toast.success('URL copiada para a área de transferência!');
                        }}
                        className="ml-2 text-blue-600 hover:text-blue-800 font-sans font-bold flex items-center gap-1 shrink-0"
                      >
                        <Copy className="w-3 h-3" /> Copiar
                      </button>
                    </div>

                    {/* AADSTS50011 Helper Box */}
                    <div className="bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900 rounded space-y-1">
                      <p className="font-bold flex items-center gap-1 text-amber-950">
                        <span>💡 Se você recebeu o erro AADSTS50011:</span>
                      </p>
                      <p className="text-[10px] text-amber-800 leading-normal">
                        O Azure requer que a URL acima esteja cadastrada em:
                        <br />
                        <strong>portal.azure.com &gt; Registros de aplicativo &gt; {azureClientId || '4b46fdf1-7963-4933-8955-0a730ed95b1d'} &gt; Autenticação &gt; URIs de redirecionamento</strong> (como <em>Aplicativo de página única - SPA</em>).
                      </p>
                      <p className="text-[10px] text-amber-800">
                        Dica: Caso no Azure você tenha cadastrado apenas a URL raiz (sem <code>/auth/callback</code>), basta clicar no botão <strong>"2. URL Raiz (/)"</strong> acima!
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <span className="text-[10px] text-slate-500">
                      Permissão necessária no Azure: <code>Mail.Send</code>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        saveMicrosoftConfig(azureClientId.trim(), azureTenantId.trim(), azureRedirectUri.trim());
                        toast.success('Configurações salvas!');
                        setShowAzureConfig(false);
                      }}
                      className="h-7 text-xs bg-slate-800 hover:bg-slate-900 text-white rounded-none font-bold uppercase"
                    >
                      Salvar Configurações
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Language & PO Controls */}
            <div className="border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
              {/* Language Switcher */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-blue-600" />
                  {emailLang === 'en' ? 'Email Language' : 'Idioma do E-mail'}
                </span>
                <div className="flex bg-white p-0.5 rounded border border-slate-200 text-xs font-bold shadow-sm">
                  <button
                    type="button"
                    onClick={() => handleSwitchEmailLanguage('pt')}
                    className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                      emailLang === 'pt' 
                        ? 'bg-blue-600 text-white font-black shadow-xs' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span>🇧🇷</span>
                    <span>Português</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchEmailLanguage('en')}
                    className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                      emailLang === 'en' 
                        ? 'bg-blue-600 text-white font-black shadow-xs' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span>🇺🇸</span>
                    <span>English</span>
                  </button>
                </div>
              </div>

              {/* PO Status Selector */}
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    {emailLang === 'en' ? 'PO (Purchase Order) Available:' : 'Possui PO (Purchase Order)?'}
                  </span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-800">
                      <input
                        type="radio"
                        name="email_has_po"
                        checked={emailHasPO}
                        onChange={() => handleUpdatePOStatus(true, emailPONeedsAdjustment)}
                        className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{emailLang === 'en' ? 'YES (With PO)' : 'SIM (Com PO)'}</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-800">
                      <input
                        type="radio"
                        name="email_has_po"
                        checked={!emailHasPO}
                        onChange={() => handleUpdatePOStatus(false, false)}
                        className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{emailLang === 'en' ? 'NO (Without PO)' : 'NÃO (Sem PO)'}</span>
                    </label>
                  </div>
                </div>

                {emailHasPO ? (
                  <div className="pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-700 bg-white p-2 border border-slate-200 rounded">
                      <input
                        type="checkbox"
                        checked={emailPONeedsAdjustment}
                        onChange={(e) => handleUpdatePOStatus(true, e.target.checked)}
                        className="w-3.5 h-3.5 text-blue-600 rounded"
                      />
                      <span>
                        {emailLang === 'en'
                          ? 'PO has insufficient remaining balance or requires amendment / adjustment'
                          : 'Quando a PO estiver sem saldo ou precisar de correção / ajuste'}
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-900 bg-amber-50 p-2.5 border border-amber-200 rounded leading-relaxed">
                    <strong className="block mb-0.5">
                      {emailLang === 'en' ? 'Automatic Clause (Without PO):' : 'Cláusula Adicionada (Sem PO):'}
                    </strong>
                    {emailLang === 'en'
                      ? 'Once the Draft Invoice has been approved, we kindly request that the PO be issued and submitted so that we may proceed with issuing and submitting the Brazilian tax invoice (Nota Fiscal) for payment processing.'
                      : 'Após a aprovação da Draft Invoice, ficamos no aguardo da emissão e do envio da PO para prosseguirmos com o envio da Nota Fiscal para faturamento.'}
                  </div>
                )}
              </div>

              {/* Editable References Row */}
              <div className="pt-2 border-t border-slate-200/80">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">
                      {emailLang === 'en' ? 'Unit' : 'Unidade'}
                    </label>
                    <input
                      type="text"
                      value={emailUnit}
                      onChange={(e) => handleUpdateRefField('unit', e.target.value)}
                      placeholder="Ex: FPSO Carioca"
                      className="w-full h-7 px-2 border border-slate-200 text-xs bg-white focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">WO</label>
                    <input
                      type="text"
                      value={emailWO}
                      onChange={(e) => handleUpdateRefField('wo', e.target.value)}
                      placeholder="Ex: 12345"
                      className="w-full h-7 px-2 border border-slate-200 text-xs bg-white focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">PO</label>
                    <input
                      type="text"
                      value={emailPO}
                      onChange={(e) => handleUpdateRefField('po', e.target.value)}
                      placeholder="Ex: 450001234"
                      className="w-full h-7 px-2 border border-slate-200 text-xs bg-white focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block">
                      {emailLang === 'en' ? 'Period' : 'Mês / Período'}
                    </label>
                    <input
                      type="text"
                      value={emailPeriod}
                      onChange={(e) => handleUpdateRefField('period', e.target.value)}
                      placeholder="Ex: 11/2023"
                      className="w-full h-7 px-2 border border-slate-200 text-xs bg-white focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Recipient */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  {emailLang === 'en' ? 'To (Recipient Email)' : 'Para (Destinatários)'}
                </Label>
                <span className="text-[10px] text-slate-500 font-medium">
                  {emailLang === 'en' ? 'Separate multiple emails with (;)' : 'Múltiplos e-mails: separe com ponto e vírgula (;)'}
                </span>
              </div>
              <Input
                type="text"
                placeholder={emailLang === 'en' ? 'client@company.com; BR-ACCOUNTSRECEIVABLES@qualitechirm.com' : 'cliente@empresa.com, BR-ACCOUNTSRECEIVABLES@qualitechirm.com'}
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="h-10 text-xs font-semibold rounded-none border-slate-300 focus:border-blue-600"
                required
              />
              {parseEmailRecipients(emailTo).length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">
                    {parseEmailRecipients(emailTo).length} destinatários:
                  </span>
                  {parseEmailRecipients(emailTo).map((email, idx) => (
                    <span 
                      key={idx} 
                      className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-semibold bg-blue-50 text-blue-800 border border-blue-200"
                    >
                      {email}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                {emailLang === 'en' ? 'Subject' : 'Assunto'}
              </Label>
              <Input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="h-10 text-xs font-semibold rounded-none border-slate-300 focus:border-blue-600"
                required
              />
            </div>

            {/* Message Body */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                {emailLang === 'en' ? 'Message' : 'Mensagem'}
              </Label>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={5}
                className="w-full text-xs font-medium p-3 rounded-none border border-slate-300 focus:outline-none focus:border-blue-600 transition-colors leading-relaxed"
              />
            </div>

            {/* Attachment Display */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  {emailLang === 'en' ? 'Attachments to be sent' : 'Arquivos Anexados ao E-mail'}
                </Label>
                <span className="text-[10px] text-slate-500 font-medium">
                  {1 + selectedExtraAttachmentIds.length} {emailLang === 'en' ? 'file(s) attached' : 'arquivo(s) anexado(s)'}
                </span>
              </div>

              {/* 1. Main Draft PDF Attachment */}
              <div className="flex items-center justify-between p-3 border border-blue-200 bg-blue-50/60 rounded">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded bg-red-100 text-red-600 flex items-center justify-center font-black text-xs shrink-0">
                    PDF
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800">{pdfFileForEmail?.name || `Draft_Invoice_${docNum}_Qualitech.pdf`}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {pdfFileForEmail ? `${(pdfFileForEmail.size / 1024).toFixed(1)} KB` : 'Pronto para envio'} • {emailLang === 'en' ? 'Draft Invoice (Main Document)' : 'Espelho da Draft Invoice (Documento Principal)'}
                    </span>
                  </div>
                </div>
                <span className="text-[9px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded uppercase">
                  {emailLang === 'en' ? 'Draft PDF' : 'Draft Principal'}
                </span>
              </div>

              {/* 2. Extra Order Attachments (PO, Quotation, Approvals, etc.) */}
              {extraAttachmentsForEmail.length > 0 && (
                <div className="pt-1 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                    <span>{emailLang === 'en' ? 'Attachments linked to this order:' : 'Anexos vinculados a este pedido:'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedExtraAttachmentIds.length === extraAttachmentsForEmail.length) {
                          setSelectedExtraAttachmentIds([]);
                        } else {
                          setSelectedExtraAttachmentIds(extraAttachmentsForEmail.map((a, idx) => a.id || String(idx)));
                        }
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold lowercase underline cursor-pointer"
                    >
                      {selectedExtraAttachmentIds.length === extraAttachmentsForEmail.length 
                        ? (emailLang === 'en' ? 'deselect all' : 'desmarcar todos') 
                        : (emailLang === 'en' ? 'select all' : 'selecionar todos')}
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {extraAttachmentsForEmail.map((att, idx) => {
                      const id = att.id || String(idx);
                      const isChecked = selectedExtraAttachmentIds.includes(id);
                      return (
                        <label
                          key={id}
                          className={`flex items-center justify-between p-2.5 border rounded cursor-pointer transition-colors ${
                            isChecked ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white opacity-70 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedExtraAttachmentIds([...selectedExtraAttachmentIds, id]);
                                } else {
                                  setSelectedExtraAttachmentIds(selectedExtraAttachmentIds.filter(x => x !== id));
                                }
                              }}
                              className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                            />
                            <div className="flex flex-col truncate">
                              <span className="text-xs font-semibold text-slate-800 truncate" title={att.name}>
                                {att.name}
                              </span>
                              <span className="text-[9px] text-slate-500">
                                {att.size ? `${(att.size / 1024).toFixed(1)} KB` : 'Anexo'} • {new Date(att.uploadedAt).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                            isChecked ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {isChecked ? (emailLang === 'en' ? 'Will Send' : 'Será Enviado') : (emailLang === 'en' ? 'Omitted' : 'Omitido')}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEmailModalOpen(false)}
              disabled={isSendingEmail}
              className="rounded-none text-xs font-bold uppercase tracking-wider"
            >
              {emailLang === 'en' ? 'Cancel' : 'Cancelar'}
            </Button>
            <Button
              type="button"
              onClick={handleSendEmailViaGraph}
              disabled={isSendingEmail}
              className="rounded-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider px-6 flex items-center gap-2 shadow-md shadow-blue-600/20"
            >
              {isSendingEmail ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>{emailLang === 'en' ? 'Sending via Microsoft...' : 'Enviando pela Microsoft...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{emailLang === 'en' ? 'Send Email' : 'Enviar E-mail'}</span>
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
