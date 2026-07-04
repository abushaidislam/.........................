import { createFileRoute } from "@tanstack/react-router";
import Onboarding from "@/components/onboarding/Onboarding";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return <Onboarding />;
}
