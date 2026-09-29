import Link from "next/link";
import { toolIds, tools, type ToolConfig } from "@/lib/filebox";

const categories: ToolConfig["category"][] = ["Image", "PDF", "Convert", "Other"];

export default function Home() {
  return (
    <main className="workspace">
      <header>
        <h1>File tools</h1>
        <p>Choose a task. Files are processed when you submit the form.</p>
      </header>
      {categories.map(category => (
        <section key={category} aria-labelledby={`category-${category}`}>
          <h2 id={`category-${category}`}>{category}</h2>
          <ul className="tool-grid">
            {toolIds.filter(id => tools[id].category === category).map(id => (
              <li key={id}>
                <Link className="tool-link" href={`/tools/${id}`}>
                  <strong>{tools[id].label}</strong>
                  <span>{tools[id].description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
