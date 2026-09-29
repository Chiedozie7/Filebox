import Link from "next/link";
import { notFound } from "next/navigation";
import { toolIds, tools, type ToolId } from "@/lib/filebox";
import ToolWorkspace from "./tool-workspace";

export function generateStaticParams() {
  return toolIds.map(tool => ({ tool }));
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  if (!toolIds.includes(tool as ToolId)) notFound();
  const id = tool as ToolId;
  const config = tools[id];
  return (
    <main className="workspace">
      <nav aria-label="Breadcrumb"><Link href="/">All tools</Link> / {config.label}</nav>
      <header>
        <h1>{config.label}</h1>
        <p>{config.description}</p>
      </header>
      <ToolWorkspace tool={id} />
      <aside aria-labelledby="related-tools">
        <h2 id="related-tools">Related tools</h2>
        <ul className="related-tools">
          {config.related.map(related => (
            <li key={related}><Link href={`/tools/${related}`}>{tools[related].label}</Link></li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
