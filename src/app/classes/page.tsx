import { Suspense } from "react";
import Classes from "@/components/Classes";

export const metadata = { title: "Classes · pine kitchen" };
export default function Page() {
  return (
    <Suspense>
      <Classes />
    </Suspense>
  );
}
