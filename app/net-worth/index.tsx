import { useCallback, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import {
  Button,
  Card,
  Empty,
  Field,
  Label,
  Screen,
  showError,
  useTheme,
} from '../../src/components/ui';
import { QueryState } from '../../src/components/QueryState';
import { useDatabaseQuery } from '../../src/hooks/useDatabaseQuery';
import { repo } from '../../src/db/database';
import { localDate, money, validDate } from '../../src/utils/finance';
import { monthRange, shiftMonth } from '../../src/utils/periods';
export default function NetWorth() {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const [date, setDate] = useState(localDate()),
    [draft, setDraft] = useState(date);
  const [selected, setSelected] = useState<number | null>(null);
  const load = useCallback(async () => {
    const dates = Array.from({ length: 6 }, (_, i) =>
      i === 5 ? date : monthRange(shiftMonth(date.slice(0, 7), i - 5)).end
    );
    const history = await Promise.all(dates.map((d) => repo().netWorth(d)));
    return { current: history[5], previous: history[4], history };
  }, [date]);
  const query = useDatabaseQuery(load, 'ledger');
  const data = query.data;
  const group = data?.current.groups.find((g) => g.currency === 'INR');
  const previous = data?.previous.groups.find((g) => g.currency === 'INR');
  const complete = data?.history.every((h) => !h.incomplete);
  const points =
    data?.history.map((h) => ({
      value: (h.groups.find((g) => g.currency === 'INR')?.net ?? 0) / 100,
      label: h.date.slice(5),
      date: h.date,
    })) ?? [];
  const highest = Math.max(1, ...points.map((p) => p.value));
  const lowest = Math.min(0, ...points.map((p) => p.value));
  return (
    <Screen title="Net worth" subtitle="Assets less liabilities, at a point in time" back>
      <Field label="As-of date (YYYY-MM-DD)" value={draft} onChangeText={setDraft} />
      <Button
        secondary
        title="Apply as-of date"
        onPress={() => {
          if (!validDate(draft)) {
            showError(new Error('Choose a valid local date.'));
            return;
          }
          setSelected(null);
          setDate(draft);
        }}
      />
      <QueryState {...query} />
      {data && (
        <>
          {data.current.incomplete && (
            <Empty
              title="Historical reconstruction is incomplete"
              detail="Some migrated accounts have no reliable opening date before this period. Totals below include only recorded postings; they are not a complete historical net worth."
            />
          )}
          {data.current.groups.map((g) => (
            <Card key={g.currency}>
              <Label>
                {g.currency} · Net worth {money(g.net, g.currency)}
              </Label>
              <Label>Total assets {money(g.assets, g.currency)}</Label>
              <Label>Total liabilities {money(g.liabilities, g.currency)}</Label>
              {!data.current.incomplete &&
                !data.previous.incomplete &&
                g.currency === previous?.currency && (
                  <>
                    <Label small>Previous month-end {money(previous.net, g.currency)}</Label>
                    <Label small>
                      Change {money(g.net - previous.net, g.currency)} ·{' '}
                      {previous.net > 0
                        ? `${(((g.net - previous.net) / previous.net) * 100).toFixed(1)}%`
                        : 'Percentage change is not meaningful for a non-positive prior net worth.'}
                    </Label>
                  </>
                )}
            </Card>
          ))}
          {group && complete && data.current.accounts.length > 0 ? (
            <Card>
              <Label>Six-month net worth history</Label>
              <Label small>INR only · Tap a point. No currencies are combined.</Label>
              <LineChart
                data={points}
                width={Math.max(140, width - 122)}
                height={190}
                spacing={50}
                maxValue={Math.ceil(highest)}
                mostNegativeValue={Math.floor(lowest)}
                noOfSections={4}
                color={c.accent}
                dataPointsColor={c.accent}
                yAxisColor={c.border}
                xAxisColor={c.border}
                rulesColor={c.border}
                yAxisLabelWidth={55}
                yAxisTextStyle={{ color: c.muted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: c.muted, fontSize: 10 }}
                formatYLabel={(v) =>
                  new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    notation: 'compact',
                  }).format(Number(v))
                }
                isAnimated={false}
                focusEnabled
                onFocus={(_: unknown, index: number) => setSelected(index)}
              />
              {selected !== null && points[selected] && (
                <Label>
                  {points[selected].date} · {money(points[selected].value * 100)}
                </Label>
              )}
              {data.history.map((h) => (
                <Label small key={h.date}>
                  {h.date} · {money(h.groups.find((g) => g.currency === 'INR')?.net ?? 0)}
                </Label>
              ))}
            </Card>
          ) : (
            <Empty
              title="Historical chart unavailable"
              detail="Six complete month-end balances are required. Migrated openings are assumptions at the documented history boundary; older balances are not invented."
            />
          )}
          <Card>
            <Label>Asset & liability details</Label>
            {data.current.accounts.map((a) => (
              <Label small key={a.id}>
                {a.name} · {a.kind} · {money(a.balance, a.currency)}
                {a.historical_assumption ? ' · Migrated opening-date assumption' : ''}
              </Label>
            ))}
          </Card>
          <Label small>
            Archived accounts remain part of net worth. Income and expense accounts are excluded.
            Future currency support must supply explicit conversion rates; separate currencies
            cannot be summed.
          </Label>
        </>
      )}
    </Screen>
  );
}
