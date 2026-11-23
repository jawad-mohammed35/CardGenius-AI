import { Workspace } from "./workspace";

export default function Home() {
  return (
    <>
      <div className="page-intro">
        <h1>Create a flashcard deck</h1>
        <p>Start with a topic, paste your notes, or add files. You can combine them in one deck.</p>
      </div>
      <Workspace hosted={process.env.VERCEL === "1" || process.env.HOSTED_GEMINI === "true"} />
    </>
  );
}
