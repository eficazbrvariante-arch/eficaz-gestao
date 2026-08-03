type TrustItem = {
  label: string;
  icon: React.ReactNode;
};

const iconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-4 w-4 shrink-0 sm:h-5 sm:w-5",
};

function ShieldLockIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg {...iconProps}>
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function StorefrontIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 9l1-5h16l1 5" />
      <path d="M4 9v10h16V9" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg {...iconProps}>
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function AwardIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </svg>
  );
}

export function TrustBar({ city }: { city?: string | null }) {
  const items: TrustItem[] = [
    { icon: <ShieldLockIcon />, label: "Compra Segura" },
    { icon: <TruckIcon />, label: city ? `Entrega Rápida em ${city}` : "Entrega Rápida" },
    { icon: <StorefrontIcon />, label: "Retire na Loja" },
    { icon: <CardIcon />, label: "Pix e Cartões" },
    { icon: <AwardIcon />, label: "Garantia de Qualidade" },
    { icon: <FlagIcon />, label: "Empresa Brasileira" },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-3 sm:gap-x-3 sm:gap-y-3 sm:py-4 lg:grid-cols-6 lg:gap-x-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-center gap-1 text-center sm:flex-row sm:gap-2 sm:text-left"
          style={{ color: "var(--store-primary)" }}
        >
          {item.icon}
          <span className="text-[11px] font-medium text-slate-700 sm:text-xs">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
