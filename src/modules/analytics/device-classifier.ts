import type { DeviceType } from "@/generated/prisma/enums";

const TABLET_PATTERN = /iPad|Android(?!.*Mobile)/i;
const MOBILE_PATTERN = /Mobi|Android|iPhone|iPod/i;

/**
 * Classifica o dispositivo a partir do User-Agent. Limitação conhecida e aceita:
 * o Safari do iPadOS 13+ manda um User-Agent de desktop (macOS) — iPads recentes
 * caem em DESKTOP. É uma lacuna conhecida da indústria com sniffing de UA, não
 * vale a complexidade de feature-detection no cliente pra corrigir.
 */
export function classifyDevice(userAgent: string | null | undefined): DeviceType {
  if (!userAgent) return "DESKTOP";
  if (TABLET_PATTERN.test(userAgent)) return "TABLET";
  if (MOBILE_PATTERN.test(userAgent)) return "MOBILE";
  return "DESKTOP";
}
