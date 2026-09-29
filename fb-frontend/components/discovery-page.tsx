import Link from "next/link";
import { type ToolId } from "@/lib/filebox";
import { discoveryPages } from "@/lib/filebox/discovery";
import { ActionCard, FileVisual } from "./discovery-ui";
import { ToolSearch } from "./tool-search";

type DiscoveryKey = keyof typeof discoveryPages;
const visuals: Record<DiscoveryKey, "pdf" | "image" | "office" | "compress" | "convert" | "multi"> = {
  pdf: "pdf", images: "image", office: "office", compress: "compress", convert: "convert", "multi-file": "multi",
};

export function DiscoveryPage({ page }: { page: DiscoveryKey }) {
  const content = discoveryPages[page];
  return <main className="discovery-page container">
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>{content.eyebrow}</span></nav>
    <div className="discovery-hero"><div><span className="eyebrow">{content.eyebrow}</span><h1>{content.title}</h1>
      <p>{content.description}</p></div><FileVisual kind={visuals[page]} /></div>
    <div className="discovery-body"><div className="discovery-intro"><span className="eyebrow">Find your tool</span>
      <h2>{page === "multi-file" ? "Choose the outcome." : page === "compress" ? "Choose by file type." : "Choose your next action."}</h2>
      <p>{content.note}</p></div>
      <div className="discovery-primary">{content.primary.map(id => <ActionCard id={id} key={id} prominent />)}</div>
      {content.secondary.length > 0 && <div className="discovery-secondary"><h3>More ways to work</h3><div>
        {content.secondary.map(id => <ActionCard id={id as ToolId} key={id} />)}</div></div>}
    </div>
    <div className="discovery-help"><div><span className="eyebrow">Still deciding?</span><h2>Search for what you need to do.</h2></div><ToolSearch compact /></div>
    <p className="discovery-footnote">Each tool lists its supported formats and current file limits before you upload.</p>
  </main>;
}
