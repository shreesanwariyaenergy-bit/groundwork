import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AVAILABILITY, INTENTS, PAGE_SIZE, STAGES, WORK_MODES, friendlyError, type ProfileCard, type RecommendationCard, type SearchFilters,
} from '@groundwork/shared';
import { Button, ChipGroup, EmptyState, ErrorState, Input, Loading, Row, Segmented, Sheet, Text } from '@/components/ui';
import { PersonCard } from '@/components/people';
import { SelectField } from '@/components/profile-forms';
import { api } from '@/lib/supabase';
import { useAsync, useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

type Mode = 'recommended' | 'search';

export default function Discover() {
  const { c } = useTheme();
  const { taxonomy } = useSession();
  const [mode, setMode] = useState<Mode>('recommended');
  const [matchType, setMatchType] = useState<string[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [draft, setDraft] = useState<SearchFilters>({});
  const [sheet, setSheet] = useState(false);
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<(ProfileCard | RecommendationCard)[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const list = useAsync(async () => {
    const rows = mode === 'recommended' ? await api.recommendations(page, matchType[0]) : await api.search(filters, page);
    setItems((prev) => (page === 0 ? rows : [...prev, ...rows]));
    setHasMore(rows.length === PAGE_SIZE);
    return rows;
  }, [mode, matchType.join(), JSON.stringify(filters), page]);

  const reset = () => { setPage(0); };
  const header = (
    <View style={{ gap: 12, paddingBottom: 12 }}>
      <Text variant="title">Discover</Text>
      <Segmented value={mode} onChange={(m) => { setMode(m); reset(); }} options={[{ value: 'recommended', label: 'Recommended' }, { value: 'search', label: 'Search' }]} />
      {mode === 'recommended' ? (
        <ChipGroup single value={matchType} onChange={(v) => { setMatchType(v); reset(); }} options={[{ value: 'cofounder', label: 'Co-founders' }, { value: 'professional', label: 'Professionals' }, { value: 'collaborator', label: 'Founders to help' }]} />
      ) : (
        <Row>
          <View style={{ flex: 1 }}><Input placeholder="Name, headline or skill" value={draft.query ?? ''} onChangeText={(q) => setDraft({ ...draft, query: q })} returnKeyType="search" onSubmitEditing={() => { setFilters(draft); reset(); }} /></View>
          <Button variant="secondary" title="Filters" onPress={() => setSheet(true)} />
        </Row>
      )}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={list.loading && page === 0 ? [] : items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <PersonCard person={item} onDismiss={mode === 'recommended' ? (id) => setItems((x) => x.filter((y) => y.id !== id)) : undefined} />}
        ListEmptyComponent={list.loading ? <Loading /> : list.error ? <ErrorState message={friendlyError(list.error)} onRetry={list.reload} /> : (
          <EmptyState title={mode === 'recommended' ? 'No strong matches yet' : 'No one matches these filters'}
            body={mode === 'recommended' ? 'We only recommend genuine fits, and the network is growing. Complete your profile or try Search.' : 'Try removing a filter or a broader keyword.'} />
        )}
        ListFooterComponent={hasMore && items.length ? <Button variant="secondary" title="Load more" loading={list.loading} onPress={() => setPage((p) => p + 1)} /> : undefined}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => { if (page === 0) list.refresh(); else setPage(0); }} colors={[c.accent]} />}
        initialNumToRender={6}
        windowSize={7}
      />
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Filters">
        <Text variant="label">Role</Text>
        <ChipGroup value={draft.roles ?? []} onChange={(v) => setDraft({ ...draft, roles: v })} options={(taxonomy?.roles ?? []).filter((r) => !r.is_cofounder_role).map((r) => ({ value: r.slug, label: r.name }))} />
        <Text variant="label">Looking for</Text>
        <ChipGroup value={draft.seeking ?? []} onChange={(v) => setDraft({ ...draft, seeking: v })} options={(taxonomy?.roles ?? []).filter((r) => r.is_cofounder_role).map((r) => ({ value: r.slug, label: r.name }))} />
        <Text variant="label">Intention</Text>
        <ChipGroup value={draft.intents ?? []} onChange={(v) => setDraft({ ...draft, intents: v })} options={INTENTS.map((i) => ({ value: i.value, label: i.label }))} />
        <Text variant="label">Availability</Text>
        <ChipGroup value={draft.availability ?? []} onChange={(v) => setDraft({ ...draft, availability: v })} options={AVAILABILITY} />
        <Text variant="label">Startup stage</Text>
        <ChipGroup value={draft.stages ?? []} onChange={(v) => setDraft({ ...draft, stages: v })} options={STAGES} />
        <Text variant="label">Working preference</Text>
        <ChipGroup value={draft.workModes ?? []} onChange={(v) => setDraft({ ...draft, workModes: v })} options={WORK_MODES} />
        <SelectField label="Industry" value={draft.industries?.[0] ?? null} onChange={(v) => setDraft({ ...draft, industries: v ? [v] : [] })} options={(taxonomy?.industries ?? []).map((i) => ({ value: i.slug, label: i.name }))} placeholder="Any industry" />
        <SelectField label="Skill" value={draft.skills?.[0] ?? null} onChange={(v) => setDraft({ ...draft, skills: v ? [v] : [] })} options={(taxonomy?.skills ?? []).map((s) => ({ value: s.slug, label: s.name }))} placeholder="Any skill" />
        <Text variant="label">Timezone within</Text>
        <ChipGroup single value={draft.maxTzDiff ? [String(draft.maxTzDiff)] : []} onChange={(v) => setDraft({ ...draft, maxTzDiff: v[0] ? Number(v[0]) : undefined })} options={[{ value: '2', label: '±2h' }, { value: '4', label: '±4h' }, { value: '6', label: '±6h' }]} />
        <Text variant="label">Minimum experience</Text>
        <ChipGroup single value={draft.minExperience ? [String(draft.minExperience)] : []} onChange={(v) => setDraft({ ...draft, minExperience: v[0] ? Number(v[0]) : undefined })} options={[{ value: '2', label: '2+ yrs' }, { value: '5', label: '5+ yrs' }, { value: '10', label: '10+ yrs' }]} />
        <Row>
          <Button title="Apply" style={{ flex: 1 }} onPress={() => { setFilters(draft); reset(); setSheet(false); }} />
          <Button variant="ghost" title="Clear" onPress={() => { setDraft({}); setFilters({}); reset(); setSheet(false); }} />
        </Row>
      </Sheet>
    </SafeAreaView>
  );
}
