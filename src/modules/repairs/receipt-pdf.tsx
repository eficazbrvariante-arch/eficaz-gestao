import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatBRL } from "@/lib/format";

export type RepairOrderReceiptData = {
  number: number;
  statusLabel: string;
  createdAt: string;
  estimatedAt: string | null;
  customerName: string;
  brand: string;
  model: string;
  color: string | null;
  reportedDefects: string | null;
  condition: string | null;
  items: { description: string; unitPrice: number; quantity: number }[];
  subtotal: number;
  discount: number;
  total: number;
  /** Recebimentos já registrados (entrada + saldo na entrega) — vazio se nada foi pago ainda. */
  payments: { method: string; amount: number; date: string }[];
  paid: number;
  balance: number;
  situation: "QUITADO" | "PENDENTE" | "SEM_COBRANCA";
  photoUrls: string[];
  /** Data URI (PNG) apontando pro comprovante público — nulo se não deu pra gerar. */
  qrCodeDataUrl: string | null;
  tenant: {
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    phone: string | null;
    address: string | null;
  };
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT: "Cartão de Débito",
  CREDIT: "Cartão de Crédito",
  STORE_CREDIT: "Crédito de loja",
  FIADO: "Fiado",
};

const styles = StyleSheet.create({
  page: {
    padding: 32,
    paddingBottom: 70,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1e293b",
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 3,
    paddingBottom: 12,
    marginBottom: 18,
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  logo: { width: 42, height: 42, objectFit: "contain" },
  logoFallback: {
    width: 42,
    height: 42,
    borderRadius: 6,
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 13,
  },
  tenantName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  docLabel: { fontSize: 9, color: "#64748b", marginTop: 2 },
  osNumber: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  statusBadge: {
    marginTop: 4,
    color: "#ffffff",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  section: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#64748b",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  row: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  label: { fontSize: 8, color: "#94a3b8" },
  value: { fontSize: 10, color: "#0f172a", marginBottom: 6 },
  paragraph: { fontSize: 10, color: "#334155", lineHeight: 1.4 },
  table: { marginTop: 2 },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 4,
  },
  colDescription: { flex: 1 },
  colQty: { width: 40, textAlign: "right" },
  colUnit: { width: 70, textAlign: "right" },
  colTotal: { width: 70, textAlign: "right" },
  tableHeaderText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#64748b" },
  totalsBlock: { marginTop: 8, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", width: 200, marginBottom: 2 },
  totalsLabel: { fontSize: 9, color: "#64748b" },
  totalsValue: { fontSize: 9, color: "#0f172a" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 200,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
  },
  grandTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  grandTotalValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  gallery: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  galleryImage: {
    width: 150,
    height: 110,
    objectFit: "cover",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: "#94a3b8" },
  qrImage: { width: 56, height: 56, marginTop: 6 },
  situationBadge: {
    marginTop: 8,
    alignSelf: "flex-end",
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
});

const SITUATION_LABELS: Record<RepairOrderReceiptData["situation"], string> = {
  QUITADO: "QUITADO",
  PENDENTE: "SALDO PENDENTE",
  SEM_COBRANCA: "SEM COBRANÇA",
};
const SITUATION_COLORS: Record<RepairOrderReceiptData["situation"], string> = {
  QUITADO: "#047857",
  PENDENTE: "#b45309",
  SEM_COBRANCA: "#64748b",
};

export function RepairOrderReceiptDocument({ order }: { order: RepairOrderReceiptData }) {
  const primary = order.tenant.primaryColor || "#0f172a";
  const secondary = order.tenant.secondaryColor || "#047857";
  const osLabel = `OS #${String(order.number).padStart(6, "0")}`;
  const deviceLine = [order.brand, order.model].filter(Boolean).join(" ");

  return (
    <Document title={`Comprovante ${osLabel}`}>
      <Page size="A4" style={styles.page}>
        <View style={[styles.headerBar, { borderBottomColor: primary }]}>
          <View style={styles.headerLeft}>
            {order.tenant.logoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's <Image>, não a tag HTML: não tem prop `alt`.
              <Image src={order.tenant.logoUrl} style={styles.logo} />
            ) : (
              <Text style={[styles.logoFallback, { backgroundColor: primary }]}>
                {order.tenant.name.slice(0, 2).toUpperCase()}
              </Text>
            )}
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.tenantName}>{order.tenant.name}</Text>
              <Text style={styles.docLabel}>Comprovante de Ordem de Serviço</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.osNumber, { color: primary }]}>{osLabel}</Text>
            <Text style={[styles.statusBadge, { backgroundColor: secondary }]}>
              {order.statusLabel}
            </Text>
            {order.qrCodeDataUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's <Image>, não a tag HTML: não tem prop `alt`.
              <Image src={order.qrCodeDataUrl} style={styles.qrImage} />
            )}
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.section, styles.col]}>
            <Text style={styles.sectionTitle}>Cliente</Text>
            <Text style={styles.value}>{order.customerName}</Text>
            <Text style={styles.label}>Data de abertura</Text>
            <Text style={styles.value}>{order.createdAt}</Text>
          </View>
          <View style={[styles.section, styles.col]}>
            <Text style={styles.sectionTitle}>Aparelho</Text>
            <Text style={styles.value}>{deviceLine}</Text>
            <Text style={styles.label}>Cor</Text>
            <Text style={styles.value}>{order.color || "—"}</Text>
          </View>
        </View>

        {order.reportedDefects && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Defeito informado</Text>
            <Text style={styles.paragraph}>{order.reportedDefects}</Text>
          </View>
        )}

        {order.condition && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Estado do aparelho</Text>
            <Text style={styles.paragraph}>{order.condition}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Serviços</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.colDescription, styles.tableHeaderText]}>Descrição</Text>
              <Text style={[styles.colQty, styles.tableHeaderText]}>Qtd.</Text>
              <Text style={[styles.colUnit, styles.tableHeaderText]}>Vlr. unit.</Text>
              <Text style={[styles.colTotal, styles.tableHeaderText]}>Total</Text>
            </View>
            {order.items.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={styles.colDescription}>{item.description}</Text>
                <Text style={styles.colQty}>{item.quantity}</Text>
                <Text style={styles.colUnit}>{formatBRL(item.unitPrice)}</Text>
                <Text style={styles.colTotal}>{formatBRL(item.unitPrice * item.quantity)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{formatBRL(order.subtotal)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Desconto</Text>
              <Text style={styles.totalsValue}>{formatBRL(order.discount)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={[styles.grandTotalValue, { color: secondary }]}>
                {formatBRL(order.total)}
              </Text>
            </View>
          </View>
        </View>

        {order.payments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pagamentos</Text>
            {order.payments.map((payment, index) => (
              <View key={index} style={[styles.totalsRow, { width: "100%" }]}>
                <Text style={styles.totalsLabel}>
                  {payment.date} — {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                </Text>
                <Text style={styles.totalsValue}>{formatBRL(payment.amount)}</Text>
              </View>
            ))}
            <View style={[styles.totalsRow, { width: "100%", marginTop: 4 }]}>
              <Text style={styles.totalsLabel}>Total recebido</Text>
              <Text style={styles.totalsValue}>{formatBRL(order.paid)}</Text>
            </View>
            <View style={[styles.totalsRow, { width: "100%" }]}>
              <Text style={styles.totalsLabel}>Saldo</Text>
              <Text style={styles.totalsValue}>{formatBRL(order.balance)}</Text>
            </View>
            <Text style={[styles.situationBadge, { backgroundColor: SITUATION_COLORS[order.situation] }]}>
              {SITUATION_LABELS[order.situation]}
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Previsão de entrega</Text>
          <Text style={styles.value}>{order.estimatedAt || "A combinar"}</Text>
        </View>

        {order.photoUrls.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fotos do aparelho</Text>
            <View style={styles.gallery}>
              {order.photoUrls.map((url, index) => (
                // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's <Image>, não a tag HTML: não tem prop `alt`.
                <Image key={index} src={url} style={styles.galleryImage} />
              ))}
            </View>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{osLabel}</Text>
          <Text style={styles.footerText}>
            {[order.tenant.phone ? `Tel: ${order.tenant.phone}` : null, order.tenant.address]
              .filter(Boolean)
              .join("  ·  ") || order.tenant.name}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
