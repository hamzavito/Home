import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChefHat,
  CheckSquare,
  ListPlus,
  Pause,
  PiggyBank,
  Play,
  Plus,
  Repeat,
  Settings,
  Undo2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, SelectInput, TextInput } from "@/components/ui/Field";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Spinner";
import { EventRow } from "@/features/calendar/EventRow";
import { useEvents, useTasks, type Task } from "@/features/home/api";
import { TaskRow } from "@/features/home/TaskRow";
import {
  useHousehold,
  type HouseholdMember,
} from "@/features/household/HouseholdProvider";
import { useWeek } from "@/features/mealplan/api";
import { genitive } from "@/features/settings/MemberPage";
import {
  describeAllowance,
  nextAllowance,
  rewardStatusLabels,
  weekdayNames,
} from "@/lib/allowance";
import { cn } from "@/lib/cn";
import {
  dayLabel,
  formatShortDate,
  fromIsoDate,
  monthKey,
  toIsoDate,
} from "@/lib/dates";
import { addDaysIso, compareEvents, taskBucket } from "@/lib/home";
import { formatAmount, parseKr, toInputValue } from "@/lib/money";
import { weekStart } from "@/lib/recipes";
import {
  goalSaved,
  walletBalance,
  walletKindLabels,
  walletMonth,
} from "@/lib/wallet";
import type { WalletKind } from "@/types/database";
import {
  useAddWalletTx,
  useAllowances,
  useAwaitingRewards,
  useCreateAllowance,
  useCreateChildGoal,
  useDecideReward,
  useSetAllowanceState,
  useUpdateAllowance,
  useVoidWalletTx,
  useWallet,
  walletErrorMessage,
  type ChildAllowance,
  type WalletTransaction,
} from "./api";
import { GoalSheets, type MoneySheet } from "./ChildPages";
import {
  AmountForm,
  ChildGoalCard,
  GoalForm,
  WalletTxRow,
} from "./WalletParts";

const giveKinds: Array<{ value: WalletKind; label: string }> = [
  { value: "allowance", label: walletKindLabels.allowance },
  { value: "deposit", label: walletKindLabels.deposit },
  { value: "deduction", label: walletKindLabels.deduction },
  { value: "purchase", label: walletKindLabels.purchase },
];

type Sheet =
  | MoneySheet
  | { kind: "give" }
  | { kind: "void"; tx: WalletTransaction }
  | { kind: "allowance-new" }
  | { kind: "allowance"; schedule: ChildAllowance };

/** Forældrenes samlede overblik over ét barn */
export function ChildDashboardPage() {
  const { id } = useParams();
  const household = useHousehold();
  const child = household.children.find((c) => c.userId === id);
  if (!child)
    return (
      <>
        <PageHeader title="Barn" back="/hjemmet" />
        <EmptyState icon={UserRound} title="Barnet findes ikke" />
      </>
    );
  return (
    <Dashboard
      key={child.userId}
      child={child}
      index={household.members.indexOf(child)}
      isOwner={household.me.role === "owner"}
    />
  );
}

