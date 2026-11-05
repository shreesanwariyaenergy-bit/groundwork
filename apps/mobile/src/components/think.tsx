import { View } from 'react-native';
import { EVIDENCE_LABELS, type EvidenceLabel, type ThinkReport } from '@groundwork/shared';
import { Badge, Card, Notice, Text } from './ui';

const TONE: Record<EvidenceLabel, 'neutral' | 'accent' | 'warning' | 'danger'> = {
  verified: 'accent', estimate: 'warning', assumption: 'warning', hypothesis: 'neutral', recommendation: 'accent', question: 'neutral',
};

export function ReportView({ report }: { report: ThinkReport }) {
  return (
    <View style={{ gap: 12 }}>
      <Notice tone={report.generated_by === 'ai' ? 'warning' : 'neutral'} title={report.generated_by === 'ai' ? 'AI-generated — verify before relying on it' : 'Basic checklist (no AI)'}>{report.disclaimer}</Notice>
      {report.overall_signal && <Text variant="small">Overall signal from the AI: <Text variant="label">{report.overall_signal}</Text> — an opinion, not a prediction.</Text>}
      {report.sections.map((s, i) => (
        <Card key={s.key} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text variant="caption">{String(i + 1).padStart(2, '0')}</Text>
            <Text variant="label" style={{ flexShrink: 1 }}>{s.title}</Text>
            {s.preliminary && <Badge tone="warning" label="Preliminary" />}
          </View>
          {!!s.summary && <Text variant="body">{s.summary}</Text>}
          {s.points.map((p, j) => (
            <View key={j} style={{ gap: 4 }}>
              <Badge tone={TONE[p.label]} label={EVIDENCE_LABELS[p.label].name} />
              <Text variant="body">{p.text}</Text>
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}
