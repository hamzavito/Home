import {
  CheckCircle2,
  KeyRound,
  Power,
  Trash2,
  UserPen,
  Wallet,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { ListGroup, ListRow } from "@/components/ui/ListRow";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toggle } from "@/components/ui/Toggle";
import {
  childAdminMessage,
  useAddChildLogin,
  useCreateChild,
  useCreateChildWithoutLogin,
  useDeleteChild,
  useLoginCode,
  useSetChildDisabled,
  useSetChildPin,
  useSetChildUsername,
  useSetChildWallet,
} from "@/features/child/api";
import {
  useHousehold,
  type HouseholdMember,
} from "@/features/household/HouseholdProvider";
import { normalizeUsername, pinProblem, USERNAME_RE } from "@/lib/child-login";

const lengthOptions = [
  { value: "6", label: "6 cifre" },
  { value: "4", label: "4 cifre" },
];

/** PIN-længde, PIN og gentagelse. Kalder onChange med den gyldige PIN eller null. */
function PinFields({
  onChange,
}: {
  onChange: (v: { pin: string; length: 4 | 6 } | null) => void;
}) {
  const [length, setLength] = useState<4 | 6>(6);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const problem = pin.length > 0 ? pinProblem(pin, length) : null;
  const mismatch = pin2.length > 0 && pin !== pin2;

  function update(next: { length?: 4 | 6; pin?: string; pin2?: string }) {
    const l = next.length ?? length;
    const p = next.pin ?? pin;
    const p2 = next.pin2 ?? pin2;
    onChange(
      pinProblem(p, l) === null && p === p2 ? { pin: p, length: l } : null,
    );
  }

  return (
    <>
      <div>
        <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">
          PIN-længde
        </p>
        <SegmentedControl
          label="PIN-længde"
          value={String(length)}
          onChange={(v) => {
            const l = v === "4" ? 4 : 6;
            setLength(l);
            setPin("");
            setPin2("");
            update({ length: l, pin: "", pin2: "" });
          }}
          options={lengthOptions}
        />
      </div>
      <Field label="PIN" error={problem}>
        <TextInput
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={length}
          value={pin}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, length);
            setPin(v);
            update({ pin: v });
          }}
        />
      </Field>
      <Field
        label="Gentag PIN"
        error={mismatch ? "PIN-koderne er ikke ens" : null}
      >
        <TextInput
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={length}
          value={pin2}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, length);
            setPin2(v);
            update({ pin2: v });
          }}
        />
      </Field>
    </>
  );
}

