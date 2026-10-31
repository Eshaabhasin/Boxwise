import path from "node:path";
import type { Style } from "@react-pdf/types";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { letterheadLines, type CompanyProfile } from "@/lib/company";

/**
 * The quotation PDF: a plain business document with one line per box.
 * Drawn only from the stored quotation, so the same quotation always gives
 * the same PDF. Money comes in as paise.
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
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

export interface QuotationPdfLine {
  title: string;
  detail: string;
  quantity: number;
  ratePaise: number;
  amountPaise: number;
}

export interface QuotationPdfData {
  number?: string;
  status: "Draft" | "Approved" | "Sent";
  date: Date;
  customerSnapshot: { company: string; contactPerson?: string; phone?: string; gstin?: string; address?: string };
  lines: QuotationPdfLine[];
  subtotalPaise: number;
  gstPercent: number;
  gstMode: "intra" | "inter";
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  terms: { deliveryTime: string; paymentTerms: string; validity: string };
  notes?: string;
}

const INK = "#1c1917";
const MUTED = "#6b625a";
const RULE = "#e7e2dc";
const SHADE = "#f6f3ef";
const ACCENT = "#8a4b1c";

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9, color: INK, paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40, lineHeight: 1.4 },
  between: { flexDirection: "row", justifyContent: "space-between" },
  bar: { height: 4, backgroundColor: ACCENT, marginBottom: 22 },
  company: { fontSize: 16, fontWeight: 700, lineHeight: 1.2 },
  muted: { color: MUTED },
  small: { fontSize: 8, color: MUTED },
  title: { fontSize: 20, fontWeight: 700, color: ACCENT, textAlign: "right", lineHeight: 1.2, letterSpacing: 1 },
  label: { fontSize: 7, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  box: { borderWidth: 0.75, borderColor: RULE, borderRadius: 4, padding: 10 },
  th: { fontSize: 7, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, paddingVertical: 6, paddingHorizontal: 6 },
  td: { paddingVertical: 7, paddingHorizontal: 6 },
  right: { textAlign: "right" },
  bold: { fontWeight: 700 },
  watermark: { position: "absolute", top: 320, left: 110, fontSize: 96, fontWeight: 700, color: "#efe9e2", transform: "rotate(-24deg)" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 7, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

/** "₹10,620.00" with the ₹ drawn from the font that has it. */
function Money({ paise, style }: { paise: number; style?: Style | Style[] }) {
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
  const row: Style[] = [s.between, { paddingVertical: big ? 7 : 3, paddingHorizontal: 6 }];
  if (big) row.push({ backgroundColor: SHADE, marginTop: 4, borderTopWidth: 1, borderTopColor: INK });
  return (
    <View style={row}>
      <Text style={big ? s.bold : s.muted}>{label}</Text>
      <Money paise={paise} style={big ? { fontWeight: 700, fontSize: 11 } : {}} />
    </View>
  );
}

const COL = { n: 22, qty: 56, rate: 70, amount: 82 };

