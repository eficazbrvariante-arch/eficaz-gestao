import { listActiveEmployeesAction } from "../ponto/actions";
import { SelfServiceLedgerForm } from "./self-service-ledger-form";

export default async function LancamentosPage() {
  const employees = await listActiveEmployeesAction();

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Lançamentos</h1>
      <p className="mb-6 text-sm text-text-muted">
        Pegou algum produto ou adiantamento da loja? Lance aqui — selecione o seu nome, informe o
        valor e tire uma selfie. O valor é descontado no seu próximo pagamento.
      </p>

      <SelfServiceLedgerForm employees={employees} />
    </div>
  );
}
