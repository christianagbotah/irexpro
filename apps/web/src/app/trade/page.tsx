import WorkspaceFoundation from '@/components/workspace-foundation';

export default function TradingWorkspacePage() {
  return (
    <WorkspaceFoundation
      activeRoute="/trade"
      eyebrow="Execution workspace"
      title="Trading Workspace"
      description="The operational surface for market context, AI-approved trade intent, broker execution, and position management. The workspace is designed to remain simpler than an institutional terminal while preserving execution transparency and risk controls."
      capabilities={[
        {
          title: 'Market & chart workspace',
          description: 'Synchronized chart panels, timeframe controls, overlays, watchlists, and market context sourced from an approved market-data contract.',
        },
        {
          title: 'AI-approved trade intent',
          description: 'Show the signal, strategy version, risk decision, approval or veto state, and execution readiness before broker submission.',
        },
        {
          title: 'Positions & orders',
          description: 'Present authoritative broker-reconciled positions, pending orders, stop-loss and take-profit state, and lifecycle changes without local guesswork.',
        },
        {
          title: 'Execution intelligence',
          description: 'Expose broker response, latency, fill quality, slippage, reconciliation state, and idempotent execution history when those contracts are available.',
        },
      ]}
    />
  );
}
