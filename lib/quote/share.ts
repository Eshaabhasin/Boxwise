/**
 * Sharing on WhatsApp. Best: the phone's share sheet with the PDF file
 * attached (Web Share API). Fallback: a wa.me link, which can only carry
 * text, so the message gets a link to the PDF instead.
 */

/** Customer phone as wa.me wants it: country code + number, digits only. Indian 10-digit numbers get 91. */
export function waPhone(phone: string | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

/** The wa.me link. Without a phone, WhatsApp asks which chat to send it to. */
export function waLink(phone: string | undefined, text: string): string {
  const to = waPhone(phone);
  return `https://wa.me/${to ?? ""}?text=${encodeURIComponent(text)}`;
}

/** The message with the PDF link appended, for the text-only fallback. */
export function textWithPdfLink(message: string, pdfUrl: string): string {
  return `${message}\n\nQuotation PDF: ${pdfUrl}`;
}

/** The public PDF address for a quotation's share token. */
export function publicPdfUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/q/${token}`;
}

/** "Quotation-BB-2026-27-0001.pdf" */
export function pdfFileName(number: string | undefined): string {
  return `Quotation-${(number ?? "draft").replace(/[^\w-]+/g, "-")}.pdf`;
}
