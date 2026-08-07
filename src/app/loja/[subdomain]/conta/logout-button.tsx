"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { logoutCustomerAction } from "@/modules/customers/customer-actions";

export function LogoutButton({ subdomain }: { subdomain: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await logoutCustomerAction(subdomain);
          router.push(`/loja/${subdomain}`);
          router.refresh();
        })
      }
      className="text-sm text-slate-500 hover:underline"
    >
      Sair
    </button>
  );
}
