// The content of a document page whose file is not on disk: the shell around it (URL, top bar, rail, tabs) stays
// as it was and only this notice takes the document's place; when the file comes back the page re-renders into
// the editor by itself through LiveRefresh (req:document-opened-in-the, decision:wf2.deleted-outside-stays-put).
export function DocNotFound({ slug, project }: { slug: string; project: string }) {
  return (
    <div className="page doc-not-found" role="status">
      <h1>Page not found</h1>
      <p>There is no document <code>{slug}</code> in <code>{project}</code> right now. If it was open here, its file was removed outside the app — a shell command, a git checkout, an agent rewriting the folder — and anything typed since the last save is gone with it.</p>
      <p className="muted">If the file comes back, the document takes this notice&rsquo;s place on its own.</p>
    </div>
  );
}