function QuotationDocument({ q, company: COMPANY }: { q: QuotationPdfData; company: CompanyProfile }) {
  const c = q.customerSnapshot;
  const date = q.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const number = q.number ?? "Draft";
  const half = q.gstPercent / 2;
  const companyLines = letterheadLines(COMPANY);

  return (
    <Document title={`Quotation ${number} - ${c.company}`} author={COMPANY.name} creator="Boxwise">
      <Page size="A4" style={s.page}>
        {q.status === "Draft" && (
          <Text style={s.watermark} fixed>
            DRAFT
          </Text>
        )}
        <View style={s.bar} fixed />

        <View style={s.between}>
          <View style={{ width: "58%" }}>
            <Text style={s.company}>{COMPANY.name}</Text>
            {companyLines.map((l) => (
              <Text key={l} style={[s.small, { marginTop: 2 }]}>
                {l}
              </Text>
            ))}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.title}>QUOTATION</Text>
            <View style={{ marginTop: 6, alignItems: "flex-end" }}>
              <Text>
                <Text style={s.muted}>No. </Text>
                <Text style={s.bold}>{number}</Text>
              </Text>
              <Text>
                <Text style={s.muted}>Date </Text>
                {date}
              </Text>
              {q.terms.validity !== "—" && (
                <Text>
                  <Text style={s.muted}>Valid for </Text>
                  {q.terms.validity}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={[s.box, { marginTop: 20, width: "60%" }]}>
          <Text style={s.label}>Quotation for</Text>
          <Text style={[s.bold, { fontSize: 11, marginTop: 3 }]}>{c.company}</Text>
          {c.contactPerson && <Text>Attn: {c.contactPerson}</Text>}
          {c.address && <Text style={s.muted}>{c.address}</Text>}
          {(c.phone || c.gstin) && <Text style={s.small}>{[c.phone ? `Phone ${c.phone}` : "", c.gstin ? `GSTIN ${c.gstin}` : ""].filter(Boolean).join("  ·  ")}</Text>}
        </View>

        <View style={{ marginTop: 18 }}>
          <View style={{ flexDirection: "row", backgroundColor: SHADE, borderTopWidth: 1, borderBottomWidth: 0.75, borderTopColor: INK, borderBottomColor: RULE }} fixed>
            <Text style={[s.th, { width: COL.n }]}>#</Text>
            <Text style={[s.th, { flex: 1 }]}>Description</Text>
            <Text style={[s.th, s.right, { width: COL.qty }]}>Qty</Text>
            <Text style={[s.th, s.right, { width: COL.rate }]}>Rate</Text>
            <Text style={[s.th, s.right, { width: COL.amount }]}>Amount</Text>
          </View>
          {q.lines.map((l, i) => (
            <View key={i} style={{ flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: RULE }} wrap={false}>
              <Text style={[s.td, s.muted, { width: COL.n }]}>{i + 1}</Text>
              <View style={[s.td, { flex: 1 }]}>
                <Text style={s.bold}>{l.title}</Text>
                {l.detail ? <Text style={[s.small, { marginTop: 2 }]}>{l.detail}</Text> : null}
              </View>
              <Text style={[s.td, s.right, { width: COL.qty }]}>{l.quantity.toLocaleString("en-IN")}</Text>
              <Money paise={l.ratePaise} style={[s.td, s.right, { width: COL.rate }]} />
              <Money paise={l.amountPaise} style={[s.td, s.right, { width: COL.amount }]} />
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", marginTop: 12 }} wrap={false}>
          <View style={{ flex: 1, paddingRight: 24 }}>
            <Text style={s.label}>Terms</Text>
            <Text style={{ marginTop: 4 }}>
              <Text style={s.muted}>Delivery: </Text>
              {q.terms.deliveryTime}
            </Text>
            <Text>
              <Text style={s.muted}>Payment: </Text>
              {q.terms.paymentTerms}
            </Text>
            <Text>
              <Text style={s.muted}>Valid for: </Text>
              {q.terms.validity}
            </Text>
            {q.notes ? (
              <>
                <Text style={[s.label, { marginTop: 10 }]}>Notes</Text>
                <Text style={{ marginTop: 3 }}>{q.notes}</Text>
              </>
            ) : null}
          </View>
          <View style={{ width: 220 }}>
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
        </View>

        <View style={{ marginTop: 34, alignItems: "flex-end" }} wrap={false}>
          <Text>For {COMPANY.name}</Text>
          <View style={{ borderBottomWidth: 0.75, borderBottomColor: INK, width: 170, marginTop: 30 }} />
          <Text style={[s.small, { marginTop: 3 }]}>Authorised signatory</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>
            {COMPANY.name} · Quotation {number}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** @param company  your letterhead (a sent quotation passes the one it was sent with) */
export async function renderQuotationPdf(q: QuotationPdfData, company: CompanyProfile): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<QuotationDocument q={q} company={company} />);
}

export { pdfFileName } from "@/lib/quote/share";