/** Husstandskoden, som barnet bruger ved login (vises kun for ejere) */
export function LoginCodeCard() {
  const code = useLoginCode(true);
  return (
    <div className="mt-3 rounded-card bg-surface-primary p-5 shadow-card">
      <p className="text-[13px] font-semibold text-secondary">
        Husstandskode til børns login
      </p>
      <p
        className="tabular mt-1 font-mono text-[28px] font-bold tracking-[0.18em]"
        aria-label="Husstandskode"
      >
        {code.isPending ? "······" : code.isError ? "–" : code.data}
      </p>
      <p className="mt-1 text-[13px] text-secondary">
        Bruges sammen med barnets brugernavn og PIN. Koden alene giver ikke
        adgang.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ Tilføj barn
export function AddChildPage() {
  const navigate = useNavigate();
  const { me } = useHousehold();
  const create = useCreateChild();
  const createNoLogin = useCreateChildWithoutLogin();
  const setWallet = useSetChildWallet();
  const code = useLoginCode(me.role === "owner");
  const [withLogin, setWithLogin] = useState(true);
  const [wallet, setWalletOn] = useState(true);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState<{ pin: string; length: 4 | 6 } | null>(null);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<{
    userId: string;
    name: string;
    username: string | null;
  } | null>(null);

  const uname = normalizeUsername(username);
  const errors = {
    name: name.trim()
      ? name.trim().length > 40
        ? "Højst 40 tegn"
        : null
      : "Skriv barnets navn",
    username: USERNAME_RE.test(uname)
      ? null
      : "2–20 tegn: små bogstaver, tal, punktum, - eller _",
  };
  const valid = withLogin
    ? !errors.name && !errors.username && pin !== null
    : !errors.name;
  const busy =
    create.isPending || createNoLogin.isPending || setWallet.isPending;
  const error = create.error ?? createNoLogin.error;

  if (me.role !== "owner")
    return (
      <>
        <PageHeader title="Tilføj barn" back="/indstillinger" />
        <p className="rounded-card bg-surface-primary p-5 text-[15px] text-secondary shadow-card">
          Kun ejere kan tilføje børn.
        </p>
      </>
    );

  if (done && !done.username)
    return (
      <>
        <PageHeader title={`${done.name} er oprettet`} back="/indstillinger" />
        <div className="rounded-card bg-surface-primary p-5 shadow-card">
          <CheckCircle2 className="size-8 text-positive" />
          <p className="mt-3 text-[15px] text-secondary">
            {done.name} er med i kalenderen, opgaver og børneoverblikket, men
            har ikke sit eget login. Du kan give {done.name} et login senere på
            barnets side under Indstillinger.
          </p>
        </div>
        <Button
          block
          className="mt-5"
          onClick={() =>
            navigate(`/indstillinger/medlem/${done.userId}`, { replace: true })
          }
        >
          Færdig
        </Button>
      </>
    );

  if (done)
    return (
      <>
        <PageHeader title={`${done.name} er oprettet`} back="/indstillinger" />
        <div className="rounded-card bg-surface-primary p-5 shadow-card">
          <CheckCircle2 className="size-8 text-positive" />
          <p className="mt-3 text-[15px] text-secondary">
            {done.name} logger ind under «Barn» på login-skærmen med:
          </p>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-[13px] font-semibold text-secondary">
                Husstandskode
              </dt>
              <dd className="font-mono text-[22px] font-bold tracking-[0.15em]">
                {code.data ?? "…"}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-secondary">
                Brugernavn
              </dt>
              <dd className="text-[20px] font-bold">{done.username}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-secondary">PIN</dt>
              <dd className="text-[15px]">
                Den PIN du lige har valgt. Den gemmes ikke i klar tekst og kan
                ikke vises igen.
              </dd>
            </div>
          </dl>
        </div>
        <Button
          block
          className="mt-5"
          onClick={() =>
            navigate(`/indstillinger/medlem/${done.userId}`, { replace: true })
          }
        >
          Færdig
        </Button>
      </>
    );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid || busy) return;
    try {
      if (!withLogin) {
        const r = await createNoLogin.mutateAsync({
          name: name.trim(),
          wallet,
        });
        setDone({ userId: r.userId ?? "", name: name.trim(), username: null });
        return;
      }
      const r = await create.mutateAsync({
        name: name.trim(),
        username: uname,
        pin: pin!.pin,
        pinLength: pin!.length,
      });
      if (!wallet && r.userId)
        await setWallet
          .mutateAsync({ childId: r.userId, enabled: false })
          .catch(() => {});
      setDone({ userId: r.userId ?? "", name: name.trim(), username: uname });
    } catch {
      // vises nedenfor
    }
  }

  return (
    <>
      <PageHeader title="Tilføj barn" back="/indstillinger" />
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Navn" error={touched ? errors.name : null}>
          <TextInput
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fx Noah"
            autoCapitalize="words"
            autoFocus
          />
        </Field>
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-secondary">
            Eget login
          </p>
          <SegmentedControl
            label="Eget login"
            value={withLogin ? "yes" : "no"}
            onChange={(v) => {
              setWithLogin(v === "yes");
              setWalletOn(v === "yes");
            }}
            options={[
              { value: "yes", label: "Med login" },
              { value: "no", label: "Uden login" },
            ]}
          />
          <p className="mt-1.5 px-1 text-[13px] text-secondary">
            {withLogin
              ? "Barnet logger ind uden e-mail og ser kun aftensmad, egne opgaver, egne og fælles aftaler og egne lommepenge."
              : "Til et lille barn uden telefon. Barnet er med i kalenderen, opgaver og overblikket, men logger ikke ind. Login kan gives senere."}
          </p>
        </div>
        <Toggle
          label="Lommepenge"
          hint="Saldo, faste lommepenge og opsparingsmål for barnet"
          checked={wallet}
          onChange={setWalletOn}
        />
        {withLogin && (
          <>
            <Field
              label="Brugernavn"
              error={touched || username ? errors.username : null}
              hint="Kun unikt i jeres husstand. Bruges ved login."
            >
              <TextInput
                value={username}
                maxLength={20}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="Fx noah"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <PinFields onChange={setPin} />
            {touched && !pin && (
              <p className="px-1 text-[13px] text-danger">
                Vælg en PIN og gentag den.
              </p>
            )}
          </>
        )}
        {error && (
          <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">
            {childAdminMessage(error)}
          </p>
        )}
        <Button type="submit" block loading={busy}>
          Opret barn
        </Button>
      </form>
    </>
  );
}

// ------------------------------------------------------------------ login-styring på medlemssiden
type Sheet = "username" | "pin" | "toggle" | null;

