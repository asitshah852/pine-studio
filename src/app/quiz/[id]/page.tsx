import QuizPrint from "@/components/QuizPrint";

export const metadata = { title: "Quiz · pine studio" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuizPrint id={id} />;
}
