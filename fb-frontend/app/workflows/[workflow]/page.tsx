import { notFound } from "next/navigation";
import { DiscoveryPage } from "@/components/discovery-page";

const ids = ["compress", "convert", "multi-file"] as const;
export function generateStaticParams() { return ids.map(workflow => ({ workflow })); }
export default async function WorkflowPage({ params }: { params: Promise<{ workflow: string }> }) {
  const { workflow } = await params;
  if (!ids.includes(workflow as typeof ids[number])) notFound();
  return <DiscoveryPage page={workflow as typeof ids[number]} />;
}
