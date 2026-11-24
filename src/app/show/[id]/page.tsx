import Show from "@/components/Show";

export const metadata = { title: "pine kitchen" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Show id={id} />;
}
