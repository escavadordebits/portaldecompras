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

export interface SendEmailOptions {
  graphAccessToken: string;
  arquivo: File;
  toEmail: string;
  subject?: string;
  bodyContent?: string;
}

export async function enviarEmailComAnexoReal(
  graphAccessToken: string, 
  arquivo: File, 
  toEmail: string = "destinatario@outlook.com",
  subject: string = "Espelho Pedido de Venda / Draft",
  bodyContent: string = "Olá, segue o arquivo em anexo enviado pelo app React."
) {
  // Inicializa o cliente com o token de autenticação do usuário obtido via MSAL
  const client = Client.init({
    authProvider: (done) => done(null, graphAccessToken),
  });

  const arquivoBase64 = await fileToBase64(arquivo);

  const emailDraft = {
    message: {
      subject: subject,
      body: {
        contentType: "Text",
        content: bodyContent,
      },
      toRecipients: [
        {
          emailAddress: {
            address: toEmail,
          },
        },
      ],
      attachments: [
        {
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: arquivo.name,
          contentType: arquivo.type || "application/pdf",
          contentBytes: arquivoBase64, // O arquivo entra aqui convertido
        },
      ],
    },
  };

  // Envia o e-mail diretamente pela API da Microsoft
  await client.api("/me/sendMail").post(emailDraft);
  alert("E-mail enviado com sucesso!");
}
