import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle2, Trash2, Download, Paperclip, Plus, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export interface StoredAttachment {
  id?: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  uploadedAt: string;
}

// Backward compatibility: state can contain files array or legacy 3 keys
export interface DocumentAttachmentsState {
  files?: StoredAttachment[];
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

export function loadStoredAttachments(documentType: 'quotation' | 'order', docId?: string | number | null): StoredAttachment[] {
  try {
    const currentKey = `sap_attachments_${documentType}_${docId || 'draft'}`;
    const saved = localStorage.getItem(currentKey);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed.files)) {
      return parsed.files;
    }
    // Convert legacy format if present
    const legacyFiles: StoredAttachment[] = [];
    if (parsed.poCliente) legacyFiles.push({ ...parsed.poCliente, id: 'poCliente' });
    if (parsed.cotacaoQualitech) legacyFiles.push({ ...parsed.cotacaoQualitech, id: 'cotacaoQualitech' });
    if (parsed.emailAprovacao) legacyFiles.push({ ...parsed.emailAprovacao, id: 'emailAprovacao' });
    return legacyFiles;
  } catch (e) {
    console.error('Error loading attachments:', e);
    return [];
  }
}

export function DocumentAttachmentsSection({
  documentType,
  docId,
  onAttachmentsChange,
  readOnly = false
}: DocumentAttachmentsSectionProps) {
  const [fileList, setFileList] = useState<StoredAttachment[]>(() => {
    return loadStoredAttachments(documentType, docId);
  });

  // Re-load when docId changes
  useEffect(() => {
    const list = loadStoredAttachments(documentType, docId);
    setFileList(list);
    if (onAttachmentsChange) {
      onAttachmentsChange({ files: list });
    }
  }, [docId, documentType]);

  const saveFileList = (newList: StoredAttachment[]) => {
    setFileList(newList);
    try {
      const currentKey = `sap_attachments_${documentType}_${docId || 'draft'}`;
      localStorage.setItem(currentKey, JSON.stringify({ files: newList }));
    } catch (e) {
      console.warn('LocalStorage save error (file might be large):', e);
    }
    if (onAttachmentsChange) {
      onAttachmentsChange({ files: newList });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const filesArray: File[] = Array.from(files);
    let loadedCount = 0;
    const newItems: StoredAttachment[] = [];

    filesArray.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const dataUrl = uploadEvent.target?.result as string;
        newItems.push({
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl: dataUrl,
          uploadedAt: new Date().toISOString()
        });

        loadedCount++;
        if (loadedCount === filesArray.length) {
          const updated = [...fileList, ...newItems];
          saveFileList(updated);
          toast.success(
            filesArray.length === 1
              ? `Arquivo "${filesArray[0].name}" anexado com sucesso!`
              : `${filesArray.length} arquivos anexados com sucesso!`
          );
        }
      };

      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleRemove = (indexToRemove: number, fileName: string) => {
    const updated = fileList.filter((_, idx) => idx !== indexToRemove);
    saveFileList(updated);
    toast.info(`Anexo "${fileName}" removido.`);
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

  const inputId = `file-input-single-${documentType}-${docId || 'draft'}`;

  return (
    <div className="space-y-4 bg-white p-6 border border-evo-bg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-evo-bg pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-none bg-evo-dark text-white flex items-center justify-center">
            <Paperclip className="w-4 h-4 text-evo-teal" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-evo-dark">
              Anexos do Documento
            </h3>
            <p className="text-[9px] font-bold text-evo-dark/50 uppercase tracking-widest">
              Faça o upload dos arquivos que serão anexados e enviados junto com a Draft Invoice
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {fileList.length > 0 ? (
            <Badge className="bg-emerald-600 text-white rounded-none text-[9px] font-black uppercase tracking-widest px-3 py-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> {fileList.length} {fileList.length === 1 ? 'Anexo Disponível' : 'Anexos Disponíveis'}
            </Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-600 border border-slate-300 rounded-none text-[9px] font-black uppercase tracking-widest px-3 py-1">
              Nenhum anexo
            </Badge>
          )}
        </div>
      </div>

      {/* Upload Zone / Drop Area */}
      {!readOnly && (
        <div>
          <input 
            type="file"
            id={inputId}
            multiple
            className="hidden"
            onChange={handleFileUpload}
            disabled={readOnly}
          />
          <label 
            htmlFor={inputId}
            className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-evo-dark/20 hover:border-evo-teal bg-slate-50 hover:bg-slate-100/80 cursor-pointer transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Upload className="w-5 h-5 text-evo-teal" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-evo-dark mb-1">
              Clique para selecionar ou arraste arquivos para anexar
            </span>
            <span className="text-[10px] text-evo-dark/50 font-medium">
              PO do cliente, Cotação, E-mail de aprovação, boletins de medição ou quaisquer outros comprovantes (PDF, XLSX, DOCX, Imagens)
            </span>
          </label>
        </div>
      )}

      {/* List of Attachments */}
      {fileList.length > 0 && (
        <div className="pt-2">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
            Arquivos Anexados ({fileList.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {fileList.map((file, idx) => (
              <div 
                key={file.id || idx}
                className="bg-slate-50 border border-slate-200 p-3.5 flex flex-col justify-between hover:border-evo-teal/50 transition-colors shadow-xs"
              >
                <div>
                  <div className="flex items-start gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                      <FileText className="w-4 h-4 text-evo-teal" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-slate-800 truncate" title={file.name}>
                        {file.name}
                      </p>
                      <div className="flex items-center gap-2 text-[9px] text-slate-500 font-medium">
                        <span>{formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span>{new Date(file.uploadedAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 mt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(file)}
                    className="flex-1 rounded-none h-7 text-[9px] font-black uppercase tracking-wider bg-white hover:bg-evo-dark hover:text-white border-slate-300 transition-all flex items-center justify-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Baixar
                  </Button>
                  {!readOnly && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemove(idx, file.name)}
                      className="rounded-none h-7 w-7 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-700 border border-rose-200"
                      title="Remover anexo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
