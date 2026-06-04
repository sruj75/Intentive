/** Companion Chat route — thin shell; renders the `chat` domain's wrapper. */
import { CompanionChat } from "../../src/domains/chat/ui/companion-chat";

export default function ChatRoute(): React.JSX.Element {
  return <CompanionChat />;
}
