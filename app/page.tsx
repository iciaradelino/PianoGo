import { AppShell } from "../components/app-shell";
import { listSheets } from "@/lib/library/repository";

export default function Home() {
  return <AppShell initialSheets={listSheets()} />;
}
