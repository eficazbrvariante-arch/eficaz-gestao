"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { SelfieCaptureField } from "@/components/ui/selfie-capture-field";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { submitConvenioSignupAction } from "./actions";

/**
 * Formulário de autoatendimento — o próprio colaborador preenche, no
 * celular dele. Selfie é sempre câmera ao vivo (nunca galeria, ver
 * `SelfieCaptureField`); comprovante aceita foto/arquivo já existente,
 * quando o convênio exige (`requireProof`).
 */
export function ConvenioSignupForm({ token, requireProof }: { token: string; requireProof: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [credentialUrl, setCredentialUrl] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [selfieUrl, setSelfieUrl] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit() {
    setError(undefined);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Informe seu nome completo";
    if (!cpf.trim()) errors.document = "Informe seu CPF";
    if (!phone.trim()) errors.phone = "Informe um telefone de contato";
    if (!selfieUrl) errors.selfieUrl = "Tire sua foto para continuar";
    if (requireProof && !proofUrl) errors.proofUrl = "Envie o comprovante para continuar";
    if (!consent) errors.consent = "É preciso aceitar os termos para continuar";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    startTransition(async () => {
      const result = await submitConvenioSignupAction(token, {
        name,
        document: cpf,
        phone,
        email,
        selfieUrl,
        proofUrl,
        consent,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.credentialUrl) setCredentialUrl(result.credentialUrl);
      if (result?.shortCode) setShortCode(result.shortCode);
    });
  }

  async function handleCopy() {
    if (!credentialUrl) return;
    try {
      await navigator.clipboard.writeText(credentialUrl);
      setCopied(true);
    } catch {
      // Sem Clipboard API — o link já fica visível pra selecionar e copiar na mão.
    }
  }

  if (credentialUrl) {
    return (
      <div className="text-center">
        <h2 className="mb-2 text-base font-semibold text-slate-900">Cadastro enviado!</h2>
        <p className="mb-4 text-sm text-slate-500">
          Seu cadastro está pendente de aprovação. Assim que for aprovado, é só informar o código
          abaixo no caixa da loja pra usar o benefício — não precisa de link nem de internet.
        </p>
        {shortCode && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-medium tracking-wide text-emerald-700 uppercase">
              Seu código
            </p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-widest text-emerald-900">
              {shortCode}
            </p>
          </div>
        )}
        <p className="mb-2 text-xs text-slate-500">
          Se preferir, guarde também o link — ele mostra o status do cadastro e o QR Code. Não
          aparece de novo depois que você sair desta página.
        </p>
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-left">
          <code className="flex-1 break-all rounded bg-white px-2 py-1.5 text-xs text-slate-700">
            {credentialUrl}
          </code>
          <Button type="button" variant="secondary" fullWidth={false} onClick={handleCopy}>
            {copied ? "Copiado!" : "Copiar"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <FormBanner message={error} variant="error" />

      <div className="mb-4">
        <Label htmlFor="name">Nome completo</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={isPending} />
        <FieldError message={fieldErrors.name} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="document">CPF</Label>
          <Input
            id="document"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            disabled={isPending}
            placeholder="Só números"
          />
          <FieldError message={fieldErrors.document} />
        </div>
        <div>
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isPending} />
          <FieldError message={fieldErrors.phone} />
        </div>
      </div>

      <div className="mb-6">
        <Label htmlFor="email">E-mail (opcional)</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div className="mb-6">
        <Label>Sua foto</Label>
        <p className="mb-2 text-xs text-slate-500">
          Tire uma selfie agora — pode aparecer com o uniforme da empresa, se preferir, mas não é
          obrigatório.
        </p>
        <SelfieCaptureField
          onCaptured={setSelfieUrl}
          uploadUrl="/api/convenios/upload"
          clientPayload={token}
          disabled={isPending}
        />
        <FieldError message={fieldErrors.selfieUrl} />
      </div>

      {requireProof && (
        <div className="mb-6">
          <Label>Comprovante</Label>
          <p className="mb-2 text-xs text-slate-500">Foto do crachá ou comprovante de vínculo com a empresa.</p>
          <ImageUploadField
            value={proofUrl}
            onChange={setProofUrl}
            uploadUrl="/api/convenios/upload"
            clientPayload={token}
            disabled={isPending}
          />
          <FieldError message={fieldErrors.proofUrl} />
        </div>
      )}

      <div className="mb-6 rounded-md border border-slate-200 bg-slate-50 p-3">
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <Checkbox
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={isPending}
            className="mt-0.5"
          />
          <span>
            Autorizo o uso dos meus dados (nome, CPF, telefone, e-mail, foto e comprovante) só para
            validar meu cadastro neste convênio e liberar o benefício nas compras. Minha foto é
            revisada por uma pessoa da loja — não é usada em reconhecimento facial automatizado. A
            empresa parceira não tem acesso à minha foto nem ao meu CPF, só ao status do meu
            cadastro.
          </span>
        </label>
        <FieldError message={fieldErrors.consent} />
      </div>

      <Button type="button" disabled={isPending} onClick={handleSubmit} className="w-full">
        {isPending ? "Enviando..." : "Enviar cadastro"}
      </Button>
    </div>
  );
}
