import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Text } from 'react-native';
import { Mic, Square } from 'lucide-react-native';
import {
  Button,
  Card,
  Choices,
  Field,
  InlineFeedback,
  Label,
  Screen,
  showError,
  useTheme,
} from '../../src/components/ui';
import { CategoryGrid } from '../../src/components/CategoryGrid';
import { MotionPressable } from '../../src/components/Motion';
import { useFinance } from '../../src/store/useFinance';
import { useVoiceEntry } from '../../src/hooks/useVoiceEntry';
import { VOICE_LANGUAGES } from '../../src/services/offlineSpeech';
import { parseVoiceExpenses, type VoiceExpenseDraft } from '../../src/utils/voiceExpenses';
import { recentEntryTemplates } from '../../src/utils/quickEntry';
import { localDate, minor, money, validDate } from '../../src/utils/finance';
import { waitForForegroundAccess } from '../../src/security/lock';
import { repo } from '../../src/db/database';
import { notify } from '../../src/store/useFeedback';

export default function VoiceExpenses() {
  const c = useTheme();
  const { accounts, categories, templates, mutate } = useFinance();
  const eligible = accounts.filter((a) => !a.archived && !a.subtype?.startsWith('loan_'));
  const [account, setAccount] = useState(
    () =>
      recentEntryTemplates(templates, accounts, categories, 'expense')[0]?.account_id ??
      eligible[0]?.id ??
      0
  );
  const [language, setLanguage] = useState<string>('en-IN');
  const [text, setText] = useState('');
  const [reviewedText, setReviewedText] = useState('');
  const [drafts, setDrafts] = useState<VoiceExpenseDraft[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const saving = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const review = useCallback(
    (transcript: string) => {
      try {
        const result = parseVoiceExpenses(transcript, categories, localDate());
        setDrafts(result.expenses);
        setWarnings(result.warnings);
        setReviewedText(transcript);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not understand these expenses.');
      }
    },
    [categories]
  );
  const voice = useVoiceEntry(setText, review);
  const stale = text !== reviewedText;
  const patch = (id: string, changes: Partial<VoiceExpenseDraft>) =>
    setDrafts((rows) => rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  const total = drafts.reduce((sum, row) => {
    try {
      return sum + minor(row.amount);
    } catch {
      return sum;
    }
  }, 0);
  const save = async () => {
    if (
      saving.current ||
      voice.listening ||
      voice.starting ||
      voice.downloading ||
      stale ||
      !drafts.length
    )
      return;
    setError(null);
    try {
      if (!eligible.some((a) => a.id === account))
        throw new Error('Choose an active account before saving.');
      const inputs = drafts.map((row, i) => {
        if (!row.description.trim()) throw new Error(`Add a description for expense ${i + 1}.`);
        if (!validDate(row.date)) throw new Error(`Choose a valid date for expense ${i + 1}.`);
        if (
          !categories.some(
            (category) =>
              category.id === row.category && !category.archived && category.type === 'expense'
          )
        )
          throw new Error(`Choose a category for expense ${i + 1}.`);
        const amount = minor(row.amount);
        if (amount <= 0) throw new Error(`Enter a positive amount for expense ${i + 1}.`);
        return {
          type: 'expense' as const,
          amount,
          account_id: account,
          destination_account_id: null,
          category_id: row.category,
          description: row.description.trim(),
          date: row.date,
          notes: '',
          component: 'standard' as const,
        };
      });
      saving.current = true;
      setBusy(true);
      await waitForForegroundAccess();
      await mutate(() => repo().saveExpenseBatch(inputs));
      notify(`${inputs.length} expense${inputs.length === 1 ? '' : 's'} saved`);
      if (mounted.current) {
        setDrafts([]);
        setText('');
        setReviewedText('');
        setWarnings([]);
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : 'Could not save expenses. Your drafts are still here.'
        );
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Screen
      title="Voice expenses"
      back
      backTo="/(tabs)/transactions"
      subtitle="Speak, review, then save">
      <Card>
        <Label>Speak naturally</Label>
        <Label small>
          “I ate biryani for 140 rupees and took tea for 15 rupees today.” Say each item and its
          rupee amount, joined with “and” or “aur”. Today / आज / آج uses your current local date.
        </Label>
        <Label small>
          Audio and raw dictation stay on this device. An installed offline speech model is
          required; typed entry works anytime. No audio recording is kept.
        </Label>
        <Choices
          label="Speaking language"
          value={language}
          options={[...VOICE_LANGUAGES]}
          onChange={(locale) => {
            if (!voice.listening && !voice.starting && !voice.downloading) {
              setLanguage(locale);
              voice.clearSetup();
            }
          }}
        />
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel={
            voice.listening ? 'Stop listening and review expenses' : 'Start private voice entry'
          }
          disabled={busy || voice.starting || voice.downloading}
          onPress={() => (voice.listening ? voice.stop() : void voice.start(language))}
          style={{
            backgroundColor: voice.listening ? c.negative : c.accent,
            padding: 18,
            borderRadius: 18,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            opacity: voice.starting ? 0.5 : 1,
          }}>
          {voice.listening ? (
            <Square color={c.onAccent} size={22} />
          ) : (
            <Mic color={c.onAccent} size={22} />
          )}
          <Text style={{ color: c.onAccent, fontWeight: '700' }}>
            {voice.starting
              ? 'Preparing microphone…'
              : voice.listening
                ? 'Stop & review'
                : text
                  ? 'Record again'
                  : 'Start speaking'}
          </Text>
        </MotionPressable>
        {voice.error && <InlineFeedback message={voice.error} />}
        {voice.recovery?.action === 'download' && (
          <>
            <Label small>
              The language model needs a one-time download. Your speech stays on this device.
            </Label>
            <Button
              secondary
              title="Download speech language"
              busy={voice.downloading}
              disabled={busy || voice.starting || voice.listening}
              onPress={() => void voice.download(language)}
            />
          </>
        )}
        {voice.recovery?.action && (
          <Button
            secondary
            title="Open device settings"
            disabled={busy || voice.starting || voice.listening || voice.downloading}
            onPress={() => void Linking.openSettings().catch(showError)}
          />
        )}
        {voice.setupMessage && <Label small>{voice.setupMessage}</Label>}
        <Field
          label="Dictation or typed expenses"
          value={text}
          onChangeText={setText}
          placeholder="Biryani 140 rupees and tea 15 rupees today"
          multiline
          maxLength={4000}
          editable={!busy && !voice.listening && !voice.starting && !voice.downloading}
          style={{ minHeight: 110, textAlignVertical: 'top' }}
        />
        <Button
          secondary
          title="Build review list"
          busy={busy || voice.starting || voice.downloading}
          disabled={voice.listening}
          onPress={() => review(text)}
        />
      </Card>
      <Choices
        label="Pay from account"
        value={account}
        options={eligible.map((a) => ({ value: a.id, label: a.name }))}
        onChange={setAccount}
      />
      {!eligible.length && (
        <Label small>
          Create a cash, bank, wallet or credit card account before saving expenses.
        </Label>
      )}
      {warnings.map((warning) => (
        <InlineFeedback key={warning} message={warning} />
      ))}
      {stale && drafts.length > 0 && (
        <InlineFeedback message="Dictation changed. Build the review list again before saving." />
      )}
      {drafts.length > 0 && (
        <Label>
          {drafts.length} expenses · {money(total)}
        </Label>
      )}
      {drafts.map((row, i) => (
        <Card key={row.id}>
          <Label>Expense {i + 1}</Label>
          <Field
            label="Description"
            value={row.description}
            maxLength={160}
            onChangeText={(description) => patch(row.id, { description })}
            editable={!busy}
          />
          <Field
            label="Amount (₹)"
            value={row.amount}
            keyboardType="decimal-pad"
            onChangeText={(amount) => patch(row.id, { amount })}
            editable={!busy}
          />
          <Field
            label="Date (YYYY-MM-DD)"
            value={row.date}
            placeholder={localDate()}
            onChangeText={(date) => patch(row.id, { date })}
            editable={!busy}
          />
          <Button
            secondary
            title={`Category · ${categories.find((category) => category.id === row.category)?.name ?? 'Choose category'}`}
            busy={busy}
            onPress={() => setExpanded(expanded === row.id ? null : row.id)}
          />
          {expanded === row.id && (
            <CategoryGrid
              value={row.category ?? undefined}
              options={categories
                .filter((category) => !category.archived && category.type === 'expense')
                .map((category) => ({ value: category.id, label: category.name }))}
              onChange={(category) => {
                patch(row.id, { category });
                setExpanded(null);
              }}
            />
          )}
          <Button
            secondary
            title="Remove expense"
            busy={busy}
            onPress={() => setDrafts((rows) => rows.filter((draft) => draft.id !== row.id))}
          />
        </Card>
      ))}
      {error && <InlineFeedback message={error} />}
      {drafts.length > 0 && (
        <Button
          title={`Save ${drafts.length} reviewed expenses`}
          busy={busy || voice.starting || voice.downloading}
          disabled={voice.listening || stale}
          onPress={() => void save()}
        />
      )}
    </Screen>
  );
}
