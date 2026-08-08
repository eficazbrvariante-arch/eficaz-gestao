import { Resend } from "resend";

/**
 * Cliente único do Resend, criado só se `RESEND_API_KEY` estiver configurada.
 * Sem a chave (ambiente ainda não integrado com um provedor de e-mail),
 * `sendEmail` cai no fallback de log — mesmo padrão que já existia no
 * placeholder de recuperação de senha do funcionário, agora compartilhado.
 */
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const DEFAULT_FROM = "Eficaz Gestão <onboarding@resend.dev>";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!resend) {
    console.log(`[e-mail] RESEND_API_KEY não configurada — não enviado.\nPara: ${to}\nAssunto: ${subject}\n${html}`);
    return;
  }

  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    // Não deixa o fluxo (ex.: pedido de reset de senha) quebrar por causa de
    // um provedor de e-mail fora do ar — só registra, quem chamou continua
    // devolvendo a mensagem genérica de sucesso de sempre.
    console.error(`[e-mail] Falha ao enviar para ${to}:`, error);
  }
}
