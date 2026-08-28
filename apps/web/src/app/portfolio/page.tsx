import WorkspaceFoundation from '@/components/workspace-foundation';

export default function PortfolioRiskPage() {
  return (
    <WorkspaceFoundation
      activeRoute="/portfolio"
      eyebrow="Capital & risk intelligence"
      title="Portfolio & Risk"
      description="The portfolio cockpit will unify broker-reconciled capital, realised and unrealised performance, exposure, drawdown, concentration, and risk-limit state. Every number shown here must reconcile to an authoritative financial source."
      capabilities={[
        {
          title: 'Equity & performance',
          description: 'Equity, balance, realised and unrealised P&L, high-water mark, fee impact, and time-series performance from reconciled financial records.',
        },
        {
          title: 'Exposure & concentration',
          description: 'Aggregate exposure by instrument, currency, asset class, strategy, and broker account using position data rather than browser-side estimates.',
        },
        {
          title: 'Drawdown & limits',
          description: 'Track current drawdown, daily loss usage, position risk, margin utilisation, and configured limits with explicit breach and warning states.',
        },
        {
          title: 'Attribution & stress',
          description: 'Explain where returns and risk originated by strategy and market context, then layer stress and scenario analysis once validated backend contracts exist.',
        },
      ]}
    />
  );
}
