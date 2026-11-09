import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient, type Session, type User } from "@supabase/supabase-js";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coins,
  LoaderCircle,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";

type BalanceEntry = {
  id: string;
  user_id: string;
  amount: number;
  note: string | null;
  recorded_at: string;
  created_at: string;
};

type DateRange = "7D" | "30D" | "90D" | "6M" | "1Y" | "ALL";
type Notice = { kind: "success" | "error"; message: string };
type BalanceDraft = { amount: string; note: string; recordedAt: string };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const dateRanges: { key: DateRange; label: string }[] = [
  { key: "7D", label: "7 days" },
  { key: "30D", label: "30 days" },
  { key: "90D", label: "90 days" },
  { key: "6M", label: "6 months" },
  { key: "1Y", label: "1 year" },
  { key: "ALL", label: "All time" },
];

const amountFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const axisAmountFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatAmount(amount: number): string {
  return amountFormatter.format(amount);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function compareTimestamps(left: string, right: string): number {
  const millisecondDifference = Date.parse(left) - Date.parse(right);
  if (millisecondDifference !== 0) return millisecondDifference;
  const subMillisecondValue = (value: string) => {
    const fraction = value.match(/T\d{2}:\d{2}:\d{2}\.(\d+)/)?.[1] ?? "";
    return Number(fraction.slice(3, 9).padEnd(6, "0"));
  };
  return subMillisecondValue(left) - subMillisecondValue(right);
}

function formatAxisDate(value: number, range: DateRange): string {
  const options: Intl.DateTimeFormatOptions =
    range === "7D" || range === "30D"
      ? { day: "numeric", month: "short" }
      : { month: "short", year: "2-digit" };
  return new Intl.DateTimeFormat("en-IN", options).format(new Date(value));
}

function toLocalDateTimeValue(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getRangeStart(range: DateRange): number | null {
  const now = new Date();
  if (range === "ALL") return null;
  if (range === "7D" || range === "30D" || range === "90D") {
    const days = range === "7D" ? 7 : range === "30D" ? 30 : 90;
    return now.getTime() - days * 24 * 60 * 60 * 1_000;
  }
  now.setMonth(now.getMonth() - (range === "6M" ? 6 : 12));
  return now.getTime();
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function getDraft(entry?: BalanceEntry): BalanceDraft {
  return {
    amount: entry ? entry.amount.toFixed(2) : "",
    note: entry?.note ?? "",
    recordedAt: toLocalDateTimeValue(entry ? new Date(entry.recorded_at) : new Date()),
  };
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [entries, setEntries] = useState<BalanceEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<DateRange>("30D");
  const [historyRange, setHistoryRange] = useState<DateRange>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<BalanceEntry | null>(null);
  const [draft, setDraft] = useState<BalanceDraft>(getDraft);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [darkMode, setDarkMode] = useState(
    () => window.localStorage.getItem("balance-theme") === "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    window.localStorage.setItem("balance-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setNotice({ kind: "error", message: error.message });
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !supabase) {
      setEntries([]);
      setEntriesLoading(false);
      return;
    }

    let active = true;
    setEntriesLoading(true);
    void supabase
      .from("balance_history")
      .select("id, user_id, amount, note, recorded_at, created_at")
      .order("recorded_at", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setNotice({ kind: "error", message: `Couldn't load your history: ${error.message}` });
          setEntries([]);
        } else {
          setEntries(
            (data ?? []).map((entry) => ({
              ...entry,
              amount: Number(entry.amount),
            })) as BalanceEntry[],
          );
        }
        setEntriesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const orderedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          compareTimestamps(a.recorded_at, b.recorded_at) ||
          compareTimestamps(a.created_at, b.created_at) ||
          a.id.localeCompare(b.id),
      ),
    [entries],
  );
  const latest = orderedEntries.at(-1) ?? null;
  const previous = orderedEntries.at(-2) ?? null;
  const change = latest && previous ? latest.amount - previous.amount : null;
  const highest = orderedEntries.length
    ? orderedEntries.reduce((value, entry) => Math.max(value, entry.amount), -Infinity)
    : null;
  const lowest = orderedEntries.length
    ? orderedEntries.reduce((value, entry) => Math.min(value, entry.amount), Infinity)
    : null;
  const rangeStart = getRangeStart(range);
  const historyStart = getRangeStart(historyRange);
  const periodEntries = orderedEntries.filter(
    (entry) => rangeStart === null || new Date(entry.recorded_at).getTime() >= rangeStart,
  );
  const periodChange =
    periodEntries.length > 1
      ? periodEntries.at(-1)!.amount - periodEntries[0].amount
      : null;

  const matchingEntries = [...orderedEntries]
    .reverse()
    .filter((entry) => {
      const value = query.trim().toLowerCase();
      const matchesDate =
        historyStart === null || new Date(entry.recorded_at).getTime() >= historyStart;
      const matchesQuery =
        !value ||
        (entry.note ?? "").toLowerCase().includes(value) ||
        formatAmount(entry.amount).toLowerCase().includes(value) ||
        entry.amount.toFixed(2).includes(value);
      return matchesDate && matchesQuery;
    });
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(matchingEntries.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const visibleEntries = matchingEntries.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result =
        authMode === "signup"
          ? await supabase.auth.signUp({ email: authEmail, password: authPassword })
          : await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (result.error) throw result.error;
      if (authMode === "signup" && !result.data.session) {
        setNotice({
          kind: "success",
          message: "Account created. Check your email to confirm your address, then sign in.",
        });
        setAuthMode("signin");
      } else {
        setNotice({ kind: "success", message: "You're signed in. Your dashboard is ready." });
      }
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function signInWithProvider(provider: "google" | "github") {
    if (!supabase || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setNotice({
        kind: "success",
        message: `Redirecting to ${provider === "google" ? "Google" : "GitHub"} for sign in...`,
      });
    } catch (error) {
      setNotice({ kind: "error", message: safeErrorMessage(error) });
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setNotice({ kind: "error", message: `Couldn't sign out: ${error.message}` });
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || busy) return;
    const amount = Number(draft.amount);
    if (
      !draft.amount.trim() ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > 9_999_999_999_999.99 ||
      !/^\d+(\.\d{1,2})?$/.test(draft.amount.trim())
    ) {
      setNotice({
        kind: "error",
        message: "Enter a valid balance of ₹0 or more, with up to two decimal places.",
      });
      return;
    }
    const recordedAt = new Date(draft.recordedAt);
    if (!draft.recordedAt || Number.isNaN(recordedAt.getTime())) {
      setNotice({ kind: "error", message: "Choose a valid date and time for this entry." });
      return;
    }

    setBusy(true);
    setNotice(null);
    const entryData = {
      amount,
      note: draft.note.trim() || null,
      recorded_at: recordedAt.toISOString(),
    };
    try {
      const result = editing
        ? await supabase
            .from("balance_history")
            .update(entryData)
            .eq("id", editing.id)
            .eq("user_id", user.id)
            .select("id, user_id, amount, note, recorded_at, created_at")
            .single()
        : await supabase.from("balance_history").insert({
            ...entryData,
            user_id: user.id,
          }).select("id, user_id, amount, note, recorded_at, created_at").single();
      if (result.error) throw result.error;
      const savedEntry = { ...result.data, amount: Number(result.data.amount) } as BalanceEntry;
      setEntries((current) =>
        editing
          ? current.map((entry) => (entry.id === savedEntry.id ? savedEntry : entry))
          : [...current, savedEntry],
      );
      setEditing(null);
      setDraft(getDraft());
      setNotice({
        kind: "success",
        message: editing ? "Historical entry updated." : "Balance snapshot saved.",
      });
    } catch (error) {
      setNotice({ kind: "error", message: `Couldn't save this entry: ${safeErrorMessage(error)}` });
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(entry: BalanceEntry) {
    if (!window.confirm("Edit this historical balance entry? Your balance history will be recalculated.")) {
      return;
    }
    setEditing(entry);
    setDraft(getDraft(entry));
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteEntry(entry: BalanceEntry) {
    if (
      !supabase ||
      !user ||
      !window.confirm(
        `Delete the ${formatAmount(entry.amount)} entry from ${formatDateTime(entry.recorded_at)}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase
        .from("balance_history")
        .delete()
        .eq("id", entry.id)
        .eq("user_id", user.id)
        .select("id")
        .single();
      if (error) throw error;
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setNotice({ kind: "success", message: "Entry deleted. Your balance history has been updated." });
    } catch (error) {
      setNotice({ kind: "error", message: `Couldn't delete this entry: ${safeErrorMessage(error)}` });
    } finally {
      setBusy(false);
    }
  }

  function cancelEdit() {
    setEditing(null);
    setDraft(getDraft());
    setNotice(null);
  }

  if (!supabase) return <SetupScreen />;
  if (authLoading) return <LoadingScreen label="Preparing your secure dashboard" />;
  if (!user) {
    return (
      <AuthScreen
        mode={authMode}
        setMode={setAuthMode}
        email={authEmail}
        setEmail={setAuthEmail}
        password={authPassword}
        setPassword={setAuthPassword}
        onSubmit={submitAuth}
        onOAuthSignIn={signInWithProvider}
        busy={busy}
        notice={notice}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((value) => !value)}
      />
    );
  }

  const displayName = user.email?.split("@")[0] ?? "there";

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Balance home">
          <span className="brand-mark"><Wallet size={19} strokeWidth={2.2} /></span>
          <span className="brand-name">balance<span>.</span></span>
        </a>
        <div className="topbar-right">
          <div className="secure-label"><ShieldCheck size={14} /> Private &amp; secure</div>
          <span className="topbar-divider" />
          <button
            className="icon-button theme-toggle"
            onClick={() => setDarkMode((value) => !value)}
            aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
            title={`Switch to ${darkMode ? "light" : "dark"} mode`}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="user-avatar" title={user.email ?? ""}>
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <button className="signout-button" onClick={() => void signOut()}>
            <LogOut size={15} /><span>Sign out</span>
          </button>
        </div>
      </header>

      <div className="dashboard">
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="live-dot" /> YOUR PERSONAL OVERVIEW</div>
            <h1>A little more <span>in control.</span></h1>
            <p className="welcome-copy">
              Hey {displayName}, here's where things stand with your money.
            </p>
          </div>
          <div className="today-pill">
            <Clock3 size={15} />
            {new Intl.DateTimeFormat("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
            }).format(new Date())}
          </div>
        </section>

        {notice && <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />}

        <section className="top-grid" aria-label="Balance and quick update">
          <article className="balance-card">
            <div className="balance-card-glow" />
            <div className="balance-card-top">
              <span className="balance-label"><span className="balance-icon"><Wallet size={16} /></span> TOTAL BALANCE</span>
              <span className="balance-card-badge"><Sparkles size={13} /> YOUR SNAPSHOT</span>
            </div>
            {entriesLoading ? (
              <div className="balance-skeleton skeleton" />
            ) : (
              <div className="balance-amount">
                <span className="currency-sign">₹</span>
                <span>{latest ? new Intl.NumberFormat("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(latest.amount) : "0.00"}</span>
              </div>
            )}
            <div className="balance-card-bottom">
              <div className="last-updated">
                <span className="last-updated-dot" />
                {latest ? `Updated ${formatDateTime(latest.recorded_at)}` : "Your first snapshot is one quick update away"}
              </div>
              {change !== null && (
                <span className={`balance-change ${change >= 0 ? "positive" : "negative"}`}>
                  {change >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                  {change > 0 ? "+" : ""}{formatAmount(change)}
                  <span className="change-caption">vs. previous</span>
                </span>
              )}
            </div>
            <div className="balance-watermark"><Coins size={112} strokeWidth={0.75} /></div>
          </article>

          <section className={`entry-card ${editing ? "is-editing" : ""}`} aria-label={editing ? "Edit balance entry" : "Add a balance snapshot"}>
            <div className="entry-card-heading">
              <div className="entry-icon">{editing ? <Pencil size={17} /> : <Plus size={19} />}</div>
              <div>
                <h2>{editing ? "Edit this entry" : "Add a snapshot"}</h2>
                <p>{editing ? "A quick check-in with your history." : "A quick check-in is all it takes."}</p>
              </div>
              {editing && <button className="edit-cancel-icon" onClick={cancelEdit} aria-label="Cancel edit"><X size={17} /></button>}
            </div>
            <form className="balance-form" onSubmit={(event) => void saveEntry(event)}>
              <label className="field-label" htmlFor="amount">Your balance</label>
              <div className="amount-input-wrap">
                <span className="amount-input-symbol">₹</span>
                <input
                  id="amount"
                  className="amount-input"
                  inputMode="decimal"
                  type="number"
                  min="0"
                  max="9999999999999.99"
                  step="0.01"
                  placeholder="0.00"
                  value={draft.amount}
                  onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
                  required
                  disabled={busy || entriesLoading}
                />
              </div>
              <div className="form-two-col">
                <div>
                  <label className="field-label" htmlFor="recorded-at">Date &amp; time</label>
                  <input
                    id="recorded-at"
                    className="form-input"
                    type="datetime-local"
                    value={draft.recordedAt}
                    onChange={(event) => setDraft((current) => ({ ...current, recordedAt: event.target.value }))}
                    required
                    disabled={busy || entriesLoading}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="note">Note <span>optional</span></label>
                  <input
                    id="note"
                    className="form-input"
                    type="text"
                    maxLength={240}
                    placeholder="What's this for?"
                    value={draft.note}
                    onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                    disabled={busy || entriesLoading}
                  />
                </div>
              </div>
              <button className="submit-button" type="submit" disabled={busy || entriesLoading}>
                {busy ? <LoaderCircle className="spin" size={17} /> : editing ? <Check size={17} /> : <Plus size={18} />}
                {busy ? "Saving..." : editing ? "Save changes" : "Add balance"}
                {!busy && <ArrowRight className="submit-arrow" size={16} />}
              </button>
              <p className="form-footnote"><ShieldCheck size={13} /> Saved privately to your account</p>
            </form>
          </section>
        </section>

        <section className="stats-grid" aria-label="Balance statistics">
          <StatCard
            icon={<Wallet size={16} />}
            label="Previous balance"
            value={previous ? formatAmount(previous.amount) : "—"}
            detail={previous ? formatDateTime(previous.recorded_at) : "Add a second snapshot"}
            tint="blue"
            loading={entriesLoading}
          />
          <StatCard
            icon={<TrendingUp size={16} />}
            label="Highest recorded"
            value={highest !== null ? formatAmount(highest) : "—"}
            detail={entries.length ? "Across all snapshots" : "No history yet"}
            tint="green"
            loading={entriesLoading}
          />
          <StatCard
            icon={<ArrowDownRight size={16} />}
            label="Lowest recorded"
            value={lowest !== null ? formatAmount(lowest) : "—"}
            detail={entries.length ? "Across all snapshots" : "No history yet"}
            tint="amber"
            loading={entriesLoading}
          />
          <StatCard
            icon={<CircleHelp size={16} />}
            label="Total updates"
            value={String(entries.length)}
            detail={entries.length === 1 ? "One snapshot so far" : "Balance snapshots"}
            tint="purple"
            loading={entriesLoading}
          />
          <StatCard
            icon={periodChange === null || periodChange >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            label="Net change"
            value={periodChange !== null ? `${periodChange > 0 ? "+" : ""}${formatAmount(periodChange)}` : "—"}
            detail={periodEntries.length > 1 ? `Over the last ${dateRanges.find((item) => item.key === range)?.label}` : "Need two snapshots in period"}
            tint={periodChange === null || periodChange >= 0 ? "green" : "rose"}
            loading={entriesLoading}
            valueTone={periodChange !== null && periodChange < 0 ? "negative" : undefined}
          />
        </section>

        <section className="chart-card" aria-label="Balance history chart">
          <div className="section-heading chart-heading">
            <div>
              <div className="section-title-row"><span className="section-title-icon"><TrendingUp size={16} /></span><h2>Your balance over time</h2></div>
              <p className="section-subtitle">Every snapshot, exactly as you recorded it.</p>
            </div>
            <div className="range-switcher" role="group" aria-label="Chart date range">
              {dateRanges.map((item) => (
                <button
                  className={range === item.key ? "range-option selected" : "range-option"}
                  key={item.key}
                  onClick={() => setRange(item.key)}
                  aria-pressed={range === item.key}
                >
                  {item.key}
                </button>
              ))}
            </div>
          </div>
          {entriesLoading ? (
            <div className="chart-skeleton skeleton" />
          ) : periodEntries.length === 0 ? (
            <EmptyChart hasHistory={entries.length > 0} />
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={periodEntries.map((entry) => ({
                    ...entry,
                    timestamp: new Date(entry.recorded_at).getTime(),
                  }))}
                  margin={{ top: 22, right: 12, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6482f5" stopOpacity={0.21} />
                      <stop offset="100%" stopColor="#6482f5" stopOpacity={0.015} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="4 6" />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(value: number) => formatAxisDate(value, range)}
                    tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={13}
                    minTickGap={44}
                  />
                  <YAxis
                    tickFormatter={(value: number) => axisAmountFormatter.format(value)}
                    tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={10}
                    width={63}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--chart-cursor)", strokeDasharray: "4 4" }}
                    content={<ChartTooltip />}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    name="Balance"
                    stroke="#6b82ee"
                    strokeWidth={2.7}
                    fill="url(#balanceFill)"
                    activeDot={{ r: 5, fill: "#fff", stroke: "#6b82ee", strokeWidth: 2.5 }}
                    dot={periodEntries.length === 1 ? { r: 4, fill: "#6b82ee", stroke: "#fff", strokeWidth: 2 } : false}
                    isAnimationActive
                    animationDuration={450}
                  />
                  {latest && periodEntries.some((entry) => entry.id === latest.id) && (
                    <ReferenceDot
                      x={new Date(latest.recorded_at).getTime()}
                      y={latest.amount}
                      r={5}
                      fill="#6b82ee"
                      stroke="var(--card-bg)"
                      strokeWidth={3}
                      isFront
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="chart-footer">
            <div className="chart-legend"><span className="legend-dot" /> Balance</div>
            <span className="chart-count">{periodEntries.length} {periodEntries.length === 1 ? "snapshot" : "snapshots"} in this period</span>
          </div>
        </section>

        <section className="history-card" aria-label="Balance history">
          <div className="section-heading history-heading">
            <div>
              <div className="section-title-row"><span className="section-title-icon history-title-icon"><Clock3 size={16} /></span><h2>Your history</h2><span className="count-badge">{entries.length}</span></div>
              <p className="section-subtitle">The little moments that add up.</p>
            </div>
            <div className="history-filters">
              <label className="history-date-filter">
                <span className="visually-hidden">Filter history by date</span>
                <select
                  value={historyRange}
                  onChange={(event) => {
                    setHistoryRange(event.target.value as DateRange);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All dates</option>
                  {dateRanges.filter((item) => item.key !== "ALL").map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
                <ChevronRight className="filter-chevron" size={14} />
              </label>
              <label className="search-field">
                <Search size={16} />
                <input
                  type="search"
                  placeholder="Search notes or amounts"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Search balance history"
                />
                {query && <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
              </label>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>DATE &amp; TIME</th>
                  <th>BALANCE</th>
                  <th>CHANGE</th>
                  <th>NOTE</th>
                  <th className="actions-heading">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {entriesLoading ? (
                  <TableSkeleton />
                ) : visibleEntries.length === 0 ? (
                  <tr><td colSpan={5}><EmptyHistory hasHistory={entries.length > 0} filtered={Boolean(query) || historyRange !== "ALL"} /></td></tr>
                ) : (
                  visibleEntries.map((entry) => {
                    const index = orderedEntries.findIndex((item) => item.id === entry.id);
                    const prior = index > 0 ? orderedEntries[index - 1] : null;
                    const entryChange = prior ? entry.amount - prior.amount : null;
                    return (
                      <tr key={entry.id} className={latest?.id === entry.id ? "latest-row" : ""}>
                        <td>
                          <div className="date-cell">
                            <span className="date-cell-dot" />
                            <span>{formatDateTime(entry.recorded_at)}</span>
                            {latest?.id === entry.id && <span className="latest-tag">LATEST</span>}
                          </div>
                        </td>
                        <td><span className="table-amount">{formatAmount(entry.amount)}</span></td>
                        <td>
                          {entryChange === null ? (
                            <span className="no-change">—</span>
                          ) : (
                            <span className={`table-change ${entryChange >= 0 ? "positive" : "negative"}`}>
                              {entryChange >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                              {entryChange > 0 ? "+" : ""}{formatAmount(entryChange)}
                            </span>
                          )}
                        </td>
                        <td><span className={entry.note ? "note-cell" : "note-empty"}>{entry.note || "—"}</span></td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="row-action"
                              title="Edit entry"
                              aria-label={`Edit entry from ${formatDateTime(entry.recorded_at)}`}
                              onClick={() => beginEdit(entry)}
                              disabled={busy}
                            ><Pencil size={15} /></button>
                            <button
                              className="row-action delete-action"
                              title="Delete entry"
                              aria-label={`Delete entry from ${formatDateTime(entry.recorded_at)}`}
                              onClick={() => void deleteEntry(entry)}
                              disabled={busy}
                            ><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span className="table-result-count">
              {matchingEntries.length
                ? `Showing ${(visiblePage - 1) * pageSize + 1}–${Math.min(visiblePage * pageSize, matchingEntries.length)} of ${matchingEntries.length}`
                : query
                  ? "No matching entries"
                  : historyRange !== "ALL"
                    ? "No entries in this date range"
                  : "Your history will show up here"}
            </span>
            <div className="pagination">
              <button
                className="page-button"
                onClick={() => setPage((value) => Math.max(1, Math.min(value, pageCount) - 1))}
                disabled={visiblePage <= 1}
                aria-label="Previous page"
              ><ChevronLeft size={17} /></button>
              <span>{visiblePage} <span className="page-of">of</span> {pageCount}</span>
              <button
                className="page-button"
                onClick={() => setPage((value) => Math.min(pageCount, Math.min(value, pageCount) + 1))}
                disabled={visiblePage >= pageCount}
                aria-label="Next page"
              ><ChevronRight size={17} /></button>
            </div>
          </div>
        </section>

        <footer className="app-footer">
          <span>Small steps. A clearer picture.</span>
          <span><ShieldCheck size={13} /> Your finances stay yours.</span>
        </footer>
      </div>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  tint,
  loading,
  valueTone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tint: string;
  loading: boolean;
  valueTone?: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-card-top">
        <span className={`stat-icon ${tint}`}>{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      {loading ? (
        <div className="stat-skeleton skeleton" />
      ) : (
        <div className={`stat-value ${valueTone ?? ""}`}>{value}</div>
      )}
      <div className="stat-detail">{detail}</div>
    </article>
  );
}

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss?: () => void }) {
  return (
    <div className={`notice-banner ${notice.kind}`} role="status">
      <span className="notice-mark">{notice.kind === "success" ? <Check size={15} /> : <CircleHelp size={15} />}</span>
      <span>{notice.message}</span>
      {onDismiss && <button onClick={onDismiss} aria-label="Dismiss notification"><X size={16} /></button>}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { recorded_at: string; note: string | null } }>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-date">{formatDateTime(entry.recorded_at)}</div>
      <div className="tooltip-amount">{formatAmount(payload[0].value)}</div>
      {entry.note && <div className="tooltip-note">{entry.note}</div>}
    </div>
  );
}

function EmptyChart({ hasHistory }: { hasHistory: boolean }) {
  return (
    <div className="empty-chart">
      <div className="empty-chart-icon"><TrendingUp size={21} /></div>
      <p>{hasHistory ? "No snapshots in this date range" : "Your story starts with a snapshot"}</p>
      <span>{hasHistory ? "Try a longer time range to see your balance history." : "Add your current balance above and watch your progress take shape."}</span>
    </div>
  );
}

function EmptyHistory({ hasHistory, filtered }: { hasHistory: boolean; filtered: boolean }) {
  return (
    <div className="empty-history">
      <div className="empty-history-icon"><Search size={18} /></div>
      <strong>{hasHistory ? filtered ? "No matches just yet" : "Nothing to see here (yet)" : "Nothing to see here (yet)"}</strong>
      <span>{hasHistory ? filtered ? "Try another search or date range, or clear the filters." : "Your balance updates will find a home here." : "Your balance updates will find a home here."}</span>
    </div>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }, (_, index) => (
        <tr key={index} className="skeleton-row">
          <td><span className="skeleton skeleton-cell date-skeleton" /></td>
          <td><span className="skeleton skeleton-cell amount-skeleton" /></td>
          <td><span className="skeleton skeleton-cell change-skeleton" /></td>
          <td><span className="skeleton skeleton-cell note-skeleton" /></td>
          <td><span className="skeleton skeleton-cell actions-skeleton" /></td>
        </tr>
      ))}
    </>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="auth-page">
      <div className="auth-loading">
        <span className="brand-mark"><Wallet size={19} /></span>
        <LoaderCircle size={21} className="spin loading-icon" />
        <span>{label}</span>
      </div>
    </main>
  );
}

function SetupScreen() {
  return (
    <main className="setup-page">
      <div className="setup-card">
        <div className="setup-brand"><span className="brand-mark"><Wallet size={19} /></span><span className="brand-name">balance<span>.</span></span></div>
        <div className="setup-icon"><ShieldCheck size={23} /></div>
        <h1>One quick setup, then you're in.</h1>
        <p>Connect your Supabase project to create your private, persistent balance history.</p>
        <ol className="setup-steps">
          <li><span>1</span>Run <code>supabase/schema.sql</code> in your Supabase SQL Editor.</li>
          <li><span>2</span>Copy <code>.env.example</code> to <code>.env</code>.</li>
          <li><span>3</span>Add your project URL and publishable key, then restart the app.</li>
        </ol>
        <div className="setup-foot"><ShieldCheck size={14} /> Your data stays protected by Supabase RLS.</div>
      </div>
    </main>
  );
}

function AuthScreen({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  onSubmit,
  onOAuthSignIn,
  busy,
  notice,
  darkMode,
  onToggleTheme,
}: {
  mode: "signin" | "signup";
  setMode: (mode: "signin" | "signup") => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOAuthSignIn: (provider: "google" | "github") => void;
  busy: boolean;
  notice: Notice | null;
  darkMode: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <a className="brand" href="#" aria-label="Balance home">
          <span className="brand-mark"><Wallet size={19} /></span>
          <span className="brand-name">balance<span>.</span></span>
        </a>
        <button className="icon-button" onClick={onToggleTheme} aria-label="Toggle dark mode">
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>
      <div className="auth-layout">
        <section className="auth-aside">
          <div className="eyebrow"><span className="live-dot" /> A CALMER WAY TO KEEP TRACK</div>
          <h1>Know where you stand.<br /><span>Feel good about it.</span></h1>
          <p>One little snapshot at a time, your financial picture gets a whole lot clearer.</p>
          <div className="auth-preview">
            <div className="preview-heading"><span><span className="preview-dot" /> YOUR BALANCE</span><Sparkles size={15} /></div>
            <div className="preview-amount">₹ 2,84,500<span>.00</span></div>
            <div className="preview-footer"><span>Looking steady</span><span className="preview-growth"><ArrowUpRight size={14} /> +8.2%</span></div>
            <div className="preview-chart">
              <svg viewBox="0 0 450 90" preserveAspectRatio="none" aria-hidden="true">
                <defs><linearGradient id="previewGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8da4ff" stopOpacity=".33" /><stop offset="100%" stopColor="#8da4ff" stopOpacity="0" /></linearGradient></defs>
                <path d="M0 72 C30 66 40 77 69 60 S112 68 142 47 S185 56 216 37 S260 50 292 31 S330 47 360 23 S405 34 450 10 L450 90 L0 90 Z" fill="url(#previewGradient)" />
                <path d="M0 72 C30 66 40 77 69 60 S112 68 142 47 S185 56 216 37 S260 50 292 31 S330 47 360 23 S405 34 450 10" fill="none" stroke="#90a5ff" strokeWidth="2.5" />
              </svg>
            </div>
          </div>
          <div className="auth-reassurance"><ShieldCheck size={16} /><span>Private by design. Only you can see your history.</span></div>
        </section>
        <section className="auth-card">
          <div className="auth-card-heading">
            <span className="auth-card-icon">{mode === "signin" ? <Wallet size={20} /> : <Sparkles size={20} />}</span>
            <div className="eyebrow">YOUR MONEY, IN PERSPECTIVE</div>
            <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
            <p>{mode === "signin" ? "Sign in to pick up right where you left off." : "Create an account to start tracking your balance."}</p>
          </div>
          {notice && <NoticeBanner notice={notice} />}
          <form className="auth-form password-auth-form" onSubmit={(event) => void onSubmit(event)}>
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={busy}
            />
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              placeholder={mode === "signin" ? "Your password" : "At least 8 characters"}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={busy}
            />
            <button type="submit" className="submit-button auth-submit" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
              {busy ? "One moment..." : mode === "signin" ? "Sign in with email" : "Create account"}
            </button>
          </form>
          <div className="auth-switch">
            {mode === "signin" ? "New around here?" : "Already have an account?"}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
              }}
              disabled={busy}
            >
              {mode === "signin" ? "Create an account" : "Sign in"} <ArrowRight size={13} />
            </button>
          </div>
          <div className="auth-divider"><span>Or continue with</span></div>
          <div className="auth-form oauth-form">
            <button type="button" className="oauth-button google-button" onClick={() => onOAuthSignIn("google")} disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.53 12.23c0-.7-.06-1.37-.18-2.01H12v3.8h5.39a4.62 4.62 0 0 1-2 3.04v2.52h3.24c1.9-1.75 2.99-4.33 2.99-7.35Z" /><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.44l-3.24-2.52c-.9.61-2.05.97-3.37.97-2.59 0-4.79-1.75-5.58-4.1H.95v2.6A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.42 19.93A6.04 6.04 0 0 1 6 16.7V14.1H2.8A10 10 0 0 0 2 12c0-1.62.39-3.15 1.08-4.5L6.42 10.1a6.02 6.02 0 0 1 0 9.83Z" /><path fill="#EA4335" d="M12 3.98c1.47 0 2.8.51 3.85 1.5l2.88-2.88A9.92 9.92 0 0 0 12 2a10 10 0 0 0-9.05 5.5L6.4 10.1A6.02 6.02 0 0 1 12 3.98Z" /></svg>}
              Continue with Google
            </button>
            <button type="button" className="oauth-button github-button" onClick={() => onOAuthSignIn("github")} disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .8a12 12 0 0 0-3.79 23.38c.6.11.82-.26.82-.57v-2.02c-3.34.73-4.04-1.6-4.04-1.6-.54-1.38-1.31-1.75-1.31-1.75-1.08-.74.08-.73.08-.73 1.2.09 1.83 1.25 1.83 1.25 1.06 1.82 2.78 1.3 3.46.99.11-.78.42-1.3.75-1.6-2.66-.3-5.46-1.33-5.46-5.9 0-1.3.46-2.37 1.22-3.2-.12-.3-.53-1.52.12-3.16 0 0 1-.32 3.3 1.23a11.31 11.31 0 0 1 6 0c2.29-1.55 3.29-1.23 3.29-1.23.66 1.64.25 2.87.12 3.16.76.83 1.22 1.9 1.22 3.2 0 4.58-2.8 5.6-5.47 5.9.43.37.81 1.1.81 2.22v3.29c0 .31.21.68.83.56A12 12 0 0 0 12 .8Z"/></svg>}
              Continue with GitHub
            </button>
          </div>
          <div className="auth-foot"><ShieldCheck size={13} /> Secured with Supabase authentication.</div>
        </section>
      </div>
      <div className="auth-page-footer"><span>Thoughtful money tracking, minus the noise.</span><span>Made for your peace of mind <span className="footer-spark">✳</span></span></div>
    </main>
  );
}

export default App;
