---
name: FSM DatePicker component
description: Inline calendar date picker for Expo FSM — no native modules, pure RN primitives.
---

## Location
`artifacts/nexus-fsm/components/DatePicker.tsx`

## Why pure RN?
`@react-native-community/datetimepicker` is not installed. The component uses a 6×7 month grid built from `View`/`Pressable`/`Text` so it works identically on iOS, Android, and Expo Web.

## Props
```ts
interface DatePickerProps {
  value: string;       // YYYY-MM-DD or ""
  onChange: (dateYmd: string) => void;
  minDate?: Date;      // defaults to today
  maxDate?: Date;      // defaults to today + 2 years
}
```

## Usage — replace free-text date inputs
```tsx
import DatePicker from '@/components/DatePicker';

<Text style={[styles.label, { color: colors.mutedForeground }]}>Date</Text>
<DatePicker value={date} onChange={setDate} />
```
`canSubmit` just checks `!!date` — no need for `isValidDateInput` when the picker is used.

**Why:** The follow-up screen used a raw TextInput that accepted any string. The picker eliminates invalid dates entirely and renders a proper calendar grid.
