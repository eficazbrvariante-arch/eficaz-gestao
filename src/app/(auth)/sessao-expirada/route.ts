import { signOut } from "@/lib/auth";

/**
 * Encerra uma sessão que aponta para uma empresa inexistente.
 *
 * Redirecionar direto para `/login` não resolveria: o cookie continua válido e o
 * proxy devolveria o usuário ao painel, num laço. Aqui a sessão é de fato
 * derrubada antes de mandar para o login.
 */
export async function GET() {
  await signOut({ redirectTo: "/login?sessao=expirada" });
}
