import CommandBox from "@/components/CommandBox";
import CompanyForm from "@/components/CompanyForm";
import { slab } from "@/lib/fonts";
import { getCompany } from "@/lib/settings";

// Your company: the letterhead on every quotation.
export default async function SettingsPage() {
  const company = await getCompany();
  return (
    <div className="kraft-page flex flex-col gap-6 pt-8">
      <div aria-hidden="true" className="kraft-sheet pointer-events-none fixed inset-0 -z-10" />
      <div>
        <h1 className={`${slab.className} text-5xl leading-none tracking-[-0.02em] text-[#3a2412] md:text-6xl`}>Your company</h1>
        <p className="mt-2 font-medium text-[#3a2412]">
          The letterhead on every quotation. Quotations already sent keep the details they went out with.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <CompanyForm key={JSON.stringify(company)} company={company} />
        <CommandBox variant="company" aside="Or say it" />
      </div>
    </div>
  );
}