export function ChildLoginControls({ child }: { child: HouseholdMember }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const setDisabled = useSetChildDisabled();
  const close = () => {
    setSheet(null);
    setDisabled.reset();
  };
  return (
    <>
      <SectionHeader title="Login" />
      <ListGroup>
        <ListRow
          icon={UserPen}
          title="Brugernavn"
          subtitle={child.username ?? ""}
          onClick={() => setSheet("username")}
        />
        <ListRow
          icon={KeyRound}
          title="Skift PIN"
          onClick={() => setSheet("pin")}
        />
        <ListRow
          icon={Power}
          iconColor={child.disabled ? "var(--positive)" : "var(--danger)"}
          title={child.disabled ? "Slå login til igen" : "Slå login fra"}
          subtitle={child.disabled ? "Login er slået fra" : "Login er aktivt"}
          onClick={() => setSheet("toggle")}
        />
      </ListGroup>
      <p className="mt-2 px-1 text-[13px] text-secondary">
        Rollen er Barn og kan ikke ændres af barnet.
      </p>

      <BottomSheet
        open={sheet === "username"}
        onClose={close}
        title="Skift brugernavn"
      >
        {sheet === "username" && <UsernameForm child={child} onDone={close} />}
      </BottomSheet>
      <BottomSheet
        open={sheet === "pin"}
        onClose={close}
        title={`Ny PIN til ${child.displayName}`}
      >
        {sheet === "pin" && <PinForm child={child} onDone={close} />}
      </BottomSheet>
      <BottomSheet
        open={sheet === "toggle"}
        onClose={close}
        title={child.disabled ? "Slå login til igen?" : "Slå login fra?"}
      >
        {sheet === "toggle" && (
          <>
            <p className="text-[15px] text-secondary">
              {child.disabled
                ? `${child.displayName} kan logge ind igen med sit brugernavn og sin PIN.`
                : `${child.displayName} bliver logget ud og kan ikke logge ind, før du slår det til igen. Opgaver, lommepenge og historik bevares.`}
            </p>
            {setDisabled.isError && (
              <p className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">
                {childAdminMessage(setDisabled.error)}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={close}>
                Annullér
              </Button>
              <Button
                variant={child.disabled ? "primary" : "danger"}
                loading={setDisabled.isPending}
                onClick={() =>
                  setDisabled.mutate(
                    { childId: child.userId, disabled: !child.disabled },
                    { onSuccess: close },
                  )
                }
              >
                {child.disabled ? "Slå til" : "Slå fra"}
              </Button>
            </div>
          </>
        )}
      </BottomSheet>
    </>
  );
}

function UsernameForm({
  child,
  onDone,
}: {
  child: HouseholdMember;
  onDone: () => void;
}) {
  const save = useSetChildUsername();
  const [username, setUsername] = useState(child.username ?? "");
  const uname = normalizeUsername(username);
  const valid = USERNAME_RE.test(uname) && uname !== child.username;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid)
          save.mutate(
            { childId: child.userId, username: uname },
            { onSuccess: onDone },
          );
      }}
    >
      <Field
        label="Brugernavn"
        error={
          username && !USERNAME_RE.test(uname)
            ? "2–20 tegn: små bogstaver, tal, punktum, - eller _"
            : null
        }
      >
        <TextInput
          value={username}
          maxLength={20}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
        />
      </Field>
      {save.isError && (
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">
          {childAdminMessage(save.error)}
        </p>
      )}
      <Button type="submit" block disabled={!valid} loading={save.isPending}>
        Gem brugernavn
      </Button>
    </form>
  );
}

function PinForm({
  child,
  onDone,
}: {
  child: HouseholdMember;
  onDone: () => void;
}) {
  const save = useSetChildPin();
  const [pin, setPin] = useState<{ pin: string; length: 4 | 6 } | null>(null);
  if (save.isSuccess)
    return (
      <>
        <p className="text-[15px] text-secondary">
          PIN er ændret. {child.displayName} bruger den nye PIN næste gang. En
          eventuel lås efter forkerte forsøg er ophævet.
        </p>
        <Button block className="mt-5" onClick={onDone}>
          OK
        </Button>
      </>
    );
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pin)
          save.mutate({
            childId: child.userId,
            pin: pin.pin,
            pinLength: pin.length,
          });
      }}
    >
      <PinFields onChange={setPin} />
      {save.isError && (
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">
          {childAdminMessage(save.error)}
        </p>
      )}
      <Button type="submit" block disabled={!pin} loading={save.isPending}>
        Gem ny PIN
      </Button>
    </form>
  );
}

