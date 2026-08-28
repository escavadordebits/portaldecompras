import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Building2, 
  Calculator, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Send, 
  FileText, 
  TrendingDown, 
  Clock, 
  DollarSign, 
  Search, 
  Award,
  ChevronRight,
  Sparkles,
  Info,
  Package
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sapService } from '../services/sapService';

export interface BidItem {
  id: string;
  itemNum: number;
  itemCode?: string;
  description: string;
  unit: string;
  targetQuantity: number;
}

export interface SupplierOfferItem {
  itemId: string;
  quantity: number;
  icmsPct: number;
  unitPrice: number;
  difal: number;
  ipi: number;
  freightItem: number;
  deliveryDays: string; // ex: "10 DDL"
}

export interface SupplierOffer {
  id: string;
  supplierName: string;
  cardCode?: string;
  contactEmail?: string;
  phone?: string;
  freightType: 'CIF' | 'FOB';
  freightTotal: number;
  paymentTerms: string; // ex: "30 DDL", "15/30 DDL"
  items: Record<string, SupplierOfferItem>;
}

export interface BidMap {
  date: string;
  reqNumber: string;
  requester: string;
  purpose: string;
  companyName: string;
  items: BidItem[];
  suppliers: SupplierOffer[];
}

export function BidComparativeView({ 
  userEmail, 
  onGeneratePO 
}: { 
  key?: string;
  userEmail?: string; 
  onGeneratePO?: (poData: any) => void; 
}) {
  const [activeReqDocEntry, setActiveReqDocEntry] = useState<string>('');
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([]);
  const [isLoadingReqs, setIsLoadingReqs] = useState<boolean>(false);
  const [isGeneratingSAPPO, setIsGeneratingSAPPO] = useState<boolean>(false);
  
  // Modals
  const [isExportSupplierModalOpen, setIsExportSupplierModalOpen] = useState(false);
  const [isImportSupplierModalOpen, setIsImportSupplierModalOpen] = useState(false);
  const [selectedSupplierForModal, setSelectedSupplierForModal] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial State based on User's Excel Template (Qualitech REQ 2346)
  const [bidData, setBidData] = useState<BidMap>({
    date: new Date().toLocaleDateString('pt-BR'),
    reqNumber: '2346',
    requester: 'ALEXANDRE',
    purpose: 'USO E CONSUMO',
    companyName: 'Qualitech',
    items: [
      { id: 'item-1', itemNum: 1, description: 'LIXEIRA CONTAINER 1000 L', unit: 'UN', targetQuantity: 1 },
      { id: 'item-2', itemNum: 2, description: 'LIXEIRA CONTAINER 500 L', unit: 'UN', targetQuantity: 1 },
      { id: 'item-3', itemNum: 3, description: 'LIXEIRA COTAINER 240 L', unit: 'UN', targetQuantity: 1 },
      { id: 'item-4', itemNum: 4, description: 'LIXEIRA CONTAINER 1000 L COM PEDAL', unit: 'UN', targetQuantity: 0 },
    ],
    suppliers: [
      {
        id: 'sup-1',
        supplierName: 'PAPELTAC - MACAÉ',
        cardCode: 'F0012',
        freightType: 'CIF',
        freightTotal: 0,
        paymentTerms: '30 DDL',
        items: {
          'item-1': { itemId: 'item-1', quantity: 1, icmsPct: 22, unitPrice: 2999.50, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '10 DDL' },
          'item-2': { itemId: 'item-2', quantity: 0, icmsPct: 22, unitPrice: 0, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '' },
          'item-3': { itemId: 'item-3', quantity: 1, icmsPct: 22, unitPrice: 376.95, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '10 DDL' },
          'item-4': { itemId: 'item-4', quantity: 0, icmsPct: 22, unitPrice: 0, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '' },
        }
      },
      {
        id: 'sup-2',
        supplierName: 'BRAS-CLEAN - MACAÉ',
        cardCode: 'F0084',
        freightType: 'CIF',
        freightTotal: 0,
        paymentTerms: '28 DDL',
        items: {
          'item-1': { itemId: 'item-1', quantity: 1, icmsPct: 22, unitPrice: 2741.89, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '20 DDL' },
          'item-2': { itemId: 'item-2', quantity: 1, icmsPct: 22, unitPrice: 2997.99, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '20 DDL' },
          'item-3': { itemId: 'item-3', quantity: 1, icmsPct: 22, unitPrice: 1186.70, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '20 DDL' },
          'item-4': { itemId: 'item-4', quantity: 0, icmsPct: 22, unitPrice: 0, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '' },
        }
      },
      {
        id: 'sup-3',
        supplierName: 'MUNDO LIMPO - MACAÉ',
        cardCode: 'F0103',
        freightType: 'CIF',
        freightTotal: 0,
        paymentTerms: '21 DDL',
        items: {
          'item-1': { itemId: 'item-1', quantity: 1, icmsPct: 22, unitPrice: 2773.26, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '25 DDL' },
          'item-2': { itemId: 'item-2', quantity: 0, icmsPct: 22, unitPrice: 0, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '' },
          'item-3': { itemId: 'item-3', quantity: 1, icmsPct: 22, unitPrice: 676.31, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '25 DDL' },
          'item-4': { itemId: 'item-4', quantity: 0, icmsPct: 22, unitPrice: 0, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '' },
        }
      }
    ]
  });

  // Load SAP Purchase Requests on mount for sync
  useEffect(() => {
    loadSAPRequests();
  }, []);

  const loadSAPRequests = async () => {
    setIsLoadingReqs(true);
    try {
      const data = await sapService.getPurchaseRequests({ top: 30 });
      setPurchaseRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Erro ao carregar solicitações do SAP:', e);
    } finally {
      setIsLoadingReqs(false);
    }
  };

  const handleImportFromSAPReq = async (docEntry: number) => {
    try {
      toast.loading('Importando dados da Solicitação do SAP...', { id: 'sap-req' });
      const req = await sapService.getPurchaseRequest(docEntry);
      if (!req) {
        toast.error('Solicitação não encontrada.', { id: 'sap-req' });
        return;
      }

      const importedItems: BidItem[] = (req.DocumentLines || []).map((l: any, idx: number) => ({
        id: `item-sap-${l.LineNum || idx}`,
        itemNum: idx + 1,
        itemCode: l.ItemCode,
        description: l.ItemDescription || l.ItemCode || `Item ${idx + 1}`,
        unit: l.MeasureUnit || 'UN',
        targetQuantity: l.Quantity || 1
      }));

      // Initialize default suppliers for the new items
      const updatedSuppliers = bidData.suppliers.map(sup => {
        const newItems: Record<string, SupplierOfferItem> = {};
        importedItems.forEach(it => {
          newItems[it.id] = {
            itemId: it.id,
            quantity: it.targetQuantity,
            icmsPct: 22,
            unitPrice: 0,
            difal: 0,
            ipi: 0,
            freightItem: 0,
            deliveryDays: '10 DDL'
          };
        });
        return {
          ...sup,
          items: newItems
        };
      });

      setBidData(prev => ({
        ...prev,
        reqNumber: String(req.DocNum || req.DocEntry),
        requester: req.RequesterEmail || req.Requester || prev.requester,
        items: importedItems,
        suppliers: updatedSuppliers
      }));

      toast.success(`Solicitação #${req.DocNum || req.DocEntry} importada com ${importedItems.length} itens!`, { id: 'sap-req' });
    } catch (error) {
      toast.error('Erro ao importar solicitação do SAP.', { id: 'sap-req' });
    }
  };

  // --- Mathematical Formulas (Exact match to Excel) ---
  // Formula Excel: =((QTDE * VALOR_UNIT) + DIFAL + IPI + FRETE_RATEADO) / QTDE
  const calculateItemCostPO = (itemOffer: SupplierOfferItem) => {
    if (!itemOffer || itemOffer.quantity <= 0) return 0;
    const grossTotal = (itemOffer.quantity * itemOffer.unitPrice) + (itemOffer.difal || 0) + (itemOffer.ipi || 0) + (itemOffer.freightItem || 0);
    return grossTotal / itemOffer.quantity;
  };

  // Custo Unitário Efetivo:
  // No caso de Uso e Consumo = Custo PO (pois não gera crédito recuperável de ICMS).
  const calculateItemCostEffective = (itemOffer: SupplierOfferItem) => {
    if (!itemOffer || itemOffer.quantity <= 0) return 0;
    return calculateItemCostPO(itemOffer);
  };

  const calculateItemTotalEffective = (itemOffer: SupplierOfferItem) => {
    if (!itemOffer || itemOffer.quantity <= 0) return 0;
    return itemOffer.quantity * calculateItemCostEffective(itemOffer);
  };

  // Supplier Summaries (Rodapé Excel)
  const calculateSupplierSummary = (sup: SupplierOffer) => {
    let totalNFe = 0;
    let totalDifal = 0;
    let totalIpi = 0;

    bidData.items.forEach(it => {
      const off = sup.items[it.id];
      if (off && off.quantity > 0 && off.unitPrice > 0) {
        totalNFe += off.quantity * off.unitPrice;
        totalDifal += (off.difal || 0);
        totalIpi += (off.ipi || 0);
      }
    });

    const freightVal = sup.freightType === 'FOB' ? (sup.freightTotal || 0) : 0;
    const totalEffective = totalNFe + totalDifal + totalIpi + freightVal;

    return {
      totalNFe,
      totalDifal,
      totalIpi,
      freightVal,
      totalEffective,
      grandTotal: totalEffective
    };
  };

  // Identify Best Supplier per Item
  const getBestOfferForItem = (itemId: string) => {
    let bestSupId = '';
    let minCost = Infinity;

    bidData.suppliers.forEach(sup => {
      const off = sup.items[itemId];
      if (off && off.quantity > 0 && off.unitPrice > 0) {
        const costEff = calculateItemCostEffective(off);
        if (costEff < minCost) {
          minCost = costEff;
          bestSupId = sup.id;
        }
      }
    });

    return { bestSupId, minCost: minCost === Infinity ? 0 : minCost };
  };

  // Identify Global Winner
  const getGlobalWinnerSupplier = () => {
    let winnerId = '';
    let lowestTotal = Infinity;

    bidData.suppliers.forEach(sup => {
      const summary = calculateSupplierSummary(sup);
      if (summary.totalEffective > 0 && summary.totalEffective < lowestTotal) {
        lowestTotal = summary.totalEffective;
        winnerId = sup.id;
      }
    });

    const winner = bidData.suppliers.find(s => s.id === winnerId);
    return { winner, lowestTotal: lowestTotal === Infinity ? 0 : lowestTotal };
  };

  // --- Handlers for User Edits ---
  const handleUpdateItemOffer = (supplierId: string, itemId: string, field: keyof SupplierOfferItem, value: any) => {
    setBidData(prev => {
      const updatedSuppliers = prev.suppliers.map(sup => {
        if (sup.id !== supplierId) return sup;
        const currentItem = sup.items[itemId] || {
          itemId,
          quantity: 1,
          icmsPct: 22,
          unitPrice: 0,
          difal: 0,
          ipi: 0,
          freightItem: 0,
          deliveryDays: ''
        };
        return {
          ...sup,
          items: {
            ...sup.items,
            [itemId]: {
              ...currentItem,
              [field]: value
            }
          }
        };
      });
      return { ...prev, suppliers: updatedSuppliers };
    });
  };

  const handleUpdateSupplierMeta = (supplierId: string, field: keyof SupplierOffer, value: any) => {
    setBidData(prev => ({
      ...prev,
      suppliers: prev.suppliers.map(sup => sup.id === supplierId ? { ...sup, [field]: value } : sup)
    }));
  };

  const handleAddSupplier = () => {
    const newId = `sup-${Date.now()}`;
    const newSupplier: SupplierOffer = {
      id: newId,
      supplierName: `NOVO FORNECEDOR ${bidData.suppliers.length + 1}`,
      freightType: 'CIF',
      freightTotal: 0,
      paymentTerms: '30 DDL',
      items: {}
    };

    bidData.items.forEach(it => {
      newSupplier.items[it.id] = {
        itemId: it.id,
        quantity: it.targetQuantity,
        icmsPct: 22,
        unitPrice: 0,
        difal: 0,
        ipi: 0,
        freightItem: 0,
        deliveryDays: '10 DDL'
      };
    });

    setBidData(prev => ({
      ...prev,
      suppliers: [...prev.suppliers, newSupplier]
    }));
    toast.success('Novo fornecedor adicionado ao comparativo!');
  };

  const handleRemoveSupplier = (supplierId: string) => {
    if (bidData.suppliers.length <= 1) {
      toast.error('O BID deve ter ao menos 1 fornecedor para comparação.');
      return;
    }
    setBidData(prev => ({
      ...prev,
      suppliers: prev.suppliers.filter(s => s.id !== supplierId)
    }));
    toast.info('Fornecedor removido do comparativo.');
  };

  const handleAddItem = () => {
    const newNum = bidData.items.length + 1;
    const newItemId = `item-${Date.now()}`;
    const newItem: BidItem = {
      id: newItemId,
      itemNum: newNum,
      description: `NOVO ITEM ${newNum}`,
      unit: 'UN',
      targetQuantity: 1
    };

    setBidData(prev => {
      const updatedSuppliers = prev.suppliers.map(sup => ({
        ...sup,
        items: {
          ...sup.items,
          [newItemId]: {
            itemId: newItemId,
            quantity: 1,
            icmsPct: 22,
            unitPrice: 0,
            difal: 0,
            ipi: 0,
            freightItem: 0,
            deliveryDays: '10 DDL'
          }
        }
      }));
      return {
        ...prev,
        items: [...prev.items, newItem],
        suppliers: updatedSuppliers
      };
    });
  };

  const handleRemoveItem = (itemId: string) => {
    if (bidData.items.length <= 1) {
      toast.error('O BID deve ter ao menos 1 item.');
      return;
    }
    setBidData(prev => ({
      ...prev,
      items: prev.items.filter(it => it.id !== itemId),
      suppliers: prev.suppliers.map(sup => {
        const copy = { ...sup.items };
        delete copy[itemId];
        return { ...sup, items: copy };
      })
    }));
  };

  // --- EXCEL EXPORT FOR SUPPLIER (Planilha para Fornecedor Preencher) ---
  const handleExportSupplierTemplateExcel = (supplier: SupplierOffer) => {
    try {
      const rows: any[] = [
        ['BID COMPARATIVO - SOLICITAÇÃO DE COTAÇÃO DE COMPRAS'],
        [`EMPRESA: ${bidData.companyName.toUpperCase()}`, `REQ Nº: ${bidData.reqNumber}`, `DATA: ${bidData.date}`],
        [`REQUISITANTE: ${bidData.requester}`, `FINALIDADE: ${bidData.purpose}`],
        [`FORNECEDOR: ${supplier.supplierName}`, `CÓDIGO/CNPJ: ${supplier.cardCode || ''}`],
        [''],
        ['INSTRUÇÕES: Preencha as colunas destacadas (Quantidade Atendida, % ICMS, Valor Unitário R$, Prazo de Entrega, DIFAL e IPI se houver).'],
        [''],
        [
          'ITEM Nº',
          'CÓDIGO SAP',
          'DESCRIÇÃO DO ITEM',
          'UN',
          'QTDE SOLICITADA',
          'QTDE ATENDIDA',
          '% ICMS',
          'VALOR UNITÁRIO (R$)',
          'DIFAL (R$)',
          'IPI (R$)',
          'PRAZO DE ENTREGA (DDL)'
        ]
      ];

      bidData.items.forEach(it => {
        const off = supplier.items[it.id] || { quantity: it.targetQuantity, icmsPct: 22, unitPrice: 0, difal: 0, ipi: 0, deliveryDays: '10 DDL' };
        rows.push([
          it.itemNum,
          it.itemCode || '',
          it.description,
          it.unit,
          it.targetQuantity,
          off.quantity || it.targetQuantity,
          off.icmsPct || 22,
          off.unitPrice || 0,
          off.difal || 0,
          off.ipi || 0,
          off.deliveryDays || '10 DDL'
        ]);
      });

      rows.push(['']);
      rows.push(['CONDIÇÕES GERAIS DA PROPOSTA:']);
      rows.push(['TIPO DE FRETE (CIF ou FOB):', supplier.freightType]);
      rows.push(['VALOR TOTAL DO FRETE (se FOB):', supplier.freightTotal]);
      rows.push(['CONDIÇÃO DE PAGAMENTO (ex: 30 DDL):', supplier.paymentTerms]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cotacao_Preenchimento');

      // Filename
      const safeSupName = supplier.supplierName.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Cotacao_REQ_${bidData.reqNumber}_${safeSupName}.xlsx`;
      XLSX.writeFile(wb, filename);

      toast.success(`Planilha gerada com sucesso para ${supplier.supplierName}!`, {
        description: 'Envie este arquivo Excel ao fornecedor para preenchimento das propostas.'
      });
      setIsExportSupplierModalOpen(false);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar planilha Excel para fornecedor.');
    }
  };

  // --- EXCEL IMPORT FROM SUPPLIER (Leitura do Excel devolvido pelo Fornecedor) ---
  const handleImportSupplierFilledExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const targetSupplier = bidData.suppliers.find(s => s.id === selectedSupplierForModal);
    if (!targetSupplier) {
      toast.error('Selecione o fornecedor correspondente.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        // Find header row
        let headerRowIndex = -1;
        for (let i = 0; i < rawData.length; i++) {
          const row = rawData[i];
          if (row && row.some((cell: any) => typeof cell === 'string' && cell.includes('ITEM Nº'))) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          toast.error('Estrutura de planilha inválida. Cabeçalho de itens não localizado.');
          return;
        }

        const newItemsMap: Record<string, SupplierOfferItem> = { ...targetSupplier.items };
        let updatedCount = 0;

        // Process item lines
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length === 0 || !row[0] || String(row[0]).trim() === '') continue;

          // Check if we hit the conditions footer
          if (typeof row[0] === 'string' && (row[0].includes('CONDIÇÕES GERAIS') || row[0].includes('TIPO DE FRETE'))) {
            break;
          }

          const itemNum = Number(row[0]);
          const desc = String(row[2] || '').trim();
          const qtyAttended = Number(row[5]) || 0;
          const icms = Number(row[6]) || 22;
          const unitPrice = Number(row[7]) || 0;
          const difal = Number(row[8]) || 0;
          const ipi = Number(row[9]) || 0;
          const deliveryDays = String(row[10] || '10 DDL').trim();

          // Match with existing item by itemNum or description
          const matchedItem = bidData.items.find(it => it.itemNum === itemNum || it.description.toLowerCase() === desc.toLowerCase());
          if (matchedItem) {
            newItemsMap[matchedItem.id] = {
              itemId: matchedItem.id,
              quantity: qtyAttended,
              icmsPct: icms,
              unitPrice: unitPrice,
              difal: difal,
              ipi: ipi,
              freightItem: 0,
              deliveryDays: deliveryDays || '10 DDL'
            };
            updatedCount++;
          }
        }

        // Look for conditions footer
        let importedFreightType = targetSupplier.freightType;
        let importedFreightVal = targetSupplier.freightTotal;
        let importedPaymentTerms = targetSupplier.paymentTerms;

        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (row && row[0]) {
            const firstCell = String(row[0]).toUpperCase();
            if (firstCell.includes('TIPO DE FRETE') && row[1]) {
              const val = String(row[1]).trim().toUpperCase();
              if (val.includes('FOB')) importedFreightType = 'FOB';
              else if (val.includes('CIF')) importedFreightType = 'CIF';
            }
            if (firstCell.includes('VALOR TOTAL DO FRETE') && row[1]) {
              importedFreightVal = Number(row[1]) || 0;
            }
            if (firstCell.includes('CONDIÇÃO DE PAGAMENTO') && row[1]) {
              importedPaymentTerms = String(row[1]).trim();
            }
          }
        }

        setBidData(prev => ({
          ...prev,
          suppliers: prev.suppliers.map(sup => sup.id === selectedSupplierForModal ? {
            ...sup,
            freightType: importedFreightType,
            freightTotal: importedFreightVal,
            paymentTerms: importedPaymentTerms,
            items: newItemsMap
          } : sup)
        }));

        toast.success(`Cotação de ${targetSupplier.supplierName} importada com sucesso!`, {
          description: `${updatedCount} itens atualizados com preços, prazos e condições.`
        });
        setIsImportSupplierModalOpen(false);
      } catch (err) {
        console.error(err);
        toast.error('Erro ao ler dados da planilha Excel.');
      }
    };
    reader.readAsBinaryString(file);
    if (e.target) e.target.value = '';
  };

  // --- FULL BID EXCEL EXPORT (Relatório Comparativo Geral) ---
  const handleExportFullBidExcel = () => {
    try {
      const rows: any[] = [];
      rows.push(['DEPARTAMENTO DE COMPRAS']);
      rows.push(['BID COMPARATIVO DE PREÇOS']);
      rows.push(['']);
      rows.push(['DATA', bidData.date, '', 'REQ', bidData.reqNumber, '', 'REQUISITANTE', bidData.requester, '', 'FINALIDADE', bidData.purpose]);
      rows.push(['EMPRESA', bidData.companyName]);
      rows.push(['']);

      // Headers
      const headerRow = ['ITEM', 'DESCRIÇÃO', 'UN'];
      bidData.suppliers.forEach(s => {
        headerRow.push(
          `[${s.supplierName}] QTDE`,
          `[${s.supplierName}] % ICMS`,
          `[${s.supplierName}] VALOR UNITÁRIO`,
          `[${s.supplierName}] CUSTO UNITÁRIO PO`,
          `[${s.supplierName}] CUSTO EFETIVO`,
          `[${s.supplierName}] VALOR TOTAL EFETIVO`,
          `[${s.supplierName}] PRAZO ENTREGA`
        );
      });
      rows.push(headerRow);

      // Item Rows
      bidData.items.forEach(it => {
        const row = [it.itemNum, it.description, it.unit];
        bidData.suppliers.forEach(s => {
          const off = s.items[it.id];
          if (off) {
            row.push(
              off.quantity,
              `${off.icmsPct}%`,
              off.unitPrice,
              calculateItemCostPO(off),
              calculateItemCostEffective(off),
              calculateItemTotalEffective(off),
              off.deliveryDays
            );
          } else {
            row.push(0, '0%', 0, 0, 0, 0, '');
          }
        });
        rows.push(row);
      });

      rows.push(['']);
      // Totals per Supplier
      const totalNFeRow: any[] = ['TOTAL NF-E', '', ''];
      const totalDifalRow: any[] = ['TOTAL DIFAL', '', ''];
      const totalEffectiveRow: any[] = ['TOTAL EFETIVO', '', ''];
      const freightRow: any[] = ['FRETE / TIPO', '', ''];
      const paymentRow: any[] = ['COND. DE PAGTO', '', ''];
      const grandTotalRow: any[] = ['VALOR TOTAL', '', ''];

      bidData.suppliers.forEach(s => {
        const sum = calculateSupplierSummary(s);
        totalNFeRow.push('', '', '', '', '', sum.totalNFe, '');
        totalDifalRow.push('', '', '', '', '', sum.totalDifal, '');
        totalEffectiveRow.push('', '', '', '', '', sum.totalEffective, '');
        freightRow.push('', '', '', '', '', `${s.freightType} (R$ ${sum.freightVal.toFixed(2)})`, '');
        paymentRow.push('', '', '', '', '', s.paymentTerms, '');
        grandTotalRow.push('', '', '', '', '', sum.grandTotal, '');
      });

      rows.push(totalNFeRow);
      rows.push(totalDifalRow);
      rows.push(totalEffectiveRow);
      rows.push(freightRow);
      rows.push(paymentRow);
      rows.push(grandTotalRow);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'BID_Comparativo');
      XLSX.writeFile(wb, `BID_Comparativo_REQ_${bidData.reqNumber}.xlsx`);

      toast.success('Planilha comparativa completa do BID exportada com sucesso!');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao exportar mapa comparativo para Excel.');
    }
  };

  // --- PDF EXPORT (Layout Relatório Oficial) ---
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.setTextColor(15, 30, 54);
      doc.text('DEPARTAMENTO DE COMPRAS - BID COMPARATIVO DE PREÇOS', 14, 15);

      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text(`Empresa: ${bidData.companyName} | Data: ${bidData.date} | REQ Nº: ${bidData.reqNumber} | Requisitante: ${bidData.requester} | Finalidade: ${bidData.purpose}`, 14, 22);

      const tableHeaders = ['Item', 'Descrição', 'UN'];
      bidData.suppliers.forEach(s => {
        tableHeaders.push(`${s.supplierName}\nQtde | Unit | Custo PO | Total Efetivo | Prazo`);
      });

      const tableData = bidData.items.map(it => {
        const row = [String(it.itemNum), it.description, it.unit];
        bidData.suppliers.forEach(s => {
          const off = s.items[it.id];
          if (off && off.quantity > 0 && off.unitPrice > 0) {
            row.push(`${off.quantity}x R$ ${off.unitPrice.toFixed(2)}\nCusto: R$ ${calculateItemCostEffective(off).toFixed(2)}\nTot: R$ ${calculateItemTotalEffective(off).toFixed(2)} (${off.deliveryDays})`);
          } else {
            row.push('-');
          }
        });
        return row;
      });

      autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: 26,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 30, 54], textColor: [255, 255, 255], fontStyle: 'bold' }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(10);
      doc.setTextColor(15, 30, 54);
      doc.text('Resumo Financeiro e Condições Comerciais:', 14, finalY);

      const summaryHeaders = ['Fornecedor', 'Total NF-e', 'DIFAL', 'Frete', 'TOTAL EFETIVO', 'Prazo Pagto'];
      const summaryRows = bidData.suppliers.map(s => {
        const sum = calculateSupplierSummary(s);
        return [
          s.supplierName,
          `R$ ${sum.totalNFe.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          `R$ ${sum.totalDifal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          `${s.freightType} (R$ ${sum.freightVal.toFixed(2)})`,
          `R$ ${sum.totalEffective.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          s.paymentTerms
        ];
      });

      autoTable(doc, {
        head: [summaryHeaders],
        body: summaryRows,
        startY: finalY + 3,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [245, 158, 11], textColor: [0, 0, 0], fontStyle: 'bold' }
      });

      doc.save(`BID_Comparativo_REQ_${bidData.reqNumber}.pdf`);
      toast.success('Relatório PDF gerado com sucesso!');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar relatório em PDF.');
    }
  };

  // --- APPROVE AND GENERATE SAP PURCHASE ORDER (PO) ---
  const handleApproveWinnerAndCreateSAPPO = async (supplier: SupplierOffer) => {
    const summary = calculateSupplierSummary(supplier);
    if (summary.totalEffective <= 0) {
      toast.error('Fornecedor não possui itens válidos cotados para gerar Pedido de Compra.');
      return;
    }

    setIsGeneratingSAPPO(true);
    try {
      const orderLines = bidData.items.map(it => {
        const off = supplier.items[it.id];
        if (!off || off.quantity <= 0 || off.unitPrice <= 0) return null;
        return {
          ItemCode: it.itemCode || 'ITEM_GEN',
          ItemDescription: it.description,
          Quantity: off.quantity,
          Price: off.unitPrice,
          Usage: 1, // Uso e Consumo
        };
      }).filter(Boolean);

      const poPayload = {
        CardCode: supplier.cardCode || 'F0001',
        Comments: `Pedido gerado via BID Comparativo REQ #${bidData.reqNumber} - Vencedor: ${supplier.supplierName}`,
        DocumentLines: orderLines
      };

      toast.loading('Enviando Pedido de Compra ao SAP Business One...', { id: 'create-po-bid' });
      const createdPO = await sapService.createPurchaseOrder(poPayload);
      toast.success(`Pedido de Compra SAP criado com sucesso! Nº DocEntry: ${createdPO.DocEntry || createdPO.DocNum || 'Gerado'}`, { id: 'create-po-bid' });
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao criar Pedido no SAP: ${err.message || 'Falha de comunicação'}`, { id: 'create-po-bid' });
    } finally {
      setIsGeneratingSAPPO(false);
    }
  };

  const globalWinner = getGlobalWinnerSupplier();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full pb-16"
    >
      {/* Top Header Card */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-6 border border-evo-bg shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-evo-teal uppercase tracking-widest mb-1">
            <Building2 className="w-4 h-4" />
            <span>Departamento de Compras • BID Comparativo</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-black text-evo-dark uppercase tracking-tight">
            Mapa Comparativo de Cotações (BID)
          </h1>
          <p className="text-xs text-evo-dark/60 font-semibold mt-1">
            Análise ponderada de preços, tributos (ICMS/DIFAL/IPI), fretes CIF/FOB e prazos de entrega/pagamento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Load from SAP Requisition */}
          <div className="flex items-center gap-2">
            <Select 
              value={activeReqDocEntry} 
              onValueChange={(val) => {
                setActiveReqDocEntry(val);
                handleImportFromSAPReq(Number(val));
              }}
            >
              <SelectTrigger className="h-10 text-xs font-bold w-48 rounded-none border-evo-bg">
                <SelectValue placeholder="Importar REQ do SAP..." />
              </SelectTrigger>
              <SelectContent>
                {purchaseRequests.map(r => (
                  <SelectItem key={r.DocEntry} value={String(r.DocEntry)} className="text-xs">
                    REQ #{r.DocNum || r.DocEntry} - {r.CardName || r.Requester || 'Solicitação'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadSAPRequests} 
              className="h-10 px-3 rounded-none border-evo-bg"
              title="Recarregar Solicitações do SAP"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReqs ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <Button 
            onClick={handleExportFullBidExcel} 
            variant="outline" 
            className="h-10 text-xs font-bold uppercase tracking-wider rounded-none border-evo-bg flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Excel Completo
          </Button>

          <Button 
            onClick={handleExportPDF} 
            variant="outline" 
            className="h-10 text-xs font-bold uppercase tracking-wider rounded-none border-evo-bg flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4 text-rose-600" />
            PDF
          </Button>

          <Button 
            onClick={handleAddSupplier} 
            className="h-10 text-xs font-bold uppercase tracking-wider rounded-none bg-evo-dark hover:bg-evo-dark/90 text-white flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            + Fornecedor
          </Button>
        </div>
      </div>

      {/* Header Parameters (Data, Req, Requisitante, Finalidade) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-white p-4 border border-evo-bg">
        <div>
          <Label className="text-[10px] font-black uppercase text-evo-dark/50 tracking-wider">Empresa</Label>
          <Input 
            value={bidData.companyName} 
            onChange={(e) => setBidData(prev => ({ ...prev, companyName: e.target.value }))}
            className="h-9 font-bold text-xs rounded-none border-evo-bg uppercase"
          />
        </div>
        <div>
          <Label className="text-[10px] font-black uppercase text-evo-dark/50 tracking-wider">Data do BID</Label>
          <Input 
            value={bidData.date} 
            onChange={(e) => setBidData(prev => ({ ...prev, date: e.target.value }))}
            className="h-9 font-bold text-xs rounded-none border-evo-bg"
          />
        </div>
        <div>
          <Label className="text-[10px] font-black uppercase text-evo-dark/50 tracking-wider">Nº REQ / Solicitação</Label>
          <Input 
            value={bidData.reqNumber} 
            onChange={(e) => setBidData(prev => ({ ...prev, reqNumber: e.target.value }))}
            className="h-9 font-bold text-xs rounded-none border-evo-bg"
          />
        </div>
        <div>
          <Label className="text-[10px] font-black uppercase text-evo-dark/50 tracking-wider">Requisitante</Label>
          <Input 
            value={bidData.requester} 
            onChange={(e) => setBidData(prev => ({ ...prev, requester: e.target.value }))}
            className="h-9 font-bold text-xs rounded-none border-evo-bg uppercase"
          />
        </div>
        <div>
          <Label className="text-[10px] font-black uppercase text-evo-dark/50 tracking-wider">Finalidade</Label>
          <Select 
            value={bidData.purpose} 
            onValueChange={(val) => setBidData(prev => ({ ...prev, purpose: val }))}
          >
            <SelectTrigger className="h-9 font-bold text-xs rounded-none border-evo-bg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USO E CONSUMO">USO E CONSUMO</SelectItem>
              <SelectItem value="INDUSTRIALIZAÇÃO">INDUSTRIALIZAÇÃO</SelectItem>
              <SelectItem value="REVENDA">REVENDA</SelectItem>
              <SelectItem value="ATIVO IMOBILIZADO">ATIVO IMOBILIZADO</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Global Recommendation Card */}
      {globalWinner.winner && (
        <Card className="border-none rounded-none bg-gradient-to-r from-emerald-50 via-teal-50 to-white border-l-4 border-l-emerald-500 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black shadow">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-emerald-800 tracking-wider">Fornecedor Mais Vantajoso (Global):</span>
                  <Badge className="bg-emerald-600 text-white font-black text-[10px] uppercase">
                    {globalWinner.winner.supplierName}
                  </Badge>
                </div>
                <div className="text-sm font-black text-evo-dark mt-0.5">
                  Valor Total Efetivo: R$ {globalWinner.lowestTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • Frete: {globalWinner.winner.freightType} • Pagto: {globalWinner.winner.paymentTerms}
                </div>
              </div>
            </div>

            <Button 
              onClick={() => handleApproveWinnerAndCreateSAPPO(globalWinner.winner!)}
              disabled={isGeneratingSAPPO}
              className="h-10 rounded-none bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs uppercase tracking-wider shadow-sm flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Gerar Pedido no SAP (PO)
            </Button>
          </div>
        </Card>
      )}

      {/* Main Comparative Matrix (Side-by-Side Table) */}
      <div className="bg-white border border-evo-bg overflow-x-auto shadow-sm">
        <Table className="w-full text-xs">
          {/* Header Row 1: Item specs vs Supplier Headers */}
          <TableHeader>
            <TableRow className="bg-evo-dark text-white hover:bg-evo-dark border-none">
              <TableHead colSpan={4} className="text-white font-black uppercase tracking-widest text-center border-r border-white/20 py-3">
                ESPECIFICAÇÃO DOS ITENS SOLICITADOS
              </TableHead>
              {bidData.suppliers.map((sup, idx) => (
                <TableHead key={sup.id} colSpan={6} className={`text-white font-black uppercase tracking-widest text-center py-3 ${idx < bidData.suppliers.length - 1 ? 'border-r border-white/20' : ''} ${globalWinner.winner?.id === sup.id ? 'bg-emerald-900' : ''}`}>
                  <div className="flex items-center justify-between px-3">
                    <span className="truncate max-w-[200px]">{sup.supplierName}</span>
                    <div className="flex items-center gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => {
                          setSelectedSupplierForModal(sup.id);
                          setIsExportSupplierModalOpen(true);
                        }}
                        className="h-6 px-2 text-[10px] text-white hover:bg-white/20 rounded-none flex items-center gap-1"
                        title="Exportar planilha para o fornecedor preencher"
                      >
                        <Download className="w-3 h-3" /> Enviar Excel
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => {
                          setSelectedSupplierForModal(sup.id);
                          setIsImportSupplierModalOpen(true);
                        }}
                        className="h-6 px-2 text-[10px] text-emerald-300 hover:bg-white/20 rounded-none flex items-center gap-1"
                        title="Importar planilha preenchida do fornecedor"
                      >
                        <Upload className="w-3 h-3" /> Importar
                      </Button>
                      {bidData.suppliers.length > 1 && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handleRemoveSupplier(sup.id)}
                          className="h-6 w-6 p-0 text-rose-300 hover:bg-rose-900/50 rounded-none"
                          title="Remover Fornecedor"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </TableHead>
              ))}
            </TableRow>

            {/* Header Row 2: Columns */}
            <TableRow className="bg-evo-dark/90 text-white hover:bg-evo-dark/90 text-[10px] uppercase font-bold tracking-wider">
              <TableHead className="text-white w-10 text-center">#</TableHead>
              <TableHead className="text-white min-w-[240px]">Descrição do Item</TableHead>
              <TableHead className="text-white w-14 text-center">UN</TableHead>
              <TableHead className="text-white w-16 text-center border-r border-white/20">Ações</TableHead>

              {bidData.suppliers.map((sup, idx) => (
                <React.Fragment key={sup.id}>
                  <TableHead className="text-white w-14 text-center bg-sky-950/60">Qtde</TableHead>
                  <TableHead className="text-white w-16 text-center bg-sky-950/60">% ICMS</TableHead>
                  <TableHead className="text-white min-w-[100px] text-right bg-sky-950/60">Valor Unit (R$)</TableHead>
                  <TableHead className="text-white min-w-[100px] text-right bg-teal-950/60">Custo PO (R$)</TableHead>
                  <TableHead className="text-white min-w-[110px] text-right bg-emerald-950/80">Total Efetivo</TableHead>
                  <TableHead className={`text-white min-w-[90px] text-center bg-sky-950/60 ${idx < bidData.suppliers.length - 1 ? 'border-r border-white/20' : ''}`}>Prazo</TableHead>
                </React.Fragment>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {bidData.items.map((it, rowIdx) => {
              const bestOffer = getBestOfferForItem(it.id);

              return (
                <TableRow key={it.id} className="hover:bg-slate-50 border-b border-evo-bg transition-colors">
                  {/* Item Description Columns */}
                  <TableCell className="font-black text-center text-evo-dark/50">{it.itemNum}</TableCell>
                  <TableCell>
                    <Input 
                      value={it.description} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setBidData(prev => ({
                          ...prev,
                          items: prev.items.map(item => item.id === it.id ? { ...item, description: val } : item)
                        }));
                      }}
                      className="h-8 font-semibold text-xs border-transparent hover:border-evo-bg focus:border-evo-teal rounded-none uppercase"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input 
                      value={it.unit} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setBidData(prev => ({
                          ...prev,
                          items: prev.items.map(item => item.id === it.id ? { ...item, unit: val } : item)
                        }));
                      }}
                      className="h-8 font-bold text-xs text-center border-transparent hover:border-evo-bg focus:border-evo-teal rounded-none uppercase w-14 mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-center border-r border-evo-bg">
                    {bidData.items.length > 1 && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => handleRemoveItem(it.id)}
                        className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-50 rounded-none"
                        title="Remover Item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>

                  {/* Supplier Values Columns */}
                  {bidData.suppliers.map((sup, sIdx) => {
                    const off = sup.items[it.id] || { quantity: 0, icmsPct: 22, unitPrice: 0, difal: 0, ipi: 0, freightItem: 0, deliveryDays: '' };
                    const isBest = bestOffer.bestSupId === sup.id && off.quantity > 0 && off.unitPrice > 0;
                    const costPO = calculateItemCostPO(off);
                    const totalEff = calculateItemTotalEffective(off);

                    return (
                      <React.Fragment key={sup.id}>
                        <TableCell className="p-1 text-center bg-slate-50/40">
                          <Input 
                            type="number"
                            value={off.quantity} 
                            onChange={(e) => handleUpdateItemOffer(sup.id, it.id, 'quantity', Number(e.target.value))}
                            className="h-8 text-xs font-bold text-center border-evo-bg rounded-none px-1"
                          />
                        </TableCell>

                        <TableCell className="p-1 text-center bg-slate-50/40">
                          <Input 
                            type="number"
                            value={off.icmsPct} 
                            onChange={(e) => handleUpdateItemOffer(sup.id, it.id, 'icmsPct', Number(e.target.value))}
                            className="h-8 text-xs font-bold text-center border-evo-bg rounded-none px-1"
                          />
                        </TableCell>

                        <TableCell className="p-1 text-right bg-slate-50/40">
                          <Input 
                            type="number"
                            step="0.01"
                            value={off.unitPrice || ''} 
                            onChange={(e) => handleUpdateItemOffer(sup.id, it.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                            placeholder="0,00"
                            className="h-8 text-xs font-bold text-right border-evo-bg rounded-none px-2"
                          />
                        </TableCell>

                        {/* Custo Unitário PO */}
                        <TableCell className={`p-2 text-right font-mono font-bold ${off.quantity > 0 && off.unitPrice > 0 ? 'text-sky-900 bg-sky-50/50' : 'text-evo-dark/30'}`}>
                          {off.quantity > 0 && off.unitPrice > 0 ? `R$ ${costPO.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}` : '-'}
                        </TableCell>

                        {/* Valor Total Efetivo (com destaque verde se for a melhor oferta) */}
                        <TableCell className={`p-2 text-right font-mono font-black ${isBest ? 'bg-emerald-100 text-emerald-900' : off.quantity > 0 && off.unitPrice > 0 ? 'text-evo-dark bg-slate-50' : 'text-evo-dark/30'}`}>
                          {off.quantity > 0 && off.unitPrice > 0 ? `R$ ${totalEff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                          {isBest && <span className="ml-1 text-[9px] uppercase font-black text-emerald-700">★</span>}
                        </TableCell>

                        {/* Prazo de Entrega */}
                        <TableCell className={`p-1 text-center ${sIdx < bidData.suppliers.length - 1 ? 'border-r border-evo-bg' : ''}`}>
                          <Input 
                            value={off.deliveryDays} 
                            onChange={(e) => handleUpdateItemOffer(sup.id, it.id, 'deliveryDays', e.target.value)}
                            placeholder="ex: 10 DDL"
                            className="h-8 text-xs font-bold text-center border-evo-bg rounded-none px-1 uppercase"
                          />
                        </TableCell>
                      </React.Fragment>
                    );
                  })}
                </TableRow>
              );
            })}

            {/* Add Item Action Row */}
            <TableRow className="bg-slate-50/70 border-b border-evo-bg">
              <TableCell colSpan={4} className="py-2 px-4 border-r border-evo-bg">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleAddItem}
                  className="h-8 text-xs font-bold uppercase tracking-wider rounded-none border-dashed border-evo-dark/30 text-evo-dark flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Linha de Item
                </Button>
              </TableCell>
              <TableCell colSpan={bidData.suppliers.length * 6} className="py-2 text-[10px] uppercase font-bold text-evo-dark/40 px-4">
                * As colunas destacadas em verde representam o menor custo efetivo unitário por item.
              </TableCell>
            </TableRow>
          </TableBody>

          {/* Footer Summaries (Matching User's Excel) */}
          <tfoot>
            {/* TOTAL NF-E */}
            <TableRow className="bg-slate-100/70 border-t-2 border-evo-dark/20 text-xs font-bold">
              <TableCell colSpan={4} className="text-right uppercase font-black tracking-widest text-evo-dark px-4 border-r border-evo-bg">
                TOTAL NF-E:
              </TableCell>
              {bidData.suppliers.map((sup, idx) => {
                const summary = calculateSupplierSummary(sup);
                return (
                  <TableCell key={sup.id} colSpan={6} className={`text-right font-mono font-bold px-4 py-2.5 ${idx < bidData.suppliers.length - 1 ? 'border-r border-evo-bg' : ''}`}>
                    R$ {summary.totalNFe.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                );
              })}
            </TableRow>

            {/* TOTAL DIFAL */}
            <TableRow className="bg-slate-100/70 text-xs font-bold">
              <TableCell colSpan={4} className="text-right uppercase font-black tracking-widest text-evo-dark px-4 border-r border-evo-bg">
                TOTAL DIFAL:
              </TableCell>
              {bidData.suppliers.map((sup, idx) => {
                const summary = calculateSupplierSummary(sup);
                return (
                  <TableCell key={sup.id} colSpan={6} className={`text-right font-mono font-bold px-4 py-1.5 ${idx < bidData.suppliers.length - 1 ? 'border-r border-evo-bg' : ''}`}>
                    {summary.totalDifal > 0 ? `R$ ${summary.totalDifal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                  </TableCell>
                );
              })}
            </TableRow>

            {/* TOTAL EFETIVO (Destaque Amarelo do Excel) */}
            <TableRow className="bg-amber-300 text-xs font-black text-slate-900 border-y-2 border-amber-400">
              <TableCell colSpan={4} className="text-right uppercase tracking-widest px-4 border-r border-amber-400">
                TOTAL EFETIVO:
              </TableCell>
              {bidData.suppliers.map((sup, idx) => {
                const summary = calculateSupplierSummary(sup);
                const isGlobalWinner = globalWinner.winner?.id === sup.id;
                return (
                  <TableCell key={sup.id} colSpan={6} className={`text-right font-mono text-sm px-4 py-3 ${idx < bidData.suppliers.length - 1 ? 'border-r border-amber-400' : ''} ${isGlobalWinner ? 'bg-amber-400' : ''}`}>
                    R$ {summary.totalEffective.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    {isGlobalWinner && <span className="ml-1 text-[10px] uppercase font-black bg-emerald-800 text-white px-1.5 py-0.5 rounded">VENCEDOR</span>}
                  </TableCell>
                );
              })}
            </TableRow>

            {/* TIPO DE FRETE & VALOR */}
            <TableRow className="bg-white text-xs font-bold">
              <TableCell colSpan={4} className="text-right uppercase font-black tracking-widest text-evo-dark px-4 border-r border-evo-bg">
                TIPO DE FRETE / FRETE (R$):
              </TableCell>
              {bidData.suppliers.map((sup, idx) => (
                <TableCell key={sup.id} colSpan={6} className={`px-4 py-2 ${idx < bidData.suppliers.length - 1 ? 'border-r border-evo-bg' : ''}`}>
                  <div className="flex items-center justify-end gap-2">
                    <Select 
                      value={sup.freightType} 
                      onValueChange={(val: 'CIF' | 'FOB') => handleUpdateSupplierMeta(sup.id, 'freightType', val)}
                    >
                      <SelectTrigger className="h-8 w-24 text-xs font-bold rounded-none border-evo-bg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CIF">CIF (Incluso)</SelectItem>
                        <SelectItem value="FOB">FOB (A Pagar)</SelectItem>
                      </SelectContent>
                    </Select>
                    {sup.freightType === 'FOB' && (
                      <Input 
                        type="number"
                        step="0.01"
                        placeholder="R$ Frete"
                        value={sup.freightTotal || ''}
                        onChange={(e) => handleUpdateSupplierMeta(sup.id, 'freightTotal', parseFloat(e.target.value) || 0)}
                        className="h-8 w-28 text-xs font-bold text-right rounded-none border-evo-bg"
                      />
                    )}
                  </div>
                </TableCell>
              ))}
            </TableRow>

            {/* CONDIÇÃO DE PAGAMENTO */}
            <TableRow className="bg-white text-xs font-bold">
              <TableCell colSpan={4} className="text-right uppercase font-black tracking-widest text-evo-dark px-4 border-r border-evo-bg">
                CONDIÇÃO DE PAGAMENTO:
              </TableCell>
              {bidData.suppliers.map((sup, idx) => (
                <TableCell key={sup.id} colSpan={6} className={`px-4 py-2 ${idx < bidData.suppliers.length - 1 ? 'border-r border-evo-bg' : ''}`}>
                  <div className="flex items-center justify-end">
                    <Input 
                      value={sup.paymentTerms} 
                      onChange={(e) => handleUpdateSupplierMeta(sup.id, 'paymentTerms', e.target.value)}
                      placeholder="ex: 30 DDL"
                      className="h-8 text-xs font-bold text-right rounded-none border-evo-bg uppercase w-40"
                    />
                  </div>
                </TableCell>
              ))}
            </TableRow>

            {/* VALOR TOTAL GERAL */}
            <TableRow className="bg-slate-900 text-white text-xs font-black">
              <TableCell colSpan={4} className="text-right uppercase tracking-widest px-4 py-3 border-r border-white/20">
                VALOR TOTAL:
              </TableCell>
              {bidData.suppliers.map((sup, idx) => {
                const summary = calculateSupplierSummary(sup);
                return (
                  <TableCell key={sup.id} colSpan={6} className={`text-right font-mono text-sm px-4 py-3 ${idx < bidData.suppliers.length - 1 ? 'border-r border-white/20' : ''}`}>
                    R$ {summary.grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                );
              })}
            </TableRow>
          </tfoot>
        </Table>
      </div>

      {/* Bottom Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 border border-evo-bg">
        <div className="flex items-center gap-2 text-xs font-bold text-evo-dark/60">
          <Info className="w-4 h-4 text-sky-600" />
          <span>Você pode editar os campos diretamente na grade ou exportar as planilhas para cada fornecedor responder.</span>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={handleExportFullBidExcel} 
            variant="outline"
            className="h-10 text-xs font-bold uppercase rounded-none border-evo-bg"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" /> Baixar Planilha Geral
          </Button>

          {globalWinner.winner && (
            <Button 
              onClick={() => handleApproveWinnerAndCreateSAPPO(globalWinner.winner!)}
              disabled={isGeneratingSAPPO}
              className="h-10 text-xs font-bold uppercase rounded-none bg-emerald-600 hover:bg-emerald-700 text-white px-6 shadow-sm flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Aprovar e Criar Pedido no SAP (PO)
            </Button>
          )}
        </div>
      </div>

      {/* MODAL 1: Export Supplier Template Excel */}
      <Dialog open={isExportSupplierModalOpen} onOpenChange={setIsExportSupplierModalOpen}>
        <DialogContent className="sm:max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase text-evo-dark">
              Exportar Cotação para Fornecedor
            </DialogTitle>
            <DialogDescription className="text-xs">
              Gera a planilha Excel padronizada com a lista de itens da REQ #{bidData.reqNumber} para envio por e-mail ou WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-bold uppercase">Fornecedor Selecionado:</Label>
            <Select value={selectedSupplierForModal} onValueChange={setSelectedSupplierForModal}>
              <SelectTrigger className="rounded-none border-evo-bg font-bold text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bidData.suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-xs font-bold">
                    {s.supplierName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-evo-dark/60">
              O fornecedor poderá preencher os preços unitários, tributos e prazos de entrega nas colunas indicadas do Excel.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsExportSupplierModalOpen(false)} className="rounded-none text-xs uppercase font-bold">
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                const target = bidData.suppliers.find(s => s.id === selectedSupplierForModal);
                if (target) handleExportSupplierTemplateExcel(target);
              }} 
              className="rounded-none bg-evo-dark hover:bg-evo-dark/90 text-white text-xs uppercase font-bold flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Baixar Arquivo .XLSX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Import Supplier Filled Excel */}
      <Dialog open={isImportSupplierModalOpen} onOpenChange={setIsImportSupplierModalOpen}>
        <DialogContent className="sm:max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase text-evo-dark">
              Importar Cotação Retornada pelo Fornecedor
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione o arquivo Excel que o fornecedor preencheu para atualizar automaticamente a matriz do BID.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold uppercase">Fornecedor do Retorno:</Label>
              <Select value={selectedSupplierForModal} onValueChange={setSelectedSupplierForModal}>
                <SelectTrigger className="rounded-none border-evo-bg font-bold text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bidData.suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-xs font-bold">
                      {s.supplierName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-2 border-dashed border-evo-bg hover:border-evo-teal p-6 text-center transition-colors cursor-pointer bg-slate-50" onClick={() => fileInputRef.current?.click()}>
              <FileSpreadsheet className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <div className="text-xs font-bold text-evo-dark uppercase">Clique para selecionar o arquivo Excel (.xlsx)</div>
              <div className="text-[10px] text-evo-dark/50 mt-1">Compatível com a planilha gerada pelo portal</div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImportSupplierFilledExcel} 
                accept=".xlsx, .xls" 
                className="hidden" 
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportSupplierModalOpen(false)} className="rounded-none text-xs uppercase font-bold">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
