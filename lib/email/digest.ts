// Daily digest email: payments due in next 14 days that are unpaid + tasks
// overdue or due in the next 7 days. Sent to every email on the allowlist.

import { Resend } from "resend";
import { prisma } from "@/lib/db/client";

const PAYMENTS_HORIZON_DAYS = 14;
const TASKS_HORIZON_DAYS = 7;

export type DigestSendResult = {
  ok: boolean;
  recipients: number;
  sent: number;
  failures: { to: string; error: string }[];
  payments_count: number;
  tasks_count: number;
};

export async function runDigest(): Promise<DigestSendResult> {
  const now = new Date();
  const paymentHorizon = new Date(now.getTime() + PAYMENTS_HORIZON_DAYS * 86_400_000);
  const taskHorizon = new Date(now.getTime() + TASKS_HORIZON_DAYS * 86_400_000);

  const [payments, tasks, allowed] = await Promise.all([
    prisma.payments.findMany({
      where: { paid_date: null, due_date: { lte: paymentHorizon } },
      orderBy: { due_date: "asc" },
      include: {
        payer: { select: { name: true } },
        contract: { include: { vendor: { select: { name: true } } } },
      },
    }),
    prisma.tasks.findMany({
      where: {
        status: { notIn: ["complete", "cancelled"] },
        due_date: { lte: taskHorizon, not: null },
      },
      orderBy: [{ due_date: "asc" }],
      take: 30,
    }),
    prisma.allowed_users.findMany({ select: { email: true, name: true } }),
  ]);

  const result: DigestSendResult = {
    ok: true,
    recipients: allowed.length,
    sent: 0,
    failures: [],
    payments_count: payments.length,
    tasks_count: tasks.length,
  };

  // If there's nothing to report, skip — no point cluttering inboxes
  if (payments.length === 0 && tasks.length === 0) {
    return result;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  if (!apiKey) {
    // Dev fallback — log the would-have-been email
    console.log(`[dev] would send digest to ${allowed.length} users · ${payments.length} payments · ${tasks.length} tasks`);
    return result;
  }
  const resend = new Resend(apiKey);

  const html = digestHtml(payments, tasks);

  for (const user of allowed) {
    try {
      const { error } = await resend.emails.send({
        from,
        to: user.email,
        subject: `Wedding planning digest — ${payments.length} payment${payments.length === 1 ? "" : "s"} due, ${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
        html,
      });
      if (error) {
        result.failures.push({ to: user.email, error: error.message });
      } else {
        result.sent += 1;
      }
    } catch (e) {
      result.failures.push({ to: user.email, error: e instanceof Error ? e.message : String(e) });
    }
  }

  result.ok = result.failures.length === 0;
  return result;
}

// ─── HTML template ───────────────────────────────────────

type PaymentRow = Awaited<ReturnType<typeof loadPayments>>[number];
type TaskRow = Awaited<ReturnType<typeof loadTasks>>[number];

async function loadPayments() {
  return prisma.payments.findMany({
    include: { payer: { select: { name: true } }, contract: { include: { vendor: { select: { name: true } } } } },
    take: 0,
  });
}
async function loadTasks() {
  return prisma.tasks.findMany({ take: 0 });
}

function digestHtml(payments: PaymentRow[], tasks: TaskRow[]): string {
  const paymentsTable = payments
    .map((p) => {
      const due = p.due_date.toISOString().slice(0, 10);
      const overdue = p.due_date < new Date();
      const amount = `$${(Number(p.amount) / 100).toLocaleString()}`;
      const vendor = p.contract?.vendor.name ?? "(one-off)";
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #EADFC6;">${escape(p.description)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EADFC6;color:#736961;">${escape(vendor)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EADFC6;font-family:JetBrains Mono,monospace;text-align:right;">${escape(amount)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EADFC6;color:${overdue ? "#B8451E" : "#736961"};">${due}${overdue ? " (overdue)" : ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EADFC6;color:#736961;font-size:12px;">${escape(p.payer.name)}</td>
      </tr>`;
    })
    .join("");

  const tasksList = tasks
    .map((t) => {
      const due = t.due_date ? t.due_date.toISOString().slice(0, 10) : "—";
      const overdue = t.due_date ? t.due_date < new Date() : false;
      return `<li style="margin-bottom:6px;line-height:1.5;">
        <strong>${escape(t.title)}</strong>
        <span style="color:${overdue ? "#B8451E" : "#736961"};font-size:12px;"> · ${due}${overdue ? " (overdue)" : ""}</span>
        ${t.owner ? `<span style="color:#736961;font-size:12px;"> · ${escape(t.owner)}</span>` : ""}
      </li>`;
    })
    .join("");

  return `<!doctype html>
<html><body style="font-family:Georgia,serif;background:#F8F2E6;color:#1A1614;padding:32px 20px;margin:0;">
  <div style="max-width:680px;margin:0 auto;background:#FFF;padding:32px;border-radius:8px;">
    <div style="border-bottom:1px solid #D9CFB9;padding-bottom:16px;margin-bottom:24px;">
      <div style="font-size:24px;font-weight:400;color:#1A1614;">Atharva <em>&amp;</em> Celesia</div>
      <div style="font-size:11px;color:#736961;font-family:JetBrains Mono,monospace;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Planning digest · ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
    </div>

    ${payments.length > 0 ? `
    <h2 style="font-size:18px;font-weight:400;font-style:italic;color:#1A1614;margin:0 0 12px;">Payments due (next 14 days)</h2>
    <table style="width:100%;border-collapse:collapse;font-family:'DM Sans',sans-serif;font-size:14px;margin-bottom:24px;">
      ${paymentsTable}
    </table>
    ` : ""}

    ${tasks.length > 0 ? `
    <h2 style="font-size:18px;font-weight:400;font-style:italic;color:#1A1614;margin:0 0 12px;">Tasks (overdue or due within a week)</h2>
    <ul style="font-family:'DM Sans',sans-serif;font-size:14px;padding-left:20px;margin:0;">
      ${tasksList}
    </ul>
    ` : ""}

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #D9CFB9;font-size:12px;color:#736961;">
      <a href="${escape(process.env.APP_URL ?? "https://wedding-tool.vercel.app")}/dashboard" style="color:#B8451E;text-decoration:none;">Open the wedding tool →</a>
    </div>
  </div>
</body></html>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
