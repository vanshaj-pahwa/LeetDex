import { Suspense } from "react";
import ProblemsClient from "./ProblemsClient";

export default function ProblemsPage() {
  return (
    <Suspense fallback={null}>
      <ProblemsClient />
    </Suspense>
  );
}
