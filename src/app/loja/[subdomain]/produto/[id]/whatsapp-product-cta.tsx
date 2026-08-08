import Link from "next/link";
import { WhatsappIcon } from "../../icons";

/**
 * CTA "Comprar pelo WhatsApp" — o link aponta para a rota
 * `comprar-whatsapp` (não direto pro WhatsApp): ela decide se manda o
 * visitante pro cadastro primeiro ou já cria o pedido pendente, ver
 * `comprar-whatsapp/route.ts`.
 */
export function WhatsappProductCta({ href, loggedIn }: { href: string; loggedIn: boolean }) {
  return (
    <div className="mt-2">
      <Link
        href={href}
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