function Dashboard({
  child,
  index,
  isOwner,
}: {
  child: HouseholdMember;
  index: number;
  isOwner: boolean;
}) {
  const navigate = useNavigate();
  const today = toIsoDate(new Date());
  const wallet = useWallet(child.userId);
  const tasks = useTasks();
  const events = useEvents(today, addDaysIso(today, 7));
  const meals = useWeek(weekStart(today));
  const allowances = useAllowances(child.userId);
  const pending = useAwaitingRewards();
  const add = useAddWalletTx();
  const voidTx = useVoidWalletTx();
  const createGoal = useCreateChildGoal();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [kind, setKind] = useState<WalletKind>("allowance");

  const name = child.displayName;
  const names = genitive(name);
  const txs = wallet.data?.transactions ?? [];
  const allGoals = wallet.data?.goals ?? [];
  const goals = allGoals.filter((g) => !g.archived_at);
  const balance = walletBalance(txs);
  const month = walletMonth(txs, monthKey(new Date()));
  const mine = (list: Task[] | undefined) =>
    (list ?? []).filter((t) => t.assignee_id === child.userId);
  const active = mine(tasks.data?.active);
  const done = mine(tasks.data?.done);
  const awaiting = (pending.data ?? []).filter(
    (t) => t.assignee_id === child.userId,
  );
  const thisWeek = active.filter((t) =>
    ["overdue", "today", "week"].includes(taskBucket(t.due_on, today)),
  );
  const later = active.filter((t) => !thisWeek.includes(t));
  const childEvents = (events.data ?? [])
    .filter(
      (e) =>
        e.participant_ids.length === 0 ||
        e.participant_ids.includes(child.userId),
    )
    .sort(compareEvents);
  const dinner = (meals.data ?? []).filter((m) => m.plan_date === today);
  const schedules = (allowances.data?.schedules ?? []).filter(
    (s) => !s.stopped_at,
  );
  const payouts = allowances.data?.payouts ?? [];

  function close() {
    setSheet(null);
    add.reset();
    voidTx.reset();
    createGoal.reset();
  }

  return (
    <>
      <PageHeader
        title={name}
        eyebrow="Barnets overblik"
        back="/hjemmet"
        action={
          <Link
            to={`/indstillinger/medlem/${child.userId}`}
            aria-label={`Indstillinger for ${name}`}
            className="pressable flex size-10 items-center justify-center rounded-full bg-surface-primary shadow-card"
          >
            <Settings className="size-5" />
          </Link>
        }
      />

      <div className="rounded-card-lg bg-surface-inverse p-5 text-on-inverse shadow-raised">
        <div className="flex items-start gap-3">
          <Avatar
            name={name}
            color={child.color}
            index={index}
            className="size-10 text-[15px]"
          />
          {child.walletEnabled ? (
            <div className="min-w-0">
              <p className="text-[14px] font-semibold">{names} saldo</p>
              {wallet.isPending ? (
                <Skeleton className="mt-2 h-11 w-36" />
              ) : (
                <Money ore={balance} size="hero" className="mt-1 block" />
              )}
            </div>
          ) : (
            <div className="min-w-0">
              <p className="truncate text-[22px] font-bold">{name}</p>
              <p className="text-[14px]">
                {child.noLogin
                  ? "Uden eget login · uden lommepenge"
                  : "Uden lommepenge"}
              </p>
            </div>
          )}
        </div>
        {child.walletEnabled && (
          <p className="tabular mt-3 text-[14px]">
            Denne måned: +{formatAmount(month.inOre)} kr. ind · −
            {formatAmount(month.outOre)} kr. brugt
          </p>
        )}
        {child.disabled && (
          <p className="mt-2 text-[13px] font-semibold">Login er slået fra</p>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button
          variant="surface"
          onClick={() => navigate(`/hjemmet/ny?ansvarlig=${child.userId}`)}
        >
          <ListPlus className="size-4.5" /> Tildel opgave
        </Button>
        <Button
          variant="surface"
          onClick={() =>
            navigate(`/hjemmet/kalender/ny?deltager=${child.userId}`)
          }
        >
          <CalendarPlus className="size-4.5" /> Ny aftale
        </Button>
      </div>
      {child.walletEnabled && (
        <Button
          block
          className="mt-3"
          onClick={() => setSheet({ kind: "give" })}
          disabled={wallet.isPending}
        >
          <Wallet className="size-5" /> Giv eller træk penge
        </Button>
      )}

      {awaiting.length > 0 && (
        <>
          <SectionHeader title="Afventer godkendelse" />
          <div className="space-y-3">
            {awaiting.map((t) => (
              <ApprovalCard key={t.id} task={t} />
            ))}
          </div>
        </>
      )}

      <SectionHeader
        title="Opgaver"
        to={`/hjemmet/ny?ansvarlig=${child.userId}`}
        linkLabel="Ny"
      />
      {tasks.isPending ? (
        <Skeleton className="h-32 rounded-card" />
      ) : active.length === 0 ? (
        <Card variant="tonal">
          <EmptyState
            compact
            icon={CheckSquare}
            title="Ingen opgaver mangler"
            text={`${name} har ingen åbne opgaver.`}
          />
        </Card>
      ) : (
        <>
          {thisWeek.length > 0 && (
            <TaskGroup title="Mangler i dag og denne uge" tasks={thisWeek} />
          )}
          {later.length > 0 && (
            <TaskGroup title="Mangler senere" tasks={later} />
          )}
        </>
      )}
      {done.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-secondary">
            Udført
          </h3>
          <Card padded={false} className="divide-y divide-subtle">
            {done.map((t) => (
              <DoneRow key={t.id} task={t} />
            ))}
          </Card>
        </section>
      )}

      <SectionHeader title="Kalender" to="/hjemmet/kalender" linkLabel="Alle" />
      {events.isPending ? (
        <Skeleton className="h-20 rounded-card" />
      ) : childEvents.length === 0 ? (
        <Card variant="tonal">
          <EmptyState
            compact
            icon={CalendarDays}
            title="Ingen aftaler de næste 7 dage"
          />
        </Card>
      ) : (
        <Card padded={false} className="divide-y divide-subtle">
          {childEvents.map((e) => (
            <EventRow
              key={e.id}
              e={e}
              showDate={e.end_date ? undefined : dayLabel(e.event_date)}
            />
          ))}
        </Card>
      )}

      <SectionHeader title="I aften" />
      <Card padded={false}>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-notice-soft text-notice">
            <ChefHat className="size-5" strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1 text-[16px] font-semibold">
            {meals.isPending
              ? " "
              : dinner.length
                ? dinner.map((m) => m.title).join(", ")
                : "Intet planlagt"}
          </span>
        </div>
      </Card>

      {child.walletEnabled && (
        <>
          <SectionHeader
            title="Faste lommepenge"
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSheet({ kind: "allowance-new" })}
              >
                <Plus className="size-4" /> Opret
              </Button>
            }
          />
          {allowances.isPending ? (
            <Skeleton className="h-20 rounded-card" />
          ) : schedules.length === 0 ? (
            <Card variant="tonal">
              <EmptyState
                compact
                icon={Repeat}
                title="Ingen faste lommepenge"
                text="Fx 50 kr. hver fredag – udbetales automatisk."
              >
                <Button
                  size="sm"
                  variant="surface"
                  onClick={() => setSheet({ kind: "allowance-new" })}
                >
                  Opret fast lommepenge
                </Button>
              </EmptyState>
            </Card>
          ) : (
            <div className="space-y-3">
              {schedules.map((s) => {
                const paid = new Set(
                  payouts
                    .filter((p) => p.schedule_id === s.id)
                    .map((p) => p.period_key),
                );
                const next = nextAllowance(s, today, paid);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSheet({ kind: "allowance", schedule: s })}
                    className="pressable flex w-full items-center gap-3 rounded-card bg-surface-primary p-4 text-left shadow-card"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-positive-soft text-positive">
                      <Repeat className="size-5" strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="tabular block text-[17px] font-bold">
                        {formatAmount(s.amount_ore)} kr.
                      </span>
                      <span className="block text-[13px] text-secondary">
                        {describeAllowance(s)}
                        {s.paused_at
                          ? " · På pause"
                          : next
                            ? ` · Næste: ${formatShortDate(fromIsoDate(next))}`
                            : " · Ingen flere udbetalinger"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {payouts.length > 0 && (
            <p className="mt-2 px-1 text-[13px] text-secondary">
              Seneste automatiske udbetaling:{" "}
              {formatShortDate(fromIsoDate(payouts[0]!.due_on))} ·{" "}
              {formatAmount(payouts[0]!.amount_ore)} kr.
            </p>
          )}

          <SectionHeader title="Seneste bevægelser" />
          {wallet.isPending ? (
            <Skeleton className="h-40 rounded-card" />
          ) : txs.length === 0 ? (
            <Card variant="tonal">
              <EmptyState
                compact
                icon={Wallet}
                title="Ingen bevægelser endnu"
              />
            </Card>
          ) : (
            <Card padded={false} className="divide-y divide-subtle">
              {txs.slice(0, 15).map((t) => (
                <WalletTxRow
                  key={t.id}
                  tx={t}
                  goals={allGoals}
                  action={
                    t.voided_at === null ? (
                      <button
                        type="button"
                        aria-label={`Fortryd ${walletKindLabels[t.kind].toLowerCase()} ${formatAmount(t.amount_ore)} kr.`}
                        onClick={() => setSheet({ kind: "void", tx: t })}
                        className="pressable -mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-secondary"
                      >
                        <Undo2 className="size-4.5" />
                      </button>
                    ) : (
                      <span className="size-8 shrink-0" />
                    )
                  }
                />
              ))}
            </Card>
          )}

          <SectionHeader
            title="Opsparingsmål"
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSheet({ kind: "new-goal" })}
              >
                <Plus className="size-4" /> Nyt mål
              </Button>
            }
          />
          {goals.length === 0 ? (
            <Card variant="tonal">
              <EmptyState
                compact
                icon={PiggyBank}
                title="Ingen mål"
                text={`${name} kan selv oprette mål, eller I kan gøre det her.`}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {goals.map((g) => (
                <ChildGoalCard
                  key={g.id}
                  goal={g}
                  savedOre={goalSaved(txs, g.id)}
                  onClick={() => setSheet({ kind: "goal", goal: g })}
                />
              ))}
            </div>
          )}
        </>
      )}
      {isOwner && (
        <p className="mt-6 px-1 text-center text-[13px] text-secondary">
          {child.noLogin
            ? "Login og lommepenge"
            : "Login, PIN, brugernavn og lommepenge"}{" "}
          styres under{" "}
          <Link
            to={`/indstillinger/medlem/${child.userId}`}
            className="font-semibold text-accent-text"
          >
            indstillinger
          </Link>
          .
        </p>
      )}

      {/* ---------------------------------------------------------------- ark */}
      <BottomSheet
        open={sheet?.kind === "give"}
        onClose={close}
        title={`Penge til ${name}`}
      >
        {sheet?.kind === "give" && (
          <AmountForm
            submitLabel="Gem"
            notePlaceholder="Fx ugens lommepenge"
            pending={add.isPending}
            error={add.isError ? walletErrorMessage(add.error) : null}
            onSubmit={(ore, note) =>
              add.mutate(
                { childId: child.userId, kind, amountOre: ore, note },
                { onSuccess: close },
              )
            }
          >
            <div
              role="radiogroup"
              aria-label="Type"
              className="flex flex-wrap gap-2"
            >
              {giveKinds.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === o.value}
                  onClick={() => setKind(o.value)}
                  className={cn(
                    "pressable h-10 rounded-full px-4 text-[14px] font-semibold transition-colors",
                    kind === o.value
                      ? "bg-accent text-on-accent"
                      : "bg-surface-secondary text-primary",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="px-1 text-[13px] text-secondary">
              {kind === "allowance" || kind === "deposit"
                ? "Lægges til saldoen."
                : "Trækkes fra saldoen."}
            </p>
          </AmountForm>
        )}
      </BottomSheet>
      <BottomSheet
        open={sheet?.kind === "new-goal"}
        onClose={close}
        title={`Nyt mål for ${name}`}
      >
        {sheet?.kind === "new-goal" && (
          <GoalForm
            pending={createGoal.isPending}
            error={
              createGoal.isError ? walletErrorMessage(createGoal.error) : null
            }
            onSubmit={(goalName, targetOre) =>
              createGoal.mutate(
                { childId: child.userId, name: goalName, targetOre },
                { onSuccess: close },
              )
            }
          />
        )}
      </BottomSheet>
      <BottomSheet
        open={sheet?.kind === "void"}
        onClose={close}
        title="Fortryd bevægelse?"
      >
        {sheet?.kind === "void" && (
          <>
            <p className="text-[15px] text-secondary">
              {walletKindLabels[sheet.tx.kind]} på{" "}
              {formatAmount(sheet.tx.amount_ore)} kr. fortrydes. Den bliver
              stående i historikken som fortrudt.
            </p>
            {voidTx.isError && (
              <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">
                {walletErrorMessage(voidTx.error)}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={close}>
                Annullér
              </Button>
              <Button
                variant="danger"
                loading={voidTx.isPending}
                onClick={() => voidTx.mutate(sheet.tx.id, { onSuccess: close })}
              >
                Fortryd
              </Button>
            </div>
          </>
        )}
      </BottomSheet>
      <BottomSheet
        open={sheet?.kind === "allowance-new"}
        onClose={close}
        title="Ny fast ordning"
      >
        {sheet?.kind === "allowance-new" && (
          <AllowanceForm childId={child.userId} onDone={close} />
        )}
      </BottomSheet>
      <BottomSheet
        open={sheet?.kind === "allowance"}
        onClose={close}
        title={
          sheet?.kind === "allowance"
            ? describeAllowance(sheet.schedule)
            : undefined
        }
      >
        {sheet?.kind === "allowance" && (
          <AllowanceManage
            schedule={sheet.schedule}
            history={payouts.filter((p) => p.schedule_id === sheet.schedule.id)}
            today={today}
            onDone={close}
          />
        )}
      </BottomSheet>
      <GoalSheets
        sheet={
          sheet && ["goal", "to-goal", "from-goal"].includes(sheet.kind)
            ? (sheet as MoneySheet)
            : null
        }
        setSheet={setSheet}
        close={close}
        childId={child.userId}
        balance={balance}
        txs={txs}
      />
    </>
  );
}

function TaskGroup({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <section className="mt-1 [&+section]:mt-5">
      <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-secondary">
        {title}
      </h3>
      <Card padded={false} className="divide-y divide-subtle">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </Card>
    </section>
  );
}

/** Udført opgave med belønningsstatus */
function DoneRow({ task }: { task: Task }) {
  return (
    <Link
      to={`/hjemmet/opgave/${task.id}`}
      className="flex items-center gap-3 px-4 py-3 active:bg-surface-secondary"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
        <Check className="size-4" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold">
          {task.title}
        </span>
        {task.reward_ore !== null && (
          <span className="block text-[13px] text-secondary">
            {formatAmount(task.reward_ore)} kr. ·{" "}
            {rewardStatusLabels[task.reward_status]}
          </span>
        )}
      </span>
    </Link>
  );
}

/** Belønning der venter: Godkend og udbetal / Afvis */
function ApprovalCard({ task }: { task: Task }) {
  const decide = useDecideReward();
  return (
    <div
      className="rounded-card bg-surface-primary p-4 shadow-card"
      aria-label={`Afventer godkendelse: ${task.title}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 break-words text-[16px] font-semibold">
          {task.title}
        </p>
        <span className="tabular shrink-0 text-[17px] font-bold text-positive">
          {formatAmount(task.reward_ore ?? 0)} kr.
        </span>
      </div>
      <p className="mt-0.5 text-[13px] text-secondary">
        Markeret som færdig
        {task.completed_at
          ? ` ${dayLabel(task.completed_at.slice(0, 10))}`
          : ""}
        . Pengene udbetales først, når I godkender.
      </p>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <Button
          size="sm"
          className="h-11"
          loading={decide.isPending && decide.variables?.approve}
          disabled={decide.isPending}
          onClick={() => decide.mutate({ taskId: task.id, approve: true })}
        >
          <Check className="size-4" strokeWidth={3} /> Godkend og udbetal
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-11"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ taskId: task.id, approve: false })}
        >
          <X className="size-4" /> Afvis
        </Button>
      </div>
      {decide.isError && (
        <p className="mt-2 text-[13px] text-danger">
          Det kunne ikke gemmes. Prøv igen.
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ faste lommepenge
const monthDays = [
  ...Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1),
    label: `Den ${i + 1}.`,
  })),
  { value: "0", label: "Sidste dag i måneden" },
];

function AllowanceForm({
  childId,
  onDone,
}: {
  childId: string;
  onDone: () => void;
}) {
  const create = useCreateAllowance();
  const today = toIsoDate(new Date());
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");
  const [weekday, setWeekday] = useState(5);
  const [monthDay, setMonthDay] = useState("1");
  const [startOn, setStartOn] = useState(today);
  const [endOn, setEndOn] = useState("");
  const ore = parseKr(amount);
  const amountError =
    amount.trim() && (ore === null || ore < 100)
      ? "Skriv et beløb på mindst 1 kr."
      : null;
  const endError =
    endOn && endOn < startOn ? "Slutdatoen skal være efter startdatoen" : null;
  const valid =
    ore !== null &&
    ore >= 100 &&
    ore <= 10_000_000 &&
    Boolean(startOn) &&
    !endError;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    create.mutate(
      {
        childId,
        amountOre: ore,
        frequency,
        weekday,
        monthDay: Number(monthDay),
        startOn,
        endOn: endOn || null,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Beløb" error={amountError}>
        <TextInput
          value={amount}
          inputMode="decimal"
          placeholder="Fx 50"
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </Field>
      <div>
        <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">
          Hvor ofte
        </p>
        <SegmentedControl
          label="Hvor ofte"
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: "weekly", label: "Ugentligt" },
            { value: "monthly", label: "Månedligt" },
          ]}
        />
      </div>
      {frequency === "weekly" ? (
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">
            Ugedag
          </p>
          <div
            role="radiogroup"
            aria-label="Ugedag"
            className="flex flex-wrap gap-2"
          >
            {weekdayNames.map((n, i) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={weekday === i + 1}
                aria-label={n}
                onClick={() => setWeekday(i + 1)}
                className={cn(
                  "pressable h-10 min-w-11 rounded-full px-3 text-[14px] font-semibold capitalize",
                  weekday === i + 1
                    ? "bg-accent text-on-accent"
                    : "bg-surface-secondary text-primary",
                )}
              >
                {n.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Field
          label="Dag i måneden"
          hint="Findes datoen ikke i en måned, bruges sidste dag."
        >
          <SelectInput
            value={monthDay}
            onChange={(e) => setMonthDay(e.target.value)}
          >
            {monthDays.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </SelectInput>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Startdato">
          <TextInput
            type="date"
            value={startOn}
            onChange={(e) => setStartOn(e.target.value)}
          />
        </Field>
        <Field label="Slutdato (valgfri)" error={endError}>
          <TextInput
            type="date"
            value={endOn}
            min={startOn}
            onChange={(e) => setEndOn(e.target.value)}
          />
        </Field>
      </div>
      <p className="px-1 text-[13px] text-secondary">
        Udbetales automatisk på dagen. Forfalder den i dag, udbetales den med
        det samme.
      </p>
      {create.isError && (
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">
          Det kunne ikke gemmes. Prøv igen.
        </p>
      )}
      <Button type="submit" block disabled={!valid} loading={create.isPending}>
        Opret fast lommepenge
      </Button>
    </form>
  );
}

function AllowanceManage({
  schedule: s,
  history,
  today,
  onDone,
}: {
  schedule: ChildAllowance;
  history: Array<{ due_on: string; amount_ore: number; period_key: string }>;
  today: string;
  onDone: () => void;
}) {
  const update = useUpdateAllowance();
  const setState = useSetAllowanceState();
  const [amount, setAmount] = useState(toInputValue(s.amount_ore));
  const [endOn, setEndOn] = useState(s.end_on ?? "");
  const [confirmStop, setConfirmStop] = useState(false);
  const ore = parseKr(amount);
  const changed = ore !== s.amount_ore || (endOn || null) !== s.end_on;
  const valid =
    ore !== null &&
    ore >= 100 &&
    ore <= 10_000_000 &&
    (!endOn || endOn >= s.start_on);
  const next = nextAllowance(
    s,
    today,
    new Set(history.map((h) => h.period_key)),
  );
  const busy = update.isPending || setState.isPending;

  return (
    <div className="space-y-4">
      <p className="text-[15px] text-secondary">
        {s.paused_at
          ? "På pause – der udbetales ikke, før du genoptager."
          : next
            ? `Næste udbetaling: ${dayLabel(next)} (${formatShortDate(fromIsoDate(next))}).`
            : "Ingen flere udbetalinger."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Beløb (kr.)">
          <TextInput
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Slutdato (valgfri)">
          <TextInput
            type="date"
            value={endOn}
            min={s.start_on}
            onChange={(e) => setEndOn(e.target.value)}
          />
        </Field>
      </div>
      <Button
        block
        disabled={!changed || !valid || busy}
        loading={update.isPending}
        onClick={() =>
          ore !== null &&
          update.mutate(
            { id: s.id, amountOre: ore, endOn: endOn || null },
            { onSuccess: onDone },
          )
        }
      >
        Gem ændringer
      </Button>
      <p className="-mt-2 px-1 text-[13px] text-secondary">
        Ændringer gælder kun fremtidige udbetalinger.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {s.paused_at ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              setState.mutate(
                { id: s.id, action: "resume" },
                { onSuccess: onDone },
              )
            }
          >
            <Play className="size-4" /> Genoptag
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              setState.mutate(
                { id: s.id, action: "pause" },
                { onSuccess: onDone },
              )
            }
          >
            <Pause className="size-4" /> Pause
          </Button>
        )}
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => setConfirmStop(true)}
        >
          Stop
        </Button>
      </div>
      {confirmStop && (
        <div className="rounded-2xl bg-danger-soft p-4">
          <p className="text-[14px] font-medium text-danger">
            Stop de faste lommepenge for altid? Tidligere udbetalinger bevares.
          </p>
          <Button
            variant="danger"
            block
            className="mt-3"
            loading={setState.isPending}
            onClick={() =>
              setState.mutate(
                { id: s.id, action: "stop" },
                { onSuccess: onDone },
              )
            }
          >
            Ja, stop
          </Button>
        </div>
      )}
      {(update.isError || setState.isError) && (
        <p className="text-[13px] text-danger">
          Det kunne ikke gemmes. Prøv igen.
        </p>
      )}
      {history.length > 0 && (
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">
            Historik
          </p>
          <ul className="divide-y divide-subtle overflow-hidden rounded-2xl bg-surface-secondary">
            {history.slice(0, 12).map((h) => (
              <li
                key={h.period_key}
                className="tabular flex justify-between px-4 py-2.5 text-[14px]"
              >
                <span>{formatShortDate(fromIsoDate(h.due_on))}</span>
                <span className="font-semibold">
                  +{formatAmount(h.amount_ore)} kr.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
