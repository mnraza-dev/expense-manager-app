import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useFinance } from '../../src/store/useFinance';
import { Choices, Empty, Field, Label, Screen, Button } from '../../src/components/ui';
import { TransactionItem } from '../../src/components/TransactionItem';
import { validDate } from '../../src/utils/finance';
export default function Transactions() {
  const router = useRouter();
  const { transactions, accounts, categories } = useFinance();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [account, setAccount] = useState(0);
  const [category, setCategory] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filters, setFilters] = useState(false);
  const invalid = Boolean(
    (from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)
  );
  const rows = transactions.filter(
    (t) =>
      t.description.toLowerCase().includes(search.toLowerCase()) &&
      (type === 'all' || t.type === type) &&
      (!account || t.account_id === account || t.destination_account_id === account) &&
      (!category || t.category_id === category) &&
      (!from || t.date >= from) &&
      (!to || t.date <= to)
  );
  let previous = '';
  return (
    <Screen
      title="Transactions"
      subtitle="The details behind your balance"
      action={() => router.push('/transaction/add')}>
      <Field
        label="Search description"
        placeholder="Coffee, salary, groceries…"
        value={search}
        onChangeText={setSearch}
      />
      <Choices
        label="Transaction type"
        value={type}
        onChange={setType}
        options={['all', 'expense', 'income', 'transfer'].map((v) => ({
          value: v,
          label: v[0].toUpperCase() + v.slice(1),
        }))}
      />
      <Button
        secondary
        title={filters ? 'Hide filters' : 'Account, category & date filters'}
        onPress={() => setFilters(!filters)}
      />
      {filters && (
        <>
          <Choices
            label="Account"
            value={account}
            onChange={setAccount}
            options={[
              { value: 0, label: 'All accounts' },
              ...accounts.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
          <Choices
            label="Category"
            value={category}
            onChange={setCategory}
            options={[
              { value: 0, label: 'All categories' },
              ...categories.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
          <Field label="From date (YYYY-MM-DD)" value={from} onChangeText={setFrom} />
          <Field label="To date (YYYY-MM-DD)" value={to} onChangeText={setTo} />
          <Button
            secondary
            title="Clear filters"
            onPress={() => {
              setAccount(0);
              setCategory(0);
              setFrom('');
              setTo('');
              setType('all');
              setSearch('');
            }}
          />
        </>
      )}
      {invalid ? (
        <Empty
          title="Check the date range"
          detail="Use valid YYYY-MM-DD dates, with the start before the end."
        />
      ) : rows.length ? (
        rows.map((t) => {
          const heading = previous !== t.date;
          previous = t.date;
          return <Labelled key={t.id} heading={heading ? t.date : undefined} item={t} />;
        })
      ) : (
        <Empty
          title="No transactions found"
          detail="Add a transaction or adjust your search and filters."
        />
      )}
    </Screen>
  );
}
function Labelled({
  heading,
  item,
}: {
  heading?: string;
  item: Parameters<typeof TransactionItem>[0]['item'];
}) {
  return (
    <>
      {heading && <Label>{heading}</Label>}
      <TransactionItem item={item} />
    </>
  );
}
