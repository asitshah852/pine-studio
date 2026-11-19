import Handout from "@/components/Handout";

export const metadata = { title: "Handout · pine studio" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Handout id={id} />;
}
