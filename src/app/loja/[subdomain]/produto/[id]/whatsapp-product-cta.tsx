import { buildWhatsappLink } from "@/lib/whatsapp";
import { WhatsappIcon } from "../../icons";

/** CTA "Comprar pelo WhatsApp" com a mensagem já preenchida com o produto, preço e link. */
export function WhatsappProductCta({
  whatsapp,
  productName,
  priceLabel,
  productUrl,
}: {
  whatsapp: string;
  productName: string;
  priceLabel: string;
  productUrl: string;
}) {
  const message = `Olá! Tenho interesse neste produto:\n${productName}\n${priceLabel}\n${productUrl}`;
  const href = buildWhatsappLink(whatsapp, message);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-[#25D366] px-5 py-3 text-sm font-medium text-[#128C7E] hover:bg-[#25D366]/5"
    >
      <WhatsappIcon className="h-4 w-4" />
      Comprar pelo WhatsApp
    </a>
  );
}
