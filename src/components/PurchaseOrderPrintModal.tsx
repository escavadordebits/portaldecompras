import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Printer, 
  Download, 
  X, 
  ZoomIn, 
  ZoomOut, 
  FileText, 
  RotateCw,
  ArrowRight,
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
  Copy
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogClose 
} from '@/components/ui/dialog';
import { QUALITECH_LOGO_PNG } from '../assets/qualitechLogoBase64';
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

interface PurchaseOrderPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  userEmail?: string;
}

export function PurchaseOrderPrintModal({ isOpen, onClose, order, userEmail }: PurchaseOrderPrintModalProps) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [zoom, setZoom] = useState<number>(100);
  const [fullOrder, setFullOrder] = useState<any>(null);
  const [supplierBP, setSupplierBP] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Email sending state (Microsoft Graph & OAuth)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
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
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [pdfFileForEmail, setPdfFileForEmail] = useState<File | null>(null);
  const [extraAttachmentsForEmail, setExtraAttachmentsForEmail] = useState<StoredAttachment[]>([]);
  const [selectedExtraAttachmentIds, setSelectedExtraAttachmentIds] = useState<string[]>([]);

  // Load detailed purchase order & BP data when modal opens
  useEffect(() => {
    if (!isOpen || !order) return;

    let isMounted = true;
    const loadDetails = async () => {
      setIsLoading(true);
      try {
        let currentOrderData = { ...order };
        if (order.DocEntry) {
          try {
            const fetched = await sapService.getPurchaseOrder(order.DocEntry);
            if (fetched && isMounted) {
              currentOrderData = { ...currentOrderData, ...fetched };
            }
          } catch (e) {
            console.warn('Usando dados em memória do pedido de compra:', e);
          }
        }
        if (isMounted) setFullOrder(currentOrderData);

        const cardCode = currentOrderData.CardCode || order.CardCode;
        if (cardCode) {
          try {
            const bp = await sapService.getBusinessPartner(cardCode);
            if (bp && isMounted) {
              setSupplierBP(bp);
            }
          } catch (e) {
            console.warn('Erro ao carregar dados do fornecedor:', e);
          }
        }
      } catch (err) {
        console.error('Erro ao preparar layout do pedido de compra:', err);
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
  const docNum = currentDoc.DocNum || currentDoc.DocEntry || '15306';
  const docNumFormatted = Number(docNum) ? Number(docNum).toLocaleString('pt-BR') : docNum;
  
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

  const docDateFormatted = formatDateDisplay(currentDoc.DocDate, '28/10/2026');
  const docDueDateFormatted = formatDateDisplay(
    currentDoc.DocDueDate || currentDoc.DocumentLines?.[0]?.ShipDate, 
    '23/11/2026'
  );

  // Contact & Sales Person
  const contactName = String(
    currentDoc.Requester || 
    currentDoc.ContactPerson || 
    (currentDoc.UserSign ? `Usuário SAP ${currentDoc.UserSign}` : '') || 
    '-Nenhum vendedor / compra'
  );
  const contactPhone = String(currentDoc.Phone || supplierBP?.Phone1 || supplierBP?.Cellular || '');

  // Payment terms & method
  const paymentCondition = String(currentDoc.PaymentGroupCode ?? currentDoc.GroupNumber ?? currentDoc.U_CondicaoPG ?? '--');
  const paymentMethodCode = String(currentDoc.PaymentMethod || currentDoc.PeyMethod || currentDoc.U_FormaPG || 'P-TRF-ITA-43410');
  const paymentMethodDesc = String(currentDoc.PaymentMethodDesc || currentDoc.U_FormaPGDesc || 'Pagamento Transferência Itaú Ag. 3032 Cc. 43410-6');

  // Shipping Address (Default Qualitech Delivery Address as per layout)
  const shippingAddressLines = useMemo(() => {
    if (currentDoc.AddressExtension?.ShipToStreet) {
      const addr = currentDoc.AddressExtension;
      return [
        'QUALITECH INSPECAO, REPARO E MANUTENCAO LTDA',
        `${addr.ShipToStreet || ''}, ${addr.ShipToStreetNo || ''}`.trim(),
        `${addr.ShipToBuilding || ''} ${addr.ShipToBlock || ''}`.trim(),
        `${addr.ShipToZipCode || ''}-${addr.ShipToCity || ''}-${addr.ShipToState || ''}`.trim(),
        addr.ShipToCountry || 'BRASIL'
      ].filter(Boolean);
    }
    return [
      'QUALITECH INSPECAO, REPARO E MANUTENCAO LTDA',
      'Avenida Jose Silva de Azevedo Neto,200',
      'Bloco 3 (Evolution IV) - Sala 0306',
      '22775-056-Rio de Janeiro-RJ',
      'BRASIL'
    ];
  }, [currentDoc]);

  // Supplier Information (checking TaxExtension.TaxId0 from SAP)
  const supplierName = String(currentDoc.CardName || supplierBP?.CardName || 'FORNECEDOR');
  const supplierCnpj = String(
    currentDoc.TaxExtension?.TaxId0 ||
    currentDoc.TaxExtension?.TaxId4 ||
    supplierBP?.TaxId0 ||
    supplierBP?.FederalTaxID ||
    currentDoc.FederalTaxID ||
    currentDoc.CNPJ ||
    '66.992.242/0001-17'
  );
  const supplierIE = String(
    currentDoc.TaxExtension?.TaxId1 ||
    currentDoc.TaxExtension?.TaxId0 ||
    supplierBP?.StateTaxId ||
    supplierBP?.TaxId1 ||
    supplierBP?.TaxId0 ||
    currentDoc.TaxId0 ||
    ''
  );
  
  const supplierAddressLines = useMemo(() => {
    if (supplierBP?.Address) {
      const street = supplierBP.Address;
      const zip = supplierBP.ZipCode || '';
      const city = supplierBP.City || '';
      const state = supplierBP.State || '';
      const country = supplierBP.Country || 'BRASIL';
      return [
        street,
        zip ? `${zip}-${city}-${state}` : `${city}-${state}`,
        country
      ].filter(Boolean);
    }
    return [
      'RUADA QUITANDA, 30',
      'GRP 501',
      '20011-030-RIO DE JANEIRO-RJ',
      'BRASIL'
    ];
  }, [supplierBP]);

  // Helper to format numbers safely
  const formatNum = (val: any, decimals = 2) => {
    if (val === undefined || val === null || val === '') return '0,00';
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
    if (isNaN(n)) return String(val);
    return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  // Document Lines
  const lines = useMemo(() => {
    const rawLines = Array.isArray(currentDoc.DocumentLines) && currentDoc.DocumentLines.length > 0 
      ? currentDoc.DocumentLines 
      : [];

    if (rawLines.length === 0) {
      return [{
        lineNum: 0,
        itemCode: 'D000284',
        description: 'Treinamento',
        ncm: '',
        dept: 'QC',
        project: 'BASE',
        natOp: 'Serviço Tomado',
        deliveryDate: docDueDateFormatted,
        cst: '',
        cfop: '1933',
        uom: '',
        quantity: 1,
        currency: 'R$',
        price: 687.00,
        total: 687.00
      }];
    }

    return rawLines.map((line: any, idx: number) => {
      const qty = Number(line.Quantity || 1);
      const unitPrice = Number(line.Price || line.UnitPrice || 0);
      const lineTotal = Number(line.LineTotal) || (qty * unitPrice);

      return {
        lineNum: line.LineNum !== undefined ? line.LineNum : idx,
        itemCode: line.ItemCode || `ITEM-${idx + 1}`,
        description: line.ItemDescription || line.Dscription || line.ItemName || 'Serviço/Material',
        ncm: line.NCMCode || line.U_NCM || '',
        dept: line.CostingCode || line.CostingCode2 || line.OcrCode || line.U_Depto || 'QC',
        project: line.CostingCode4 || line.ProjectCode || line.Project || line.U_Projeto || currentDoc.Project || 'BASE',
        natOp: line.Usage || line.NatOp || 'Serviço Tomado',
        deliveryDate: formatDateDisplay(line.ShipDate || line.DocDueDate, docDueDateFormatted),
        cst: line.CSTCode || line.CST || '',
        cfop: line.CFOPCode || line.CFOP || '1933',
        uom: line.MeasureUnit || line.UoM || line.UomCode || '',
        quantity: qty,
        currency: line.Currency || currentDoc.DocCurrency || 'R$',
        price: unitPrice,
        total: lineTotal
      };
    });
  }, [currentDoc, docDueDateFormatted]);

  // Total amount
  const docTotal = useMemo(() => {
    if (currentDoc.DocTotal !== undefined && Number(currentDoc.DocTotal) > 0) {
      return Number(currentDoc.DocTotal);
    }
    return lines.reduce((acc, l) => acc + (Number(l.total) || 0), 0);
  }, [currentDoc, lines]);

  // Comments / Observações (Page 2 box)
  const orderComments = currentDoc.Comments || 
    currentDoc.OpeningRemarks || 
    currentDoc.ClosingRemarks || 
    currentDoc.U_Observacoes || 
    'Pedido referente ao treinamento de Cultura Naval realizado pela Águas e Barcos (Paulo Fonseca), colaboradora Lara do Carmo. Data do pagamento: 23/11';

  // Helper to generate jsPDF instance
  const generatePdfInstance = (): { doc: jsPDF; fileName: string } => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const drawCommonHeader = (docInstance: jsPDF, pageNum: number) => {
      // Top Yellow Bar & Title
      docInstance.setFillColor(245, 158, 11);
      docInstance.rect(205, 10, 2.5, 7, 'F');

      docInstance.setFont('helvetica', 'bold');
      docInstance.setFontSize(13);
      docInstance.setTextColor(15, 23, 42);
      docInstance.text('Pedido de Compra', 209, 15.5);

      // Subtable (N° Documento, Pagina)
      docInstance.setFont('helvetica', 'normal');
      docInstance.setFontSize(7.5);
      docInstance.setTextColor(100, 116, 139);
      docInstance.text('N° Documento', 205, 22.5);
      docInstance.text('Pagina', 270, 22.5);

      docInstance.setFont('helvetica', 'bold');
      docInstance.setFontSize(8.5);
      docInstance.setTextColor(15, 23, 42);
      docInstance.text(String(docNumFormatted), 205, 27);
      docInstance.text(String(pageNum), 273, 27);

      docInstance.setDrawColor(203, 213, 225);
      docInstance.setLineDashPattern([1, 1], 0);
      docInstance.line(205, 29, 283, 29);
      docInstance.setLineDashPattern([], 0);

      // Data de Emissão & Data de Entrega
      docInstance.setFont('helvetica', 'normal');
      docInstance.setFontSize(7.5);
      docInstance.setTextColor(100, 116, 139);
      docInstance.text('Data de Emissão', 205, 33);
      docInstance.text('Data de Entrega', 255, 33);

      docInstance.setFont('helvetica', 'bold');
      docInstance.setFontSize(8);
      docInstance.setTextColor(15, 23, 42);
      docInstance.text(docDateFormatted, 205, 37.5);
      docInstance.text(docDueDateFormatted, 255, 37.5);

      // Seu Contato & Telefone
      docInstance.setFont('helvetica', 'normal');
      docInstance.setFontSize(7);
      docInstance.setTextColor(100, 116, 139);
      docInstance.text('Seu Contato', 205, 42);
      docInstance.text('Telefone', 265, 42);

      docInstance.setFont('helvetica', 'bold');
      docInstance.setFontSize(7.5);
      docInstance.setTextColor(15, 23, 42);
      docInstance.text(contactName.slice(0, 32), 205, 46.5);
      docInstance.text(contactPhone || '-', 265, 46.5);

      // Left Company Header (Qualitech Shell Logo + Text)
      try {
        docInstance.addImage(QUALITECH_LOGO_PNG, "PNG", 14, 6.5, 11, 11);
      } catch (err) {
        console.warn("Erro ao inserir logo no PDF:", err);
      }

      // "Quali" (navy) and "tech" (bright blue)
      docInstance.setFont("helvetica", "bold");
      docInstance.setFontSize(15);
      docInstance.setTextColor(12, 53, 89);
      docInstance.text("Quali", 26.5, 15);
      docInstance.setTextColor(0, 136, 209);
      docInstance.text("tech", 38, 15);

      docInstance.setFont('helvetica', 'bold');
      docInstance.setFontSize(7.5);
      docInstance.setTextColor(15, 23, 42);
      docInstance.text('QUALITECH INSPECAO, REPARO E MANUTENCAO LTDA', 14, 20.5);

      docInstance.setFont('helvetica', 'normal');
      docInstance.setFontSize(7);
      docInstance.setTextColor(71, 85, 105);
      docInstance.text('CNPJ: 17.417.147/0001-84    Inscrição Estadual: 79909564', 14, 24.5);
      docInstance.text('Jose Silva de Azevedo Neto, 200, Barra da Tijuca, Rio de Janeiro - RJ - BR', 14, 28.5);
    };

    // --- PAGE 1 ---
    drawCommonHeader(doc, 1);

    // Page 1 specific right header extensions:
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('Condição de PG', 205, 51);
    doc.text('Forma de PG', 255, 51);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(paymentCondition, 205, 55);
    doc.text(paymentMethodCode, 255, 55);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('Forma de PG', 205, 59.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text(paymentMethodDesc.slice(0, 48), 205, 63.5);

    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(205, 65.5, 283, 65.5);
    doc.setLineDashPattern([], 0);

    // Endereço de Remessa
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('Endereço de Remessa', 205, 69.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    let remY = 73.5;
    shippingAddressLines.forEach((line) => {
      doc.text(line, 205, remY);
      remY += 3.5;
    });

    // Middle Left: Supplier Block (Page 1)
    const supY = 38;
    doc.setFillColor(245, 158, 11);
    doc.triangle(14, supY + 2.5, 16.5, supY + 1.2, 14, supY, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(supplierName.slice(0, 48), 18, supY + 2.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text('CNPJ', 23, supY + 7);
    doc.text(supplierCnpj, 48, supY + 7);

    doc.text('Inscrição Estadual', 23, supY + 11);
    doc.text(supplierIE || '-', 48, supY + 11);

    let supAddrY = supY + 15.5;
    supplierAddressLines.forEach((line) => {
      doc.text(line, 23, supAddrY);
      supAddrY += 3.8;
    });

    // Dotted separator line above table
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(14, 95, 283, 95);
    doc.setLineDashPattern([], 0);

    // Items Table (Page 1)
    const tableHeaders = [
      'Cód do Item', 'Descrição', 'Cod NCM', 'Departamento', 'Projeto', 'Nat Operação',
      'Data Entrega', 'CST', 'CFOP', 'UM', 'QTD.', 'Moed.', 'Preço', 'Total'
    ];

    const tableRows = lines.map(l => [
      String(l.lineNum !== undefined ? `${l.lineNum} ${l.itemCode || ''}` : l.itemCode || '-'),
      String(l.description || '-'),
      String(l.ncm || '-'),
      String(l.dept || '-'),
      String(l.project || '-'),
      String(l.natOp || '-'),
      String(l.deliveryDate || '-'),
      String(l.cst || '-'),
      String(l.cfop || '-'),
      String(l.uom || '-'),
      formatNum(l.quantity, 2),
      String(l.currency || 'R$'),
      formatNum(l.price, 2),
      formatNum(l.total, 2)
    ]);

    autoTable(doc, {
      head: [tableHeaders],
      body: tableRows,
      startY: 97,
      margin: { left: 14, right: 14 },
      styles: {
        fontSize: 6.5,
        cellPadding: 1.8,
        textColor: [15, 23, 42],
        lineColor: [241, 245, 249],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        halign: 'left',
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 46 },
        2: { cellWidth: 16 },
        3: { cellWidth: 16 },
        4: { cellWidth: 16 },
        5: { cellWidth: 24 },
        6: { cellWidth: 20 },
        7: { cellWidth: 12 },
        8: { cellWidth: 14 },
        9: { cellWidth: 10 },
        10: { cellWidth: 15, halign: 'right' },
        11: { cellWidth: 12, halign: 'center' },
        12: { cellWidth: 22, halign: 'right' },
        13: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
      }
    });

    const finalY1 = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : 120;

    // Dotted line under table items
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(14, finalY1 + 3, 283, finalY1 + 3);
    doc.setLineDashPattern([], 0);

    // Total Amount on Page 1
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Valor Total', 232, finalY1 + 8.5);
    doc.text('R$', 252, finalY1 + 8.5);
    doc.text(formatNum(docTotal, 2), 282, finalY1 + 8.5, { align: 'right' });

    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(225, finalY1 + 11.5, 283, finalY1 + 11.5);
    doc.setLineDashPattern([], 0);

    // --- PAGE 2 ---
    doc.addPage();
    drawCommonHeader(doc, 2);

    // Dotted separator line above table header
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(14, 52, 283, 52);
    doc.setLineDashPattern([], 0);

    // Repeated Table Header on Page 2
    autoTable(doc, {
      head: [tableHeaders],
      body: [],
      startY: 54,
      margin: { left: 14, right: 14 },
      styles: {
        fontSize: 6.5,
        cellPadding: 1.8,
        textColor: [15, 23, 42]
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 46 },
        2: { cellWidth: 16 },
        3: { cellWidth: 16 },
        4: { cellWidth: 16 },
        5: { cellWidth: 24 },
        6: { cellWidth: 20 },
        7: { cellWidth: 12 },
        8: { cellWidth: 14 },
        9: { cellWidth: 10 },
        10: { cellWidth: 15, halign: 'right' },
        11: { cellWidth: 12, halign: 'center' },
        12: { cellWidth: 22, halign: 'right' },
        13: { cellWidth: 24, halign: 'right' }
      }
    });

    const finalY2 = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY : 65;

    // Orange Rounded Box with Order Comments / Remarks
    const boxX = 14;
    const boxY = finalY2 + 8;
    const boxWidth = 269;
    const boxHeight = 35;

    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(0.4);
    doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'D');

    // Text inside box
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const splitComments = doc.splitTextToSize(orderComments, boxWidth - 10);
    doc.text(splitComments, boxX + 5, boxY + 7);

    // Red standard numbered notes below the box
    const redNotes = [
      '1 - Favor mencionar o número deste pedido de compra na Nota Fiscal;',
      '2 - Não nos responsabilizamos pelo frete, caso não seja respeitada a empresa indicada;',
      '3 - Faturamento/Cobrança: Endereço acima;',
      '4 - Emissões de faturas devem ser realizadas entre os dias 1 e 25 de cada mês;',
      '5 - Itens que requer certificado, a documentação deve ser enviada junto as faturas;'
    ];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(239, 68, 68);
    let noteY = boxY + boxHeight + 8;
    redNotes.forEach((note) => {
      doc.text(note, boxX, noteY);
      noteY += 4.5;
    });

    const fileName = `Pedido_de_Compra_${docNum}.pdf`;
    return { doc, fileName };
  };

  const getPdfFile = (): File => {
    const { doc, fileName } = generatePdfInstance();
    const blob = doc.output('blob');
    return new File([blob], fileName, { type: 'application/pdf' });
  };

  const handleDownloadPdf = () => {
    try {
      setIsGeneratingPdf(true);
      const { doc, fileName } = generatePdfInstance();
      doc.save(fileName);
      toast.success(`Download de "${fileName}" iniciado com sucesso!`);
    } catch (err) {
      console.error('Erro ao gerar PDF do pedido de compra:', err);
      toast.error('Erro ao gerar arquivo PDF para download.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Build standard email draft for purchase order
  const buildDefaultEmail = () => {
    const defaultRecipient = (
      supplierBP?.EmailAddress ||
      supplierBP?.Email ||
      currentDoc.ContactEmail ||
      currentDoc.EmailAddress ||
      currentDoc.Email ||
      ''
    ).trim();

    const subject = `Pedido de Compra #${docNum} - Qualitech | ${supplierName}`;
    const body = `Prezados,

Encaminhamos em anexo o Pedido de Compra #${docNum}, emitido pela QUALITECH INSPECAO, REPARO E MANUTENCAO LTDA.

Dados do Pedido:
• Fornecedor: ${supplierName}
• Data de Emissão: ${docDateFormatted}
• Previsão de Entrega: ${docDueDateFormatted}
• Valor Total: R$ ${formatNum(docTotal, 2)}

Solicitamos a gentileza de acusar o recebimento e confirmar as condições comerciais e prazos acordados.

Atenciosamente,
Departamento de Compras / Procurement
QUALITECH INSPECAO, REPARO E MANUTENCAO LTDA`;

    return { defaultRecipient, subject, body };
  };

  const handleOpenEmailModal = () => {
    try {
      const storedAccount = getStoredMicrosoftAccount();
      if (storedAccount) {
        setMsAccount(storedAccount);
        setMsGraphToken(storedAccount.accessToken);
      }

      const { defaultRecipient, subject, body } = buildDefaultEmail();
      setEmailTo(defaultRecipient);
      setEmailSubject(subject);
      setEmailBody(body);

      const file = getPdfFile();
      setPdfFileForEmail(file);

      // Load linked stored attachments for purchase order
      const docEntryId = fullOrder?.DocEntry || order?.DocEntry || 'draft';
      const stored = loadStoredAttachments('purchase-order', docEntryId);
      setExtraAttachmentsForEmail(stored);
      setSelectedExtraAttachmentIds(stored.map((a, idx) => a.id || String(idx)));

      setIsEmailModalOpen(true);
    } catch (err) {
      console.error('Erro ao preparar e-mail:', err);
      toast.error('Erro ao preparar e-mail com anexo.');
    }
  };

  const handleSendEmailViaGraph = async () => {
    let tokenToSend = msGraphToken.trim();

    if (!tokenToSend) {
      if (!azureClientId.trim()) {
        setShowAzureConfig(true);
        toast.error('Conecte sua conta Microsoft corporativa.');
        return;
      }
      try {
        toast.info('Abrindo autorização da Microsoft corporativa...');
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
        toast.error(authErr?.message || 'Autenticação necessária para envio corporativo.');
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

    if (!pdfFileForEmail) {
      toast.error('Arquivo PDF em anexo não encontrado.');
      return;
    }

    setIsSendingEmail(true);
    try {
      const allFilesToSend: (File | { name: string; type: string; contentBytes: string })[] = [
        pdfFileForEmail
      ];

      extraAttachmentsForEmail.forEach((att, idx) => {
        const id = att.id || String(idx);
        if (selectedExtraAttachmentIds.includes(id) && att.dataUrl) {
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

      toast.success(`E-mail com ${allFilesToSend.length} anexo(s) enviado com sucesso via Microsoft 365!`);
      setIsEmailModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao enviar e-mail via Microsoft Graph:', err);
      toast.error(err?.message || 'Erro ao enviar e-mail pela API Microsoft Graph.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleDisconnectMicrosoft = () => {
    clearMicrosoftSession();
    setMsAccount(null);
    setMsGraphToken('');
    toast.info('Conta Microsoft desconectada deste navegador.');
  };

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #purchase-order-print-container, #purchase-order-print-container * {
            visibility: visible !important;
          }
          #purchase-order-print-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .po-print-page-break {
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
                  Espelho Pedido de Compra • Layout de Impressão SAP
                  <span className="bg-evo-teal/20 text-evo-teal text-xs px-2 py-0.5 rounded font-mono font-bold">
                    #{docNum}
                  </span>
                </DialogTitle>
                <p className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">
                  Visualização fiel ao Crystal Reports / SAP Business One com download em PDF e envio corporativo
                </p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Page Selector Tabs */}
              <div className="hidden md:flex bg-white/10 p-0.5 rounded border border-white/15 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1 rounded transition-colors ${activeTab === 'all' ? 'bg-evo-teal text-evo-dark font-black' : 'text-white/70 hover:text-white'}`}
                >
                  Todas as Páginas (2)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('page1')}
                  className={`px-3 py-1 rounded transition-colors ${activeTab === 'page1' ? 'bg-evo-teal text-evo-dark font-black' : 'text-white/70 hover:text-white'}`}
                >
                  Pág. 1
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('page2')}
                  className={`px-3 py-1 rounded transition-colors ${activeTab === 'page2' ? 'bg-evo-teal text-evo-dark font-black' : 'text-white/70 hover:text-white'}`}
                >
                  Pág. 2
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center bg-white/10 rounded border border-white/15 px-1 py-0.5">
                <button 
                  type="button" 
                  onClick={() => setZoom(Math.max(60, zoom - 10))} 
                  className="p-1 hover:bg-white/15 text-white/80 rounded"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono px-2 text-white/90">{zoom}%</span>
                <button 
                  type="button" 
                  onClick={() => setZoom(Math.min(150, zoom + 10))} 
                  className="p-1 hover:bg-white/15 text-white/80 rounded"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button 
                  type="button" 
                  onClick={() => setZoom(100)} 
                  className="text-[10px] uppercase font-bold text-evo-teal px-1.5 hover:underline"
                  title="Ajustar 100%"
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
                title="Imprimir layout"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Imprimir</span>
              </Button>

              {/* Download PDF Button */}
              <Button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider h-9 px-4 flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
                title="Baixar arquivo PDF"
              >
                {isGeneratingPdf ? (
                  <RotateCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Baixar PDF</span>
              </Button>

              {/* Send by Corporate Email Button */}
              <Button
                type="button"
                onClick={handleOpenEmailModal}
                className="rounded-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider h-9 px-4 flex items-center gap-1.5 shadow-lg shadow-blue-600/20"
                title="Enviar Pedido por E-mail Corporativo"
              >
                <Mail className="w-4 h-4" />
                <span className="hidden sm:inline">Enviar por E-mail</span>
              </Button>

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
                <RotateCw className="w-4 h-4 animate-spin text-evo-teal" /> Sincronizando dados do pedido de compra...
              </div>
            )}

            <div 
              id="purchase-order-print-container"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}
              className="flex flex-col gap-12 items-center min-w-fit pb-12"
            >
              {/* PAGE 1 */}
              {(activeTab === 'all' || activeTab === 'page1') && (
                <div className="w-[1100px] min-h-[770px] bg-white text-slate-900 shadow-2xl p-10 flex flex-col justify-between po-print-page-break select-text font-sans">
                  <div>
                    {/* Header */}
                    <div className="flex justify-between items-start pb-4">
                      {/* Left Company Header */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-2">
                          <img 
                            src={QUALITECH_LOGO_PNG} 
                            alt="Qualitech Shell" 
                            className="h-10 w-10 object-contain" 
                          />
                          <div className="flex items-baseline font-black tracking-tight text-2xl">
                            <span className="text-[#0C3559]">Quali</span>
                            <span className="text-[#0088D1]">tech</span>
                          </div>
                        </div>
                        <h2 className="text-xs font-black uppercase text-slate-900 tracking-tight">
                          QUALITECH INSPECAO, REPARO E MANUTENCAO LTDA
                        </h2>
                        <div className="grid grid-cols-2 gap-x-6 text-[11px] text-slate-600 font-medium">
                          <div>
                            <span className="font-bold text-slate-700">CNPJ:</span> 17.417.147/0001-84
                          </div>
                          <div>
                            <span className="font-bold text-slate-700">Inscrição Estadual:</span> 79909564
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Jose Silva de Azevedo Neto, 200, Barra da Tijuca, Rio de Janeiro - RJ - BR
                        </p>
                      </div>

                      {/* Right Meta Column */}
                      <div className="w-[320px]">
                        <div className="flex items-center gap-2 justify-end mb-2">
                          <div className="w-1.5 h-6 bg-[#F59E0B]"></div>
                          <h1 className="text-xl font-black uppercase tracking-wider text-slate-900">Pedido de Compra</h1>
                        </div>
                        <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-xs">
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>N° Documento</span>
                            <span>Pagina</span>
                          </div>
                          <div className="flex justify-between font-black text-slate-900">
                            <span className="text-sm">{docNumFormatted}</span>
                            <span>1</span>
                          </div>
                          <div className="border-t border-dashed border-slate-200 my-1"></div>
                          
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>Data de Emissão</span>
                            <span>Data de Entrega</span>
                          </div>
                          <div className="flex justify-between font-bold text-slate-900">
                            <span>{docDateFormatted}</span>
                            <span>{docDueDateFormatted}</span>
                          </div>

                          <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                            <span>Seu Contato</span>
                            <span>Telefone</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-900 font-bold">
                            <span className="truncate max-w-[200px]">{contactName}</span>
                            <span>{contactPhone || '-'}</span>
                          </div>

                          <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                            <span>Condição de PG</span>
                            <span>Forma de PG</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-900 font-bold">
                            <span>{paymentCondition}</span>
                            <span>{paymentMethodCode}</span>
                          </div>

                          <div className="pt-1">
                            <span className="text-[10px] text-slate-500">Forma de PG</span>
                            <div className="text-[11px] font-bold text-slate-900 leading-tight">
                              {paymentMethodDesc}
                            </div>
                          </div>

                          <div className="border-t border-dashed border-slate-200 my-1 pt-1">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Endereço de Remessa</span>
                            <div className="text-[11px] text-slate-800 font-bold leading-tight mt-0.5 space-y-0.5">
                              {shippingAddressLines.map((l, i) => (
                                <p key={i}>{l}</p>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Middle Left: Supplier Information */}
                    <div className="pt-2 pb-6 border-b border-dashed border-slate-300">
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-[#F59E0B]" />
                        <h3 className="text-xs font-black uppercase text-slate-900 tracking-tight">
                          {supplierName}
                        </h3>
                      </div>
                      <div className="pl-6 pt-1 space-y-1 text-xs text-slate-700">
                        <div className="flex gap-6">
                          <div>
                            <span className="text-slate-500 text-[11px] mr-2">CNPJ</span>
                            <span className="font-bold">{supplierCnpj}</span>
                          </div>
                          {supplierIE && (
                            <div>
                              <span className="text-slate-500 text-[11px] mr-2">Inscrição Estadual</span>
                              <span className="font-bold">{supplierIE}</span>
                            </div>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 font-medium leading-tight">
                          {supplierAddressLines.map((line, i) => (
                            <p key={i}>{line}</p>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Items Table */}
                    <div className="pt-4">
                      <table className="w-full border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                            <th className="py-2 px-2 text-left font-bold">Cód do Item</th>
                            <th className="py-2 px-2 text-left font-bold">Descrição</th>
                            <th className="py-2 px-2 text-left font-bold">Cod NCM</th>
                            <th className="py-2 px-2 text-left font-bold">Departamento</th>
                            <th className="py-2 px-2 text-left font-bold">Projeto</th>
                            <th className="py-2 px-2 text-left font-bold">Nat Operação</th>
                            <th className="py-2 px-2 text-left font-bold">Data Entrega</th>
                            <th className="py-2 px-2 text-left font-bold">CST</th>
                            <th className="py-2 px-2 text-left font-bold">CFOP</th>
                            <th className="py-2 px-2 text-center font-bold">UM</th>
                            <th className="py-2 px-2 text-right font-bold">QTD.</th>
                            <th className="py-2 px-2 text-center font-bold">Moed.</th>
                            <th className="py-2 px-2 text-right font-bold">Preço</th>
                            <th className="py-2 px-2 text-right font-bold">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {lines.map((l, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-2 text-slate-800 font-mono text-[10px]">
                                {l.lineNum} {l.itemCode}
                              </td>
                              <td className="py-2.5 px-2 text-slate-900 font-medium">{l.description}</td>
                              <td className="py-2.5 px-2 text-slate-600">{l.ncm || '-'}</td>
                              <td className="py-2.5 px-2 text-slate-600">{l.dept || '-'}</td>
                              <td className="py-2.5 px-2 text-slate-600">{l.project || '-'}</td>
                              <td className="py-2.5 px-2 text-slate-600">{l.natOp || '-'}</td>
                              <td className="py-2.5 px-2 text-slate-600">{l.deliveryDate || '-'}</td>
                              <td className="py-2.5 px-2 text-slate-600">{l.cst || '-'}</td>
                              <td className="py-2.5 px-2 text-slate-600">{l.cfop || '-'}</td>
                              <td className="py-2.5 px-2 text-center text-slate-600">{l.uom || '-'}</td>
                              <td className="py-2.5 px-2 text-right font-mono font-medium">{formatNum(l.quantity, 2)}</td>
                              <td className="py-2.5 px-2 text-center text-slate-600">{l.currency}</td>
                              <td className="py-2.5 px-2 text-right font-mono">{formatNum(l.price, 2)}</td>
                              <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900">{formatNum(l.total, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Footer Total */}
                  <div className="pt-6 border-t border-dashed border-slate-300">
                    <div className="flex justify-end items-center gap-6 text-sm">
                      <span className="font-bold text-slate-700">Valor Total</span>
                      <span className="font-bold text-slate-700">R$</span>
                      <span className="font-black text-base text-slate-900 font-mono">{formatNum(docTotal, 2)}</span>
                    </div>
                    <div className="w-56 ml-auto border-b border-dashed border-slate-300 pt-1"></div>
                  </div>
                </div>
              )}

              {/* PAGE 2 */}
              {(activeTab === 'all' || activeTab === 'page2') && (
                <div className="w-[1100px] min-h-[770px] bg-white text-slate-900 shadow-2xl p-10 flex flex-col justify-between po-print-page-break select-text font-sans">
                  <div>
                    {/* Header Page 2 */}
                    <div className="flex justify-between items-start pb-4">
                      {/* Left Company Header */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-2">
                          <img 
                            src={QUALITECH_LOGO_PNG} 
                            alt="Qualitech Shell" 
                            className="h-10 w-10 object-contain" 
                          />
                          <div className="flex items-baseline font-black tracking-tight text-2xl">
                            <span className="text-[#0C3559]">Quali</span>
                            <span className="text-[#0088D1]">tech</span>
                          </div>
                        </div>
                        <h2 className="text-xs font-black uppercase text-slate-900 tracking-tight">
                          QUALITECH INSPECAO, REPARO E MANUTENCAO LTDA
                        </h2>
                        <div className="grid grid-cols-2 gap-x-6 text-[11px] text-slate-600 font-medium">
                          <div>
                            <span className="font-bold text-slate-700">CNPJ:</span> 17.417.147/0001-84
                          </div>
                          <div>
                            <span className="font-bold text-slate-700">Inscrição Estadual:</span> 79909564
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Jose Silva de Azevedo Neto, 200, Barra da Tijuca, Rio de Janeiro - RJ - BR
                        </p>
                      </div>

                      {/* Right Meta Column */}
                      <div className="w-[320px]">
                        <div className="flex items-center gap-2 justify-end mb-2">
                          <div className="w-1.5 h-6 bg-[#F59E0B]"></div>
                          <h1 className="text-xl font-black uppercase tracking-wider text-slate-900">Pedido de Compra</h1>
                        </div>
                        <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-xs">
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>N° Documento</span>
                            <span>Pagina</span>
                          </div>
                          <div className="flex justify-between font-black text-slate-900">
                            <span className="text-sm">{docNumFormatted}</span>
                            <span>2</span>
                          </div>
                          <div className="border-t border-dashed border-slate-200 my-1"></div>
                          
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>Data de Emissão</span>
                            <span>Data de Entrega</span>
                          </div>
                          <div className="flex justify-between font-bold text-slate-900">
                            <span>{docDateFormatted}</span>
                            <span>{docDueDateFormatted}</span>
                          </div>

                          <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                            <span>Seu Contato</span>
                            <span>Telefone</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-900 font-bold">
                            <span className="truncate max-w-[200px]">{contactName}</span>
                            <span>{contactPhone || '-'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Table Header Bar repeated */}
                    <div className="pt-2 pb-6 border-t border-dashed border-slate-300">
                      <table className="w-full border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                            <th className="py-2 px-2 text-left font-bold">Cód do Item</th>
                            <th className="py-2 px-2 text-left font-bold">Descrição</th>
                            <th className="py-2 px-2 text-left font-bold">Cod NCM</th>
                            <th className="py-2 px-2 text-left font-bold">Departamento</th>
                            <th className="py-2 px-2 text-left font-bold">Projeto</th>
                            <th className="py-2 px-2 text-left font-bold">Nat Operação</th>
                            <th className="py-2 px-2 text-left font-bold">Data Entrega</th>
                            <th className="py-2 px-2 text-left font-bold">CST</th>
                            <th className="py-2 px-2 text-left font-bold">CFOP</th>
                            <th className="py-2 px-2 text-center font-bold">UM</th>
                            <th className="py-2 px-2 text-right font-bold">QTD.</th>
                            <th className="py-2 px-2 text-center font-bold">Moed.</th>
                            <th className="py-2 px-2 text-right font-bold">Preço</th>
                            <th className="py-2 px-2 text-right font-bold">Total</th>
                          </tr>
                        </thead>
                      </table>
                    </div>

                    {/* Orange Rounded Box with Comments / Observações */}
                    <div className="mt-4 rounded-xl border-2 border-orange-400 p-6 bg-white min-h-[140px] shadow-sm">
                      <p className="text-xs text-slate-800 leading-relaxed font-medium">
                        {orderComments}
                      </p>
                    </div>

                    {/* Red Standard Disclaimers */}
                    <div className="mt-8 space-y-1.5 text-xs text-red-500 font-medium leading-relaxed">
                      <p>1 - Favor mencionar o número deste pedido de compra na Nota Fiscal;</p>
                      <p>2 - Não nos responsabilizamos pelo frete, caso não seja respeitada a empresa indicada;</p>
                      <p>3 - Faturamento/Cobrança: Endereço acima;</p>
                      <p>4 - Emissões de faturas devem ser realizadas entre os dias 1 e 25 de cada mês;</p>
                      <p>5 - Itens que requer certificado, a documentação deve ser enviada junto as faturas;</p>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-6 text-right">
                    Qualitech ERP • Layout Padrão de Pedido de Compra
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Corporate Email Sending Modal (Microsoft 365) */}
      <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
        <DialogContent 
          showCloseButton={false}
          className="w-[95vw] max-w-2xl bg-white text-slate-900 p-0 rounded-none border border-slate-200 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        >
          <DialogHeader className="bg-slate-900 p-4 sm:p-5 text-white flex flex-row items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-black tracking-tight text-white uppercase">
                  Enviar Pedido de Compra por E-mail
                </DialogTitle>
                <p className="text-[11px] text-slate-400 font-medium">
                  Envio via Microsoft 365 Corporativo • Pedido #{docNum}
                </p>
              </div>
            </div>
            <DialogClose render={<Button variant="ghost" className="text-white hover:bg-white/20 p-1.5 h-8 w-8 rounded-none" />}>
              <X className="w-4 h-4" />
            </DialogClose>
          </DialogHeader>

          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            {/* Sender / Corporate Account Status */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800">Remetente Corporativo: </span>
                  <span className="font-mono text-slate-600">
                    {msAccount ? `${msAccount.name} (${msAccount.username})` : (userEmail || 'Conta Corporativa Microsoft')}
                  </span>
                </div>
              </div>
              {msAccount ? (
                <button
                  type="button"
                  onClick={handleDisconnectMicrosoft}
                  className="text-[10px] text-red-600 hover:text-red-800 font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                >
                  <LogOut className="w-3 h-3" /> Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setIsLoggingInMs(true);
                      const acc = await loginWithMicrosoftPopup({
                        clientId: azureClientId.trim(),
                        tenantId: azureTenantId.trim()
                      });
                      setMsAccount(acc);
                      setMsGraphToken(acc.accessToken);
                      toast.success(`Conectado como ${acc.name}!`);
                    } catch (e: any) {
                      toast.error(e?.message || 'Erro ao conectar conta Microsoft.');
                    } finally {
                      setIsLoggingInMs(false);
                    }
                  }}
                  disabled={isLoggingInMs}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                >
                  <Key className="w-3 h-3" /> {isLoggingInMs ? 'Conectando...' : 'Conectar Microsoft 365'}
                </button>
              )}
            </div>

            {/* Recipient */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                Para (Destinatários)
              </Label>
              <Input
                type="text"
                placeholder="fornecedor@empresa.com; compras@qualitechirm.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="h-10 text-xs font-semibold rounded-none border-slate-300 focus:border-blue-600"
                required
              />
              <p className="text-[10px] text-slate-400">
                Separe múltiplos destinatários com ponto e vírgula (;) ou vírgula (,).
              </p>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                Assunto do E-mail
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
                Corpo da Mensagem
              </Label>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={6}
                className="w-full text-xs font-medium p-3 rounded-none border border-slate-300 focus:outline-none focus:border-blue-600 transition-colors leading-relaxed font-sans"
              />
            </div>

            {/* Attachments Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  Arquivos em Anexo ({1 + selectedExtraAttachmentIds.length})
                </Label>
              </div>

              {/* 1. Main PDF Attachment */}
              <div className="flex items-center justify-between p-3 border border-blue-200 bg-blue-50/60 rounded">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded bg-red-100 text-red-600 flex items-center justify-center font-black text-xs shrink-0">
                    PDF
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800">{pdfFileForEmail?.name || `Pedido_de_Compra_${docNum}.pdf`}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Layout Oficial do Pedido de Compra (2 páginas)
                    </span>
                  </div>
                </div>
                <span className="text-[9px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded uppercase">
                  PDF Principal
                </span>
              </div>

              {/* 2. Extra Stored Attachments */}
              {extraAttachmentsForEmail.length > 0 && (
                <div className="pt-1 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                    <span>Documentos vinculados a este pedido:</span>
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
                      {selectedExtraAttachmentIds.length === extraAttachmentsForEmail.length ? 'desmarcar todos' : 'selecionar todos'}
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
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                            />
                            <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-xs font-semibold text-slate-800 truncate">{att.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">
                            {(att.size / 1024).toFixed(1)} KB
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEmailModalOpen(false)}
              className="rounded-none border-slate-300 text-xs font-bold uppercase tracking-wider"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSendEmailViaGraph}
              disabled={isSendingEmail}
              className="rounded-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider px-6 flex items-center gap-2 shadow-lg shadow-blue-600/20"
            >
              {isSendingEmail ? (
                <RotateCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>{isSendingEmail ? 'Enviando...' : 'Enviar via Microsoft 365'}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
