"use client";

import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";

/** Preferência de menu recolhido no desktop — por navegador/terminal, não por usuário. */
const COLLAPSED_STORAGE_KEY = "eficaz:sidebar-collapsed";

/**
 * A preferência mora no localStorage, que é um sistema externo ao React — por
 * isso é lida por `useSyncExternalStore`, e não por `useState` + `useEffect`.
 * O efeito daria o mesmo resultado na tela, mas com um render extra a cada
 * carga da página (e é justamente o padrão que o lint de hooks barra).
 *
 * `cache` existe porque `getSnapshot` precisa devolver sempre o MESMO valor
 * enquanto nada mudar: ler o localStorage a cada chamada devolveria uma
 * leitura nova a cada render e o React entraria em laço.
 */
let cache: boolean | null = null;
const listeners = new Set<() => void>();

function getCollapsedSnapshot() {
  if (cache === null) {
    try {
      cache = window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      // Navegador com armazenamento bloqueado — segue expandido, sem quebrar.
      cache = false;
    }
  }
  return cache;
}

/** No servidor não existe preferência: renderiza expandido e o cliente corrige. */
function getCollapsedServerSnapshot() {
  return false;
}

function subscribeCollapsed(onChange: () => void) {
  listeners.add(onChange);
  // Duas abas do painel abertas no mesmo navegador: o `storage` dispara na
  // OUTRA aba quando esta grava. Sem isso, recolher numa deixaria a outra com
  // o valor antigo até alguém recarregar.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== COLLAPSED_STORAGE_KEY) return;
    cache = event.newValue === "1";
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function writeCollapsed(next: boolean) {
  cache = next;
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Sem persistir, mas a sessão atual continua funcionando.
  }
  listeners.forEach((listener) => listener());
}

type MobileSidebarContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /**
   * Menu recolhido no desktop (o operador escolheu devolver a largura pro
   * conteúdo — nasceu pro PDV, mas vale em qualquer tela). Quando recolhido,
   * a navegação continua inteira: vira a mesma gaveta já usada no celular,
   * aberta pelo botão de menu da barra de cima. Nenhuma página some, nenhuma
   * permissão muda.
   */
  isCollapsed: boolean;
  toggleCollapsed: () => void;
};

const MobileSidebarContext = createContext<MobileSidebarContextValue | null>(null);

export function MobileSidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const isCollapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot
  );

  const toggleCollapsed = useCallback(() => {
    writeCollapsed(!getCollapsedSnapshot());
  }, []);

  return (
    <MobileSidebarContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        isCollapsed,
        toggleCollapsed,
      }}
    >
      {children}
    </MobileSidebarContext.Provider>
  );
}

export function useMobileSidebar() {
  const context = useContext(MobileSidebarContext);
  if (!context) {
    throw new Error("useMobileSidebar deve ser usado dentro de MobileSidebarProvider");
  }
  return context;
}