// ------------------------------------------------------------------ barn uden login, lommepenge og sletning (ejere)
export function ChildManageControls({ child }: { child: HouseholdMember }) {
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<"login" | "delete" | null>(null);
  const wallet = useSetChildWallet();
  const del = useDeleteChild();
  const [confirm, setConfirm] = useState("");
  const close = () => {
    setSheet(null);
    setConfirm("");
    del.reset();
  };
  const walletError = wallet.error
    ? (wallet.error as { message?: string }).message?.includes(
        "faste lommepenge",
      )
      ? "Stop de faste lommepenge først (under barnets overblik)."
      : "Lommepenge kunne ikke ændres. Prøv igen."
    : null;
  return (
    <>
      {child.noLogin && (
        <>
          <SectionHeader title="Login" />
          <ListGroup>
            <ListRow
              icon={KeyRound}
              title="Giv eget login"
              subtitle="Brugernavn og PIN, når barnet er stort nok"
              onClick={() => setSheet("login")}
            />
          </ListGroup>
          <p className="mt-2 px-1 text-[13px] text-secondary">
            {child.displayName} har ikke sit eget login og kan ikke logge ind.
          </p>
        </>
      )}
      <SectionHeader title="Lommepenge" />
      <div className="overflow-hidden rounded-card bg-surface-primary shadow-card">
        <div className="flex items-center gap-1 pl-4">
          <Wallet className="size-5 shrink-0 text-accent-text" />
          <div className="min-w-0 flex-1">
            <Toggle
              label="Lommepenge"
              hint={
                child.walletEnabled
                  ? "Saldo, faste lommepenge og opsparingsmål"
                  : "Slået fra – barnet har ikke noget med økonomi at gøre"
              }
              checked={child.walletEnabled}
              disabled={wallet.isPending}
              onChange={(v) =>
                wallet.mutate({ childId: child.userId, enabled: v })
              }
            />
          </div>
        </div>
      </div>
      {walletError && (
        <p className="mt-2 px-1 text-[13px] text-danger">{walletError}</p>
      )}

      <ListGroup className="mt-6">
        <ListRow
          icon={Trash2}
          iconColor="var(--danger)"
          tone="danger"
          title={`Slet ${child.displayName}`}
          onClick={() => setSheet("delete")}
        />
      </ListGroup>

      <BottomSheet
        open={sheet === "login"}
        onClose={close}
        title={`Login til ${child.displayName}`}
      >
        {sheet === "login" && <AddLoginForm child={child} onDone={close} />}
      </BottomSheet>
      <BottomSheet
        open={sheet === "delete"}
        onClose={close}
        title={`Slet ${child.displayName}?`}
      >
        <p className="text-[15px] text-secondary">
          {child.displayName} fjernes fra husstanden.{" "}
          {child.noLogin ? "" : "Login, "}lommepenge, opsparingsmål og aftaler
          kun for {child.displayName} slettes. Opgaver bliver uden ansvarlig.
          Det kan ikke fortrydes.
        </p>
        <div className="mt-4">
          <Field label='Skriv "SLET" for at bekræfte'>
            <TextInput
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
            />
          </Field>
        </div>
        {del.isError && (
          <p className="mt-3 text-[14px] text-danger">
            {childAdminMessage(del.error)}
          </p>
        )}
        <Button
          variant="danger"
          block
          className="mt-5"
          disabled={confirm.trim() !== "SLET"}
          loading={del.isPending}
          onClick={() =>
            del.mutate(child.userId, {
              onSuccess: () => navigate("/indstillinger", { replace: true }),
            })
          }
        >
          Slet {child.displayName}
        </Button>
      </BottomSheet>
    </>
  );
}

function AddLoginForm({
  child,
  onDone,
}: {
  child: HouseholdMember;
  onDone: () => void;
}) {
  const add = useAddChildLogin();
  const code = useLoginCode(true);
  const [username, setUsername] = useState(
    normalizeUsername(child.displayName)
      .replace(/[^a-z0-9æøå._-]/g, "")
      .slice(0, 20),
  );
  const [pin, setPin] = useState<{ pin: string; length: 4 | 6 } | null>(null);
  const uname = normalizeUsername(username);
  const valid = USERNAME_RE.test(uname) && pin !== null;
  if (add.isSuccess)
    return (
      <>
        <p className="text-[15px] text-secondary">
          {child.displayName} logger nu ind under «Barn» med husstandskoden{" "}
          <span className="font-mono font-bold">{code.data ?? "…"}</span>,
          brugernavnet <span className="font-bold">{uname}</span> og den PIN, du
          valgte.
        </p>
        <Button block className="mt-5" onClick={onDone}>
          OK
        </Button>
      </>
    );
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid)
          add.mutate({
            childId: child.userId,
            username: uname,
            pin: pin.pin,
            pinLength: pin.length,
          });
      }}
    >
      <Field
        label="Brugernavn"
        error={
          username && !USERNAME_RE.test(uname)
            ? "2–20 tegn: små bogstaver, tal, punktum, - eller _"
            : null
        }
        hint="Kun unikt i jeres husstand. Bruges ved login."
      >
        <TextInput
          value={username}
          maxLength={20}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>
      <PinFields onChange={setPin} />
      {add.isError && (
        <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">
          {childAdminMessage(add.error)}
        </p>
      )}
      <Button type="submit" block disabled={!valid} loading={add.isPending}>
        Giv login
      </Button>
    </form>
  );
}
