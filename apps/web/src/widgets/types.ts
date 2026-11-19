export interface WidgetViewProps<P = any, S = any> {
  params: P;
  state: S;
  dispatch(action: unknown): void;
  readOnly: boolean;
  locale: string;
  /** Result of the last check – used to colour options/marks (always paired with icons/text). */
  result?: 'ok' | 'bad' | null;
  /** id of the element that labels the widget (the prompt) */
  labelledBy?: string;
  /** Submit shortcut (Enter in text inputs). */
  onSubmit?(): void;
}

export const tr = (locale: string, de: string, en: string) => (locale.startsWith('de') ? de : en);
