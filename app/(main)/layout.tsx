import Header from "@/components/Header";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-12 md:px-8">{children}</main>
    </div>
  );
}
