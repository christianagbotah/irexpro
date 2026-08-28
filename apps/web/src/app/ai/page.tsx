import WorkspaceFoundation from '@/components/workspace-foundation';

export default function AiCommandCenterPage() {
  return (
    <WorkspaceFoundation
      activeRoute="/ai"
      eyebrow="Autonomous intelligence"
      title="AI Command Center"
      description="The explainability and supervision surface for autonomous trading decisions. It will connect model output to strategy selection, risk validation, execution state, and post-trade evidence so every action has an inspectable decision path."
      capabilities={[
        {
          title: 'Decision timeline',
          description: 'Trace signal generation through strategy selection, risk approval or veto, execution submission, broker response, and reconciliation.',
        },
        {
          title: 'Model confidence & evidence',
          description: 'Render confidence, supporting features, model version, and provenance only when supplied by the authoritative AI decision contract.',
        },
        {
          title: 'Market regime intelligence',
          description: 'Surface the active regime classification, volatility context, and strategy eligibility rules with timestamps and model provenance.',
        },
        {
          title: 'Risk veto explainability',
          description: 'Make rejected trades first-class events by showing the exact risk rule, limit, or policy that prevented execution.',
        },
      ]}
    />
  );
}
