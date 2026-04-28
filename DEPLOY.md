# Guia de Deploy - Qualitech SAP Portal

Este documento descreve os passos para realizar o deploy da aplicação em um servidor Windows com IIS.

## Pré-requisitos no Servidor
1. **Node.js** (v20+)
2. **IIS** com **URL Rewrite Module** instalado.
3. **iisnode** instalado.

## Comandos de Deploy

### 1. Instalação e Build
Execute estes comandos na raiz do projeto:

```bash
# Instalar dependências
npm install

# Compilar o frontend (Cria a pasta /dist)
npm run build
```

### 2. Configuração de Ambiente
Crie um arquivo `.env` na raiz do servidor com as credenciais necessárias:
- `SAP_URL`
- `SAP_USER`
- `SAP_PASSWORD`
- `SAP_COMPANY_DB`
- `RESEND_API_KEY` (para o envio de e-mails)

## Estrutura de Arquivos no IIS
Seu site no IIS deve apontar para a raiz deste projeto. Os arquivos essenciais são:
- `dist/` (gerado pelo build)
- `node_modules/`
- `web.config`
- `server.ts`
- `server.js`
- `iisnode.yml`
- `.env`

## Troubleshooting
- Verifique os logs na pasta `iisnode/` caso ocorram erros 500.
- Certifique-se de que o pool de aplicativos do IIS esteja configurado como `No Managed Code`.
- O comando `node --import tsx server.ts` deve funcionar manualmente no terminal do servidor para validar a conexão com o SAP.
