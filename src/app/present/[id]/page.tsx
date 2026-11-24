import Presenter from "@/components/Presenter";

export const metadata = { title: "Presenter · pine kitchen" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Presenter id={id} />;
}
