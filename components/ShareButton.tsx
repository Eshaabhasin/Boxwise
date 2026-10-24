"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { textWithPdfLink, waLink } from "@/lib/quote/share";

/** Dispatch on window (detail: quotation id) to start sending, e.g. after "bhej do". */
export const SHARE_EVENT = "boxbol:share";

interface Props {
  quotationId: string;
  fileName: string;
  pdfUrl: string;
  /** Public link to the PDF, for the text-only fallback. */
  publicPdfUrl: string;
  message: string;
  phone?: string;
  sent: boolean;
}

/**
 * Sends the quotation on WhatsApp. On a phone this opens the share sheet with
 * the PDF file attached; where files can't be shared (most desktops) it opens
 * WhatsApp with the message and a link to the PDF. Either way the card moves to Sent.
 * The PDF is fetched ahead of time because browsers only allow the share
 * sheet right after a tap or key press.
 */
export default function ShareButton({ quotationId, fileName, pdfUrl, publicPdfUrl, message, phone, sent }: Props) {
  const router = useRouter();
  const file = useRef<File | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "tap" | "error">("idle");
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    fetch(pdfUrl)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (live && blob) file.current = new File([blob], fileName, { type: "application/pdf" });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pdfUrl, fileName]);

  const record = useCallback(
    async (via: "share" | "link") => {
      await fetch(`/api/quotations/${quotationId}/sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ via }),
      });
      router.refresh();
    },
    [quotationId, router],
  );

  const send = useCallback(
    async (fromVoice: boolean) => {
      setState("busy");
      setNote("");
      const f = file.current;
      if (f && typeof navigator.canShare === "function" && navigator.canShare({ files: [f] })) {
        try {
          await navigator.share({ files: [f], text: message });
          await record("share");
          setState("idle");
          setNote("Shared. The card is now Sent.");
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            setState("idle");
            setNote("Not sent.");
            return;
          }
          // A spoken "send" has no tap behind it, and the browser may refuse the share sheet.
          if (fromVoice && err instanceof DOMException && err.name === "NotAllowedError") {
            setState("tap");
            return;
          }
        }
      }
      // Text-only fallback: WhatsApp with the message and a link to the PDF.
      const opened = window.open(waLink(phone, textWithPdfLink(message, publicPdfUrl)), "_blank", "noopener");
      if (!opened && fromVoice) {
        setState("tap");
        return;
      }
      await record("link");
      setState("idle");
      setNote("WhatsApp opened with the message and a PDF link. The card is now Sent.");
    },
    [message, phone, publicPdfUrl, record],
  );

  useEffect(() => {
    const onShare = (e: Event) => {
      if ((e as CustomEvent<unknown>).detail === quotationId) void send(true);
    };
    window.addEventListener(SHARE_EVENT, onShare);
    return () => window.removeEventListener(SHARE_EVENT, onShare);
  }, [quotationId, send]);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void send(false)}
        disabled={state === "busy"}
        className={`hard-shadow border-2 border-ink bg-brick px-5 py-3 font-display text-lg font-extrabold uppercase tracking-[0.015em] text-cream disabled:opacity-60 ${
          state === "tap" ? "ring-4 ring-brick/40" : ""
        }`}
      >
        {state === "busy" ? "Opening…" : sent ? "Send again on WhatsApp" : "Send on WhatsApp"}
      </button>
      {state === "tap" && <p className="text-sm font-medium text-brick">Your phone needs one tap to open WhatsApp. Tap the button above.</p>}
      {note && <p className="text-sm text-ink-2">{note}</p>}
    </div>
  );
}
