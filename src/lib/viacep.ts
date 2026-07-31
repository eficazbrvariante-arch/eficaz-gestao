import { onlyDigits } from "@/lib/validations/order";

export type AddressLookup = {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
};

type ViaCepResponse = {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
};

/**
 * Busca o endereço de um CEP no ViaCEP (serviço público e gratuito, sem chave).
 *
 * Retorna `null` quando o CEP é inválido, não existe, ou o serviço está fora do ar —
 * o checkout continua funcionando com o preenchimento manual nesses casos.
 */
export async function lookupAddressByZip(zip: string): Promise<AddressLookup | null> {
  const digits = onlyDigits(zip);
  if (digits.length !== 8) return null;

  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;

    const data: ViaCepResponse = await response.json();
    // O ViaCEP responde 200 com `{ erro: true }` para CEP inexistente.
    if (data.erro) return null;

    return {
      street: data.logradouro ?? "",
      neighborhood: data.bairro ?? "",
      city: data.localidade ?? "",
      state: data.uf ?? "",
    };
  } catch {
    return null;
  }
}
