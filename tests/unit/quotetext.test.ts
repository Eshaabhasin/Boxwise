import { describe, expect, it } from "vitest";
import { readQuoteText } from "@/lib/commands/quotetext";

describe("notes, said in words", () => {
  it.each([
    ["notes mein likho ex works Bhiwandi", "ex works Bhiwandi"],
    ["Notes mein ex works Bhiwandi likho.", "ex works Bhiwandi"],
    ["note: Prices are ex-works Bhiwandi.", "Prices are ex-works Bhiwandi"],
    ["add note transport extra", "transport extra"],
  ])("%s", (text, notes) => {
    expect(readQuoteText(text)).toEqual({ notes });
  });
});

describe("your letterhead, said in words", () => {
  it.each([
    ["hamari company ka naam Shree Packaging Industries karo", { name: "Shree Packaging Industries" }],
    ["Change our company name to Shree Packaging.", { name: "Shree Packaging" }],
    ["my company name is R S Packers", { name: "R S Packers" }],
    // Each detail goes in its own field.
    [
      "My company name is XYZ. My email is xyz@gmail.com and my GSTIN is 1234567812",
      { name: "XYZ", email: "xyz@gmail.com", gstin: "1234567812" },
    ],
    [
      "hamari company ka naam Shree Packaging hai, email shree@gmail.com aur GST number 27AAPFU0939F1ZV",
      { name: "Shree Packaging", email: "shree@gmail.com", gstin: "27AAPFU0939F1ZV" },
    ],
    ["my email address is a@b.in and phone number is 98200 12345", { email: "a@b.in", phone: "98200 12345" }],
    ["our address is Plot 4, MIDC, Bhiwandi 421302", { address: "Plot 4, MIDC, Bhiwandi 421302" }],
    ["My GSTIN is 27AAPFU0939F1ZV", { gstin: "27AAPFU0939F1ZV" }],
  ])("%s", (text, seller) => {
    expect(readQuoteText(text)).toEqual({ seller });
  });

  it.each([
    "company ka naam Verma Traders karo",
    "Sharma Packaging ka email sharma@gmail.com hai",
    "box 2 ka rate 21",
    "notebook ke liye 500 box",
    "approve",
  ])("leaves %s to the usual reading", (text) => {
    expect(readQuoteText(text)).toBeNull();
  });
});

describe("on the Your company page", () => {
  it.each([
    ["Change the company name to XPI", { name: "XPI" }],
    ["Maine company name XPI kar diya", { name: "XPI" }],
    ["company ka naam XPI Packaging karo", { name: "XPI Packaging" }],
    ["name is XPI", { name: "XPI" }],
    ["Company name is XPI, email info@xpi.in and phone 98200 12345", { name: "XPI", email: "info@xpi.in", phone: "98200 12345" }],
    ["GSTIN 27AAPFU0939F1ZV", { gstin: "27AAPFU0939F1ZV" }],
  ])("%s", (text, seller) => {
    expect(readQuoteText(text, { ownCompany: true })).toEqual({ seller });
  });
});
