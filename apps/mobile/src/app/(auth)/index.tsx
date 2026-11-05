import { router } from 'expo-router';
import { View } from 'react-native';
import { BRAND } from '@groundwork/shared';
import { Button, Notice, Screen, Text } from '@/components/ui';
import { isConfigured } from '@/lib/config';
import { useTheme } from '@/lib/theme';

export default function Welcome() {
  const { c } = useTheme();
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ minHeight: 520, justifyContent: 'center', gap: 20 }}>
        <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' }}>
          {[22, 14, 22].map((w, i) => <View key={i} style={{ width: w, height: 3, borderRadius: 2, backgroundColor: c.accent, marginVertical: 2, alignSelf: 'center' }} />)}
        </View>
        <Text variant="title" style={{ fontSize: 32, lineHeight: 38 }}>Find your people.{'\n'}Validate your idea.{'\n'}Build what matters.</Text>
        <Text variant="muted" style={{ fontSize: 16, lineHeight: 24 }}>
          {BRAND.name} helps founders find complementary co-founders and startup builders, and pressure-test ideas with Think.
        </Text>
        {!isConfigured && <Notice tone="warning" title="Not connected">This build has no backend configured (missing EXPO_PUBLIC_SUPABASE_* values).</Notice>}
        <View style={{ gap: 10, marginTop: 8 }}>
          <Button title="Create an account" onPress={() => router.push('/register')} />
          <Button title="Log in" variant="secondary" onPress={() => router.push('/login')} />
        </View>
        <Text variant="caption" style={{ textAlign: 'center' }}>Free to join · Adults 18+</Text>
      </View>
    </Screen>
  );
}
