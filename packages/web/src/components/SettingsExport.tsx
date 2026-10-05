// Export a product as one file (decision:wf2.product-transfer): what it knows — documents, the app's pages, inbox,
// agent instructions — to hand to someone or keep; they open it with Add a product › Import a file.
export function SettingsExport({ product }: { product: string }) {
  return (
    <section className="kind-section settings-section">
      <h2>Export</h2>
      <p className="lede">Download <b>{product}</b> as one file, <code>{product}.wye.tgz</code>: its documents, the app&apos;s pages (requests, workflow runs), inbox and agent instructions. Agent sessions and change history stay on this machine; the graph is rebuilt where it is imported (Add a product › Import a file).</p>
      <div className="sec-actions"><a className="btn pri" href={`/api/${product}/export`} download={`${product}.wye.tgz`}>Export {product}.wye.tgz</a></div>
    </section>
  );
}
