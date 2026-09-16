import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle2, Trash2, Download, Paperclip, Mail, FileSpreadsheet, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export interface StoredAttachment {
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  uploadedAt: string;
}

export interface DocumentAttachmentsState {
  poCliente?: StoredAttachment | null;
  cotacaoQualitech?: StoredAttachment | null;
  emailAprovacao?: StoredAttachment | null;
}

interface DocumentAttachmentsSectionProps {
  documentType: 'quotation' | 'order';
  docId?: string | number | null;
  onAttachmentsChange?: (attachments: DocumentAttachmentsState) => void;
  readOnly?: boolean;
}

export function DocumentAttachmentsSection({
  documentType,
  docId,
  onAttachmentsChange,
  readOnly = false
}: DocumentAttachmentsSectionProps) {
  const storageKey = `sap_attachments_${documentType}_${docId || 'draft'}`;

  const [attachments, setAttachments] = useState<DocumentAttachmentsState>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading attachments from storage:', e);
    }
    return {
      poCliente: null,
      cotacaoQualitech: null,
      emailAprovacao: null
    };
  });

  // Re-load when docId changes
  useEffect(() => {
    try {
      const currentKey = `sap_attachments_${documentType}_${docId || 'draft'}`;
      const saved = localStorage.getItem(currentKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setAttachments(parsed);
        if (onAttachmentsChange) onAttachmentsChange(parsed);
      } else {
        setAttachments({
          poCliente: null,
          cotacaoQualitech: null,
          emailAprovacao: null
        });
      }
    } catch (e) {
      console.error('Error re-reading attachments:', e);
    }
  }, [docId, documentType]);

  const saveAttachments = (newAttachments: DocumentAttachmentsState) => {
    setAttachments(newAttachments);
    try {
      const currentKey = `sap_attachments_${documentType}_${docId || 'draft'}`;
      localStorage.setItem(currentKey, JSON.stringify(newAttachments));
    } catch (e) {
      console.warn('LocalStorage save error (file might be large):', e);
    }
    if (onAttachmentsChange) {
      onAttachmentsChange(newAttachments);
    }
  };

  const handleFileUpload = (field: keyof DocumentAttachmentsState, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUrl = uploadEvent.target?.result as string;
      const newAttachment: StoredAttachment = {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        dataUrl: dataUrl,
        uploadedAt: new Date().toISOString()
      };

      const updated = {
        ...attachments,
        [field]: newAttachment
      };

      saveAttachments(updated);
      toast.success(`Anexo "${file.name}" anexado com sucesso!`);
    };

    // Read as DataURL for persistence & download
    reader.readAsDataURL(file);
    // Reset file input value so re-uploading the same file triggers onChange
    e.target.value = '';
  };

  const handleRemove = (field: keyof DocumentAttachmentsState, fieldName: string) => {
    const updated = {
      ...attachments,
      [field]: null
    };
    saveAttachments(updated);
    toast.info(`Anexo ${fieldName} removido.`);
  };

  const handleDownload = (attachment: StoredAttachment) => {
    if (!attachment.dataUrl) {
      toast.error('Conteúdo do anexo não disponível para download.');
      return;
    }
    const link = document.createElement('a');
    link.href = attachment.dataUrl;
    link.download = attachment.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Download de "${attachment.name}" iniciado.`);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const fieldsConfig: {
    key: keyof DocumentAttachmentsState;
    label: string;
    description: string;
    icon: React.ElementType;
    badgeColor: string;
  }[] = [
    {
      key: 'poCliente',
      label: 'PO do Cliente (Purchase Order)',
      description: 'Documento oficial ou espelho da PO enviada pelo cliente',
      icon: FileSpreadsheet,
      badgeColor: 'border-blue-500 text-blue-600 bg-blue-50'
    },
    {
      key: 'cotacaoQualitech',
      label: 'Cotação Qualitech',
      description: 'Cópia da proposta comercial formalizada e precificada',
      icon: FileCheck,
      badgeColor: 'border-evo-teal text-evo-teal bg-evo-teal/10'
    },
    {
      key: 'emailAprovacao',
      label: 'E-mail de Aprovação',
      description: 'Comprovante em PDF ou mensagem de aprovação formal do cliente',
      icon: Mail,
      badgeColor: 'border-emerald-500 text-emerald-600 bg-emerald-50'
    }
  ];

  return (
    <div className="space-y-4 bg-white p-8 border border-evo-bg shadow-sm">
      <div className="flex items-center justify-between border-b border-evo-bg pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-none bg-evo-dark text-white flex items-center justify-center">
            <Paperclip className="w-4 h-4 text-evo-teal" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-evo-dark">
              Anexos e Comprovações da Venda
            </h3>
            <p className="text-[9px] font-bold text-evo-dark/40 uppercase tracking-widest">
              Anexe os 3 documentos essenciais para rastreabilidade e auditoria (PO, Cotação e Aprovação)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {Object.values(attachments).filter(Boolean).length === 3 ? (
            <Badge className="bg-emerald-600 text-white rounded-none text-[9px] font-black uppercase tracking-widest px-3 py-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> 3/3 Anexos Carregados
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800 border border-amber-300 rounded-none text-[9px] font-black uppercase tracking-widest px-3 py-1">
              {Object.values(attachments).filter(Boolean).length}/3 Anexos Anexados
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        {fieldsConfig.map(({ key, label, description, icon: Icon, badgeColor }) => {
          const currentFile = attachments[key];
          const inputId = `file-input-${documentType}-${docId || 'draft'}-${key}`;

          return (
            <div 
              key={key} 
              className={`p-5 border-2 transition-all flex flex-col justify-between rounded-none ${
                currentFile 
                  ? 'border-emerald-400 bg-emerald-50/20' 
                  : 'border-dashed border-evo-dark/20 bg-slate-50 hover:bg-slate-100/70'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-evo-dark/5 text-evo-dark flex items-center justify-center">
                      <Icon className="w-4 h-4 text-evo-teal" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-evo-dark">
                      {label}
                    </span>
                  </div>
                  {currentFile ? (
                    <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-3 h-3" /> Anexado
                    </span>
                  ) : (
                    <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-slate-200 text-slate-600">
                      Pendente
                    </span>
                  )}
                </div>

                <p className="text-[9px] text-evo-dark/50 leading-relaxed min-h-[32px] mb-4">
                  {description}
                </p>

                {currentFile ? (
                  <div className="bg-white p-3 border border-emerald-200 shadow-sm mb-4 space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-[10px] font-black text-evo-dark truncate" title={currentFile.name}>
                        {currentFile.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[8px] font-bold text-evo-dark/40 pt-1 border-t border-slate-100">
                      <span>{formatFileSize(currentFile.size)}</span>
                      <span>{new Date(currentFile.uploadedAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="pt-2">
                {currentFile ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(currentFile)}
                      className="flex-1 rounded-none h-8 text-[9px] font-black uppercase tracking-wider border-emerald-300 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3 h-3" />
                      Baixar
                    </Button>
                    {!readOnly && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemove(key, label)}
                        className="rounded-none h-8 w-8 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-700 border border-rose-200"
                        title="Remover anexo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div>
                    <input 
                      type="file"
                      id={inputId}
                      className="hidden"
                      onChange={(e) => handleFileUpload(key, e)}
                      disabled={readOnly}
                    />
                    <label 
                      htmlFor={inputId}
                      className={`w-full h-9 flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all border ${
                        readOnly 
                          ? 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-300 text-slate-500' 
                          : 'bg-white hover:bg-evo-dark hover:text-white border-evo-dark/20 text-evo-dark shadow-sm'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 text-evo-teal" />
                      Selecionar Arquivo
                    </label>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
