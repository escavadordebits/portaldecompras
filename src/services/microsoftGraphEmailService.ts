import { Client } from "@microsoft/microsoft-graph-client";

// Função para converter um arquivo do input do React para Base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      // Remove o prefixo "data:application/pdf;base64,"
      resolve(base64String.split(",")[1]);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Utilitário para separar e limpar múltiplos e-mails separados por ponto e vírgula (;), vírgula (,) ou espaço
 */
export function parseEmailRecipients(input: string | string[]): string[] {
  if (!input) return [];
  
  const rawList = Array.isArray(input) ? input : input.split(/[;,]+/);
  
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of rawList) {
    if (!item) continue;
    // Extrai e-mail caso venha no formato "Nome <email@dominio.com>"
    const match = item.match(/<([^>]+)>/);
    const cleaned = (match ? match[1] : item).trim();
    if (cleaned && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      result.push(cleaned);
    }
  }

  return result;
}

export interface SendEmailOptions {
  graphAccessToken: string;
  arquivo?: File;
  arquivos?: (File | { name: string; type: string; contentBytes: string })[];
  toEmail: string | string[];
  ccEmail?: string | string[];
  subject?: string;
  bodyContent?: string;
}

export async function enviarEmailComAnexoReal(
  graphAccessToken: string, 
  arquivoOuArquivos: File | (File | { name: string; type: string; contentBytes: string })[], 
  toEmail: string | string[] = "destinatario@outlook.com",
  subject: string = "Espelho Pedido de Venda / Draft",
  bodyContent: string = "Olá, segue o arquivo em anexo enviado pelo app React.",
  ccEmail?: string | string[]
) {
  // Inicializa o cliente com o token de autenticação do usuário obtido via MSAL / OAuth
  const client = Client.init({
    authProvider: (done) => done(null, graphAccessToken),
  });

  const recipientList = parseEmailRecipients(toEmail);
  if (recipientList.length === 0) {
    throw new Error("Nenhum endereço de e-mail de destinatário válido foi informado.");
  }

  const rawList = Array.isArray(arquivoOuArquivos) ? arquivoOuArquivos : [arquivoOuArquivos];
  const attachmentsList = [];

  for (const item of rawList) {
    if (!item) continue;
    if ('contentBytes' in item && typeof item.contentBytes === 'string') {
      attachmentsList.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: item.name,
        contentType: item.type || "application/octet-stream",
        contentBytes: item.contentBytes,
      });
    } else if (item instanceof File) {
      const base64 = await fileToBase64(item);
      attachmentsList.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: item.name,
        contentType: item.type || "application/pdf",
        contentBytes: base64,
      });
    }
  }

  const toRecipients = recipientList.map((addr) => ({
    emailAddress: {
      address: addr,
    },
  }));

  const ccRecipientList = ccEmail ? parseEmailRecipients(ccEmail) : [];
  const ccRecipients = ccRecipientList.map((addr) => ({
    emailAddress: {
      address: addr,
    },
  }));

  const emailDraft: any = {
    message: {
      subject: subject,
      body: {
        contentType: "Text",
        content: bodyContent,
      },
      toRecipients: toRecipients,
      attachments: attachmentsList,
    },
  };

  if (ccRecipients.length > 0) {
    emailDraft.message.ccRecipients = ccRecipients;
  }

  // Envia o e-mail diretamente pela API da Microsoft Graph
  await client.api("/me/sendMail").post(emailDraft);
}
