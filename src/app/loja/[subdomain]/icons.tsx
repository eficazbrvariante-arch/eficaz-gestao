import type { SVGProps } from "react";
import type { CategoryIconKey } from "@/lib/category-icons";
import type { FlashDealIconKey } from "@/lib/flash-deal-icons";

const baseProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type IconProps = SVGProps<SVGSVGElement>;

export function ShieldLockIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

export function StorefrontIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 9l1-5h16l1 5" />
      <path d="M4 9v10h16V9" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

export function AwardIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </svg>
  );
}

export function StarIcon(props: IconProps & { filled?: boolean }) {
  const { filled, ...rest } = props;
  return (
    <svg {...baseProps} fill={filled ? "currentColor" : "none"} {...rest}>
      <polygon points="12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.27 5.82 21.52 7 14.64 2 9.77 8.91 8.76 12 2.5" />
    </svg>
  );
}

export function CartIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M1 1h4l2.4 12.6a2 2 0 0 0 2 1.6h9.2a2 2 0 0 0 2-1.6L23 6H6" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

/** Logo do WhatsApp — preenchido (`fill`), diferente do resto dos ícones (traço), pra ficar reconhecível. */
export function WhatsappIcon(props: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.41-1.42a9.87 9.87 0 0 0 4.63 1.18h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2Zm5.79 14.13c-.25.7-1.25 1.32-1.71 1.4-.44.08-.99.11-1.6-.1-.37-.12-.85-.28-1.46-.55-2.58-1.12-4.26-3.73-4.39-3.9-.13-.17-1.05-1.4-1.05-2.67 0-1.27.66-1.9.9-2.16.23-.26.5-.32.67-.32.17 0 .33 0 .48.01.16.01.36-.06.56.43.21.5.71 1.73.77 1.86.06.13.1.28.02.45-.08.17-.13.28-.25.43-.13.15-.27.34-.38.46-.13.13-.26.27-.11.53.15.26.68 1.12 1.46 1.82 1 .89 1.85 1.17 2.11 1.3.26.13.41.11.56-.07.15-.17.65-.76.83-1.02.17-.26.34-.21.57-.13.23.09 1.47.69 1.72.82.25.13.42.19.48.3.06.11.06.63-.19 1.33Z" />
    </svg>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c1.5 2 2 4 2 6a8 8 0 1 1-16 0c0-4 3-6 4-9 .5 1.5 1.5 2 2 2 .5-2-.5-4 2-6z" />
    </svg>
  );
}

// --- Ícones de categoria (grade de categorias da home) ---

function HeadphonesIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <rect x="1" y="14" width="6" height="7" rx="2" />
      <rect x="17" y="14" width="6" height="7" rx="2" />
    </svg>
  );
}

function ChargerIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="7" y="2" width="10" height="16" rx="2" />
      <path d="M10 22v-4M14 22v-4M9 6h6M9 10h6" />
    </svg>
  );
}

function CableIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M6 3v4a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v6" />
      <circle cx="6" cy="3" r="2" />
      <circle cx="18" cy="21" r="2" />
    </svg>
  );
}

function PowerBankIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="4" y="4" width="14" height="16" rx="2" />
      <path d="M10 0v4M14 0v4" />
      <polyline points="13 9 9 14 12 14 11 19 15 13 12 13 13 9" />
    </svg>
  );
}

function SpeakerIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="5" y="1" width="14" height="22" rx="3" />
      <circle cx="12" cy="8" r="3" />
      <circle cx="12" cy="16" r="1.5" />
    </svg>
  );
}

function SmartwatchIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M9 17v3a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

function StandIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="6" y="2" width="12" height="16" rx="2" />
      <path d="M9 22h6M12 18v4" />
    </svg>
  );
}

function AdapterIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="5" y="8" width="14" height="10" rx="2" />
      <path d="M9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M10 18v3M14 18v3" />
    </svg>
  );
}

function CameraIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

function GenericTagIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M20.59 13.41 12 22 2 12V2h10z" />
      <circle cx="6.5" cy="6.5" r="1.5" />
    </svg>
  );
}

const CATEGORY_ICON_MAP: Record<CategoryIconKey, (props: IconProps) => React.JSX.Element> = {
  headphones: HeadphonesIcon,
  charger: ChargerIcon,
  cable: CableIcon,
  powerbank: PowerBankIcon,
  speaker: SpeakerIcon,
  smartwatch: SmartwatchIcon,
  stand: StandIcon,
  adapter: AdapterIcon,
  camera: CameraIcon,
  generic: GenericTagIcon,
};

/** Ícone da categoria (chave em `Category.icon`); sem chave reconhecida, usa o genérico. */
export function CategoryIcon({ icon, ...props }: IconProps & { icon: string | null }) {
  const Component =
    icon && icon in CATEGORY_ICON_MAP ? CATEGORY_ICON_MAP[icon as CategoryIconKey] : GenericTagIcon;
  return <Component {...props} />;
}

// --- Ícones da Oferta Relâmpago ---

export function LightningIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <polygon points="13 2 3 14 11 14 10 22 21 9 13 9 13 2" />
    </svg>
  );
}

export function GiftIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="8" width="18" height="13" rx="1" />
      <path d="M3 12h18M12 8v13M8 8a2.5 2.5 0 0 1 0-5C10 3 12 5 12 8c0-3 2-5 4-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

export function BagIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M6 8h12l-1 13H7z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

const FLASH_DEAL_ICON_MAP: Record<FlashDealIconKey, (props: IconProps) => React.JSX.Element> = {
  lightning: LightningIcon,
  fire: FlameIcon,
  gift: GiftIcon,
  clock: ClockIcon,
  bag: BagIcon,
  target: TargetIcon,
};

/** Ícone da Oferta Relâmpago (chave configurada pelo lojista); sem chave reconhecida, usa o raio. */
export function FlashDealIcon({ icon, ...props }: IconProps & { icon: string }) {
  const Component =
    icon in FLASH_DEAL_ICON_MAP ? FLASH_DEAL_ICON_MAP[icon as FlashDealIconKey] : LightningIcon;
  return <Component {...props} />;
}
