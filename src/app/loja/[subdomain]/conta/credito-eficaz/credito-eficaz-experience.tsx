"use client";

import { useRef, useState } from "react";
import { PactoDeConfianca, type PactoVariant } from "./pacto-de-confianca";
import { CreditoEficazSection, type ApplicationRow } from "../credito-eficaz-section";
import type { CustomerCreditSummary } from "@/modules/credito-eficaz/credito-eficaz-service";

/**
 * Une o Pacto de Confiança ao formulário real num clique só: o CTA do Pacto
 * abre `CreditoEficazSection` direto (via `forceShowForm`) e rola a tela até
 * ele — sem etapa intermediária, sem duplicar o formulário.
 */
export function CreditoEficazExperience({
  subdomain,
  variant,
  summary,
  latestApplication,
}: {
  subdomain: string;
  variant: PactoVariant;
  summary: CustomerCreditSummary | null;
  latestApplication: ApplicationRow | null;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  function handleRequest() {
    setFormOpen(true);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <>
      <PactoDeConfianca variant={variant} onRequest={handleRequest} />
      <div ref={formRef}>
        <CreditoEficazSection
          subdomain={subdomain}
          summary={summary}
          latestApplication={latestApplication}
          forceShowForm={formOpen}
        />
      </div>
    </>
  );
}
