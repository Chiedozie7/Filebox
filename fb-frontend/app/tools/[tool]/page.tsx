import Link from "next/link";
import { notFound } from "next/navigation";
import { toolIds, tools, type ToolId } from "@/lib/filebox";
import { toolPath } from "@/lib/filebox/discovery";
import { ToolIcon, toolTone } from "@/components/tool-icon";
import ToolWorkspace from "./tool-workspace";

export function generateStaticParams() {
  return toolIds.map(tool => ({ tool }));
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  if (!toolIds.includes(tool as ToolId)) notFound();
  const id = tool as ToolId;
  const config = tools[id];
  const categoryHref = id.startsWith("image-") ? "/images" : id.startsWith("pdf-") ? "/pdf" :
    ["batch-convert", "zip"].includes(id) ? "/workflows/multi-file" : "/office";
  return (
    <main className={`workspace container tone-${toolTone(id)}`}>
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href={categoryHref}>Tools</Link><span>/</span><span>{config.label}</span></nav>
      <header className="tool-page-header"><ToolIcon id={id} large/><div><span className="eyebrow">FileBox tool</span>
        <h1>{config.label}</h1><p>{config.description}</p></div></header>
      <div className="tool-page-body"><ToolWorkspace tool={id} />
        <aside className="tool-info" aria-labelledby="related-tools"><div className="info-card"><span className="eyebrow">How it works</span>
          <h2>Choose. Process. Download.</h2><p>Pick a supported file, set any options, then download your result when it is ready.</p></div>
          <div className="related-panel"><h2 id="related-tools">Keep going</h2><p>Other tools for the next step.</p>
            <ul className="related-tools">{config.related.map(related => <li key={related}><Link href={toolPath(related)}>
              <ToolIcon id={related}/><span>{tools[related].label}</span><span aria-hidden="true">↗</span></Link></li>)}</ul></div>
        </aside></div>
    </main>
  );
}
