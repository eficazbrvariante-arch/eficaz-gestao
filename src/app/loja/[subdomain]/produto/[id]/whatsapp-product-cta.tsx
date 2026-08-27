import Link from "next/link";
import { WhatsappIcon } from "../../icons";

/**
 * CTA "Comprar pelo WhatsApp" — o link aponta para a rota
 * `comprar-whatsapp` (não direto pro WhatsApp): ela decide se manda o
 * visitante pro cadastro primeiro ou já cria o pedido pendente, ver
 * `comprar-whatsapp/route.ts`.
 *
 * `prefetch={false}` é obrigatório aqui: o Next faz prefetch de todo
 * `<Link>` assim que ele entra na tela (só de rolar a página), e como o
 * destino cria o pedido como efeito colateral de um GET, isso criava
 * pedido fantasma sem o visitante clicar em nada.
 */
export function WhatsappProductCta({ href, loggedIn }: { href: string; loggedIn: boolean }) {
  return (
    <div className="mt-2">
      <Link
        href={href}
        prefetch={false}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-[#25D366] px-5 py-3 text-sm font-medium text-[#128C7E] hover:bg-[#25D366]/5"
      >
        <WhatsappIcon className="h-4 w-4" />
        Comprar pelo WhatsApp
      </Link>
      {!loggedIn && (
        <p className="mt-1 text-center text-xs text-slate-500">
          Cadastro rápido primeiro, para esse pedido aparecer no sistema da loja.
        </p>
      )}
    </div>
  );
}
