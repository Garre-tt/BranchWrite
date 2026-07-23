export function ProposalWorkspaceEmpty() {
  return (
    <section className="proposal-panel" aria-labelledby="proposal-heading">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Separate workspace</p>
          <h2 id="proposal-heading">Proposal Workspace</h2>
        </div>
      </div>
      <div className="proposal-empty">
        <div className="proposal-empty-mark" aria-hidden="true">
          ↗
        </div>
        <h3>No proposal selected</h3>
        <p>
          Proposed writing will stay separate from My Draft until you explicitly
          accept it.
        </p>
      </div>
    </section>
  );
}
