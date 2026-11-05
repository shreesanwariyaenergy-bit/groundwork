import { router } from 'expo-router';
import { View } from 'react-native';
import { INTENTS, countryName } from '@groundwork/shared';
import { Avatar, Badge, Button, Card, Divider, Row, Screen, Text } from '@/components/ui';
import { useSession } from '@/lib/session';

export default function ProfileTab() {
  const { profile, avatar, roleName, session } = useSession();
  if (!profile) return null;
  const rows: [string, string, string][] = [
    ['Edit profile', 'Photo, about, skills, links, startup', '/edit-profile'],
    ['View my public profile', 'See what others see', `/u/${session!.user.id}`],
    ['Connections', 'Requests you sent and accepted connections', '/connections'],
    ['Settings', 'Privacy, notifications, blocked accounts, delete account', '/settings'],
  ];
  return (
    <Screen>
      <Row style={{ alignItems: 'flex-start' }}>
        <Avatar name={profile.display_name} uri={avatar(profile.avatar_path)} size={72} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="title" style={{ fontSize: 22 }}>{profile.display_name}</Text>
          <Text variant="muted">{profile.headline}</Text>
          <Text variant="caption">{[roleName(profile.primary_role), countryName(profile.country_code)].filter(Boolean).join(' · ')}</Text>
        </View>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{profile.intents.map((i) => <Badge key={i} label={INTENTS.find((x) => x.value === i)?.label ?? i} />)}</View>
      <Card style={{ padding: 0 }}>
        {rows.map(([title, sub, href], i) => (
          <View key={href}>
            {i > 0 && <Divider />}
            <Button variant="ghost" title={title} accessibilityLabel={`${title}. ${sub}`} onPress={() => router.push(href as never)} style={{ justifyContent: 'flex-start', minHeight: 56 }} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
