import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text as RNText,
  TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initials, touchTarget } from '@groundwork/shared';
import { font, useTheme } from '@/lib/theme';

// ------------------------------------------------------------------ Text
type TextVariant = 'title' | 'heading' | 'body' | 'label' | 'muted' | 'small' | 'caption';
export function Text({ children, variant = 'body', style, numberOfLines, color }: { children: ReactNode; variant?: TextVariant; style?: StyleProp<TextStyle>; numberOfLines?: number; color?: string }) {
  const { c } = useTheme();
  const v: Record<TextVariant, TextStyle> = {
    title: { fontFamily: font.semibold, fontSize: 26, lineHeight: 32, color: c.text, letterSpacing: -0.3 },
    heading: { fontFamily: font.semibold, fontSize: 17, lineHeight: 24, color: c.text },
    body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: c.text },
    label: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: c.text },
    muted: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: c.textMuted },
    small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: c.textMuted },
    caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: c.textSubtle },
  };
  return <RNText style={[v[variant], color ? { color } : null, style]} numberOfLines={numberOfLines}>{children}</RNText>;
}

// ------------------------------------------------------------------ Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ title, onPress, variant = 'primary', loading, disabled, small, style, accessibilityLabel }: {
  title: string; onPress?: () => void; variant?: Variant; loading?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const bg = { primary: c.accent, secondary: c.surfaceRaised, ghost: 'transparent', danger: c.danger }[variant];
  const fg = { primary: c.onAccent, secondary: c.text, ghost: c.text, danger: '#fff' }[variant];
  return (
    <Pressable
      onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [{
        minHeight: small ? 36 : touchTarget, paddingHorizontal: small ? 12 : 18, borderRadius: 8, backgroundColor: bg,
        alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
        borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth * 2 : 0, borderColor: c.borderStrong,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      }, style]}>
      {loading && <ActivityIndicator color={fg} size="small" />}
      <RNText style={{ color: fg, fontFamily: font.medium, fontSize: small ? 14 : 15 }}>{title}</RNText>
    </Pressable>
  );
}

// ------------------------------------------------------------------ Inputs
export function Input({ label, hint, error, style, multiline, ...rest }: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text variant="label">{label}</Text>}
      <TextInput
        placeholderTextColor={c.textSubtle} multiline={multiline}
        style={[{
          minHeight: multiline ? 96 : touchTarget, borderWidth: 1, borderColor: error ? c.danger : c.borderStrong, borderRadius: 8,
          paddingHorizontal: 12, paddingVertical: multiline ? 10 : 0, color: c.text, backgroundColor: c.surfaceRaised,
          fontFamily: font.regular, fontSize: 15, textAlignVertical: multiline ? 'top' : 'center',
        }, style]}
        {...rest}
      />
      {error ? <Text variant="small" color={c.danger}>{error}</Text> : hint ? <Text variant="caption">{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, justifyContent: 'center',
        borderColor: selected ? c.accent : c.borderStrong, backgroundColor: selected ? c.accentSoft : 'transparent' }}>
      <Text variant="small" color={selected ? c.text : c.textMuted}>{label}</Text>
    </Pressable>
  );
}

export function ChipGroup<T extends string>({ options, value, onChange, max, single }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; max?: number; single?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return <Chip key={o.value} label={o.label} selected={on} onPress={() => {
          if (single) onChange(on ? [] : [o.value]);
          else if (on) onChange(value.filter((v) => v !== o.value));
          else if (!max || value.length < max) onChange([...value, o.value]);
        }} />;
      })}
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'warning' | 'danger' }) {
  const { c } = useTheme();
  const t = { neutral: [c.surface, c.textMuted], accent: [c.accentSoft, c.accent], warning: [c.warningSoft, c.warning], danger: [c.dangerSoft, c.danger] }[tone];
  return <View style={{ backgroundColor: t[0], borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' }}><Text variant="caption" color={t[1]} style={{ fontFamily: font.medium }}>{label}</Text></View>;
}

// ------------------------------------------------------------------ Layout
export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { c } = useTheme();
  const s: ViewStyle = { backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 16 };
  return onPress
    ? <Pressable onPress={onPress} style={({ pressed }) => [s, { opacity: pressed ? 0.9 : 1 }, style]}>{children}</Pressable>
    : <View style={[s, style]}>{children}</View>;
}

export function Screen({ children, scroll = true, refreshing, onRefresh, padded = true, edges = ['top'] }: {
  children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; padded?: boolean; edges?: ('top' | 'bottom')[];
}) {
  const { c } = useTheme();
  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={{ padding: padded ? 16 : 0, paddingBottom: 40, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} /> : undefined}>
      {children}
    </ScrollView>
  ) : <View style={{ flex: 1, padding: padded ? 16 : 0 }}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{inner}</KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Avatar({ name, uri, size = 40 }: { name: string; uri?: string | null; size?: number }) {
  const { c } = useTheme();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={150} cachePolicy="memory-disk" accessibilityIgnoresInvertColors />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="small" style={{ fontSize: Math.max(11, size * 0.36), fontFamily: font.medium }}>{initials(name)}</Text>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const { c } = useTheme();
  return <View style={{ padding: 32, alignItems: 'center', gap: 8 }}><ActivityIndicator color={c.accent} />{label && <Text variant="muted">{label}</Text>}</View>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.borderStrong, borderRadius: 12, padding: 24, alignItems: 'center', gap: 6 }}>
      <Text variant="heading" style={{ textAlign: 'center' }}>{title}</Text>
      {body && <Text variant="muted" style={{ textAlign: 'center' }}>{body}</Text>}
      {action && <View style={{ marginTop: 10 }}>{action}</View>}
    </View>
  );
}

export function Notice({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'danger' | 'accent'; title?: string }) {
  const { c } = useTheme();
  const bg = { neutral: c.surface, warning: c.warningSoft, danger: c.dangerSoft, accent: c.accentSoft }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 8, padding: 12, gap: 2 }} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      {title && <Text variant="label">{title}</Text>}
      {typeof children === 'string' ? <Text variant="small" color={c.text}>{children}</Text> : children}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Notice tone="danger" title="Could not load">
      <View style={{ gap: 10 }}>
        <Text variant="small">{message}</Text>
        {onRetry && <Button small variant="secondary" title="Try again" onPress={onRetry} style={{ alignSelf: 'flex-start' }} />}
      </View>
    </Notice>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="heading">{title}</Text>{action}
      </View>
      {children}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderRadius: 8, padding: 3, gap: 3 }} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, minHeight: 38, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surfaceRaised : 'transparent' }}>
            <Text variant="small" color={on ? c.text : c.textMuted} style={{ fontFamily: on ? font.medium : font.regular }}>
              {o.label}{o.count ? ` · ${o.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bottom sheet built on RN Modal (keyboard-aware, dismiss on backdrop / back button). */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <Modal visible={visible} onRequestClose={onClose} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90%' as unknown as number }}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.borderStrong }} /></View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text variant="heading">{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"><Text variant="muted">Close</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 14 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}
