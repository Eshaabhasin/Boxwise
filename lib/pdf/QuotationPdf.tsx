import path from "node:path";
import type { Style } from "@react-pdf/types";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { display } from "@/lib/commands/plan";
import { COMPANY } from "@/lib/company";
import { FIELD_DEFS, type FieldKey, type Specs } from "@/lib/fields";

/**
 * The quotation PDF, drawn from the frozen snapshot only, so the same
 * quotation always produces the same PDF. Money comes in as paise.
 */

const FONT_DIR = path.join(process.cwd(), "lib", "pdf", "fonts");
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(FONT_DIR, "inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "inter-latin-600-normal.woff"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "inter-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  // Inter's "latin-ext" file holds the ₹ sign (the plain latin file does not).
  Font.register({
    family: "InterExt",
    fonts: [
      { src: path.join(FONT_DIR, "inter-latin-ext-400-normal.woff"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "inter-latin-ext-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({ family: "InterTight", src: path.join(FONT_DIR, "inter-tight-latin-800-normal.woff"), fontWeight: 800 });
  Font.register({ family: "Mono", src: path.join(FONT_DIR, "jetbrains-mono-latin-400-normal.woff") });
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

export interface QuotationPdfData {
  number?: string;
  status: "Draft" | "Approved" | "Sent";
  date: Date;
  customerSnapshot: { company: string; contactPerson?: string; phone?: string; gstin?: string; address?: string };
  specsSnapshot: Specs;
  quantity: number;
  ratePaise: number;
  subtotalPaise: number;
  gstPercent: number;
  gstMode: "intra" | "inter";
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  terms: { deliveryTime: string; paymentTerms: string; validity: string };
  itemTitle: string;
  itemDetail: string;
}

const INK = "#2a1a10";
const MUTED = "#6b5440";
const BRICK = "#9c2f1c";
const RULE = "#d9c7a5";

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.5, color: INK, paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, lineHeight: 1.35 },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  company: { fontFamily: "InterTight", fontWeight: 800, fontSize: 17, textTransform: "uppercase", lineHeight: 1.15 },
  mono: { fontFamily: "Mono", fontSize: 7.5, color: MUTED },
  title: { fontFamily: "InterTight", fontWeight: 800, fontSize: 22, color: BRICK, textAlign: "right", lineHeight: 1.15, marginBottom: 4 },
  label: { fontFamily: "Mono", fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 },
  hr: { borderBottomWidth: 1.5, borderBottomColor: INK, marginVertical: 14 },
  th: { fontFamily: "Mono", fontSize: 7, color: MUTED, textTransform: "uppercase", paddingVertical: 5 },
  cell: { paddingVertical: 8 },
  right: { textAlign: "right" },
  bold: { fontWeight: 700 },
  watermark: { position: "absolute", top: 330, left: 90, fontFamily: "InterTight", fontWeight: 800, fontSize: 110, color: "#f1e6d2", transform: "rotate(-24deg)" },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontFamily: "Mono", fontSize: 7, color: MUTED, textAlign: "center" },
});

/** "₹10,620.00" with the ₹ drawn from the font that has it. */
type TextStyle = Style | Style[];

function Money({ paise, style }: { paise: number; style?: TextStyle }) {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const body = `${Math.floor(abs / 100).toLocaleString("en-IN")}.${String(abs % 100).padStart(2, "0")}`;
  return (
    <Text style={style}>
      {sign}
      <Text style={{ fontFamily: "InterExt" }}>₹</Text>
      {body}
    </Text>
  );
}

function TotalRow({ label, paise, big }: { label: string; paise: number; big?: boolean }) {
  const amount: Style = big ? { fontWeight: 700, fontSize: 14 } : {};
  return (
    <View style={[s.between, { paddingVertical: big ? 6 : 3 }, big ? { borderTopWidth: 1.5, borderTopColor: INK, marginTop: 4 } : {}]}>
      <Text style={big ? { fontFamily: "InterTight", fontWeight: 800, fontSize: 12, textTransform: "uppercase" } : {}}>{label}</Text>
      <Money paise={paise} style={amount} />
    </View>
  );
}

function SpecGrid({ specs }: { specs: Specs }) {
  const rows = FIELD_DEFS.filter((f) => f.onPdf && f.group !== "commercial" && f.kind !== "length").flatMap((f) => {
    const v = specs[f.key as FieldKey];
    return v === undefined || v === null || v === "" ? [] : [{ label: f.label, value: display(f.key as FieldKey, v, specs) }];
  });
  if (rows.length === 0) return null;
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={s.label}>Specification</Text>
      <View style={[s.row, { flexWrap: "wrap", marginTop: 6, borderTopWidth: 0.75, borderTopColor: RULE }]}>
        {rows.map((r) => (
          <View key={r.label} style={{ width: "33.33%", paddingVertical: 5, paddingRight: 8, borderBottomWidth: 0.75, borderBottomColor: RULE }}>
            <Text style={[s.label, { fontSize: 6.5 }]}>{r.label}</Text>
            <Text style={s.bold}>{r.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function QuotationDocument({ q }: { q: QuotationPdfData }) {
  const c = q.customerSnapshot;
  const date = q.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const number = q.status === "Draft" ? `DRAFT${q.number ? ` (${q.number})` : ""}` : (q.number ?? "");
  const half = q.gstPercent / 2;
  const companyLine = [COMPANY.addressLines.join(", "), COMPANY.phone, COMPANY.email, COMPANY.gstin ? `GSTIN ${COMPANY.gstin}` : ""]
    .filter(Boolean)
    .join("  ·  ");
  const bank = COMPANY.bank;

  return (
    <Document title={`Quotation ${q.number ?? "draft"} - ${c.company}`} author={COMPANY.name} creator="BoxBol">
      <Page size="A4" style={s.page}>
        {q.status === "Draft" && <Text style={s.watermark} fixed>DRAFT</Text>}

        <View style={s.between}>
          <View style={{ width: "62%" }}>
            <Text style={s.company}>{COMPANY.name}</Text>
            <Text style={[s.mono, { marginTop: 4 }]}>{companyLine}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.title}>QUOTATION</Text>
            <Text style={[s.mono, s.right, { marginTop: 3 }]}>No. {number}</Text>
            <Text style={[s.mono, s.right]}>{date}</Text>
          </View>
        </View>

        <View style={s.hr} />

        <Text style={s.label}>Quotation for</Text>
        <Text style={{ fontFamily: "InterTight", fontWeight: 800, fontSize: 13, textTransform: "uppercase", marginTop: 2, marginBottom: 3, lineHeight: 1.15 }}>{c.company}</Text>
        {c.contactPerson && <Text>Attn: {c.contactPerson}</Text>}
        {c.address && <Text>{c.address}</Text>}
        {(c.phone || c.gstin) && (
          <Text style={s.mono}>{[c.phone ? `Phone ${c.phone}` : "", c.gstin ? `GSTIN ${c.gstin}` : ""].filter(Boolean).join("  ·  ")}</Text>
        )}

        <View style={{ marginTop: 18 }}>
          <View style={[s.row, { borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: MUTED }]}>
            <Text style={[s.th, { flex: 3.2 }]}>Item</Text>
            <Text style={[s.th, s.right, { flex: 0.9 }]}>Qty</Text>
            <Text style={[s.th, s.right, { flex: 1.1 }]}>Rate</Text>
            <Text style={[s.th, s.right, { flex: 1.4 }]}>Amount</Text>
          </View>
          <View style={[s.row, { borderBottomWidth: 0.75, borderBottomColor: RULE }]}>
            <View style={[s.cell, { flex: 3.2, paddingRight: 8 }]}>
              <Text style={s.bold}>{q.itemTitle}</Text>
              {q.itemDetail && <Text style={[s.mono, { marginTop: 2 }]}>{q.itemDetail}</Text>}
            </View>
            <Text style={[s.cell, s.right, { flex: 0.9 }]}>{q.quantity.toLocaleString("en-IN")}</Text>
            <Money paise={q.ratePaise} style={[s.cell, s.right, { flex: 1.1 }]} />
            <Money paise={q.subtotalPaise} style={[s.cell, s.right, { flex: 1.4 }]} />
          </View>
        </View>

        <View style={{ marginLeft: "auto", width: 230, marginTop: 10 }}>
          <TotalRow label="Subtotal" paise={q.subtotalPaise} />
          {q.gstMode === "intra" ? (
            <>
              <TotalRow label={`CGST ${half}%`} paise={q.cgstPaise} />
              <TotalRow label={`SGST ${half}%`} paise={q.sgstPaise} />
            </>
          ) : (
            <TotalRow label={`IGST ${q.gstPercent}%`} paise={q.igstPaise} />
          )}
          {q.roundOffPaise !== 0 && <TotalRow label="Round off" paise={q.roundOffPaise} />}
          <TotalRow label="Total" paise={q.totalPaise} big />
        </View>

        <SpecGrid specs={q.specsSnapshot} />

        <View style={{ marginTop: 18 }}>
          <Text style={s.label}>Terms</Text>
          <Text style={{ marginTop: 4 }}>Delivery: {q.terms.deliveryTime}</Text>
          <Text>Payment: {q.terms.paymentTerms}</Text>
          <Text>Valid for: {q.terms.validity}</Text>
        </View>

        {bank.accountNumber && (
          <View style={{ marginTop: 14 }}>
            <Text style={s.label}>Bank details</Text>
            <Text style={[s.mono, { marginTop: 3 }]}>
              {[bank.accountName, bank.name, `A/c ${bank.accountNumber}`, bank.ifsc ? `IFSC ${bank.ifsc}` : ""].filter(Boolean).join("  ·  ")}
            </Text>
          </View>
        )}

        <View style={{ marginTop: 36, width: 180 }}>
          <Text>For {COMPANY.name}</Text>
          <View style={{ borderBottomWidth: 0.75, borderBottomColor: INK, marginTop: 30 }} />
          <Text style={[s.mono, { marginTop: 3 }]}>Authorised signatory</Text>
        </View>

        <Text style={s.footer} fixed>
          {q.number ? `Quotation ${q.number}` : "Draft quotation"} · {c.company}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderQuotationPdf(q: QuotationPdfData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<QuotationDocument q={q} />);
}

export { pdfFileName } from "@/lib/quote/share";
