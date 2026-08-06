import { z } from "zod";

const EVENT_TYPES = [
  "PAGE_VIEW",
  "PRODUCT_VIEW",
  "ADD_TO_CART",
  "CHECKOUT_START",
  "PURCHASE",
  "FLASH_VIEW",
  "FLASH_CLICK",
  "HEARTBEAT",
] as const;

export const trackEventSchema = z.object({
  subdomain: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  visitorId: z.string().trim().min(1),
  type: z.enum(EVENT_TYPES),
  path: z.string().trim().max(300).optional(),
  productId: z.string().trim().min(1).optional(),
  orderId: z.string().trim().min(1).optional(),
  referrer: z.string().trim().max(500).optional(),
});
export type TrackEventInput = z.infer<typeof trackEventSchema>;
