import Link from "next/link";
import { tools } from "@/lib/filebox";
import { quickTools, toolPath } from "@/lib/filebox/discovery";
import { ActionCard, FileVisual, SectionHeading } from "@/components/discovery-ui";
import { ToolSearch } from "@/components/tool-search";
import { WorkflowCarousel } from "@/components/workflow-carousel";

export default function Home() {
  return <main>
    <section className="hero container">
      <div className="hero-copy"><span className="eyebrow"><span className="live-dot"/> The right tool for the file in front of you</span>
        <h1>Every file has a <em>next step.</em></h1>
        <p>Make it smaller. Convert it. Pull words from a scan. FileBox helps you find the right move and get it done.</p>
        <ToolSearch />
        <div className="quick-tools"><span>Popular</span>{quickTools.map(id => <Link key={id} href={toolPath(id)}>{tools[id].label} <span aria-hidden="true">↗</span></Link>)}</div>
      </div>
      <FileVisual kind="hero" />
      <div className="hero-bottom"><span>FILE WORK, WITHOUT THE FRICTION</span><span>Explore ↓</span></div>
    </section>

    <section className="section container">
      <SectionHeading eyebrow="Start with a task" title="Four ways forward." description="Choose what you want to accomplish. We’ll point you to the right tool." />
      <WorkflowCarousel />
    </section>

    <section className="capability-strip" id="features"><div className="container"><div className="capability-strip-intro">
      <span className="eyebrow">Built for real file work</span><h2>More than a single conversion.</h2></div>
      <div className="capability-strip-list"><div><strong>Batch processing</strong><p>Apply one output format across several files.</p></div>
        <div><strong>OCR + tables</strong><p>Read scanned text and detect ruled tables.</p></div>
        <div><strong>Editable output</strong><p>Reconstruct content into working documents.</p></div>
        <div><strong>Temporary files</strong><p>Processing files are cleaned up automatically.</p></div>
        <div><strong>Fast discovery</strong><p>Search by tool name or the task in mind.</p></div></div>
    </div></section>

    <section className="section feature-section pdf-showcase" id="pdf-tools"><div className="container">
      <SectionHeading eyebrow="01 / PDF" title="A better way through PDF." description="The everyday PDF jobs, all in one place: compress, rearrange, combine, unlock, and convert."
        href="/pdf" linkText="Explore PDF tools" />
      <div className="pdf-layout"><div className="pdf-feature-visual"><FileVisual kind="pdf"/><div className="feature-visual-label">FROM PDF / TO POSSIBILITY</div></div>
        <div className="pdf-actions"><div className="pdf-primary"><ActionCard id="pdf-compress" prominent/><ActionCard id="pdf-merge" prominent
          note="Combine PDFs, DOCX, XLSX, and supported images into one PDF."/></div>
          <div className="action-list"><ActionCard id="pdf-split"/><ActionCard id="pdf-unlock"/><ActionCard id="pdf-to-word"/>
            <ActionCard id="pdf-to-excel"/><ActionCard id="pdf-to-pptx"/></div></div></div>
    </div></section>

    <section className="section container image-showcase">
      <SectionHeading eyebrow="02 / Images" title="Keep the image. Lose the excess." description="Compress, resize, or convert without guessing which tool you need."
        href="/images" linkText="Explore image tools" />
      <div className="showcase-split"><FileVisual kind="image"/><div className="showcase-actions">
        <ActionCard id="image-compress" prominent/><ActionCard id="image-resize"/><ActionCard id="image-convert"/><ActionCard id="batch-convert"/>
      </div></div>
    </section>

    <section className="section feature-section office-showcase"><div className="container">
      <SectionHeading eyebrow="03 / Documents" title="Move between formats freely." description="From Word and Excel to PDF and PPTX, follow the direction your work needs."
        href="/office" linkText="Explore document conversion" />
      <div className="showcase-split office-split"><FileVisual kind="office"/><div className="office-links">
        {(["word-to-pdf", "word-to-excel", "excel-to-pdf", "excel-to-word", "pptx-to-pdf", "pdf-to-pptx"] as const).map(id =>
          <ActionCard id={id} key={id}/>)}
      </div></div>
    </div></section>

    <section className="section container ocr-showcase"><div className="showcase-split">
      <div><SectionHeading eyebrow="04 / OCR" title="Give scanned pages new life." description="Extract text from images and multi-page scanned PDFs into an editable Word document. Ruled tables can be detected too."
        href={toolPath("ocr-to-word")} linkText="Turn a scan into editable Word" />
        <div className="feature-points"><span>Text extraction</span><span>Editable DOCX output</span><span>Ruled-table detection</span></div></div>
      <FileVisual kind="scans" />
    </div></section>

    <section className="section feature-section multi-showcase"><div className="container showcase-split">
      <FileVisual kind="multi" />
      <div><SectionHeading eyebrow="05 / Multiple files" title="Handle the whole stack." description="Convert files in a batch, combine mixed inputs into one PDF, or package them as a ZIP."
        href="/workflows/multi-file" linkText="Work with multiple files" />
        <div className="mini-actions"><ActionCard id="batch-convert"/><ActionCard id="pdf-merge"/><ActionCard id="zip"/></div>
      </div>
    </div></section>

    <section className="section container privacy-section" id="about"><div>
      <span className="eyebrow">Made for the task at hand</span><h2>Files are here to move forward.</h2></div>
      <div><p>FileBox transfers files to the processing service for the tool you choose. Processing files are temporary and cleaned up automatically, so they are not kept longer than necessary.</p>
        <div className="privacy-points"><span>Secure transfer</span><span>Temporary processing</span><span>Automatic cleanup</span></div></div>
    </section>

    <section className="section final-search"><div className="container"><span className="eyebrow">Your next step starts here</span>
      <h2>What do you need to do with your file?</h2><ToolSearch /></div></section>
  </main>;
}
