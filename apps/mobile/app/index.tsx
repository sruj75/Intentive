import { ExperienceApp } from "../src/experience/ui/experience-app";
import { ExperienceProvider } from "../src/experience/ui/experience-provider";

export default function ExperienceRoute(): React.JSX.Element {
  return (
    <ExperienceProvider>
      <ExperienceApp />
    </ExperienceProvider>
  );
}
