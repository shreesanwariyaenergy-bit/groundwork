import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { api, supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { font, useTheme } from '@/lib/theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];
const icon = (name: IconName) => ({ color, size }: { color: unknown; size: number }) => <MaterialIcons name={name} color={color as string} size={size} />;

function useInboxBadge() {
  const { session } = useSession();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    const load = () => api.unreadNotificationCount().then(setCount).catch(() => {});
    load();
    const ch = supabase.channel(`tabs:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session]);
  return count;
}

export default function TabsLayout() {
  const { c } = useTheme();
  const badge = useInboxBadge();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: c.text,
      tabBarInactiveTintColor: c.textSubtle,
      tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.border, height: 64, paddingTop: 6 },
      tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11, paddingBottom: 4 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: icon('search') }} />
      <Tabs.Screen name="think" options={{ title: 'Think', tabBarIcon: icon('lightbulb-outline') }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: icon('chat-bubble-outline'), tabBarBadge: badge > 0 ? badge : undefined, tabBarBadgeStyle: { backgroundColor: c.accent, color: c.onAccent, fontSize: 10 } }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}
