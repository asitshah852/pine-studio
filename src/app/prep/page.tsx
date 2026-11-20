import { Suspense } from "react";
import Prep from "@/components/Prep";

export const metadata = { title: "Class · pine studio" };
export default function Page() {
  return (
    <Suspense>
      <Prep />
    </Suspense>
  );
}
